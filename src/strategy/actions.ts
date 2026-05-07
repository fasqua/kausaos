/**
 * KausaOS - Strategy Actions
 * Executes actions when strategy triggers fire
 */

import { Strategy, ActionType, StrategyEngine } from './engine';
import { TriggerResult } from './triggers';
import { KausaLayerClient } from '../brain/api-client';
import { Notifier } from '../notify';
import { LlmProvider } from '../brain/llm';

export interface ActionResult {
  success: boolean;
  message: string;
  data?: any;
}

export async function executeAction(
  strategy: Strategy,
  triggerResult: TriggerResult,
  apiClient: KausaLayerClient,
  strategyEngine: StrategyEngine,
  notifier?: Notifier,
  llmProvider?: LlmProvider
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
        return await actionNotify(action_params, strategy.name, triggerResult.reason, notifier);
      case 'kausa_pay':
        return await actionKausaPay(action_params, apiClient, notifier);
      case 'llm_analyze':
        return await actionLlmAnalyze(action_params, llmProvider);
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

  // Swap matched pockets, or specific pocket_id, or ALL active pockets
  let pocketsToSwap = matchedPockets.length > 0
    ? matchedPockets
    : params.pocket_id
      ? [params.pocket_id]
      : [];

  // If no pockets specified, fetch all active pockets (for price-triggered swap-all)
  if (pocketsToSwap.length === 0) {
    try {
      const pocketsRes = await apiClient.listPockets();
      if (pocketsRes.success && pocketsRes.data) {
        const allPockets = Array.isArray(pocketsRes.data) ? pocketsRes.data : pocketsRes.data.pockets || [];
        pocketsToSwap = allPockets
          .filter((p: any) => p.status === 'active')
          .map((p: any) => p.id || p.pocket_id);
      }
    } catch (_) {}
  }

  if (pocketsToSwap.length === 0) {
    return { success: false, message: 'No active pockets found for swap' };
  }

  const results: string[] = [];
  for (const pocketId of pocketsToSwap) {
    let swapAmount = parseFloat(params.amount) || 0;
    let amountRaw: number | undefined = undefined;

    // Handle "all" amount - fetch token balance and swap everything
    if (params.amount === 'all' || params.amount === 'max') {
      if (inputMint === 'SOL' || inputMint === 'So11111111111111111111111111111111111111112') {
        // Sell all SOL: fetch pocket balance
        try {
          const pocketRes = await apiClient.getPocket(pocketId);
          if (pocketRes.success && pocketRes.data) {
            const balance = pocketRes.data.balance_sol || 0;
            swapAmount = Math.max(0, balance - 0.005); // reserve for fees
          }
        } catch (_) {}
      } else {
        // Sell all tokens: fetch token balance
        try {
          const balRes = await apiClient.getTokenBalances(pocketId);
          if (balRes.success && balRes.data) {
            const tokens = Array.isArray(balRes.data) ? balRes.data : balRes.data.tokens || [];
            const token = tokens.find((t: any) => t.mint === inputMint || t.symbol === inputMint);
            if (token) {
              amountRaw = parseInt(token.balance_raw || token.amount_raw || token.amount || '0');
              swapAmount = 0;
            }
          }
        } catch (_) {}
      }
    }

    const res = await apiClient.swapExecute(pocketId, {
      input_mint: inputMint,
      output_mint: outputMint,
      amount: swapAmount,
      slippage_bps: slippageBps,
      amount_raw: amountRaw,
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

async function actionNotify(
  params: Record<string, any>,
  strategyName: string,
  triggerReason: string,
  notifier?: Notifier
): Promise<ActionResult> {
  const message = params.message || `Strategy "${strategyName}" triggered: ${triggerReason}`;

  if (notifier) {
    await notifier.send(message, {
      strategy: strategyName,
      trigger: triggerReason,
      action: 'notify',
      success: true,
    });
  } else {
    console.log(`[NOTIFY] ${message}`);
  }

  return { success: true, message: `Notification sent: ${message}` };
}

async function actionKausaPay(
  params: Record<string, any>,
  apiClient: KausaLayerClient,
  notifier?: Notifier
): Promise<ActionResult> {
  const pocketId = params.pocket_id;
  const url = params.url;
  const maxAmount = params.max_amount_usdc || 0.01;

  if (!pocketId || !url) {
    return { success: false, message: 'kausa_pay requires pocket_id and url' };
  }

  // Call KausaPay endpoint
  const res = await apiClient.kausaPay(pocketId, {
    url,
    method: params.method || 'POST',
    body: params.body,
    max_amount_usdc: maxAmount,
    headers: params.headers,
  });

  if (!res.success) {
    return { success: false, message: `KausaPay failed: ${res.error}` };
  }

  // Extract content from response
  let extractedContent = '';
  const responseData = res.data;

  if (responseData) {
    // Try to parse nested responsebody (x402 returns JSON string in responsebody)
    let parsed = responseData;
    if (typeof responseData.response_body === 'string') {
      try { parsed = JSON.parse(responseData.response_body); } catch (_) { parsed = responseData; }
    } else if (typeof responseData.responsebody === 'string') {
      try { parsed = JSON.parse(responseData.responsebody); } catch (_) { parsed = responseData; }
    } else if (typeof responseData.responseBody === 'string') {
      try { parsed = JSON.parse(responseData.responseBody); } catch (_) { parsed = responseData; }
    }

    if (params.extract_field && parsed[params.extract_field]) {
      extractedContent = String(parsed[params.extract_field]);
    } else if (typeof parsed === 'string') {
      extractedContent = parsed;
    } else {
      // Try common response fields
      const commonFields = ['content', 'snippet', 'text', 'answer', 'response', 'data', 'message', 'result', 'premiumContent', 'token', 'access_token', 'jwt', 'session_token'];
      for (const field of commonFields) {
        if (parsed[field]) {
          extractedContent = typeof parsed[field] === 'string'
            ? parsed[field]
            : JSON.stringify(parsed[field]);
          break;
        }
      }
      // Try nested results array (Perplexity format)
      if (!extractedContent && parsed.results && Array.isArray(parsed.results)) {
        extractedContent = parsed.results
          .map((r: any) => r.snippet || r.text || r.content || JSON.stringify(r))
          .join('\n\n')
          .slice(0, 2000);
      }
      if (!extractedContent) {
        extractedContent = JSON.stringify(parsed).slice(0, 500);
      }
    }
  }

  // Truncate if too long
  if (extractedContent.length > 2000) {
    extractedContent = extractedContent.slice(0, 2000) + '...';
  }

  // If response contains a token/credential, prepend it prominently
  // so LLM cannot accidentally summarize it away
  const tokenFields = ['token', 'access_token', 'jwt', 'session_token', 'api_key', 'key', 'credential'];
  let tokenParsed = responseData;
  if (typeof responseData?.response_body === 'string') {
    try { tokenParsed = JSON.parse(responseData.response_body); } catch (_) {}
  }
  if (tokenParsed && typeof tokenParsed === 'object') {
    for (const tf of tokenFields) {
      if (tokenParsed[tf] && typeof tokenParsed[tf] === 'string') {
        extractedContent = `API_TOKEN: ${tokenParsed[tf]}\n\nFull response: ${extractedContent}`;
        break;
      }
    }
  }

  // Auto-notify if enabled
  if (params.notify !== false && notifier) {
    const prefix = params.notify_prefix || 'KausaPay Result';
    await notifier.send(`${prefix}:\n${extractedContent}`, {
      action: 'kausa_pay',
      success: true,
    });
  }

  // Include full response_body so LLM/user can see raw API response (tokens, data, etc.)
  const fullResponse = responseData?.response_body || responseData?.responsebody || '';
  return {
    success: true,
    message: extractedContent,
    data: { content: extractedContent, raw: responseData, response_body: fullResponse },
  };
}

async function actionLlmAnalyze(
  params: Record<string, any>,
  llmProvider?: LlmProvider
): Promise<ActionResult> {
  const prompt = params.prompt;
  if (!prompt) {
    return { success: false, message: 'llm_analyze requires a prompt' };
  }

  if (!llmProvider) {
    return { success: false, message: 'LLM provider not available. Check llm config in kausaos.json.' };
  }

  const systemPrompt = params.system_prompt || 'You are a concise analyst. Answer in 3 sentences max unless instructed otherwise.';

  try {
    const response = await llmProvider.chat(
      [{ role: 'user', content: prompt }],
      systemPrompt,
      [] // no tools
    );

    const result = response.text || '';
    return {
      success: true,
      message: result,
      data: { content: result },
    };
  } catch (err: any) {
    return { success: false, message: 'LLM analysis failed: ' + err.message };
  }
}
