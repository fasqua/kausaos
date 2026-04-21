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
- For strategy creation from natural language, translate to structured parameters.
`;
}
