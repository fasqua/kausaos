#!/usr/bin/env node
/**
 * KausaOS - CLI Entry Point
 * Commands: setup, start, status
 */

import path from 'path';
import fs from 'fs';
import readline from 'readline';

const args = process.argv.slice(2);
const command = args[0] || 'start';

async function setup(): Promise<void> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const ask = (q: string): Promise<string> =>
    new Promise((resolve) => rl.question(q, resolve));

  console.log('\n=== KausaOS Setup Wizard ===\n');

  const provider = await ask('LLM Provider (anthropic/openai/ollama) [anthropic]: ') || 'anthropic';

  let model = '';
  if (provider === 'anthropic') model = 'claude-sonnet-4-20250514';
  else if (provider === 'openai') model = 'gpt-4o';
  else model = await ask('Ollama model name: ') || 'llama3';

  const llmApiKey = await ask(`${provider} API Key: `);
  const klApiKey = await ask('KausaLayer API Key (from kausalayer.com/mcp): ');
  const endpoint = await ask('KausaLayer endpoint [https://mazepocket.kausalayer.com]: ')
    || 'https://mazepocket.kausalayer.com';

  const config = {
    llm: { provider, model, api_key: llmApiKey },
    kausalayer: { api_key: klApiKey, endpoint },
    channels: {
      telegram: { enabled: false, bot_token: '' },
      discord: { enabled: false, bot_token: '' },
      terminal: { enabled: true },
    },
    heartbeat: { interval_minutes: 30 },
    dashboard: { enabled: false, port: 3000 },
    database: { path: './kausaos.db' },
  };

  const configPath = path.join(process.cwd(), 'kausaos.json');
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  console.log(`\nConfig saved to ${configPath}`);

  // Create AGENT.md if not exists
  const agentPath = path.join(process.cwd(), 'AGENT.md');
  if (!fs.existsSync(agentPath)) {
    fs.copyFileSync(path.join(__dirname, '..', 'AGENT.md'), agentPath);
    console.log(`AGENT.md created at ${agentPath}`);
  }

  console.log('\nSetup complete! Run "kausaos start" to begin.\n');
  rl.close();
}

async function start(): Promise<void> {
  // Delegate to daemon
  require('./daemon');
}

async function status(): Promise<void> {
  const configPath = path.join(process.cwd(), 'kausaos.json');
  if (!fs.existsSync(configPath)) {
    console.log('No kausaos.json found. Run "kausaos setup" first.');
    return;
  }

  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  console.log('\n=== KausaOS Status ===');
  console.log(`LLM: ${config.llm.provider} (${config.llm.model})`);
  console.log(`Endpoint: ${config.kausalayer.endpoint}`);
  console.log(`Terminal: ${config.channels.terminal.enabled ? 'enabled' : 'disabled'}`);
  console.log(`Heartbeat: every ${config.heartbeat.interval_minutes} minutes`);
  console.log('');
}

// Route commands
switch (command) {
  case 'setup':
    setup();
    break;
  case 'start':
    start();
    break;
  case 'status':
    status();
    break;
  default:
    console.log(`Unknown command: ${command}`);
    console.log('Usage: kausaos <setup|start|status>');
}
