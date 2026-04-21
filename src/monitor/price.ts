/**
 * KausaOS - Price Monitor
 * Real-time SOL price feed via DexScreener API
 * Caches price history for custom timeframe calculations
 */

import axios from 'axios';

const DEXSCREENER_API = 'https://api.dexscreener.com/latest/dex/tokens/So11111111111111111111111111111111111111112';
const SOL_USDC_PAIR = 'Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE'; // Orca SOL/USDC highest liquidity

interface PriceSnapshot {
  price: number;
  timestamp: number;
  change_h1: number;
  change_h6: number;
  change_h24: number;
}

export class PriceMonitor {
  private currentPrice: number;
  private priceHistory: PriceSnapshot[];
  private maxHistorySize: number;
  private lastFetch: number;
  private cacheDurationMs: number;

  constructor() {
    this.currentPrice = 0;
    this.priceHistory = [];
    this.maxHistorySize = 288; // 24h worth at 5-min intervals
    this.lastFetch = 0;
    this.cacheDurationMs = 30000; // 30 second cache
  }

  /**
   * Fetch current SOL price from DexScreener
   */
  async fetchPrice(): Promise<PriceSnapshot> {
    const now = Date.now();

    // Return cached if fresh
    if (this.lastFetch > 0 && now - this.lastFetch < this.cacheDurationMs && this.priceHistory.length > 0) {
      return this.priceHistory[this.priceHistory.length - 1];
    }

    try {
      const response = await axios.get(DEXSCREENER_API, { timeout: 10000 });
      const pairs = response.data?.pairs || [];

      // Find the specific Orca SOL/USDC pair
      let targetPair = pairs.find((p: any) => p.pairAddress === SOL_USDC_PAIR);

      // Fallback: find any Solana SOL/USDC pair with highest liquidity
      if (!targetPair) {
        targetPair = pairs
          .filter((p: any) =>
            p.chainId === 'solana' &&
            p.baseToken?.symbol === 'SOL' &&
            (p.quoteToken?.symbol === 'USDC' || p.quoteToken?.symbol === 'USDT')
          )
          .sort((a: any, b: any) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0))[0];
      }

      if (!targetPair) {
        throw new Error('No SOL/USDC pair found');
      }

      const snapshot: PriceSnapshot = {
        price: parseFloat(targetPair.priceUsd || '0'),
        timestamp: now,
        change_h1: targetPair.priceChange?.h1 || 0,
        change_h6: targetPair.priceChange?.h6 || 0,
        change_h24: targetPair.priceChange?.h24 || 0,
      };

      this.currentPrice = snapshot.price;
      this.lastFetch = now;

      // Add to history
      this.priceHistory.push(snapshot);
      if (this.priceHistory.length > this.maxHistorySize) {
        this.priceHistory = this.priceHistory.slice(-this.maxHistorySize);
      }

      return snapshot;
    } catch (err: any) {
      console.warn(`[PriceMonitor] Fetch failed: ${err.message}`);

      // Return last known price if available
      if (this.priceHistory.length > 0) {
        return this.priceHistory[this.priceHistory.length - 1];
      }

      return { price: 0, timestamp: now, change_h1: 0, change_h6: 0, change_h24: 0 };
    }
  }

  /**
   * Get current SOL price
   */
  async getPrice(): Promise<number> {
    const snapshot = await this.fetchPrice();
    return snapshot.price;
  }

  /**
   * Get price change percentage for a given timeframe
   * Uses DexScreener data for h1/h6/h24, or calculates from history for custom periods
   */
  async getPriceChange(hours: number): Promise<number> {
    const snapshot = await this.fetchPrice();

    // Use DexScreener's built-in price change data
    if (hours <= 1) return snapshot.change_h1;
    if (hours <= 6) return snapshot.change_h6;
    if (hours <= 24) return snapshot.change_h24;

    // For longer periods, calculate from history
    return this.calculateChangeFromHistory(hours);
  }

  /**
   * Calculate price change from cached history
   */
  private calculateChangeFromHistory(hours: number): number {
    if (this.priceHistory.length < 2) return 0;

    const now = Date.now();
    const targetTime = now - hours * 3600000;

    // Find closest snapshot to target time
    let closest = this.priceHistory[0];
    for (const snapshot of this.priceHistory) {
      if (Math.abs(snapshot.timestamp - targetTime) < Math.abs(closest.timestamp - targetTime)) {
        closest = snapshot;
      }
    }

    if (closest.price === 0) return 0;

    const currentPrice = this.priceHistory[this.priceHistory.length - 1].price;
    return ((currentPrice - closest.price) / closest.price) * 100;
  }

  /**
   * Check if SOL dropped more than threshold in given hours
   */
  async hasDropped(thresholdPercent: number, hours: number): Promise<{ dropped: boolean; change: number }> {
    const change = await this.getPriceChange(hours);
    return {
      dropped: change < 0 && Math.abs(change) >= thresholdPercent,
      change,
    };
  }

  /**
   * Get full price info for system context
   */
  async getPriceInfo(): Promise<{
    price: number;
    change_h1: number;
    change_h6: number;
    change_h24: number;
    historySize: number;
  }> {
    const snapshot = await this.fetchPrice();
    return {
      price: snapshot.price,
      change_h1: snapshot.change_h1,
      change_h6: snapshot.change_h6,
      change_h24: snapshot.change_h24,
      historySize: this.priceHistory.length,
    };
  }
}
