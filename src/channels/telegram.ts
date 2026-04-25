/**
 * KausaOS - Telegram Channel
 * Bot handler: message routing, command handling, user onboarding
 * Multi-tenant via UserSessionManager
 */

import TelegramBot from 'node-telegram-bot-api';
import { KausaOSConfig } from '../config';
import { StrategyEngine } from '../strategy/engine';
import { TokenPriceMonitor } from '../monitor/token-price';
import { UserSessionManager } from './user-session';
import { onboardTelegramUser, exportUserPrivateKey } from './onboarding';
import { Notifier } from '../notify';

export class TelegramChannel {
  private bot: TelegramBot;
  private config: KausaOSConfig;
  private sessionManager: UserSessionManager;
  private strategyEngine: StrategyEngine;
  private masterKey: string;
  private notifier: Notifier | null;
  private running: boolean;

  constructor(params: {
    config: KausaOSConfig;
    basePath: string;
    strategyEngine: StrategyEngine;
    tokenPriceMonitor: TokenPriceMonitor;
    masterKey: string;
  }) {
    const botToken = params.config.channels.telegram.bot_token;
    if (!botToken) {
      throw new Error('Telegram bot_token not configured in kausaos.json');
    }

    this.bot = new TelegramBot(botToken, { polling: true });
    this.config = params.config;
    this.strategyEngine = params.strategyEngine;
    this.masterKey = params.masterKey;
    this.notifier = null;
    this.running = false;

    this.sessionManager = new UserSessionManager({
      config: params.config,
      basePath: params.basePath,
      strategyEngine: params.strategyEngine,
      tokenPriceMonitor: params.tokenPriceMonitor,
      idleTimeoutMinutes: 30,
    });
  }

  /**
   * Start the Telegram bot and register handlers
   */
  async start(): Promise<void> {
    this.running = true;
    this.sessionManager.startCleanup();

    // Register command handlers
    this.bot.onText(/\/start/, (msg) => this.handleStart(msg));
    this.bot.onText(/\/portfolio/, (msg) => this.handleCommand(msg, '/portfolio'));
    this.bot.onText(/\/pockets/, (msg) => this.handleCommand(msg, '/pockets'));
    this.bot.onText(/\/rules/, (msg) => this.handleCommand(msg, '/rules'));
    this.bot.onText(/\/history/, (msg) => this.handleCommand(msg, '/history'));
    this.bot.onText(/\/wallet/, (msg) => this.handleCommand(msg, '/wallet'));
    this.bot.onText(/\/export/, (msg) => this.handleExport(msg));
    this.bot.onText(/\/help/, (msg) => this.handleHelp(msg));
    this.bot.onText(/\/settings/, (msg) => this.handleSettings(msg));

    // Handle all non-command messages (natural language via LLM)
    this.bot.on('message', (msg) => {
      if (!msg.text || msg.text.startsWith('/')) return;
      this.handleMessage(msg);
    });

    console.log('[Telegram] Bot started, listening for messages...');
  }

  /**
   * Stop the bot
   */
  stop(): void {
    this.running = false;
    this.sessionManager.clearAll();
    this.bot.stopPolling();
    console.log('[Telegram] Bot stopped');
  }

  /**
   * /start - Onboard new user or welcome existing
   */
  private async handleStart(msg: TelegramBot.Message): Promise<void> {
    const chatId = msg.chat.id;
    const telegramId = msg.from?.id?.toString();
    const username = msg.from?.username;

    if (!telegramId) return;

    // Check if user exists
    const existing = this.strategyEngine.getTelegramUser(telegramId);
    if (existing) {
      await this.bot.sendMessage(chatId,
        `Welcome back! Your KausaOS account is active.\n\n` +
        `*Wallet:* \`${existing.wallet_address}\`\n` +
        `*Tier:* ${existing.tier}\n\n` +
        `Send me a message or use /help to see commands.`,
        { parse_mode: 'Markdown' }
      );
      return;
    }

    // New user - onboard
    await this.bot.sendMessage(chatId,
      'Welcome to KausaOS, your privacy agent on Solana. Setting up your account now...'
    );

    await this.bot.sendMessage(chatId, 'Creating your wallet...');

    const result = await onboardTelegramUser(
      telegramId,
      username,
      this.strategyEngine,
      this.config.kausalayer,
      this.masterKey
    );

    if (!result.success) {
      await this.bot.sendMessage(chatId,
        `Setup failed: ${result.error}\n\nPlease try /start again.`
      );
      return;
    }

    await this.bot.sendMessage(chatId, 'Wallet created. Generating API key...');

    await this.bot.sendMessage(chatId,
      `Your KausaOS account is ready!\n\n` +
      `*Wallet:* \`${result.wallet_address}\`\n` +
      `_(this is your identity wallet for authentication)_\n\n` +
      `*API Key:* \`${result.api_key}\`\n` +
      `_(you can also use this with MCP servers)_\n\n` +
      `To start using KausaOS:\n` +
      `• Type \"create pocket 0.1\" to create a stealth wallet\n` +
      `• You will receive a deposit address to fund it\n` +
      `• Send SOL from any wallet (Phantom, exchange, etc.)\n` +
      `• Once funded, trade, swap, and automate privately\n\n` +
      `I am running 24/7 for you.`,
      { parse_mode: 'Markdown' }
    );

    // Send private key as self-destructing message (60 seconds)
    const pkMsg = await this.bot.sendMessage(chatId,
      `*Your Private Key (backup):*\n\`${result.private_key}\`\n\n` +
      `_Save this now. This message will be deleted in 60 seconds._`,
      { parse_mode: 'Markdown' }
    ).catch(async () => {
      return await this.bot.sendMessage(chatId,
        `Your Private Key (backup):\n${result.private_key}\n\nSave this now. This message will be deleted in 60 seconds.`
      );
    });
    if (pkMsg) {
      setTimeout(() => {
        this.bot.deleteMessage(chatId, pkMsg.message_id).catch(() => {});
      }, 60000);
    }

    // Create session immediately
    await this.sessionManager.createNewSession(telegramId);

    // Register this user for heartbeat notifications
    if (this.notifier) {
      this.notifier.addTelegramChatId(telegramId);
    }
  }

  /**
   * Handle commands that map to Brain queries
   */
  private async handleCommand(msg: TelegramBot.Message, command: string): Promise<void> {
    const chatId = msg.chat.id;
    const telegramId = msg.from?.id?.toString();
    if (!telegramId) return;

    const session = await this.sessionManager.getSession(telegramId);
    if (!session) {
      await this.bot.sendMessage(chatId, 'You need to set up first. Type /start');
      return;
    }

    // Map commands to natural language for Brain
    const commandMap: Record<string, string> = {
      '/portfolio': 'Show my portfolio summary',
      '/pockets': 'List all my pockets',
      '/rules': 'Show my active trade rules',
      '/history': 'Show my recent trade history',
      '/wallet': 'Show my wallet address and balance',
    };

    const query = commandMap[command] || command;

    try {
      await this.bot.sendChatAction(chatId, 'typing');
      const response = await session.brain.processMessage(query);
      await this.sendLongMessage(chatId, response);
    } catch (err: any) {
      await this.bot.sendMessage(chatId, `Error: ${err.message}`);
    }

    // Update activity
    this.strategyEngine.updateTelegramUserActivity(telegramId);
  }

  /**
   * /export - Export private key with confirmation
   */
  private async handleExport(msg: TelegramBot.Message): Promise<void> {
    const chatId = msg.chat.id;
    const telegramId = msg.from?.id?.toString();
    if (!telegramId) return;

    const user = this.strategyEngine.getTelegramUser(telegramId);
    if (!user) {
      await this.bot.sendMessage(chatId, 'You need to set up first. Type /start');
      return;
    }

    // Send confirmation request
    await this.bot.sendMessage(chatId,
      'Are you sure you want to export your private key?\n' +
      'This will be sent as a self-destructing message.\n\n' +
      'Reply *YES* to confirm.',
      { parse_mode: 'Markdown' }
    );

    // Listen for confirmation
    const listener = (confirmMsg: TelegramBot.Message) => {
      if (confirmMsg.from?.id?.toString() !== telegramId) return;
      if (confirmMsg.chat.id !== chatId) return;
      if (confirmMsg.text?.toUpperCase() !== 'YES') return;

      this.bot.removeListener('message', listener);

      const result = exportUserPrivateKey(telegramId, this.strategyEngine, this.masterKey);
      if (result.success) {
        // Send with auto-delete (message_effect_id not available, use manual delete)
        this.bot.sendMessage(chatId,
          `*Private Key:*\n\`${result.private_key}\`\n\n_This message will be deleted in 60 seconds._`,
          { parse_mode: 'Markdown' }
        ).then((sentMsg) => {
          // Auto-delete after 60 seconds
          setTimeout(() => {
            this.bot.deleteMessage(chatId, sentMsg.message_id).catch(() => {});
          }, 60000);
        });
      } else {
        this.bot.sendMessage(chatId, `Export failed: ${result.error}`);
      }
    };

    this.bot.on('message', listener);

    // Auto-remove listener after 60 seconds
    setTimeout(() => {
      this.bot.removeListener('message', listener);
    }, 60000);
  }

  /**
   * /help - Show available commands
   */
  private async handleHelp(msg: TelegramBot.Message): Promise<void> {
    const chatId = msg.chat.id;
    await this.bot.sendMessage(chatId,
      `*KausaOS Commands:*\n\n` +
      `/start - Set up or show account\n` +
      `/portfolio - Portfolio summary with PnL\n` +
      `/pockets - List active pockets\n` +
      `/rules - Show trade rules\n` +
      `/history - Recent trades\n` +
      `/wallet - Wallet address & balance\n` +
      `/export - Export private key\n` +
      `/settings - Preferences\n` +
      `/help - This message\n\n` +
      `You can also type naturally:\n` +
      `• "Create a pocket with 0.5 SOL"\n` +
      `• "Buy BONK with 0.1 SOL"\n` +
      `• "Set take profit at 3x for BONK"\n` +
      `• "Sweep everything to my main wallet"`,
      { parse_mode: 'Markdown' }
    );
  }

  /**
   * /settings - Placeholder for user preferences
   */
  private async handleSettings(msg: TelegramBot.Message): Promise<void> {
    const chatId = msg.chat.id;
    await this.bot.sendMessage(chatId,
      '*Settings:*\n\n' +
      'Settings are coming soon. For now, everything works with defaults.',
      { parse_mode: 'Markdown' }
    );
  }

  /**
   * Handle natural language messages via Brain/LLM
   */
  private async handleMessage(msg: TelegramBot.Message): Promise<void> {
    const chatId = msg.chat.id;
    const telegramId = msg.from?.id?.toString();
    const text = msg.text;

    if (!telegramId || !text) return;

    const session = await this.sessionManager.getSession(telegramId);
    if (!session) {
      await this.bot.sendMessage(chatId, 'You need to set up first. Type /start');
      return;
    }

    try {
      await this.bot.sendChatAction(chatId, 'typing');

      // Initialize API client if not yet
      try {
        await session.brain.getApiClient().init();
      } catch (_) {}

      const response = await session.brain.processMessage(text);
      await this.sendLongMessage(chatId, response);

      // Auto-monitor deposit if a pocket was just created
      const pocketMatch = response.match(/pocket_[a-z0-9]+/);
      const depositMatch = response.match(/deposit|deposit_address|waiting for funding/i);
      if (pocketMatch && depositMatch) {
        const pocketId = pocketMatch[0];
        this.monitorDeposit(chatId, pocketId, session.brain.getApiClient());
      }
    } catch (err: any) {
      console.error(`[Telegram] Error for ${telegramId}: ${err.message}`);
      await this.bot.sendMessage(chatId, `Something went wrong: ${err.message}`);
    }

    // Update activity
    this.strategyEngine.updateTelegramUserActivity(telegramId);
  }

  /**
   * Monitor a pocket for deposit arrival and notify user
   * Polls every 10 seconds for up to 10 minutes
   */
  private monitorDeposit(chatId: number, pocketId: string, apiClient: any): void {
    let attempts = 0;
    const maxAttempts = 60; // 10 minutes at 10s intervals
    let lastStatus = '';

    const poll = async () => {
      attempts++;
      if (attempts > maxAttempts) {
        await this.bot.sendMessage(chatId,
          `Deposit monitoring timed out for ${pocketId}. Use "show pocket ${pocketId}" to check manually.`
        ).catch(() => {});
        return;
      }

      try {
        const res = await apiClient.getPocket(pocketId);
        if (!res.success || !res.data) {
          setTimeout(poll, 10000);
          return;
        }

        const status = res.data.status || '';
        const balance = res.data.balance_sol || res.data.balance || 0;

        // Detect status changes
        if (status === 'active' && balance > 0 && lastStatus !== 'funded') {
          lastStatus = 'funded';
          await this.bot.sendMessage(chatId,
            `Deposit received! Maze routing complete.\n\n` +
            `Pocket: \`${pocketId}\`\n` +
            `Balance: ${balance} SOL\n` +
            `Status: Active and funded\n\n` +
            `Your pocket is ready for trading, swaps, and transfers.`,
            { parse_mode: 'Markdown' }
          ).catch(async () => {
            await this.bot.sendMessage(chatId,
              `Deposit received! Pocket ${pocketId} funded with ${balance} SOL. Ready for trading.`
            );
          });
          return; // Stop polling
        }

        // Still waiting
        setTimeout(poll, 10000);
      } catch (_) {
        setTimeout(poll, 10000);
      }
    };

    // Start polling after 15 seconds (give time for deposit tx)
    setTimeout(poll, 15000);
  }

  /**
   * Send long messages in chunks (Telegram max 4096 chars)
   */
  private async sendLongMessage(chatId: number, text: string): Promise<void> {
    const MAX_LENGTH = 4000;

    if (text.length <= MAX_LENGTH) {
      await this.bot.sendMessage(chatId, text, { parse_mode: 'Markdown' }).catch(async () => {
        // Fallback without Markdown if parsing fails
        await this.bot.sendMessage(chatId, text);
      });
      return;
    }

    // Split into chunks
    const chunks: string[] = [];
    let remaining = text;
    while (remaining.length > 0) {
      if (remaining.length <= MAX_LENGTH) {
        chunks.push(remaining);
        break;
      }

      // Find a good break point (newline)
      let breakPoint = remaining.lastIndexOf('\n', MAX_LENGTH);
      if (breakPoint < MAX_LENGTH / 2) {
        breakPoint = MAX_LENGTH;
      }

      chunks.push(remaining.slice(0, breakPoint));
      remaining = remaining.slice(breakPoint);
    }

    for (const chunk of chunks) {
      await this.bot.sendMessage(chatId, chunk, { parse_mode: 'Markdown' }).catch(async () => {
        await this.bot.sendMessage(chatId, chunk);
      });
    }
  }

  /**
   * Send a message to a specific Telegram user (for notifications)
   */
  async sendNotification(telegramId: string, message: string): Promise<boolean> {
    try {
      await this.bot.sendMessage(parseInt(telegramId), message, { parse_mode: 'Markdown' }).catch(async () => {
        await this.bot.sendMessage(parseInt(telegramId), message);
      });
      return true;
    } catch (err: any) {
      console.error(`[Telegram] Notification failed for ${telegramId}: ${err.message}`);
      return false;
    }
  }

  /**
   * Set notifier for registering new user chat IDs
   */
  setNotifier(notifier: Notifier): void {
    this.notifier = notifier;
  }

  /**
   * Get the session manager (for heartbeat integration)
   */
  getSessionManager(): UserSessionManager {
    return this.sessionManager;
  }

  /**
   * Get the bot instance (for notify.ts integration)
   */
  getBot(): TelegramBot {
    return this.bot;
  }
}
