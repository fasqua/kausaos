/**
 * KausaOS - LLM Abstraction Layer
 * Model-agnostic: Anthropic Claude, OpenAI GPT, Ollama (local)
 */

import { LlmConfig } from '../config';

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface ToolCall {
  name: string;
  input: Record<string, unknown>;
}

export interface LlmMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface LlmResponse {
  text: string;
  tool_calls: ToolCall[];
  stop_reason: 'end_turn' | 'tool_use' | 'max_tokens';
}

export interface LlmProvider {
  chat(
    messages: LlmMessage[],
    systemPrompt: string,
    tools: ToolDefinition[],
    toolResults?: { name: string; result: string }[]
  ): Promise<LlmResponse>;
}

/**
 * Anthropic Claude Provider
 */
export class AnthropicProvider implements LlmProvider {
  private apiKey: string;
  private model: string;

  constructor(config: LlmConfig) {
    this.apiKey = config.api_key;
    this.model = config.model;
  }

  async chat(
    messages: LlmMessage[],
    systemPrompt: string,
    tools: ToolDefinition[],
    toolResults?: { name: string; result: string }[]
  ): Promise<LlmResponse> {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: this.apiKey });

    // Convert tools to Anthropic format
    const anthropicTools = tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.input_schema as any,
    }));

    // Build messages array
    const apiMessages: any[] = [];

    for (const msg of messages) {
      if (msg.role === 'system') continue; // system goes in system param
      apiMessages.push({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      });
    }

    // Append tool results if any
    if (toolResults && toolResults.length > 0) {
      const toolResultBlocks: any[] = toolResults.map((tr) => ({
        type: 'tool_result' as const,
        tool_use_id: tr.name,
        content: tr.result,
      }));
      apiMessages.push({ role: 'user', content: toolResultBlocks });
    }

    const response = await client.messages.create({
      model: this.model,
      max_tokens: 4096,
      system: systemPrompt,
      tools: anthropicTools,
      messages: apiMessages,
    });

    // Parse response
    let text = '';
    const toolCalls: ToolCall[] = [];

    for (const block of response.content) {
      if (block.type === 'text') {
        text += block.text;
      } else if (block.type === 'tool_use') {
        toolCalls.push({
          name: block.name,
          input: block.input as Record<string, unknown>,
        });
      }
    }

    const stopReason =
      response.stop_reason === 'tool_use'
        ? 'tool_use'
        : response.stop_reason === 'max_tokens'
          ? 'max_tokens'
          : 'end_turn';

    return { text, tool_calls: toolCalls, stop_reason: stopReason };
  }
}

/**
 * OpenAI GPT Provider
 */
export class OpenAIProvider implements LlmProvider {
  private apiKey: string;
  private model: string;

  constructor(config: LlmConfig) {
    this.apiKey = config.api_key;
    this.model = config.model;
  }

  async chat(
    messages: LlmMessage[],
    systemPrompt: string,
    tools: ToolDefinition[],
    _toolResults?: { name: string; result: string }[]
  ): Promise<LlmResponse> {
    const { default: OpenAI } = await import('openai');
    const client = new OpenAI({ apiKey: this.apiKey });

    // Build messages with system prompt
    const apiMessages: Array<{ role: string; content: string }> = [
      { role: 'system', content: systemPrompt },
      ...messages
        .filter((m) => m.role !== 'system')
        .map((m) => ({ role: m.role, content: m.content })),
    ];

    // Convert tools to OpenAI format
    const openaiTools = tools.map((t) => ({
      type: 'function' as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.input_schema,
      },
    }));

    const response = await client.chat.completions.create({
      model: this.model,
      messages: apiMessages as any,
      tools: openaiTools,
      max_tokens: 4096,
    });

    const choice = response.choices[0];
    const text = choice.message?.content || '';
    const toolCalls: ToolCall[] = [];

    if (choice.message?.tool_calls) {
      for (const tc of choice.message.tool_calls) {
        toolCalls.push({
          name: tc.function.name,
          input: JSON.parse(tc.function.arguments),
        });
      }
    }

    const stopReason =
      choice.finish_reason === 'tool_calls'
        ? 'tool_use'
        : choice.finish_reason === 'length'
          ? 'max_tokens'
          : 'end_turn';

    return { text, tool_calls: toolCalls, stop_reason: stopReason };
  }
}

/**
 * Ollama Local Provider
 */
export class OllamaProvider implements LlmProvider {
  private model: string;
  private endpoint: string;

  constructor(config: LlmConfig) {
    this.model = config.model;
    this.endpoint = config.api_key || 'http://localhost:11434';
  }

  async chat(
    messages: LlmMessage[],
    systemPrompt: string,
    _tools: ToolDefinition[],
    _toolResults?: { name: string; result: string }[]
  ): Promise<LlmResponse> {
    const axios = (await import('axios')).default;

    const ollamaMessages = [
      { role: 'system', content: systemPrompt },
      ...messages.filter((m) => m.role !== 'system').map((m) => ({
        role: m.role,
        content: m.content,
      })),
    ];

    const response = await axios.post(`${this.endpoint}/api/chat`, {
      model: this.model,
      messages: ollamaMessages,
      stream: false,
    });

    return {
      text: response.data.message?.content || '',
      tool_calls: [],
      stop_reason: 'end_turn',
    };
  }
}

/**
 * Factory: create LLM provider from config
 */
export function createLlmProvider(config: LlmConfig): LlmProvider {
  switch (config.provider) {
    case 'anthropic':
      return new AnthropicProvider(config);
    case 'openai':
      return new OpenAIProvider(config);
    case 'openrouter':
      return new OpenRouterProvider(config);
    case 'ollama':
      return new OllamaProvider(config);
    default:
      throw new Error(`Unsupported LLM provider: ${config.provider}`);
  }
}

/**
 * OpenRouter Provider
 * Universal API - access Claude, GPT, Llama, etc via one endpoint
 */
export class OpenRouterProvider implements LlmProvider {
  private apiKey: string;
  private model: string;

  constructor(config: LlmConfig) {
    this.apiKey = config.api_key;
    this.model = config.model;
  }

  async chat(
    messages: LlmMessage[],
    systemPrompt: string,
    tools: ToolDefinition[],
    _toolResults?: { name: string; result: string }[]
  ): Promise<LlmResponse> {
    const axios = (await import('axios')).default;

    const apiMessages = [
      { role: 'system', content: systemPrompt },
      ...messages.filter((m) => m.role !== 'system').map((m) => ({
        role: m.role,
        content: m.content,
      })),
    ];

    const openRouterTools = tools.map((t) => ({
      type: 'function' as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.input_schema,
      },
    }));

    const response = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model: this.model,
        messages: apiMessages,
        tools: openRouterTools,
        max_tokens: 4096,
      },
      {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://kausalayer.com',
          'X-Title': 'KausaOS',
        },
      }
    );

    const choice = response.data.choices[0];
    const text = choice.message?.content || '';
    const toolCalls: ToolCall[] = [];

    if (choice.message?.tool_calls) {
      for (const tc of choice.message.tool_calls) {
        toolCalls.push({
          name: tc.function.name,
          input: JSON.parse(tc.function.arguments),
        });
      }
    }

    const stopReason =
      choice.finish_reason === 'tool_calls'
        ? 'tool_use'
        : choice.finish_reason === 'length'
          ? 'max_tokens'
          : 'end_turn';

    return { text, tool_calls: toolCalls, stop_reason: stopReason };
  }
}
