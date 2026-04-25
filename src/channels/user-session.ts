/**
 * KausaOS - User Session Manager
 * Multi-tenant: one KausaOS instance serves many Telegram users
 * Each user gets isolated Brain, API client, conversation history
 * Sessions cached in memory, evicted after idle timeout
 */

import { Brain, BrainOptions } from '../brain';
import { KausaOSConfig } from '../config';
import { StrategyEngine, TelegramUser } from '../strategy';
import { TokenPriceMonitor } from '../monitor/token-price';
import { PriceMonitor } from '../monitor/price';

export interface UserSession {
  telegramId: string;
  brain: Brain;
  lastActivity: number;
  createdAt: number;
}

export class UserSessionManager {
  private sessions: Map<string, UserSession>;
  private config: KausaOSConfig;
  private basePath: string;
  private strategyEngine: StrategyEngine;
  private tokenPriceMonitor: TokenPriceMonitor;
  private priceMonitor: PriceMonitor;
  private idleTimeoutMs: number;
  private cleanupTimer: NodeJS.Timeout | null;

  constructor(params: {
    config: KausaOSConfig;
    basePath: string;
    strategyEngine: StrategyEngine;
    tokenPriceMonitor: TokenPriceMonitor;
    idleTimeoutMinutes?: number;
  }) {
    this.sessions = new Map();
    this.config = params.config;
    this.basePath = params.basePath;
    this.strategyEngine = params.strategyEngine;
    this.tokenPriceMonitor = params.tokenPriceMonitor;
    this.priceMonitor = new PriceMonitor();
    this.idleTimeoutMs = (params.idleTimeoutMinutes || 30) * 60 * 1000;
    this.cleanupTimer = null;
  }

  /**
   * Start periodic cleanup of idle sessions
   */
  startCleanup(): void {
    if (this.cleanupTimer) return;
    // Run cleanup every 5 minutes
    this.cleanupTimer = setInterval(() => {
      this.evictIdleSessions();
    }, 5 * 60 * 1000);
    console.log('[SessionManager] Cleanup started');
  }

  /**
   * Stop periodic cleanup
   */
  stopCleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  /**
   * Get or create a session for a Telegram user
   * If session exists in memory, return it
   * If not, load user from DB and create new Brain instance
   */
  async getSession(telegramId: string): Promise<UserSession | null> {
    // Check memory cache first
    const existing = this.sessions.get(telegramId);
    if (existing) {
      existing.lastActivity = Date.now();
      return existing;
    }

    // Load user from database
    const user = this.strategyEngine.getTelegramUser(telegramId);
    if (!user || user.status !== 'active') {
      return null;
    }

    // Create new session
    const session = this.createSession(user);
    this.sessions.set(telegramId, session);

    // Update last activity in DB
    this.strategyEngine.updateTelegramUserActivity(telegramId);

    console.log(`[SessionManager] Session created for ${telegramId} (${this.sessions.size} active)`);
    return session;
  }

  /**
   * Create a Brain instance for a specific user
   * Overrides the kausalayer api_key with user's own key
   */
  private createSession(user: TelegramUser): UserSession {
    // Create user-specific config with their API key
    const userConfig: KausaOSConfig = {
      ...this.config,
      kausalayer: {
        ...this.config.kausalayer,
        api_key: user.api_key,
      },
    };

    const brain = new Brain({
      config: userConfig,
      basePath: this.basePath,
    });

    // Connect shared components
    brain.setStrategyEngine(this.strategyEngine);
    brain.setTokenPriceMonitor(this.tokenPriceMonitor);
    brain.setTelegramId(user.telegram_id);

    // Sync price data to brain
    this.priceMonitor.getPriceInfo().then((priceInfo) => {
      brain.setPriceData(priceInfo);
    }).catch(() => {});

    return {
      telegramId: user.telegram_id,
      brain,
      lastActivity: Date.now(),
      createdAt: Date.now(),
    };
  }

  /**
   * Create a new session after onboarding (user just registered)
   * Called right after onboardTelegramUser succeeds
   */
  async createNewSession(telegramId: string): Promise<UserSession | null> {
    // Remove any stale session
    this.sessions.delete(telegramId);

    // Load fresh from DB
    return this.getSession(telegramId);
  }

  /**
   * Remove a session from memory
   */
  removeSession(telegramId: string): void {
    this.sessions.delete(telegramId);
    console.log(`[SessionManager] Session removed for ${telegramId} (${this.sessions.size} active)`);
  }

  /**
   * Evict sessions that have been idle beyond the timeout
   */
  private evictIdleSessions(): void {
    const now = Date.now();
    let evicted = 0;

    for (const [telegramId, session] of this.sessions) {
      if (now - session.lastActivity > this.idleTimeoutMs) {
        this.sessions.delete(telegramId);
        evicted++;
      }
    }

    if (evicted > 0) {
      console.log(`[SessionManager] Evicted ${evicted} idle session(s) (${this.sessions.size} remaining)`);
    }
  }

  /**
   * Get count of active sessions in memory
   */
  getActiveSessionCount(): number {
    return this.sessions.size;
  }

  /**
   * Get all active session telegram IDs
   */
  getActiveSessionIds(): string[] {
    return Array.from(this.sessions.keys());
  }

  /**
   * Check if a user has an active session
   */
  hasSession(telegramId: string): boolean {
    return this.sessions.has(telegramId);
  }

  /**
   * Clear all sessions (for shutdown)
   */
  clearAll(): void {
    const count = this.sessions.size;
    this.sessions.clear();
    this.stopCleanup();
    console.log(`[SessionManager] Cleared ${count} session(s)`);
  }
}
