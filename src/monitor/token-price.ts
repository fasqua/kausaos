/**
 * KausaOS - Token Price Monitor
 * Track prices of arbitrary tokens via DexScreener
 * Used for portfolio PnL, take profit, stop loss, alerts
 */

import axios from 'axios';

const DEXSCREENER_TOKEN_API = 'https://api.dexscreener.com/latest/dex/tokens';

export interface TokenPriceInfo {
  mint: string;
  symbol: string;
  price_usd: number;
  change_h1: number;
  change_h6: number;
  change_h24: number;
  volume_h24: number;
  liquidity_usd: number;
  fetched_at: number;
}

export class TokenPriceMonitor {
  private cache: Map<string, TokenPriceInfo>;
  private cacheDurationMs: number;

  constructor(cacheDurationMs: number = 30000) {
    this.cache = new Map();
    this.cacheDurationMs = cacheDurationMs;
  }

  /**
   * Fetch price for a single token by mint address
   */
  async getTokenPrice(mint: string): Promise<TokenPriceInfo | null> {
    const now = Date.now();

    // Check cache
    const cached = this.cache.get(mint);
    if (cached && now - cached.fetched_at < this.cacheDurationMs) {
      return cached;
    }

    try {
      const response = await axios.get(`${DEXSCREENER_TOKEN_API}/${mint}`, { timeout: 10000 });
      const pairs = response.data?.pairs || [];

      if (pairs.length === 0) return null;

      // Find highest liquidity Solana pair
      const solPair = pairs
        .filter((p: any) => p.chainId === 'solana')
        .sort((a: any, b: any) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0))[0];

      if (!solPair) return null;

      const info: TokenPriceInfo = {
        mint,
        symbol: solPair.baseToken?.symbol || 'UNKNOWN',
        price_usd: parseFloat(solPair.priceUsd || '0'),
        change_h1: solPair.priceChange?.h1 || 0,
        change_h6: solPair.priceChange?.h6 || 0,
        change_h24: solPair.priceChange?.h24 || 0,
        volume_h24: solPair.volume?.h24 || 0,
        liquidity_usd: solPair.liquidity?.usd || 0,
        fetched_at: now,
      };

      this.cache.set(mint, info);
      return info;
    } catch (err: any) {
      console.warn(`[TokenPrice] Failed to fetch ${mint}: ${err.message}`);
      return cached || null;
    }
  }

  /**
   * Fetch prices for multiple tokens at once
   * DexScreener supports comma-separated mints (max 30)
   */
  async getMultipleTokenPrices(mints: string[]): Promise<Map<string, TokenPriceInfo>> {
    const results = new Map<string, TokenPriceInfo>();
    const now = Date.now();

    // Split into cached vs needs fetch
    const needsFetch: string[] = [];
    for (const mint of mints) {
      const cached = this.cache.get(mint);
      if (cached && now - cached.fetched_at < this.cacheDurationMs) {
        results.set(mint, cached);
      } else {
        needsFetch.push(mint);
      }
    }

    if (needsFetch.length === 0) return results;

    // Fetch in batches of 30 (DexScreener limit)
    for (let i = 0; i < needsFetch.length; i += 30) {
      const batch = needsFetch.slice(i, i + 30);
      const joined = batch.join(',');

      try {
        const response = await axios.get(`${DEXSCREENER_TOKEN_API}/${joined}`, { timeout: 15000 });
        const pairs = response.data?.pairs || [];

        // Group pairs by base token mint
        const pairsByMint: Record<string, any[]> = {};
        for (const pair of pairs) {
          if (pair.chainId !== 'solana') continue;
          const mint = pair.baseToken?.address;
          if (!mint) continue;
          if (!pairsByMint[mint]) pairsByMint[mint] = [];
          pairsByMint[mint].push(pair);
        }

        // Pick highest liquidity pair for each token
        for (const mint of batch) {
          const tokenPairs = pairsByMint[mint] || [];
          if (tokenPairs.length === 0) continue;

          const best = tokenPairs.sort((a: any, b: any) =>
            (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0)
          )[0];

          const info: TokenPriceInfo = {
            mint,
            symbol: best.baseToken?.symbol || 'UNKNOWN',
            price_usd: parseFloat(best.priceUsd || '0'),
            change_h1: best.priceChange?.h1 || 0,
            change_h6: best.priceChange?.h6 || 0,
            change_h24: best.priceChange?.h24 || 0,
            volume_h24: best.volume?.h24 || 0,
            liquidity_usd: best.liquidity?.usd || 0,
            fetched_at: now,
          };

          this.cache.set(mint, info);
          results.set(mint, info);
        }
      } catch (err: any) {
        console.warn(`[TokenPrice] Batch fetch failed: ${err.message}`);
        // Return cached values for failed batch
        for (const mint of batch) {
          const cached = this.cache.get(mint);
          if (cached) results.set(mint, cached);
        }
      }
    }

    return results;
  }

  /**
   * Calculate PnL for a position
   */
  async calculatePnL(
    tokenMint: string,
    avgBuyPriceUsd: number,
    totalAmountToken: number,
    totalInvestedSol: number
  ): Promise<{
    current_price_usd: number;
    avg_buy_price_usd: number;
    pnl_pct: number;
    unrealized_value_usd: number;
    cost_basis_usd: number;
  } | null> {
    const priceInfo = await this.getTokenPrice(tokenMint);
    if (!priceInfo || priceInfo.price_usd === 0) return null;

    const currentValueUsd = totalAmountToken * priceInfo.price_usd;
    const costBasisUsd = avgBuyPriceUsd * totalAmountToken;
    const pnlPct = costBasisUsd > 0 ? ((currentValueUsd - costBasisUsd) / costBasisUsd) * 100 : 0;

    return {
      current_price_usd: priceInfo.price_usd,
      avg_buy_price_usd: avgBuyPriceUsd,
      pnl_pct: pnlPct,
      unrealized_value_usd: currentValueUsd,
      cost_basis_usd: costBasisUsd,
    };
  }

  /**
   * Clear cache for a specific token or all tokens
   */
  clearCache(mint?: string): void {
    if (mint) {
      this.cache.delete(mint);
    } else {
      this.cache.clear();
    }
  }
}
