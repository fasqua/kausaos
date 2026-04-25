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
- NEVER use Markdown tables (|---|---|) or code block tables. They break on mobile.
- For listing multiple items, use numbered list with key details on one line each:
  1. SOL Monitor - Active - Every 1m - Notify
  2. DCA BONK - Active - Every 4h - Buy 0.1 SOL
- For single item details, use simple bullet points:
  Name: SOL Monitor
  Status: Active
  Trigger: Every 1 minute
  Action: Notify

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

Token price triggers (vs average buy price from portfolio):
- "token_up BONK > 50" (BONK rose more than 50% from average buy)
- "token_down WIF > 30" (WIF dropped more than 30% from average buy)
- "token_up SOL > 100" (any token rose more than 100% from avg buy)

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

## Portfolio & Trading
You can track token positions and set automated trading rules.

When a user swaps tokens, record the trade using the strategy engine's recordTrade internally.
The portfolio_summary tool shows all positions with PnL calculated from average buy price vs current market price.

Trade rules:
- take_profit_pct: percentage above average buy price to auto-sell (e.g., 100 = sell when price doubles from avg buy)
- stop_loss_pct: percentage below average buy price to auto-sell (e.g., 30 = sell when price drops 30% from avg buy)
- dca_interval_minutes: how often to auto-buy more of this token
- dca_amount_sol: how much SOL to swap each DCA interval

Example user requests:
- "Buy 0.5 SOL worth of BONK in pocket_abc" -> use swap_execute, then the system tracks the trade automatically
- "Show my portfolio" -> use portfolio_summary
- "Set take profit at 2x for BONK" -> use set_trade_rule with take_profit_pct: 100
- "Stop loss at 30% for WIF" -> use set_trade_rule with stop_loss_pct: 30
- "DCA 0.1 SOL into BONK every 4 hours" -> use set_trade_rule with dca_interval_minutes: 240, dca_amount_sol: 0.1
- "Show my trade history" -> use get_trade_history
- "Remove my BONK rule" -> use remove_trade_rule

All trades happen inside stealth pockets via maze routing. Privacy is maintained.
`;
}
