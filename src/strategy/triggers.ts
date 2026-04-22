/**
 * KausaOS - Trigger Evaluator
 * Evaluates strategy trigger conditions against current state
 * Phase 2: Real price feed + multi-condition triggers
 */

import { Strategy, TriggerType } from './engine';
import { KausaLayerClient } from '../brain/api-client';
import { PriceMonitor } from '../monitor/price';

export interface TriggerState {
  pockets: Array<{
    id: string;
    balance: number;
    status: string;
    created_at: string;
    last_activity: string | null;
  }>;
  solPrice: number;
  solPriceChange_h1: number;
  solPriceChange_h6: number;
  solPriceChange_h24: number;
  activePocketCount: number;
  pendingOperations: number;
}

export interface TriggerResult {
  triggered: boolean;
  reason: string;
  matchedPockets?: string[];
}

/**
 * Evaluate a single trigger or multi-condition trigger
 * Multi-condition format: "condition1 AND condition2" or "condition1 OR condition2"
 */
export async function evaluateTrigger(
  strategy: Strategy,
  state: TriggerState
): Promise<TriggerResult> {
  const { trigger_type, trigger_condition } = strategy;

  try {
    // Check for multi-condition (AND / OR)
    if (trigger_condition.includes(' AND ')) {
      return evaluateMultiCondition(strategy, state, 'AND');
    }
    if (trigger_condition.includes(' OR ')) {
      return evaluateMultiCondition(strategy, state, 'OR');
    }

    // Single condition
    return evaluateSingleTrigger(trigger_type, trigger_condition, state);
  } catch (err: any) {
    return { triggered: false, reason: `Trigger evaluation error: ${err.message}` };
  }
}

/**
 * Evaluate multi-condition triggers (AND / OR)
 */
async function evaluateMultiCondition(
  strategy: Strategy,
  state: TriggerState,
  operator: 'AND' | 'OR'
): Promise<TriggerResult> {
  const separator = ` ${operator} `;
  const conditions = strategy.trigger_condition.split(separator);
  const results: TriggerResult[] = [];

  for (const condition of conditions) {
    const trimmed = condition.trim();
    // Auto-detect trigger type from condition
    const detectedType = detectTriggerType(trimmed);
    const result = await evaluateSingleTrigger(detectedType, trimmed, state);
    results.push(result);
  }

  if (operator === 'AND') {
    const allTriggered = results.every((r) => r.triggered);
    const reasons = results.map((r) => r.reason).join(' AND ');
    const matchedPockets = results
      .flatMap((r) => r.matchedPockets || [])
      .filter((v, i, a) => a.indexOf(v) === i); // deduplicate

    return {
      triggered: allTriggered,
      reason: allTriggered ? `All conditions met: ${reasons}` : `Not all conditions met: ${reasons}`,
      matchedPockets: allTriggered ? matchedPockets : undefined,
    };
  } else {
    // OR
    const anyTriggered = results.some((r) => r.triggered);
    const triggeredResults = results.filter((r) => r.triggered);
    const reasons = triggeredResults.length > 0
      ? triggeredResults.map((r) => r.reason).join(' OR ')
      : results.map((r) => r.reason).join(' OR ');
    const matchedPockets = triggeredResults
      .flatMap((r) => r.matchedPockets || [])
      .filter((v, i, a) => a.indexOf(v) === i);

    return {
      triggered: anyTriggered,
      reason: anyTriggered ? `Condition met: ${reasons}` : `No conditions met: ${reasons}`,
      matchedPockets: anyTriggered ? matchedPockets : undefined,
    };
  }
}

/**
 * Auto-detect trigger type from condition string
 */
function detectTriggerType(condition: string): TriggerType {
  if (condition.includes('pocket.balance')) return 'balance_threshold';
  if (condition.startsWith('cron:') || condition.startsWith('every:')) return 'time_based';
  if (condition.includes('sol_drop') || condition.includes('sol_rise') || condition.includes('sol_price')) return 'price_based';
  if (condition.includes('funding_status') || condition.includes('failed')) return 'status_based';
  if (condition.includes('idle')) return 'idle_time';
  if (condition.includes('active_pockets') || condition.includes('pocket_count')) return 'pocket_count';
  return 'balance_threshold'; // default
}

/**
 * Evaluate a single trigger condition
 */
async function evaluateSingleTrigger(
  triggerType: TriggerType,
  condition: string,
  state: TriggerState
): Promise<TriggerResult> {
  switch (triggerType) {
    case 'balance_threshold':
      return evaluateBalanceThreshold(condition, state);
    case 'time_based':
      return evaluateTimeBased(condition);
    case 'price_based':
      return evaluatePriceBased(condition, state);
    case 'status_based':
      return evaluateStatusBased(condition, state);
    case 'idle_time':
      return evaluateIdleTime(condition, state);
    case 'pocket_count':
      return evaluatePocketCount(condition, state);
    default:
      return { triggered: false, reason: `Unknown trigger type: ${triggerType}` };
  }
}

/**
 * balance_threshold: "pocket.balance > 0.5" or "pocket.balance < 0.01"
 */
function evaluateBalanceThreshold(condition: string, state: TriggerState): TriggerResult {
  const match = condition.match(/pocket\.balance\s*(>|<|>=|<=|==)\s*([\d.]+)/);
  if (!match) {
    return { triggered: false, reason: `Invalid balance condition: ${condition}` };
  }

  const operator = match[1];
  const threshold = parseFloat(match[2]);
  const matchedPockets: string[] = [];

  for (const pocket of state.pockets) {
    if (pocket.status !== 'active') continue;
    let met = false;
    switch (operator) {
      case '>': met = pocket.balance > threshold; break;
      case '<': met = pocket.balance < threshold; break;
      case '>=': met = pocket.balance >= threshold; break;
      case '<=': met = pocket.balance <= threshold; break;
      case '==': met = pocket.balance === threshold; break;
    }
    if (met) matchedPockets.push(pocket.id);
  }

  if (matchedPockets.length > 0) {
    return {
      triggered: true,
      reason: `${matchedPockets.length} pocket(s) match: ${condition}`,
      matchedPockets,
    };
  }
  return { triggered: false, reason: `No pockets match: ${condition}` };
}

/**
 * time_based: "cron:0 9 * * *" or "every:2h"
 */
function evaluateTimeBased(condition: string): TriggerResult {
  const now = new Date();

  if (condition.startsWith('every:')) {
    return { triggered: true, reason: `Time-based trigger: ${condition}` };
  }

  if (condition.startsWith('cron:')) {
    const cronParts = condition.replace('cron:', '').trim().split(' ');
    if (cronParts.length >= 2) {
      const cronMinute = parseInt(cronParts[0]);
      const cronHour = parseInt(cronParts[1]);
      const currentHour = now.getUTCHours();
      const currentMinute = now.getUTCMinutes();

      if (currentHour === cronHour && Math.abs(currentMinute - cronMinute) < 30) {
        return { triggered: true, reason: `Cron trigger matched: ${condition}` };
      }
    }
    return { triggered: false, reason: `Cron not matched: ${condition}` };
  }

  return { triggered: false, reason: `Unknown time condition: ${condition}` };
}

/**
 * price_based: "sol_drop > 20" or "sol_drop > 10 6h" or "sol_rise > 15"
 * Format: sol_drop|sol_rise operator threshold [timeframe]
 * Timeframes: h1, h6, h24 (default: h6)
 */
function evaluatePriceBased(condition: string, state: TriggerState): TriggerResult {
  // Support multiple formats:
  // Format 1: "sol_drop > 20 h6" or "sol_drop > 20"
  // Format 2: "sol_price_change_6h < -5" (LLM generated)

  // Try Format 2 first (LLM generated)
  const altMatch = condition.match(/sol_price_change_(\w+)\s*(>|<|>=|<=)\s*(-?[\d.]+)/);
  if (altMatch) {
    let tf = altMatch[1];
    if (tf === '1h') tf = 'h1';
    if (tf === '6h') tf = 'h6';
    if (tf === '24h') tf = 'h24';
    const threshold = parseFloat(altMatch[3]);

    let priceChange = 0;
    switch (tf) {
      case 'h1': priceChange = state.solPriceChange_h1; break;
      case 'h6': priceChange = state.solPriceChange_h6; break;
      case 'h24': priceChange = state.solPriceChange_h24; break;
    }

    let met = false;
    switch (altMatch[2]) {
      case '>': met = priceChange > threshold; break;
      case '<': met = priceChange < threshold; break;
      case '>=': met = priceChange >= threshold; break;
      case '<=': met = priceChange <= threshold; break;
    }

    if (met) {
      return {
        triggered: true,
        reason: `SOL price change ${priceChange.toFixed(2)}% in ${tf} meets: ${condition}`,
      };
    }
    return {
      triggered: false,
      reason: `SOL price change ${priceChange.toFixed(2)}% in ${tf}, condition: ${condition}`,
    };
  }

  // Format 1: "sol_drop > 20 h6" or "sol_drop > 20"
  const match = condition.match(/(sol_drop|sol_rise)\s*(>|<|>=|<=)\s*([\d.]+)\s*(h1|h6|h24)?/);
  if (!match) {
    return { triggered: false, reason: `Invalid price condition: ${condition}` };
  }

  const direction = match[1];
  const operator = match[2];
  const threshold = parseFloat(match[3]);
  const timeframe = match[4] || 'h6';

  let priceChange = 0;
  switch (timeframe) {
    case 'h1': priceChange = state.solPriceChange_h1; break;
    case 'h6': priceChange = state.solPriceChange_h6; break;
    case 'h24': priceChange = state.solPriceChange_h24; break;
  }

  const absChange = Math.abs(priceChange);
  let met = false;

  if (direction === 'sol_drop' && priceChange < 0) {
    switch (operator) {
      case '>': met = absChange > threshold; break;
      case '<': met = absChange < threshold; break;
      case '>=': met = absChange >= threshold; break;
      case '<=': met = absChange <= threshold; break;
    }
  } else if (direction === 'sol_rise' && priceChange > 0) {
    switch (operator) {
      case '>': met = absChange > threshold; break;
      case '<': met = absChange < threshold; break;
      case '>=': met = absChange >= threshold; break;
      case '<=': met = absChange <= threshold; break;
    }
  }

  if (met) {
    return {
      triggered: true,
      reason: `SOL ${direction === 'sol_drop' ? 'dropped' : 'rose'} ${absChange.toFixed(2)}% in ${timeframe} (threshold: ${threshold}%)`,
    };
  }
  return {
    triggered: false,
    reason: `SOL price change ${priceChange.toFixed(2)}% in ${timeframe}, threshold: ${direction} ${operator} ${threshold}%`,
  };
}

/**
 * status_based: "funding_status == failed"
 */
function evaluateStatusBased(condition: string, state: TriggerState): TriggerResult {
  if (condition.includes('failed') && state.pendingOperations > 0) {
    return { triggered: true, reason: `${state.pendingOperations} pending/failed operations detected` };
  }
  return { triggered: false, reason: 'No matching status condition' };
}

/**
 * idle_time: "idle > 2h" or "idle > 30m"
 */
function evaluateIdleTime(condition: string, state: TriggerState): TriggerResult {
  const match = condition.match(/idle\s*>\s*(\d+)([hm])/);
  if (!match) {
    return { triggered: false, reason: `Invalid idle condition: ${condition}` };
  }

  const value = parseInt(match[1]);
  const unit = match[2];
  const thresholdMs = unit === 'h' ? value * 3600000 : value * 60000;
  const now = Date.now();
  const matchedPockets: string[] = [];

  for (const pocket of state.pockets) {
    if (pocket.status !== 'active') continue;
    const lastActivity = pocket.last_activity
      ? new Date(pocket.last_activity).getTime()
      : new Date(pocket.created_at).getTime();

    if (now - lastActivity > thresholdMs) {
      matchedPockets.push(pocket.id);
    }
  }

  if (matchedPockets.length > 0) {
    return {
      triggered: true,
      reason: `${matchedPockets.length} pocket(s) idle > ${value}${unit}`,
      matchedPockets,
    };
  }
  return { triggered: false, reason: `No pockets idle > ${value}${unit}` };
}

/**
 * pocket_count: "active_pockets > 10"
 */
function evaluatePocketCount(condition: string, state: TriggerState): TriggerResult {
  const match = condition.match(/(active_pockets|pocket_count)\s*(>|<|>=|<=|==)\s*(\d+)/);
  if (!match) {
    return { triggered: false, reason: `Invalid pocket_count condition: ${condition}` };
  }

  const operator = match[2];
  const threshold = parseInt(match[3]);
  const count = state.activePocketCount;

  let met = false;
  switch (operator) {
    case '>': met = count > threshold; break;
    case '<': met = count < threshold; break;
    case '>=': met = count >= threshold; break;
    case '<=': met = count <= threshold; break;
    case '==': met = count === threshold; break;
  }

  if (met) {
    return { triggered: true, reason: `Active pockets (${count}) matches: ${condition}` };
  }
  return { triggered: false, reason: `Active pockets: ${count}, condition: ${condition}` };
}

/**
 * Fetch current trigger state from API + real price data
 */
export async function fetchTriggerState(
  apiClient: KausaLayerClient,
  priceMonitor?: PriceMonitor
): Promise<TriggerState> {
  // Get pockets
  const pocketsRes = await apiClient.listPockets();
  const pockets = pocketsRes.success && Array.isArray(pocketsRes.data?.pockets)
    ? pocketsRes.data.pockets.map((p: any) => ({
        id: p.id || p.pocket_id,
        balance: p.balance_sol || p.balance || 0,
        status: p.status || 'active',
        created_at: p.created_at || new Date().toISOString(),
        last_activity: p.last_activity || null,
      }))
    : [];

  const activePocketCount = pockets.filter((p: any) => p.status === 'active').length;

  // Real SOL price from DexScreener
  let solPrice = 0;
  let solPriceChange_h1 = 0;
  let solPriceChange_h6 = 0;
  let solPriceChange_h24 = 0;

  if (priceMonitor) {
    try {
      const priceInfo = await priceMonitor.getPriceInfo();
      solPrice = priceInfo.price;
      solPriceChange_h1 = priceInfo.change_h1;
      solPriceChange_h6 = priceInfo.change_h6;
      solPriceChange_h24 = priceInfo.change_h24;
    } catch (err: any) {
      console.warn(`[Trigger] Price fetch failed: ${err.message}`);
    }
  }

  return {
    pockets,
    solPrice,
    solPriceChange_h1,
    solPriceChange_h6,
    solPriceChange_h24,
    activePocketCount,
    pendingOperations: 0,
  };
}
