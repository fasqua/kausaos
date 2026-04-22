/**
 * KausaOS - Configuration Loader
 * Loads kausaos.json and AGENT.md
 */

import fs from 'fs';
import path from 'path';

export interface LlmConfig {
  provider: 'anthropic' | 'openai' | 'ollama' | 'openrouter';
  model: string;
  api_key: string;
}

export interface KausaLayerConfig {
  api_key: string;
  endpoint: string;
}

export interface ChannelConfig {
  enabled: boolean;
  bot_token?: string;
}

export interface HeartbeatConfig {
  interval_minutes: number;
}

export interface DashboardConfig {
  enabled: boolean;
  port: number;
}

export interface DatabaseConfig {
  path: string;
}

export interface NotificationConfig {
  webhooks: string[];
}

export interface KausaOSConfig {
  llm: LlmConfig;
  kausalayer: KausaLayerConfig;
  channels: {
    telegram: ChannelConfig;
    discord: ChannelConfig;
    terminal: ChannelConfig;
  };
  heartbeat: HeartbeatConfig;
  dashboard: DashboardConfig;
  database: DatabaseConfig;
  notifications?: NotificationConfig;
}

const CONFIG_FILE = 'kausaos.json';
const AGENT_FILE = 'AGENT.md';

export function loadConfig(basePath?: string): KausaOSConfig {
  const base = basePath || process.cwd();
  const configPath = path.join(base, CONFIG_FILE);

  if (!fs.existsSync(configPath)) {
    throw new Error(`Config file not found: ${configPath}. Run 'kausaos setup' first.`);
  }

  const raw = fs.readFileSync(configPath, 'utf-8');
  const config: KausaOSConfig = JSON.parse(raw);

  // Validate required fields
  if (!config.llm?.provider) {
    throw new Error('Missing llm.provider in kausaos.json');
  }
  if (!config.llm?.api_key) {
    throw new Error('Missing llm.api_key in kausaos.json. Set your LLM API key.');
  }
  if (!config.kausalayer?.api_key) {
    throw new Error('Missing kausalayer.api_key in kausaos.json. Get one at kausalayer.com/mcp');
  }
  if (!config.kausalayer?.endpoint) {
    throw new Error('Missing kausalayer.endpoint in kausaos.json');
  }

  return config;
}

export function loadAgentPrompt(basePath?: string): string {
  const base = basePath || process.cwd();
  const agentPath = path.join(base, AGENT_FILE);

  if (!fs.existsSync(agentPath)) {
    console.warn(`AGENT.md not found at ${agentPath}, using default prompt.`);
    return getDefaultAgentPrompt();
  }

  return fs.readFileSync(agentPath, 'utf-8');
}

function getDefaultAgentPrompt(): string {
  return `You are KausaOS, a privacy-specialized autonomous agent on Solana.
You manage maze routing, stealth wallets, private transactions, and token swaps.
Be direct, concise, and security-first.`;
}
