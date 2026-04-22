/**
 * KausaOS - Strategy Actions
 * Executes actions when strategy triggers fire
 */

import { Strategy, ActionType, StrategyEngine } from './engine';
import { TriggerResult } from './triggers';
import { KausaLayerClient } from '../brain/api-client';

export interface ActionResult {
  success: boolean;
  message: string;
  data?: any;
}

export async function executeAction(
  strategy: Strategy,
  triggerResult: TriggerResult,
  apiClient: KausaLayerClient,
  strategyEngine: StrategyEngine
): Promise<ActionResult> {
  const { action_type, action_params } = strategy;
  const matchedPockets = triggerResult.matchedPockets || [];

  try {
    switch (action_type) {
      case 'create_pocket':
        return await actionCreatePocket(action_params, apiClient);
      case 'sweep':
        return await actionSweep(action_params, matchedPockets, apiClient);
      case 'sweep_all':
        return await actionSweepAll(action_params, apiClient);
      case 'send_p2p':
        return await actionSendP2P(action_params, apiClient);
      case 'swap':
        return await actionSwap(action_params, matchedPockets, apiClient);
      case 'recover':
        return await actionRecover(matchedPockets, apiClient);
      case 'notify':
        return actionNotify(action_params, strategy.name, triggerResult.reason);
      default:
        return { success: false, message: `Unknown action type: ${action_type}` };
    }
  } catch (err: any) {
    return { success: false, message: `Action failed: ${err.message}` };
  }
}

async function actionCreatePocket(
  params: Record<string, any>,
  apiClient: KausaLayerClient
): Promise<ActionResult> {
  const amount = params.amount_sol || 0.01;
  const label = params.label || `auto_${Date.now()}`;
  const complexity = params.complexity || 'medium';

  const res = await apiClient.createPocket({ amount_sol: amount, label, complexity });
  if (!res.success) {
    return { success: false, message: `Create pocket failed: ${res.error}` };
  }
  return { success: true, message: `Pocket created: ${label} (${amount} SOL)`, data: res.data };
}

async function actionSweep(
  params: Record<string, any>,
  matchedPockets: string[],
  apiClient: KausaLayerClient
): Promise<ActionResult> {
  const destination = params.destination;
  const destinationSlot = params.destination_slot;
  const results: string[] = [];

  // Sweep matched pockets or use pocket_id from params
  const pocketsToSweep = matchedPockets.length > 0
    ? matchedPockets
    : params.pocket_id
      ? [params.pocket_id]
      : [];

  if (pocketsToSweep.length === 0) {
    return { success: false, message: 'No pockets to sweep' };
  }

  for (const pocketId of pocketsToSweep) {
    const res = await apiClient.sweepPocket(pocketId, {
      destination,
      destination_slot: destinationSlot,
    });
    results.push(res.success ? `${pocketId}: swept` : `${pocketId}: ${res.error}`);
  }

  const successCount = results.filter((r) => r.includes('swept')).length;
  return {
    success: successCount > 0,
    message: `Swept ${successCount}/${pocketsToSweep.length} pockets`,
    data: results,
  };
}

async function actionSweepAll(
  params: Record<string, any>,
  apiClient: KausaLayerClient
): Promise<ActionResult> {
  const res = await apiClient.sweepAllPockets({
    destination: params.destination,
    destination_slot: params.destination_slot,
  });

  if (!res.success) {
    return { success: false, message: `Sweep all failed: ${res.error}` };
  }
  return { success: true, message: 'All pockets sweep initiated', data: res.data };
}

async function actionSendP2P(
  params: Record<string, any>,
  apiClient: KausaLayerClient
): Promise<ActionResult> {
  // Support single recipient or multiple recipients (payroll)
  const recipients = params.recipients || [
    { recipient_pocket_id: params.recipient_pocket_id, amount_sol: params.amount_sol },
  ];

  if (!params.pocket_id) {
    return { success: false, message: 'No sender pocket_id specified' };
  }

  const results: string[] = [];
  for (const recipient of recipients) {
    const res = await apiClient.sendToPocket(params.pocket_id, {
      recipient_pocket_id: recipient.recipient_pocket_id,
      amount_sol: recipient.amount_sol,
    });
    results.push(res.success
      ? `${recipient.recipient_pocket_id}: sent ${recipient.amount_sol} SOL`
      : `${recipient.recipient_pocket_id}: ${res.error}`);
  }

  const successCount = results.filter((r) => r.includes('sent')).length;
  return {
    success: successCount > 0,
    message: `P2P sent to ${successCount}/${recipients.length} recipients`,
    data: results,
  };
}

async function actionSwap(
  params: Record<string, any>,
  matchedPockets: string[],
  apiClient: KausaLayerClient
): Promise<ActionResult> {
  // Default mints: SOL -> USDC for panic/protection strategies
  const inputMint = params.input_mint || 'SOL';
  const outputMint = params.output_mint || 'USDC';
  const slippageBps = params.slippage_bps || 300;

  // Swap all matched pockets, or use pocket_id from params
  const pocketsToSwap = matchedPockets.length > 0
    ? matchedPockets
    : params.pocket_id
      ? [params.pocket_id]
      : [];

  if (pocketsToSwap.length === 0) {
    return { success: false, message: 'No pockets specified for swap' };
  }

  const results: string[] = [];
  for (const pocketId of pocketsToSwap) {
    const res = await apiClient.swapExecute(pocketId, {
      input_mint: inputMint,
      output_mint: outputMint,
      amount: params.amount || 0,
      slippage_bps: slippageBps,
    });
    results.push(res.success ? `${pocketId}: swapped` : `${pocketId}: ${res.error}`);
  }

  const successCount = results.filter((r) => r.includes('swapped')).length;
  return {
    success: successCount > 0,
    message: `Swapped ${successCount}/${pocketsToSwap.length} pockets (${inputMint} -> ${outputMint})`,
    data: results,
  };
}

async function actionRecover(
  matchedPockets: string[],
  apiClient: KausaLayerClient
): Promise<ActionResult> {
  if (matchedPockets.length === 0) {
    return { success: false, message: 'No pockets to recover' };
  }

  const results: string[] = [];
  for (const pocketId of matchedPockets) {
    const res = await apiClient.recoverFunding(pocketId);
    results.push(res.success ? `${pocketId}: recovered` : `${pocketId}: ${res.error}`);
  }

  const successCount = results.filter((r) => r.includes('recovered')).length;
  return {
    success: successCount > 0,
    message: `Recovered ${successCount}/${matchedPockets.length} pockets`,
    data: results,
  };
}

function actionNotify(
  params: Record<string, any>,
  strategyName: string,
  triggerReason: string
): ActionResult {
  const message = params.message || `Strategy "${strategyName}" triggered: ${triggerReason}`;

  // For now, log to console. Telegram/Discord webhook will be added later.
  console.log(`[NOTIFY] ${message}`);

  return { success: true, message: `Notification sent: ${message}` };
}
