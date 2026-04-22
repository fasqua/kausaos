/**
 * KausaOS - Brain Module
 * Connects LLM, tools, and API client into the agent's "brain"
 */

import { KausaOSConfig } from '../config';
import { createLlmProvider, LlmProvider, LlmMessage } from './llm';
import { KausaLayerClient } from './api-client';
import { allTools, executeTool } from './tools';
import { buildSystemPrompt, SystemContext } from './prompts';

export interface BrainOptions {
  config: KausaOSConfig;
  basePath: string;
}

export class Brain {
  private llm: LlmProvider;
  private apiClient: KausaLayerClient;
  private basePath: string;
  private conversationHistory: LlmMessage[];
  private systemContext: SystemContext;
  private maxToolLoops: number;
  private priceData: any;
  private strategyEngine: any;

  constructor(options: BrainOptions) {
    this.llm = createLlmProvider(options.config.llm);
    this.apiClient = new KausaLayerClient(options.config.kausalayer);
    this.basePath = options.basePath;
    this.conversationHistory = [];
    this.maxToolLoops = 10;
    this.priceData = null;
    this.strategyEngine = null;
    this.systemContext = {
      activePockets: 0,
      activeStrategies: 0,
      lastHeartbeat: null,
      pendingOperations: 0,
      tierName: 'FREE',
    };
  }

  updateContext(context: Partial<SystemContext>): void {
    this.systemContext = { ...this.systemContext, ...context };
  }

  clearHistory(): void {
    this.conversationHistory = [];
  }

  setStrategyEngine(engine: any): void {
    this.strategyEngine = engine;
  }

  setPriceData(data: any): void {
    this.priceData = data;
  }

  getApiClient(): KausaLayerClient {
    return this.apiClient;
  }

  async getStartupSummary(): Promise<string> {
    const parts: string[] = [];

    // Strategy summary
    if (this.strategyEngine) {
      const strategies = this.strategyEngine.listStrategies();
      const active = strategies.filter((s: any) => s.status === 'active').length;
      const paused = strategies.filter((s: any) => s.status === 'paused').length;
      if (strategies.length > 0) {
        parts.push(`Strategies: ${active} active, ${paused} paused`);
      }

      // Recent execution logs
      let recentLogs: any[] = [];
      for (const strat of strategies) {
        const logs = this.strategyEngine.getStrategyLogs(strat.id, 5);
        recentLogs = recentLogs.concat(logs);
      }
      if (recentLogs.length > 0) {
        recentLogs.sort((a: any, b: any) => b.triggered_at.localeCompare(a.triggered_at));
        const recent = recentLogs.slice(0, 5);
        parts.push(`Recent activity: ${recent.length} execution(s)`);
        for (const log of recent) {
          const status = log.success ? 'ok' : 'fail';
          parts.push(`  [${status}] ${log.action_type}: ${log.action_result}`);
        }
      }
    }

    // Pocket summary
    try {
      const pockets = await this.apiClient.getActivePocketCount();
      parts.push(`Active pockets: ${pockets}`);
    } catch (_) {}

    // Tier
    const tier = this.apiClient.getTierInfo();
    parts.push(`Tier: ${tier.tier}`);

    if (parts.length === 0) return '';
    return parts.join('\n');
  }

  async processMessage(userMessage: string): Promise<string> {
    // Add user message to history
    this.conversationHistory.push({ role: 'user', content: userMessage });

    const systemPrompt = buildSystemPrompt(this.basePath, this.systemContext);
    let finalResponse = '';
    let loopCount = 0;

    // Tool execution loop - LLM may call multiple tools in sequence
    const executedTools: Set<string> = new Set();
    while (loopCount < this.maxToolLoops) {
      loopCount++;

      const llmResponse = await this.llm.chat(
        this.conversationHistory,
        systemPrompt,
        allTools
      );

      // If LLM returned text, accumulate it
      if (llmResponse.text) {
        finalResponse += llmResponse.text;
      }

      // If no tool calls, we're done
      if (llmResponse.tool_calls.length === 0 || llmResponse.stop_reason !== 'tool_use') {
        break;
      }

      // Execute each tool call (skip duplicates of mutating operations)
      for (const toolCall of llmResponse.tool_calls) {
        const mutatingTools = ['create_strategy', 'delete_strategy', 'sweep_pocket', 'sweep_all_pockets', 'send_to_pocket', 'swap_execute', 'create_pocket', 'delete_pocket'];
        if (mutatingTools.includes(toolCall.name) && executedTools.has(toolCall.name)) {
          continue; // Skip duplicate mutating tool call
        }
        executedTools.add(toolCall.name);
        const toolResult = await executeTool(toolCall, this.apiClient, {
          strategies: null,
          systemStatus: this.systemContext,
          priceData: this.priceData,
          strategyEngine: this.strategyEngine,
        });

        // Add assistant message with tool call indication
        this.conversationHistory.push({
          role: 'assistant',
          content: `[Calling tool: ${toolCall.name}]`,
        });

        // Add tool result as user message (for next LLM turn)
        this.conversationHistory.push({
          role: 'user',
          content: `[Tool result for ${toolCall.name}]: ${toolResult}`,
        });
      }
    }

    // Add final response to history
    if (finalResponse) {
      this.conversationHistory.push({ role: 'assistant', content: finalResponse });
    }

    // Trim history if too long (keep last 50 messages)
    if (this.conversationHistory.length > 50) {
      this.conversationHistory = this.conversationHistory.slice(-50);
    }

    return finalResponse || '[No response from LLM]';
  }
}

export { KausaLayerClient } from './api-client';
export { allTools, executeTool } from './tools';
export { buildSystemPrompt } from './prompts';
export { createLlmProvider } from './llm';
export type { LlmProvider, LlmMessage, LlmResponse, ToolDefinition, ToolCall } from './llm';
export type { SystemContext } from './prompts';
