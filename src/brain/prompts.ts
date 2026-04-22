/**
 * KausaOS - System Prompt Builder
 * Constructs the system prompt from AGENT.md + runtime context
 */

import { loadAgentPrompt } from '../config';

export interface SystemContext {
  activePockets: number;
  activeStrategies: number;
  lastHeartbeat: string | null;
  pendingOperations: number;
  tierName: string;
}

export function buildSystemPrompt(basePath?: string, context?: SystemContext): string {
  const agentPrompt = loadAgentPrompt(basePath);

  const runtimeContext = context
    ? `
## Current State
- Active pockets: ${context.activePockets}
- Active strategies: ${context.activeStrategies}
- Last heartbeat: ${context.lastHeartbeat || 'never'}
- Pending operations: ${context.pendingOperations}
- Tier: ${context.tierName}
`
    : '';

  return `${agentPrompt}

${runtimeContext}

## Available Actions
You have access to tools for: pocket management, maze routing, sweep operations,
P2P transfers, token swaps, wallet management, contacts, analytics, and strategy management.
Call the appropriate tool based on the user's request. You can chain multiple tools in sequence.

## Important
- Always use tool calls for operations. Never hallucinate results.
- If an operation requires confirmation (sweep_all, large transfers), ask first.
- Report tool results clearly and concisely.
- Never call the same tool twice in one request. One create_strategy, one sweep, one swap per user message.

## Strategy Trigger Format
When creating strategies, use these exact formats for trigger_condition:

Price triggers:
- "sol_drop > 5 h6" (SOL dropped more than 5% in 6 hours)
- "sol_drop > 20 h24" (SOL dropped more than 20% in 24 hours)
- "sol_rise > 10 h1" (SOL rose more than 10% in 1 hour)
Timeframes: h1, h6, h24. Default: h6

Balance triggers:
- "pocket.balance > 0.5" (pocket balance above 0.5 SOL)
- "pocket.balance < 0.01" (pocket balance below 0.01 SOL)

Time triggers:
- "cron:0 9 * * *" (every day at 09:00 UTC)
- "every:2h" (every 2 hours)

Idle triggers:
- "idle > 6h" (pocket idle more than 6 hours)
- "idle > 30m" (pocket idle more than 30 minutes)

Pocket count triggers:
- "active_pockets > 10" (more than 10 active pockets)
- "active_pockets < 2" (less than 2 active pockets)

Multi-condition (AND/OR):
- "sol_drop > 15 h6 AND active_pockets > 0"
- "idle > 6h OR pocket.balance < 0.01"

Always use these exact formats. Do not invent alternative formats.

## Strategy Action Parameters
When creating strategies, use these action_params for each action_type:

sweep: { destination_slot: 1 } or { destination: "wallet_address" }
sweep_all: { destination_slot: 1 } or { destination: "wallet_address" }
swap: { input_mint: "SOL", output_mint: "USDC" } (defaults to SOL->USDC if omitted)
send_p2p: { pocket_id: "sender_pocket", recipient_pocket_id: "receiver_pocket", amount_sol: 0.1 } (single) or { pocket_id: "sender_pocket", recipients: [{ recipient_pocket_id: "pocket_alice", amount_sol: 10 }, { recipient_pocket_id: "pocket_bob", amount_sol: 10 }] } (payroll)
create_pocket: { amount_sol: 0.1, label: "name", complexity: "medium" }
recover: {} (no params needed, operates on matched pockets)
notify: { message: "custom message" } (optional)
`;
}
