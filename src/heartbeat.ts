/**
 * KausaOS - Heartbeat Scheduler
 * Phase 2: PriceMonitor integration + per-strategy interval support
 */

import { StrategyEngine } from './strategy/engine';
import { evaluateTrigger, fetchTriggerState } from './strategy/triggers';
import { executeAction } from './strategy/actions';
import { ExecutionPipeline } from './executor/pipeline';
import { KausaLayerClient } from './brain/api-client';
import { PriceMonitor } from './monitor/price';
import { TokenPriceMonitor } from './monitor/token-price';
import { OperationsMonitor } from './monitor/operations';
import { Notifier } from './notify';

export class Heartbeat {
  private intervalMinutes: number;
  private timer: NodeJS.Timeout | null;
  private strategyEngine: StrategyEngine;
  private apiClient: KausaLayerClient;
  private priceMonitor: PriceMonitor;
  private running: boolean;
  private lastBeat: string | null;
  private beatCount: number;
  private quiet: boolean;
  private pipeline: ExecutionPipeline;
  private opsMonitor: OperationsMonitor;
  private notifier: Notifier;
  private tokenPriceMonitor: TokenPriceMonitor;

  constructor(
    intervalMinutes: number,
    strategyEngine: StrategyEngine,
    apiClient: KausaLayerClient
  ) {
    this.intervalMinutes = intervalMinutes;
    this.timer = null;
    this.strategyEngine = strategyEngine;
    this.apiClient = apiClient;
    this.priceMonitor = new PriceMonitor();
    this.running = false;
    this.lastBeat = null;
    this.beatCount = 0;
    this.quiet = false;
    this.pipeline = new ExecutionPipeline();
    this.opsMonitor = new OperationsMonitor();
    this.notifier = new Notifier();
    this.tokenPriceMonitor = new TokenPriceMonitor();
  }

  start(): void {
    if (this.running) return;
    this.running = true;

    const intervalMs = this.intervalMinutes * 60 * 1000;
    console.log(`[Heartbeat] Started. Interval: ${this.intervalMinutes} minutes`);

    // Run first beat after a short delay
    setTimeout(() => this.beat(), 5000);

    // Schedule recurring beats
    this.timer = setInterval(() => this.beat(), intervalMs);
  }

  stop(): void {
    this.running = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    console.log('[Heartbeat] Stopped');
  }

  getLastBeat(): string | null {
    return this.lastBeat;
  }

  getBeatCount(): number {
    return this.beatCount;
  }

  setQuiet(quiet: boolean): void {
    this.quiet = quiet;
  }

  getPriceMonitor(): PriceMonitor {
    return this.priceMonitor;
  }

  setNotifier(notifier: Notifier): void {
    this.notifier = notifier;
  }

  getPendingOperations(): number {
    return this.pipeline.getPendingCount();
  }

  private async beat(): Promise<void> {
    if (!this.running) return;

    this.beatCount++;
    this.lastBeat = new Date().toISOString();
    if (!this.quiet) console.log(`[Heartbeat] Beat #${this.beatCount} at ${this.lastBeat}`);

    try {
      // Reset daily counters if needed
      this.strategyEngine.resetDailyCounters();

      // Get active strategies ready to evaluate
      const strategies = this.strategyEngine.getActiveStrategies();
      if (strategies.length === 0) {
        if (!this.quiet) console.log('[Heartbeat] No active strategies to evaluate');
      }

      if (!this.quiet) console.log(`[Heartbeat] Evaluating ${strategies.length} active strategies`);

      // Fetch current state with real price data
      const triggerState = await fetchTriggerState(this.apiClient, this.priceMonitor, this.opsMonitor, this.strategyEngine, this.tokenPriceMonitor);

      // Log price info
      if (triggerState.solPrice > 0) {
        if (!this.quiet) console.log(`[Heartbeat] SOL: $${triggerState.solPrice.toFixed(2)} (1h: ${triggerState.solPriceChange_h1.toFixed(2)}%, 6h: ${triggerState.solPriceChange_h6.toFixed(2)}%, 24h: ${triggerState.solPriceChange_h24.toFixed(2)}%)`);
      }

      // Evaluate each strategy
      for (const strategy of strategies) {
        try {
          // Per-strategy interval check
          if (strategy.trigger_interval_seconds > 0 && strategy.last_executed_at) {
            const lastExec = new Date(strategy.last_executed_at).getTime();
            const intervalMs = strategy.trigger_interval_seconds * 1000;
            if (Date.now() - lastExec < intervalMs) {
              continue; // Skip, not enough time passed for this strategy
            }
          }

          const triggerResult = await evaluateTrigger(strategy, triggerState);

          if (triggerResult.triggered) {
            console.log(`[Heartbeat] Strategy "${strategy.name}" TRIGGERED: ${triggerResult.reason}`);

            const pipelineResult = await this.pipeline.run(
              strategy,
              triggerResult,
              this.apiClient,
              this.strategyEngine,
              this.notifier
            );

            this.strategyEngine.logExecution(
              strategy.id,
              triggerResult.reason,
              pipelineResult.message,
              pipelineResult.success
            );

            console.log(`[Heartbeat] Strategy "${strategy.name}" [${pipelineResult.stage}]: ${pipelineResult.message}`);

          }
        } catch (err: any) {
          console.error(`[Heartbeat] Error evaluating strategy "${strategy.name}": ${err.message}`);
          this.strategyEngine.logExecution(
            strategy.id,
            'evaluation_error',
            err.message,
            false
          );
        }
      }

      // Evaluate trade rules (take profit, stop loss, DCA)
      try {
        await this.evaluateTradeRules();
      } catch (err: any) {
        console.error(`[Heartbeat] Trade rules error: ${err.message}`);
      }

      // Detect anomalies: operations stuck > 10 minutes
      const anomalies = this.pipeline.detectAnomalies();
      if (anomalies.length > 0) {
        console.log(`[Heartbeat] ANOMALY: ${anomalies.length} operation(s) stuck > 10 minutes`);
      }

      // Check backend for stuck/failed operations
      try {
        const opsStatus = await this.opsMonitor.checkOperations(this.apiClient);
        if (opsStatus.stuck.length > 0) {
          console.log(`[Heartbeat] STUCK: ${opsStatus.stuck.length} operation(s) stuck in backend`);
        }
        if (opsStatus.failed.length > 0) {
          console.log(`[Heartbeat] FAILED: ${opsStatus.failed.length} operation(s) failed in backend`);
        }
      } catch (_) {}
    } catch (err: any) {
      console.error(`[Heartbeat] Beat error: ${err.message}`);
    }

  }

  /**
   * Evaluate trade rules: take profit, stop loss, DCA
   */
  private async evaluateTradeRules(): Promise<void> {
    const rules = this.strategyEngine.getActiveTradeRules();
    if (rules.length === 0) return;

    console.log(`[Heartbeat] Evaluating ${rules.length} trade rule(s)`);

    for (const rule of rules) {
      try {
        const position = this.strategyEngine.getPosition(rule.pocket_id, rule.token_mint);
        if (!position || position.total_amount_token <= 0) continue;

        // Check take profit / stop loss
        if (rule.take_profit_pct || rule.stop_loss_pct) {
          const priceInfo = await this.tokenPriceMonitor.getTokenPrice(rule.token_mint);
          if (!priceInfo || priceInfo.price_usd === 0) continue;

          const avgBuy = position.average_buy_price_usd;
          if (avgBuy <= 0) continue;

          const currentPrice = priceInfo.price_usd;
          const changePct = ((currentPrice - avgBuy) / avgBuy) * 100;

          // Take profit
          if (rule.take_profit_pct && changePct >= rule.take_profit_pct) {
            console.log(`[TradeRule] TAKE PROFIT: ${rule.token_symbol} at ${changePct.toFixed(1)}% (target: ${rule.take_profit_pct}%)`);
            try {
              const sellResult = await this.apiClient.swapExecute(rule.pocket_id, {
                input_mint: rule.token_mint,
                output_mint: 'So11111111111111111111111111111111111111112',
                amount: 0,
                amount_raw: position.total_amount_token,
              });
              if (sellResult.success) {
                this.strategyEngine.recordTrade({
                  pocket_id: rule.pocket_id,
                  token_mint: rule.token_mint,
                  token_symbol: rule.token_symbol,
                  side: 'sell',
                  amount_sol: 0,
                  amount_token: position.total_amount_token,
                  price_usd: currentPrice,
                  tx_signature: sellResult.data?.tx_signature || null,
                });
                console.log(`[TradeRule] Sold ${rule.token_symbol}: +${changePct.toFixed(1)}%`);
                if (this.notifier.hasWebhooks()) {
                  await this.notifier.send(`Take profit executed: ${rule.token_symbol} at +${changePct.toFixed(1)}% from avg buy`);
                }
              }
            } catch (err: any) {
              console.error(`[TradeRule] Take profit sell failed: ${err.message}`);
            }
            continue;
          }

          // Stop loss
          if (rule.stop_loss_pct && changePct <= -rule.stop_loss_pct) {
            console.log(`[TradeRule] STOP LOSS: ${rule.token_symbol} at ${changePct.toFixed(1)}% (limit: -${rule.stop_loss_pct}%)`);
            try {
              const sellResult = await this.apiClient.swapExecute(rule.pocket_id, {
                input_mint: rule.token_mint,
                output_mint: 'So11111111111111111111111111111111111111112',
                amount: 0,
                amount_raw: position.total_amount_token,
              });
              if (sellResult.success) {
                this.strategyEngine.recordTrade({
                  pocket_id: rule.pocket_id,
                  token_mint: rule.token_mint,
                  token_symbol: rule.token_symbol,
                  side: 'sell',
                  amount_sol: 0,
                  amount_token: position.total_amount_token,
                  price_usd: currentPrice,
                  tx_signature: sellResult.data?.tx_signature || null,
                });
                console.log(`[TradeRule] Sold ${rule.token_symbol}: ${changePct.toFixed(1)}%`);
                if (this.notifier.hasWebhooks()) {
                  await this.notifier.send(`Stop loss executed: ${rule.token_symbol} at ${changePct.toFixed(1)}% from avg buy`);
                }
              }
            } catch (err: any) {
              console.error(`[TradeRule] Stop loss sell failed: ${err.message}`);
            }
            continue;
          }
        }

        // DCA
        if (rule.dca_interval_minutes && rule.dca_amount_sol) {
          const now = Date.now();
          const lastDca = rule.last_dca_at ? new Date(rule.last_dca_at).getTime() : 0;
          const intervalMs = rule.dca_interval_minutes * 60 * 1000;

          if (now - lastDca >= intervalMs) {
            console.log(`[TradeRule] DCA: buying ${rule.dca_amount_sol} SOL of ${rule.token_symbol}`);
            try {
              const buyResult = await this.apiClient.swapExecute(rule.pocket_id, {
                input_mint: 'SOL',
                output_mint: rule.token_mint,
                amount: rule.dca_amount_sol,
              });
              if (buyResult.success) {
                const swapData = buyResult.data?.swap_result || buyResult.data || {};
                this.strategyEngine.recordTrade({
                  pocket_id: rule.pocket_id,
                  token_mint: rule.token_mint,
                  token_symbol: rule.token_symbol,
                  side: 'buy',
                  amount_sol: rule.dca_amount_sol,
                  amount_token: parseFloat(swapData.out_amount || '0'),
                  price_usd: parseFloat(swapData.price_usd || '0'),
                  tx_signature: swapData.tx_signature || null,
                });
                this.strategyEngine.updateTradeRuleDcaTime(rule.id);
                console.log(`[TradeRule] DCA complete: ${rule.dca_amount_sol} SOL -> ${rule.token_symbol}`);
              }
            } catch (err: any) {
              console.error(`[TradeRule] DCA buy failed: ${err.message}`);
            }
          }
        }
      } catch (err: any) {
        console.error(`[TradeRule] Error evaluating rule ${rule.id}: ${err.message}`);
      }
    }
  }

}
