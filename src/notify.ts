/**
 * KausaOS - Notification System
 * Sends notifications via webhooks (Discord, Slack, custom endpoints)
 * Falls back to console.log if no webhooks configured
 */

import axios from 'axios';
import TelegramBot from 'node-telegram-bot-api';

export class Notifier {
  private webhooks: string[];
  private telegramBot: TelegramBot | null;
  private telegramChatIds: Set<string>;

  constructor(webhooks: string[] = []) {
    this.webhooks = webhooks;
    this.telegramBot = null;
    this.telegramChatIds = new Set();
  }

  /**
   * Send notification to all configured webhooks + console
   */
  async send(message: string, metadata?: {
    strategy?: string;
    trigger?: string;
    action?: string;
    success?: boolean;
  }): Promise<void> {
    // Always log to console
    console.log(`[NOTIFY] ${message}`);

    // Send to webhooks
    for (const url of this.webhooks) {
      try {
        await this.sendWebhook(url, message, metadata);
      } catch (err: any) {
        console.warn(`[NOTIFY] Webhook failed (${url}): ${err.message}`);
      }
    }

    // Send to Telegram chats
    await this.broadcastTelegram(message);
  }

  /**
   * Send to a single webhook URL
   * Auto-detects Discord, Slack, or generic webhook format
   */
  private async sendWebhook(url: string, message: string, metadata?: any): Promise<void> {
    let payload: any;

    if (url.includes('discord.com/api/webhooks')) {
      // Discord webhook format
      payload = {
        content: null,
        embeds: [{
          title: 'KausaOS Notification',
          description: message,
          color: metadata?.success === false ? 0xff4444 : 0x00cc88,
          fields: this.buildFields(metadata),
          timestamp: new Date().toISOString(),
          footer: { text: 'KausaOS Privacy Agent' },
        }],
      };
    } else if (url.includes('hooks.slack.com')) {
      // Slack webhook format
      payload = {
        text: `*KausaOS*: ${message}`,
        blocks: [
          {
            type: 'section',
            text: { type: 'mrkdwn', text: `*KausaOS Notification*\n${message}` },
          },
          ...(metadata ? [{
            type: 'context',
            elements: this.buildSlackContext(metadata),
          }] : []),
        ],
      };
    } else {
      // Generic webhook (POST JSON)
      payload = {
        source: 'kausaos',
        message,
        metadata: metadata || {},
        timestamp: new Date().toISOString(),
      };
    }

    await axios.post(url, payload, {
      timeout: 10000,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  /**
   * Build Discord embed fields from metadata
   */
  private buildFields(metadata?: any): any[] {
    if (!metadata) return [];
    const fields: any[] = [];
    if (metadata.strategy) fields.push({ name: 'Strategy', value: metadata.strategy, inline: true });
    if (metadata.trigger) fields.push({ name: 'Trigger', value: metadata.trigger, inline: true });
    if (metadata.action) fields.push({ name: 'Action', value: metadata.action, inline: true });
    return fields;
  }

  /**
   * Build Slack context elements from metadata
   */
  private buildSlackContext(metadata: any): any[] {
    const elements: any[] = [];
    if (metadata.strategy) elements.push({ type: 'mrkdwn', text: `*Strategy:* ${metadata.strategy}` });
    if (metadata.trigger) elements.push({ type: 'mrkdwn', text: `*Trigger:* ${metadata.trigger}` });
    if (metadata.action) elements.push({ type: 'mrkdwn', text: `*Action:* ${metadata.action}` });
    return elements;
  }

  /**
   * Set Telegram bot instance for sending notifications
   */
  setTelegramBot(bot: TelegramBot): void {
    this.telegramBot = bot;
  }

  /**
   * Register a Telegram chat ID for notifications
   */
  addTelegramChatId(chatId: string): void {
    this.telegramChatIds.add(chatId);
  }

  /**
   * Remove a Telegram chat ID
   */
  removeTelegramChatId(chatId: string): void {
    this.telegramChatIds.delete(chatId);
  }

  /**
   * Send notification to a specific Telegram chat
   */
  async sendTelegram(chatId: string, message: string): Promise<void> {
    if (!this.telegramBot) return;
    try {
      await this.telegramBot.sendMessage(parseInt(chatId), message, {
        parse_mode: 'Markdown',
      }).catch(async () => {
        await this.telegramBot!.sendMessage(parseInt(chatId), message);
      });
    } catch (err: any) {
      console.warn(`[NOTIFY] Telegram send failed (${chatId}): ${err.message}`);
    }
  }

  /**
   * Send notification to all registered Telegram chats
   */
  async broadcastTelegram(message: string): Promise<void> {
    if (!this.telegramBot || this.telegramChatIds.size === 0) return;
    for (const chatId of this.telegramChatIds) {
      await this.sendTelegram(chatId, message);
    }
  }

  /**
   * Check if webhooks are configured
   */
  hasWebhooks(): boolean {
    return this.webhooks.length > 0;
  }

  /**
   * Check if any notification channel is configured
   */
  hasAnyChannel(): boolean {
    return this.webhooks.length > 0 || this.telegramChatIds.size > 0;
  }

  /**
   * Add a webhook URL at runtime
   */
  addWebhook(url: string): void {
    if (!this.webhooks.includes(url)) {
      this.webhooks.push(url);
    }
  }

  /**
   * Remove a webhook URL
   */
  removeWebhook(url: string): void {
    this.webhooks = this.webhooks.filter((w) => w !== url);
  }

  /**
   * List configured webhooks
   */
  listWebhooks(): string[] {
    return [...this.webhooks];
  }
}
