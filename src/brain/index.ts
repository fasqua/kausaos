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

  async processMessage(userMessage: string): Promise<string> {
    // Add user message to history
    this.conversationHistory.push({ role: 'user', content: userMessage });

    const systemPrompt = buildSystemPrompt(this.basePath, this.systemContext);
    let finalResponse = '';
    let loopCount = 0;

    // Tool execution loop - LLM may call multiple tools in sequence
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

      // Execute each tool call
      for (const toolCall of llmResponse.tool_calls) {
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
