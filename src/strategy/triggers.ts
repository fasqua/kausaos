/**
 * KausaOS - Trigger Evaluator
 * Evaluates strategy trigger conditions against current state
 */

import { Strategy, TriggerType } from './engine';
import { KausaLayerClient } from '../brain/api-client';

export interface TriggerState {
  pockets: Array<{
    id: string;
    balance: number;
    status: string;
    created_at: string;
    last_activity: string | null;
  }>;
  solPrice: number;
  solPriceChange4h: number;
  activePocketCount: number;
  pendingOperations: number;
}

export interface TriggerResult {
  triggered: boolean;
  reason: string;
  matchedPockets?: string[];
}

export async function evaluateTrigger(
  strategy: Strategy,
  state: TriggerState
): Promise<TriggerResult> {
  const { trigger_type, trigger_condition } = strategy;

  try {
    switch (trigger_type) {
      case 'balance_threshold':
        return evaluateBalanceThreshold(trigger_condition, state);
      case 'time_based':
        return evaluateTimeBased(trigger_condition);
      case 'price_based':
        return evaluatePriceBased(trigger_condition, state);
      case 'status_based':
        return evaluateStatusBased(trigger_condition, state);
      case 'idle_time':
        return evaluateIdleTime(trigger_condition, state);
      case 'pocket_count':
        return evaluatePocketCount(trigger_condition, state);
      default:
        return { triggered: false, reason: `Unknown trigger type: ${trigger_type}` };
    }
  } catch (err: any) {
    return { triggered: false, reason: `Trigger evaluation error: ${err.message}` };
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
      reason: `${matchedPockets.length} pocket(s) match condition: ${condition}`,
      matchedPockets,
    };
  }
  return { triggered: false, reason: `No pockets match: ${condition}` };
}

/**
 * time_based: "cron:0 9 * * *" (every day at 09:00) or "every:2h"
 */
function evaluateTimeBased(condition: string): TriggerResult {
  const now = new Date();

  // Simple "every:Xh" or "every:Xm" pattern
  if (condition.startsWith('every:')) {
    // This is evaluated at heartbeat level, always triggers if heartbeat fires
    return { triggered: true, reason: `Time-based trigger: ${condition}` };
  }

  // Cron-like: "cron:M H * * *" (minute hour)
  if (condition.startsWith('cron:')) {
    const cronParts = condition.replace('cron:', '').trim().split(' ');
    if (cronParts.length >= 2) {
      const cronMinute = parseInt(cronParts[0]);
      const cronHour = parseInt(cronParts[1]);
      const currentHour = now.getUTCHours();
      const currentMinute = now.getUTCMinutes();

      // Check if within 30-minute heartbeat window
      if (currentHour === cronHour && Math.abs(currentMinute - cronMinute) < 30) {
        return { triggered: true, reason: `Cron trigger matched: ${condition}` };
      }
    }
    return { triggered: false, reason: `Cron not matched: ${condition}` };
  }

  return { triggered: false, reason: `Unknown time condition: ${condition}` };
}

/**
 * price_based: "sol_drop > 20" (SOL dropped more than 20% in 4h)
 */
function evaluatePriceBased(condition: string, state: TriggerState): TriggerResult {
  const match = condition.match(/sol_drop\s*(>|<|>=|<=)\s*([\d.]+)/);
  if (match) {
    const operator = match[1];
    const threshold = parseFloat(match[2]);
    const drop = Math.abs(state.solPriceChange4h);

    let met = false;
    switch (operator) {
      case '>': met = drop > threshold; break;
      case '<': met = drop < threshold; break;
      case '>=': met = drop >= threshold; break;
      case '<=': met = drop <= threshold; break;
    }

    if (met && state.solPriceChange4h < 0) {
      return { triggered: true, reason: `SOL dropped ${drop.toFixed(1)}% in 4h (threshold: ${threshold}%)` };
    }
    return { triggered: false, reason: `SOL change: ${state.solPriceChange4h.toFixed(1)}%, threshold: ${threshold}%` };
  }

  return { triggered: false, reason: `Invalid price condition: ${condition}` };
}

/**
 * status_based: "funding_status == failed"
 */
function evaluateStatusBased(condition: string, state: TriggerState): TriggerResult {
  // Check for failed/stuck operations
  if (condition.includes('failed') && state.pendingOperations > 0) {
    return { triggered: true, reason: `${state.pendingOperations} pending/failed operations detected` };
  }
  return { triggered: false, reason: 'No matching status condition' };
}

/**
 * idle_time: "idle > 2h" or "idle > 6h"
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
      reason: `${matchedPockets.length} pocket(s) idle for more than ${value}${unit}`,
      matchedPockets,
    };
  }
  return { triggered: false, reason: `No pockets idle > ${value}${unit}` };
}

/**
 * pocket_count: "active_pockets > 10"
 */
function evaluatePocketCount(condition: string, state: TriggerState): TriggerResult {
  const match = condition.match(/active_pockets\s*(>|<|>=|<=|==)\s*(\d+)/);
  if (!match) {
    return { triggered: false, reason: `Invalid pocket_count condition: ${condition}` };
  }

  const operator = match[1];
  const threshold = parseInt(match[2]);
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
    return { triggered: true, reason: `Active pocket count (${count}) matches condition: ${condition}` };
  }
  return { triggered: false, reason: `Active pockets: ${count}, condition: ${condition}` };
}

/**
 * Fetch current trigger state from API
 */
export async function fetchTriggerState(apiClient: KausaLayerClient): Promise<TriggerState> {
  // Get pockets
  const pocketsRes = await apiClient.listPockets();
  const pockets = pocketsRes.success && Array.isArray(pocketsRes.data?.pockets)
    ? pocketsRes.data.pockets.map((p: any) => ({
        id: p.id || p.pocket_id,
        balance: p.balance || 0,
        status: p.status || 'active',
        created_at: p.created_at || new Date().toISOString(),
        last_activity: p.last_activity || null,
      }))
    : [];

  const activePocketCount = pockets.filter((p: any) => p.status === 'active').length;

  // SOL price - placeholder (will be replaced with real API call in Phase 3)
  const solPrice = 0;
  const solPriceChange4h = 0;

  return {
    pockets,
    solPrice,
    solPriceChange4h,
    activePocketCount,
    pendingOperations: 0,
  };
}
