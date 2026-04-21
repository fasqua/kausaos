/**
 * KausaOS - Heartbeat Scheduler
 * Wakes up every N minutes, evaluates strategies, executes actions
 */

import { StrategyEngine } from './strategy/engine';
import { evaluateTrigger, fetchTriggerState } from './strategy/triggers';
import { executeAction } from './strategy/actions';
import { KausaLayerClient } from './brain/api-client';

export class Heartbeat {
  private intervalMinutes: number;
  private timer: NodeJS.Timeout | null;
  private strategyEngine: StrategyEngine;
  private apiClient: KausaLayerClient;
  private running: boolean;
  private lastBeat: string | null;
  private beatCount: number;

  constructor(
    intervalMinutes: number,
    strategyEngine: StrategyEngine,
    apiClient: KausaLayerClient
  ) {
    this.intervalMinutes = intervalMinutes;
    this.timer = null;
    this.strategyEngine = strategyEngine;
    this.apiClient = apiClient;
    this.running = false;
    this.lastBeat = null;
    this.beatCount = 0;
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

  private async beat(): Promise<void> {
    if (!this.running) return;

    this.beatCount++;
    this.lastBeat = new Date().toISOString();
    console.log(`[Heartbeat] Beat #${this.beatCount} at ${this.lastBeat}`);

    try {
      // Reset daily counters if needed
      this.strategyEngine.resetDailyCounters();

      // Get active strategies ready to evaluate
      const strategies = this.strategyEngine.getActiveStrategies();
      if (strategies.length === 0) {
        console.log('[Heartbeat] No active strategies to evaluate');
        return;
      }

      console.log(`[Heartbeat] Evaluating ${strategies.length} active strategies`);

      // Fetch current state for trigger evaluation
      const triggerState = await fetchTriggerState(this.apiClient);

      // Evaluate each strategy
      for (const strategy of strategies) {
        try {
          const triggerResult = await evaluateTrigger(strategy, triggerState);

          if (triggerResult.triggered) {
            console.log(`[Heartbeat] Strategy "${strategy.name}" TRIGGERED: ${triggerResult.reason}`);

            // Execute the action
            const actionResult = await executeAction(
              strategy,
              triggerResult,
              this.apiClient,
              this.strategyEngine
            );

            // Log the execution
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
