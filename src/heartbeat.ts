/**
 * KausaOS - Heartbeat Scheduler
 * Phase 2: PriceMonitor integration + per-strategy interval support
 */

import { StrategyEngine } from './strategy/engine';
import { evaluateTrigger, fetchTriggerState } from './strategy/triggers';
import { executeAction } from './strategy/actions';
import { KausaLayerClient } from './brain/api-client';
import { PriceMonitor } from './monitor/price';

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
        return;
      }

      if (!this.quiet) console.log(`[Heartbeat] Evaluating ${strategies.length} active strategies`);

      // Fetch current state with real price data
      const triggerState = await fetchTriggerState(this.apiClient, this.priceMonitor);

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

            const actionResult = await executeAction(
              strategy,
              triggerResult,
              this.apiClient,
              this.strategyEngine
            );

            this.strategyEngine.logExecution(
              strategy.id,
              triggerResult.reason,
              actionResult.message,
              actionResult.success
            );

            console.log(`[Heartbeat] Strategy "${strategy.name}" action: ${actionResult.message}`);
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
    } catch (err: any) {
      console.error(`[Heartbeat] Beat error: ${err.message}`);
    }
  }
}
