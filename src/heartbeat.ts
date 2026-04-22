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
        return;
      }

      if (!this.quiet) console.log(`[Heartbeat] Evaluating ${strategies.length} active strategies`);

      // Fetch current state with real price data
      const triggerState = await fetchTriggerState(this.apiClient, this.priceMonitor, this.opsMonitor);

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
}
