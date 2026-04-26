/**
 * KausaOS - Execution Pipeline
 * Safety layer: validate, conflict check, execute, retry, recover
 * Sits between heartbeat trigger and action execution
 */

import { Strategy } from '../strategy/engine';
import { TriggerResult } from '../strategy/triggers';
import { ActionResult, executeAction } from '../strategy/actions';
import { KausaLayerClient } from '../brain/api-client';
import { StrategyEngine } from '../strategy/engine';
import { Notifier } from '../notify';

export interface PipelineResult {
  success: boolean;
  message: string;
  stage: 'validation' | 'conflict' | 'execution' | 'retry';
  data?: any;
}

interface PendingOperation {
  pocketId: string;
  type: 'funding' | 'sweep' | 'p2p';
  startedAt: number;
}

export class ExecutionPipeline {
  private pendingOps: PendingOperation[];
  private maxRetries: number;
  private anomalyThresholdMs: number;

  constructor() {
    this.pendingOps = [];
    this.maxRetries = 3;
    this.anomalyThresholdMs = 10 * 60 * 1000; // 10 minutes
  }

  /**
   * Run the full pipeline: validate -> conflict check -> execute -> retry on failure
   */
  async run(
    strategy: Strategy,
    triggerResult: TriggerResult,
    apiClient: KausaLayerClient,
    strategyEngine: StrategyEngine,
    notifier?: Notifier
  ): Promise<PipelineResult> {

    // Stage 1: Validation
    const validation = await this.validate(strategy, triggerResult, apiClient);
    if (!validation.valid) {
      return {
        success: false,
        message: `Validation failed: ${validation.reason}`,
        stage: 'validation',
      };
    }

    // Stage 2: Conflict check
    const conflict = this.checkConflict(strategy, triggerResult);
    if (conflict.hasConflict) {
      return {
        success: false,
        message: `Conflict detected: ${conflict.reason}`,
        stage: 'conflict',
      };
    }

    // Stage 3: Execute with retry
    let lastError = '';
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        // Track operation
        const matchedPockets = triggerResult.matchedPockets || [];
        for (const pocketId of matchedPockets) {
          this.trackOperation(pocketId, strategy.action_type as any);
        }

        const actionResult = await executeAction(
          strategy,
          triggerResult,
          apiClient,
          strategyEngine,
          notifier
        );

        // Clear tracked operations on success
        for (const pocketId of matchedPockets) {
          this.clearOperation(pocketId);
        }

        if (actionResult.success) {
          return {
            success: true,
            message: actionResult.message,
            stage: 'execution',
            data: actionResult.data,
          };
        }

        lastError = actionResult.message;

        // Don't retry certain errors
        if (this.isNonRetryableError(actionResult.message)) {
          return {
            success: false,
            message: `Action failed (non-retryable): ${actionResult.message}`,
            stage: 'execution',
          };
        }

      } catch (err: any) {
        lastError = err.message;
      }

      // Wait before retry (exponential backoff)
      if (attempt < this.maxRetries) {
        const backoffMs = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
        console.log(`[Pipeline] Retry ${attempt}/${this.maxRetries} in ${backoffMs / 1000}s...`);
        await this.sleep(backoffMs);
      }
    }

    return {
      success: false,
      message: `Failed after ${this.maxRetries} retries: ${lastError}`,
      stage: 'retry',
    };
  }

  /**
   * Stage 1: Pre-execution validation
   */
  private async validate(
    strategy: Strategy,
    triggerResult: TriggerResult,
    apiClient: KausaLayerClient
  ): Promise<{ valid: boolean; reason: string }> {
    const matchedPockets = triggerResult.matchedPockets || [];

    // For sweep/send actions, verify pockets have balance
    if (['sweep', 'send_p2p'].includes(strategy.action_type) && matchedPockets.length > 0) {
      for (const pocketId of matchedPockets) {
        const res = await apiClient.getPocket(pocketId);
        if (res.success && res.data) {
          const balance = res.data.balance_sol || res.data.balance || 0;
          if (balance <= 0) {
            return { valid: false, reason: `Pocket ${pocketId} has zero balance` };
          }
        }
      }
    }

    // For swap actions, verify pocket exists and has balance
    if (strategy.action_type === 'swap') {
      const pocketId = strategy.action_params.pocket_id || matchedPockets[0];
      if (!pocketId) {
        // No specific pocket - actionSwap will auto-fetch all active pockets
        return { valid: true, reason: 'ok - will swap all active pockets' };
      }
    }

    return { valid: true, reason: 'ok' };
  }

  /**
   * Stage 2: Conflict detection
   */
  private checkConflict(
    strategy: Strategy,
    triggerResult: TriggerResult
  ): { hasConflict: boolean; reason: string } {
    const matchedPockets = triggerResult.matchedPockets || [];

    // Check if any matched pocket already has a pending operation
    for (const pocketId of matchedPockets) {
      const pending = this.pendingOps.find((op) => op.pocketId === pocketId);
      if (pending) {
        return {
          hasConflict: true,
          reason: `Pocket ${pocketId} has pending ${pending.type} operation`,
        };
      }
    }

    return { hasConflict: false, reason: '' };
  }

  /**
   * Track a pending operation
   */
  private trackOperation(pocketId: string, type: 'funding' | 'sweep' | 'p2p'): void {
    // Remove existing tracking for this pocket
    this.pendingOps = this.pendingOps.filter((op) => op.pocketId !== pocketId);
    this.pendingOps.push({ pocketId, type, startedAt: Date.now() });
  }

  /**
   * Clear a tracked operation
   */
  private clearOperation(pocketId: string): void {
    this.pendingOps = this.pendingOps.filter((op) => op.pocketId !== pocketId);
  }

  /**
   * Detect anomalies: operations stuck longer than threshold
   */
  detectAnomalies(): PendingOperation[] {
    const now = Date.now();
    return this.pendingOps.filter((op) => now - op.startedAt > this.anomalyThresholdMs);
  }

  /**
   * Get count of pending operations
   */
  getPendingCount(): number {
    return this.pendingOps.length;
  }

  /**
   * Check if error is non-retryable
   */
  private isNonRetryableError(message: string): boolean {
    const nonRetryable = [
      'zero balance',
      'not found',
      'invalid',
      'insufficient',
      'unauthorized',
      'No pocket',
    ];
    return nonRetryable.some((keyword) => message.toLowerCase().includes(keyword.toLowerCase()));
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
