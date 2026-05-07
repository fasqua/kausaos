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
import { LlmProvider } from '../brain/llm';

export interface PipelineResult {
  success: boolean;
  message: string;
  stage: 'validation' | 'conflict' | 'execution' | 'retry';
  data?: any;
}

export interface ChainStep {
  step: number;
  action_type: string;
  action_params: Record<string, any>;
  output_var?: string;
  continue_on_fail?: boolean;
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
    notifier?: Notifier,
    llmProvider?: LlmProvider
  ): Promise<PipelineResult> {

    // Check for action chain
    if (strategy.action_chain) {
      return await this.runChain(strategy, triggerResult, apiClient, strategyEngine, notifier, llmProvider);
    }

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
          notifier,
          llmProvider
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
   * Run a multi-step action chain. Output from step N becomes context for step N+1.
   */
  private async runChain(
    strategy: Strategy,
    triggerResult: TriggerResult,
    apiClient: KausaLayerClient,
    strategyEngine: StrategyEngine,
    notifier?: Notifier,
    llmProvider?: LlmProvider
  ): Promise<PipelineResult> {
    let chain: ChainStep[];
    try {
      chain = JSON.parse(strategy.action_chain!);
    } catch (_) {
      return { success: false, message: 'Invalid action_chain JSON', stage: 'validation' };
    }

    if (!Array.isArray(chain) || chain.length === 0) {
      return { success: false, message: 'action_chain is empty', stage: 'validation' };
    }

    const stepOutputs = new Map<string, any>();
    stepOutputs.set('$trigger', { reason: triggerResult.reason, matchedPockets: triggerResult.matchedPockets });

    for (let i = 0; i < chain.length; i++) {
      const step = chain[i];

      // Handle condition steps (branch logic)
      if (step.action_type === 'condition') {
        const resolvedCondParams = resolveTemplates(step.action_params, stepOutputs);
        const conditionMet = evaluateCondition(resolvedCondParams.if || '', stepOutputs);
        const gotoStep = conditionMet ? resolvedCondParams.then_goto : resolvedCondParams.else_goto;

        if (gotoStep === 'stop' || gotoStep === undefined) {
          if (gotoStep === 'stop') break;
          continue;
        }

        const targetIdx = chain.findIndex((s: ChainStep) => s.step === Number(gotoStep));
        if (targetIdx >= 0) {
          i = targetIdx - 1; // -1 because loop increments
        }
        continue;
      }

      // Determine loop count (default 1 = no loop)
      const loopCount = (step as any).loop?.count || 1;
      const loopDelay = (step as any).loop?.delay_seconds || 0;

      for (let loopIdx = 0; loopIdx < loopCount; loopIdx++) {
        // Budget check for kausa_pay steps
        if (step.action_type === 'kausa_pay' && step.action_params.budget) {
          const budget = step.action_params.budget;
          const today = new Date().toISOString().split('T')[0];
          const spent = strategyEngine.getStrategySpend(strategy.id, today);
          const maxAmount = step.action_params.max_amount_usdc || 0.01;
          if (budget.max_daily_usdc && spent + maxAmount > budget.max_daily_usdc) {
            stepOutputs.set('$prev', { message: 'Daily budget exceeded' });
            break;
          }
        }

        // Resolve template variables in action_params
        const resolvedParams = resolveTemplates(step.action_params, stepOutputs);

        // Build temporary strategy-like object for executeAction
        const stepStrategy = {
          ...strategy,
          action_type: step.action_type as any,
          action_params: resolvedParams,
        };

        try {
          const result = await executeAction(stepStrategy, triggerResult, apiClient, strategyEngine, notifier, llmProvider);

          // Record spend for kausa_pay
          if (step.action_type === 'kausa_pay' && result.success) {
            const today = new Date().toISOString().split('T')[0];
            const spentAmount = step.action_params.max_amount_usdc || 0.01;
            strategyEngine.recordStrategySpend(strategy.id, today, spentAmount);
          }

          // Store output
          const outputData = result.data || { message: result.message };
          if (step.output_var) {
            stepOutputs.set(step.output_var, outputData);
          }
          stepOutputs.set('$prev', outputData);

          // Stop chain on failure unless continue_on_fail
          if (!result.success && !step.continue_on_fail) {
            return {
              success: false,
              message: `Chain failed at step ${step.step}: ${result.message}`,
              stage: 'execution',
              data: { failed_step: step.step, outputs: Object.fromEntries(stepOutputs) },
            };
          }
        } catch (err: any) {
          if (!step.continue_on_fail) {
            return {
              success: false,
              message: `Chain error at step ${step.step}: ${err.message}`,
              stage: 'execution',
              data: { failed_step: step.step },
            };
          }
          stepOutputs.set('$prev', { error: err.message });
        }

        // Delay between loop iterations
        if (loopIdx < loopCount - 1 && loopDelay > 0) {
          await new Promise(r => setTimeout(r, loopDelay * 1000));
        }
      }
    }

    return {
      success: true,
      message: `Chain completed: ${chain.length} steps`,
      stage: 'execution',
      data: { outputs: Object.fromEntries(stepOutputs) },
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

/**
 * Evaluate a condition string like "{{var.field}} contains 'text'" or "{{var.field}} > 100"
 */
function evaluateCondition(condition: string, outputs: Map<string, any>): boolean {
  if (!condition) return false;

  // Resolve all template variables first
  let resolved = condition;
  resolved = resolved.replace(/\{\{(\$?\w+)\.(\w+)\}\}/g, (_, varName, field) => {
    const data = outputs.get(varName);
    return data?.[field] ?? '';
  });

  // Parse operator
  if (resolved.includes(' contains ')) {
    const parts = resolved.split(' contains ');
    const left = parts[0].trim();
    const right = parts.slice(1).join(' contains ').trim().replace(/^['"]|['"]$/g, '');
    return left.toLowerCase().includes(right.toLowerCase());
  }
  if (resolved.includes(' not_contains ')) {
    const parts = resolved.split(' not_contains ');
    const left = parts[0].trim();
    const right = parts.slice(1).join(' not_contains ').trim().replace(/^['"]|['"]$/g, '');
    return !left.toLowerCase().includes(right.toLowerCase());
  }
  if (resolved.includes(' > ')) {
    const [left, right] = resolved.split(' > ');
    return parseFloat(left.trim()) > parseFloat(right.trim());
  }
  if (resolved.includes(' < ')) {
    const [left, right] = resolved.split(' < ');
    return parseFloat(left.trim()) < parseFloat(right.trim());
  }
  if (resolved.includes(' >= ')) {
    const [left, right] = resolved.split(' >= ');
    return parseFloat(left.trim()) >= parseFloat(right.trim());
  }
  if (resolved.includes(' <= ')) {
    const [left, right] = resolved.split(' <= ');
    return parseFloat(left.trim()) <= parseFloat(right.trim());
  }
  if (resolved.includes(' == ')) {
    const [left, right] = resolved.split(' == ');
    return left.trim().replace(/^['"]|['"]$/g, '') === right.trim().replace(/^['"]|['"]$/g, '');
  }
  if (resolved.includes(' != ')) {
    const [left, right] = resolved.split(' != ');
    return left.trim().replace(/^['"]|['"]$/g, '') !== right.trim().replace(/^['"]|['"]$/g, '');
  }
  if (resolved.trim().endsWith(' exists')) {
    const val = resolved.replace(' exists', '').trim();
    return val !== '' && val !== 'undefined' && val !== 'null';
  }

  // If no operator matched, treat as truthy check
  return resolved.trim() !== '' && resolved.trim() !== 'false' && resolved.trim() !== '0';
}

function resolveTemplates(params: Record<string, any>, outputs: Map<string, any>): Record<string, any> {
  const resolved = { ...params };
  for (const [key, value] of Object.entries(resolved)) {
    if (typeof value === 'string' && value.includes('{{')) {
      resolved[key] = value.replace(/\{\{(\$?\w+)\.(\w+)\}\}/g, (_, varName, field) => {
        const data = outputs.get(varName);
        return data?.[field] ?? '';
      });
    } else if (typeof value === 'object' && value !== null) {
      resolved[key] = resolveTemplates(value, outputs);
    }
  }
  return resolved;
}
