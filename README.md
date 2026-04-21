<div align="center">

# KausaOS

### Privacy Agent Framework for Solana

[![Solana](https://img.shields.io/badge/Solana-Mainnet-9945FF?style=for-the-badge&logo=solana)](https://solana.com)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue?style=for-the-badge&logo=typescript)](https://typescriptlang.org)
[![License](https://img.shields.io/badge/License-Apache_2.0-blue?style=for-the-badge)](LICENSE)
[![KausaLayer](https://img.shields.io/badge/KausaLayer-Protocol-green?style=for-the-badge)](https://kausalayer.com)
[![Twitter](https://img.shields.io/badge/Twitter-@kausalayer-1DA1F2?style=for-the-badge&logo=twitter)](https://x.com/kausalayer)

**Autonomous AI agent that turns KausaLayer into a full privacy autopilot**

</div>

---

## What is KausaOS?

KausaOS is a standalone privacy agent framework that runs as a 24/7 daemon on your server. It has an LLM as its brain and specializes exclusively in privacy operations on Solana through the KausaLayer protocol.

Think of it this way:

- **Regular AI** (ChatGPT/Claude in browser): You ask, it answers. Cannot act. Forgets.
- **KausaOS**: An autonomous agent that manages your privacy operations around the clock. It acts, remembers, and executes strategies without human intervention.

KausaOS is not a plugin for another framework. It stands on its own. When other agent frameworks need privacy capabilities on Solana, they connect to KausaOS as an external service.

```
User sends message via Terminal / Telegram / Discord
    |
    v
+------------------------------------------+
|            Channel Gateway               |
+-------------------+----------------------+
                    |
                    v
+------------------------------------------+
|              LLM Brain                   |
|    (Claude / GPT / Ollama / OpenRouter)  |
|                                          |
|    Receives: message + history + tools   |
|    Decides: which tool(s) to call        |
+-------------------+----------------------+
                    |
                    v
+------------------------------------------+
|          Tool Executor (46 tools)        |
|                                          |
|    Pocket ops - Maze routing - Sweep     |
|    P2P transfer - Swap - Contacts        |
|    Strategy - Analytics - Recovery       |
+-------------------+----------------------+
                    |
                    v
+------------------------------------------+
|        KausaLayer Backend (Rust/Axum)    |
|        mazepocket.kausalayer.com         |
+------------------------------------------+
```

---

## Key Features

### LLM Brain (Model-Agnostic)
- Supports **Anthropic Claude**, **OpenAI GPT**, **OpenRouter** (any model), and **Ollama** (local models)
- The LLM decides which tools to call and in what order
- Conversation history maintained across interactions
- Configurable via `AGENT.md` personality file

### Strategy Engine
- Define automated rules as declarative strategies (trigger + action + constraints)
- **6 trigger types**: balance threshold, time-based (cron), price-based, status-based, idle time, pocket count
- **7 action types**: create pocket, sweep, sweep all, send P2P, swap, recover, notify
- Strategies evaluated autonomously on each heartbeat cycle
- Daily execution limits and cooldown periods

### Heartbeat Scheduler
- Wakes up every N minutes (default: 30)
- Evaluates all active strategies against current state
- Executes actions when trigger conditions are met
- Logs all decisions and results

### Multi-Channel Interface
- **Terminal**: Interactive CLI chat for development and testing
- **Telegram**: Bot integration (planned)
- **Discord**: Bot integration (planned)
- **Web Dashboard**: Visual management UI (planned)

### On-Chain Tier Resolution
- Automatically detects your $KAUSA token balance via Solana RPC
- Resolves tier (FREE / BASIC / PRO / ENTERPRISE) at startup
- Tier determines daily route limits, max transaction size, and fee rates

---

## Architecture

KausaOS has four components. Each serves as an access point to the same privacy infrastructure (the KausaLayer backend in Rust/Axum).

| Component | Purpose | Status |
|-----------|---------|--------|
| **Core Engine** | Autonomous daemon: LLM brain + 46 tools + strategy engine + heartbeat | Live |
| **MCP Server** | Model Context Protocol interface for external AI agents | Live (24 tools) |
| **KausaOS SDK** | npm package for developers building on KausaOS | Planned |
| **Interop API** | REST API for external agent frameworks | Planned |

---

## Available Tools

### Pocket Operations (9 tools)

| Tool | Description |
|------|-------------|
| `create_pocket` | Create a new stealth wallet funded via maze routing |
| `list_pockets` | List all pockets (active, swept, archived) |
| `get_pocket_info` | Get pocket details: balance, address, status, label |
| `rename_pocket` | Rename or label a pocket |
| `archive_pocket` | Archive a pocket (hides from active list) |
| `delete_pocket` | Soft delete a pocket (must have zero balance) |
| `export_pocket_key` | Export private key for import into Phantom/Solflare |
| `get_pocket_transactions` | Get transaction history from Solana blockchain |
| `get_token_balances` | Get all token balances (SOL + SPL tokens) |

### Maze Routing (3 tools)

| Tool | Description |
|------|-------------|
| `maze_route` | Send SOL privately A to B with multi-hop routing |
| `check_route_status` | Check progress of a maze route or funding request |
| `retry_route` | Retry a failed route from where it stopped |

### Sweep Operations (6 tools)

| Tool | Description |
|------|-------------|
| `sweep_pocket` | Withdraw all funds from pocket via maze routing |
| `sweep_all_pockets` | Sweep ALL active pockets to single destination |
| `get_sweep_status` | Check sweep progress |
| `resume_sweep` | Resume a failed or stuck sweep |
| `recover_sweep` | Recover funds stuck in sweep maze nodes |
| `recover_funding` | Recover funds stuck in funding maze nodes |

### P2P Transfer (3 tools)

| Tool | Description |
|------|-------------|
| `send_to_pocket` | Send SOL pocket-to-pocket via maze routing |
| `get_p2p_status` | Check P2P transfer progress |
| `recover_p2p` | Recover funds stuck in P2P maze nodes |

### Swap Operations (2 tools)

| Tool | Description |
|------|-------------|
| `swap_quote` | Get swap quote before executing (price impact, expected output) |
| `swap_execute` | Execute token swap via Jupiter (SOL to any SPL token) |

### Wallet Management (3 tools)

| Tool | Description |
|------|-------------|
| `list_wallets` | List saved destination wallets (slots 1-5) |
| `add_wallet` | Save a destination wallet to a slot |
| `delete_wallet` | Remove a saved wallet by slot |

### Contacts (3 tools)

| Tool | Description |
|------|-------------|
| `add_contact` | Map an alias to a pocket ID for easy P2P transfers |
| `list_contacts` | List all saved contacts |
| `delete_contact` | Delete a contact by alias |

### Analytics (5 tools)

| Tool | Description |
|------|-------------|
| `get_stats` | Protocol-wide statistics: total nodes, hops, 24h activity |
| `get_usage_stats` | Personal usage: routes today, this week, total volume |
| `get_route_history` | History of all maze routes with status |
| `get_tier_info` | Current tier, holding requirements, fee rates |
| `estimate_fee` | Estimate fee for a route or pocket creation |

### Strategy Management (6 tools)

| Tool | Description |
|------|-------------|
| `create_strategy` | Create automated strategy (trigger + action + constraints) |
| `list_strategies` | List all strategies with status |
| `pause_strategy` | Pause an active strategy |
| `resume_strategy` | Resume a paused strategy |
| `delete_strategy` | Delete a strategy permanently |
| `get_strategy_logs` | Get execution logs for a strategy |

### System (2 tools)

| Tool | Description |
|------|-------------|
| `health_check` | Check if KausaLayer backend is healthy |
| `get_system_status` | KausaOS uptime, active strategies, last heartbeat |

---

## Strategy Engine

Users define strategies as declarative rules. Strategies can be created via natural language and the LLM translates them to structured config.

### Example

"Sweep any pocket idle for more than 6 hours back to my main wallet"

```json
{
  "name": "sweep_idle_pockets",
  "trigger": {
    "type": "idle_time",
    "condition": "idle > 6h",
    "check_interval_seconds": 60
  },
  "action": {
    "type": "sweep",
    "destination_slot": 1
  },
  "constraints": {
    "max_executions_per_day": 10,
    "cooldown_minutes": 30
  }
}
```

### Trigger Types

| Trigger | Description | Example |
|---------|-------------|---------|
| `balance_threshold` | Pocket balance above/below value | `pocket.balance > 0.5` |
| `time_based` | Schedule (cron-like) | `cron:0 9 * * *` |
| `price_based` | SOL price movement | `sol_drop > 20` |
| `status_based` | Operation completed/failed | `funding_status == failed` |
| `idle_time` | Pocket idle for duration | `idle > 2h` |
| `pocket_count` | Active pocket count threshold | `active_pockets > 10` |

### Action Types

| Action | Description |
|--------|-------------|
| `create_pocket` | Create new stealth wallet with specified amount |
| `sweep` | Sweep matched pockets to destination |
| `sweep_all` | Sweep all active pockets to single destination |
| `send_p2p` | Send SOL between pockets via maze routing |
| `swap` | Execute token swap via Jupiter |
| `recover` | Recover funds from stuck operations |
| `notify` | Send notification (webhook, Telegram) |

### Use Cases

- **Privacy DCA**: Every day at 09:00, create pocket, fund, swap to USDC, sweep to cold wallet
- **Auto-consolidation**: When active pockets exceed threshold, sweep small balances to largest pocket
- **Panic button**: If SOL drops significantly, sweep ALL and swap to stablecoins
- **Idle sweep**: Sweep pockets idle beyond time threshold back to main wallet
- **Auto-recovery**: If any operation stuck beyond timeout, automatically run recovery

---

## Configuration

### kausaos.json

```json
{
  "llm": {
    "provider": "openrouter",
    "model": "anthropic/claude-sonnet-4",
    "api_key": "YOUR_API_KEY"
  },
  "kausalayer": {
    "api_key": "YOUR_KAUSALAYER_KEY",
    "endpoint": "http://localhost:3033"
  },
  "channels": {
    "telegram": { "enabled": false, "bot_token": "" },
    "discord": { "enabled": false, "bot_token": "" },
    "terminal": { "enabled": true }
  },
  "heartbeat": { "interval_minutes": 30 },
  "dashboard": { "enabled": false, "port": 3000 },
  "database": { "path": "./kausaos.db" }
}
```

### AGENT.md

The `AGENT.md` file defines the agent personality and behavior rules. Edit it to customize how KausaOS responds and operates.

### LLM Providers

| Provider | Model Examples | Config |
|----------|---------------|--------|
| OpenRouter | `anthropic/claude-sonnet-4`, `openai/gpt-4o`, `meta-llama/llama-3-70b` | `provider: "openrouter"` |
| Anthropic | `claude-sonnet-4-20250514` | `provider: "anthropic"` |
| OpenAI | `gpt-4o`, `gpt-4-turbo` | `provider: "openai"` |
| Ollama | `llama3`, `mistral`, `codellama` | `provider: "ollama"` |

---

## Token ($KAUSA)

$KAUSA powers the entire KausaLayer ecosystem. Holding $KAUSA unlocks higher tiers with better limits and lower fees.

| Tier | $KAUSA Required | Daily Routes | Max Amount | Fee |
|------|----------------|-------------|------------|-----|
| FREE | 0 | 1 | 0.1 SOL | 2.0% |
| BASIC | 1,000 | 5 | 1 SOL | 1.0% |
| PRO | 10,000 | 20 | 10 SOL | 0.5% |
| ENTERPRISE | 100,000 | 100 | 100 SOL | 0.25% |

**CA:** `BWXSNRBKMviG68MqavyssnzDq4qSArcN7eNYjqEfpump`

---

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Core Engine | TypeScript, Node.js |
| LLM Integration | Anthropic SDK, OpenAI SDK, OpenRouter API, Ollama |
| Strategy Storage | SQLite (better-sqlite3) |
| Backend | Rust, Axum (KausaLayer) |
| Blockchain | Solana (Helius RPC) |
| Swap | Jupiter Ultra API |
| Channel | Terminal (readline), Telegram/Discord (planned) |

---

## Project Structure

```
kausaos/
  src/
    brain/              # LLM integration
      llm.ts            # Provider abstraction (Claude/GPT/OpenRouter/Ollama)
      tools.ts          # 46 tool definitions + executor
      api-client.ts     # KausaLayer HTTP client with meta_address auth
      prompts.ts        # System prompt builder
      index.ts          # Brain orchestrator
    strategy/           # Strategy engine
      engine.ts         # Strategy CRUD + storage
      triggers.ts       # 6 trigger type evaluators
      actions.ts        # 7 action type executors
      index.ts
    channels/           # Communication channels
      terminal.ts       # Interactive CLI chat
      index.ts
    config.ts           # Config loader (kausaos.json + AGENT.md)
    heartbeat.ts        # Heartbeat scheduler
    daemon.ts           # Main entry point
    cli.ts              # CLI commands (setup/start/status)
  AGENT.md              # Agent personality and behavior
  kausaos.json.example  # Config template
  .env.example          # Environment template
  package.json
  tsconfig.json
```

---

## Ecosystem

KausaOS is part of the KausaLayer ecosystem:

| Layer | Component | Description |
|-------|-----------|-------------|
| Protocol | **KausaLayer** | Privacy protocol on Solana |
| Token | **$KAUSA** | Utility token for the ecosystem |
| Product | **SDP Maze** | Direct privacy routing (A to B via maze) |
| Product | **SDP Maze Pocket** | Stealth wallet creation and management |
| Framework | **KausaOS** | Autonomous privacy agent (this repo) |
| Interface | **MCP Server** | AI agent integration via Model Context Protocol |

---

## Contributing

1. Fork the repository
2. Create a feature branch
3. Write tests for new functionality
4. Submit a pull request

---

## License

Apache 2.0 License - see [LICENSE](LICENSE) for details.

---

<div align="center">

**KausaOS** | Privacy Agent Framework for Solana

Built by [KausaLayer](https://kausalayer.com) | Powered by [$KAUSA](https://pump.fun/BWXSNRBKMviG68MqavyssnzDq4qSArcN7eNYjqEfpump)

</div>
