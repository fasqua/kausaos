/**
 * KausaOS - Tool Definitions (80+ tools for LLM)
 * Each tool maps to a KausaLayer API endpoint
 */

import { ToolDefinition, ToolCall } from './llm';
import { KausaLayerClient, ApiResponse } from './api-client';

// ============================================================
// Tool Definitions - presented to LLM so it knows what it can do
// ============================================================

export const allTools: ToolDefinition[] = [
  // --- Pocket Operations (12) ---
  {
    name: 'create_pocket',
    description: 'Create a new stealth wallet (pocket) funded via maze routing. Returns deposit address and pocket ID.',
    input_schema: {
      type: 'object',
      properties: {
        amount_sol: { type: 'number', description: 'Amount of SOL to fund (min 0.01)' },
        label: { type: 'string', description: 'Optional label for the pocket' },
        complexity: { type: 'string', enum: ['low', 'medium', 'high'], description: 'Privacy level (default: medium)' },
      },
      required: ['amount_sol'],
    },
  },
  {
    name: 'list_pockets',
    description: 'List all pockets (active, swept, archived) with their balances and status.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'get_pocket_info',
    description: 'Get detailed info about a specific pocket: balance, address, status, label, creation date.',
    input_schema: {
      type: 'object',
      properties: {
        pocket_id: { type: 'string', description: 'Pocket ID to query' },
      },
      required: ['pocket_id'],
    },
  },
  {
    name: 'rename_pocket',
    description: 'Rename or label a pocket for easy identification.',
    input_schema: {
      type: 'object',
      properties: {
        pocket_id: { type: 'string', description: 'Pocket ID to rename' },
        label: { type: 'string', description: 'New label for the pocket' },
      },
      required: ['pocket_id', 'label'],
    },
  },
  {
    name: 'archive_pocket',
    description: 'Archive a pocket. Hides it from active list but preserves data.',
    input_schema: {
      type: 'object',
      properties: {
        pocket_id: { type: 'string', description: 'Pocket ID to archive' },
      },
      required: ['pocket_id'],
    },
  },
  {
    name: 'delete_pocket',
    description: 'Delete a pocket (soft delete). Pocket must have zero balance.',
    input_schema: {
      type: 'object',
      properties: {
        pocket_id: { type: 'string', description: 'Pocket ID to delete' },
      },
      required: ['pocket_id'],
    },
  },
  {
    name: 'export_pocket_key',
    description: 'Export the private key of a pocket for import into Phantom, Solflare, or other wallets.',
    input_schema: {
      type: 'object',
      properties: {
        pocket_id: { type: 'string', description: 'Pocket ID to export' },
      },
      required: ['pocket_id'],
    },
  },
  {
    name: 'get_pocket_transactions',
    description: 'Get transaction history (signatures) for a specific pocket from Solana blockchain.',
    input_schema: {
      type: 'object',
      properties: {
        pocket_id: { type: 'string', description: 'Pocket ID to query transactions' },
      },
      required: ['pocket_id'],
    },
  },
  {
    name: 'get_token_balances',
    description: 'Get all token balances (SOL + SPL tokens) for a pocket.',
    input_schema: {
      type: 'object',
      properties: {
        pocket_id: { type: 'string', description: 'Pocket ID to check balances' },
      },
      required: ['pocket_id'],
    },
  },

  // --- Maze Routing (3) ---
  {
    name: 'maze_route',
    description: 'Send SOL privately from A to B via dynamic maze routing. Multi-hop, split, merge for privacy.',
    input_schema: {
      type: 'object',
      properties: {
        destination: { type: 'string', description: 'Destination Solana wallet address' },
        destination_slot: { type: 'number', description: 'Saved wallet slot (1-5) as alternative to address' },
        amount_sol: { type: 'number', description: 'Amount of SOL to send (min 0.01)' },
        complexity: { type: 'string', enum: ['low', 'medium', 'high'], description: 'Privacy level' },
      },
      required: ['amount_sol'],
    },
  },
  {
    name: 'check_route_status',
    description: 'Check the progress of a maze route, funding request, or sweep operation.',
    input_schema: {
      type: 'object',
      properties: {
        request_id: { type: 'string', description: 'Route/funding/sweep request ID' },
      },
      required: ['request_id'],
    },
  },
  {
    name: 'retry_route',
    description: 'Retry a failed route from where it stopped.',
    input_schema: {
      type: 'object',
      properties: {
        request_id: { type: 'string', description: 'Failed route request ID' },
      },
      required: ['request_id'],
    },
  },

  // --- Sweep Operations (6) ---
  {
    name: 'sweep_pocket',
    description: 'Withdraw all funds from a pocket to destination via maze routing.',
    input_schema: {
      type: 'object',
      properties: {
        pocket_id: { type: 'string', description: 'Pocket ID to sweep' },
        destination: { type: 'string', description: 'Destination wallet address' },
        destination_slot: { type: 'number', description: 'Saved wallet slot (1-5)' },
      },
      required: ['pocket_id'],
    },
  },
  {
    name: 'sweep_all_pockets',
    description: 'Sweep ALL active pockets to a single destination via maze routing.',
    input_schema: {
      type: 'object',
      properties: {
        destination: { type: 'string', description: 'Destination wallet address' },
        destination_slot: { type: 'number', description: 'Saved wallet slot (1-5)' },
      },
    },
  },
  {
    name: 'get_sweep_status',
    description: 'Check progress of a sweep operation.',
    input_schema: {
      type: 'object',
      properties: {
        sweep_id: { type: 'string', description: 'Sweep request ID' },
      },
      required: ['sweep_id'],
    },
  },
  {
    name: 'resume_sweep',
    description: 'Resume a failed or stuck sweep operation.',
    input_schema: {
      type: 'object',
      properties: {
        sweep_id: { type: 'string', description: 'Sweep request ID to resume' },
      },
      required: ['sweep_id'],
    },
  },
  {
    name: 'recover_sweep',
    description: 'Recover funds stuck in sweep maze nodes.',
    input_schema: {
      type: 'object',
      properties: {
        sweep_id: { type: 'string', description: 'Sweep request ID to recover' },
      },
      required: ['sweep_id'],
    },
  },
  {
    name: 'recover_funding',
    description: 'Recover funds stuck in funding maze nodes for a pocket.',
    input_schema: {
      type: 'object',
      properties: {
        pocket_id: { type: 'string', description: 'Pocket ID with stuck funding' },
      },
      required: ['pocket_id'],
    },
  },

  // --- P2P Transfer (4) ---
  {
    name: 'send_to_pocket',
    description: 'Send SOL from one pocket to another pocket via maze routing (P2P transfer).',
    input_schema: {
      type: 'object',
      properties: {
        pocket_id: { type: 'string', description: 'Sender pocket ID' },
        recipient_pocket_id: { type: 'string', description: 'Recipient pocket ID' },
        amount_sol: { type: 'number', description: 'Amount of SOL to send' },
      },
      required: ['pocket_id', 'recipient_pocket_id', 'amount_sol'],
    },
  },
  {
    name: 'get_p2p_status',
    description: 'Check progress of a P2P pocket-to-pocket transfer.',
    input_schema: {
      type: 'object',
      properties: {
        transfer_id: { type: 'string', description: 'P2P transfer ID' },
      },
      required: ['transfer_id'],
    },
  },
  {
    name: 'recover_p2p',
    description: 'Recover funds stuck in P2P transfer maze nodes.',
    input_schema: {
      type: 'object',
      properties: {
        transfer_id: { type: 'string', description: 'P2P transfer ID to recover' },
      },
      required: ['transfer_id'],
    },
  },

  // --- Swap Operations (4) ---
  {
    name: 'swap_quote',
    description: 'Get a swap quote before executing. Shows expected output amount and price impact.',
    input_schema: {
      type: 'object',
      properties: {
        pocket_id: { type: 'string', description: 'Pocket ID to swap from' },
        input_mint: { type: 'string', description: 'Input token mint address (use "SOL" for native SOL)' },
        output_mint: { type: 'string', description: 'Output token mint address or symbol' },
        amount: { type: 'number', description: 'Amount to swap' },
      },
      required: ['pocket_id', 'input_mint', 'output_mint', 'amount'],
    },
  },
  {
    name: 'swap_execute',
    description: 'Execute a token swap via Jupiter. Swap SOL to any token or token back to SOL.',
    input_schema: {
      type: 'object',
      properties: {
        pocket_id: { type: 'string', description: 'Pocket ID to swap from' },
        input_mint: { type: 'string', description: 'Input token mint address (use "SOL" for native SOL)' },
        output_mint: { type: 'string', description: 'Output token mint address or symbol' },
        amount: { type: 'number', description: 'Amount to swap' },
        slippage_bps: { type: 'number', description: 'Slippage tolerance in basis points (default: 300)' },
      },
      required: ['pocket_id', 'input_mint', 'output_mint', 'amount'],
    },
  },

  // --- Wallet Management (3) ---
  {
    name: 'list_wallets',
    description: 'List all saved destination wallets (slots 1-5).',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'add_wallet',
    description: 'Save a destination wallet address to a slot (1-5) for quick operations.',
    input_schema: {
      type: 'object',
      properties: {
        slot: { type: 'number', description: 'Wallet slot number (1-5)' },
        address: { type: 'string', description: 'Solana wallet address' },
        label: { type: 'string', description: 'Optional label' },
      },
      required: ['slot', 'address'],
    },
  },
  {
    name: 'delete_wallet',
    description: 'Remove a saved destination wallet by slot number.',
    input_schema: {
      type: 'object',
      properties: {
        slot: { type: 'number', description: 'Wallet slot to remove (1-5)' },
      },
      required: ['slot'],
    },
  },

  // --- Contacts (3) ---
  {
    name: 'add_contact',
    description: 'Add a contact alias mapped to a pocket ID for easy P2P transfers.',
    input_schema: {
      type: 'object',
      properties: {
        alias: { type: 'string', description: 'Contact alias (e.g., @bob)' },
        pocket_id: { type: 'string', description: 'Pocket ID for this contact' },
      },
      required: ['alias', 'pocket_id'],
    },
  },
  {
    name: 'list_contacts',
    description: 'List all saved contacts with their aliases and pocket IDs.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'delete_contact',
    description: 'Delete a contact by alias.',
    input_schema: {
      type: 'object',
      properties: {
        alias: { type: 'string', description: 'Contact alias to delete' },
      },
      required: ['alias'],
    },
  },

  // --- Analytics & Info (5) ---
  {
    name: 'get_stats',
    description: 'Get protocol-wide statistics: total nodes, hops, 24h activity.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'get_usage_stats',
    description: 'Get personal usage statistics: routes today, this week, total volume.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'get_route_history',
    description: 'Get history of all maze routes (funding and sweeps) with status.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'get_tier_info',
    description: 'Get current tier info: holding requirements, limits, fee rates.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'estimate_fee',
    description: 'Estimate the fee for a maze route or pocket creation without executing.',
    input_schema: {
      type: 'object',
      properties: {
        amount_sol: { type: 'number', description: 'Amount of SOL' },
        operation: { type: 'string', enum: ['route', 'pocket', 'sweep'], description: 'Type of operation' },
      },
      required: ['amount_sol'],
    },
  },

  // --- Strategy Engine (6) ---
  {
    name: 'create_strategy',
    description: 'Create an automated strategy with trigger condition and action. Evaluated on heartbeat cycles.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Strategy name' },
        trigger_type: {
          type: 'string',
          enum: ['balance_threshold', 'time_based', 'price_based', 'status_based', 'idle_time', 'pocket_count', 'schedule', 'usepod_balance'],
          description: 'Type of trigger condition',
        },
        trigger_condition: { type: 'string', description: 'Condition expression (e.g., "pocket.balance > 0.5")' },
        trigger_interval_seconds: { type: 'number', description: 'How often to check (default: 60)' },
        action_type: {
          type: 'string',
          enum: ['create_pocket', 'sweep', 'sweep_all', 'send_p2p', 'swap', 'recover', 'notify', 'kausa_pay', 'llm_analyze', 'fund_usepod'],
          description: 'Action to execute when triggered',
        },
        action_params: { type: 'object', description: 'Parameters for the action' },
        max_executions_per_day: { type: 'number', description: 'Max times this strategy can fire per day' },
        cooldown_minutes: { type: 'number', description: 'Minimum minutes between executions' },
        action_chain: { type: 'string', description: 'JSON array of chain steps for multi-step strategies. Each step: {step, action_type, action_params, output_var?, continue_on_fail?}. Use {{$prev.field}} to reference previous step output.' },
      },
      required: ['name', 'trigger_type', 'trigger_condition', 'action_type'],
    },
  },
  {
    name: 'list_strategies',
    description: 'List all registered strategies with their status (active, paused).',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'pause_strategy',
    description: 'Pause an active strategy. It will not be evaluated on heartbeat.',
    input_schema: {
      type: 'object',
      properties: {
        strategy_id: { type: 'string', description: 'Strategy ID to pause' },
      },
      required: ['strategy_id'],
    },
  },
  {
    name: 'resume_strategy',
    description: 'Resume a paused strategy.',
    input_schema: {
      type: 'object',
      properties: {
        strategy_id: { type: 'string', description: 'Strategy ID to resume' },
      },
      required: ['strategy_id'],
    },
  },
  {
    name: 'delete_strategy',
    description: 'Delete a strategy permanently.',
    input_schema: {
      type: 'object',
      properties: {
        strategy_id: { type: 'string', description: 'Strategy ID to delete' },
      },
      required: ['strategy_id'],
    },
  },
  {
    name: 'update_strategy',
    description: 'Update an existing strategy. Change trigger condition, action, limits, or other parameters without deleting and recreating.',
    input_schema: {
      type: 'object',
      properties: {
        strategy_id: { type: 'string', description: 'Strategy ID to update' },
        name: { type: 'string', description: 'New name' },
        trigger_type: { type: 'string', enum: ['balance_threshold', 'time_based', 'price_based', 'status_based', 'idle_time', 'pocket_count', 'schedule', 'usepod_balance'], description: 'New trigger type' },
        trigger_condition: { type: 'string', description: 'New trigger condition' },
        trigger_interval_seconds: { type: 'number', description: 'New check interval' },
        action_type: { type: 'string', enum: ['create_pocket', 'sweep', 'sweep_all', 'send_p2p', 'swap', 'recover', 'notify', 'kausa_pay', 'llm_analyze', 'fund_usepod'], description: 'New action type' },
        action_params: { type: 'object', description: 'New action parameters' },
        max_executions_per_day: { type: 'number', description: 'New daily limit' },
        cooldown_minutes: { type: 'number', description: 'New cooldown period' },
        action_chain: { type: 'string', description: 'New action chain JSON' },
      },
      required: ['strategy_id'],
    },
  },
  {
    name: 'get_strategy_logs',
    description: 'Get execution logs for a strategy: when it triggered, what it did, results.',
    input_schema: {
      type: 'object',
      properties: {
        strategy_id: { type: 'string', description: 'Strategy ID to get logs for' },
      },
      required: ['strategy_id'],
    },
  },

  // --- System (2) ---
  {
    name: 'health_check',
    description: 'Check if KausaLayer backend is healthy and responsive.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'get_sol_price',
    description: 'Get current SOL price in USD with price changes over 1h, 6h, and 24h timeframes. Real-time data from DexScreener.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'get_system_status',
    description: 'Get KausaOS system status: uptime, active strategies, last heartbeat, pending operations.',
    input_schema: { type: 'object', properties: {} },
  },
  // --- Portfolio & Trading (4) ---
  {
    name: 'portfolio_summary',
    description: 'Get portfolio summary: all token positions with PnL, average buy price, and current value. Shows unrealized profit/loss for each token held in pockets.',
    input_schema: {
      type: 'object',
      properties: {
        pocket_id: { type: 'string', description: 'Optional: filter by pocket ID' },
      },
    },
  },
  {
    name: 'get_trade_history',
    description: 'Get history of all token swaps (buys and sells) with entry prices and amounts.',
    input_schema: {
      type: 'object',
      properties: {
        pocket_id: { type: 'string', description: 'Optional: filter by pocket ID' },
        limit: { type: 'number', description: 'Number of trades to return (default: 50)' },
      },
    },
  },
  {
    name: 'set_trade_rule',
    description: 'Set take profit, stop loss, or DCA rule for a token position. Rules are evaluated on heartbeat. Take profit/stop loss percentage is relative to average buy price.',
    input_schema: {
      type: 'object',
      properties: {
        pocket_id: { type: 'string', description: 'Pocket ID holding the token' },
        token_mint: { type: 'string', description: 'Token mint address' },
        token_symbol: { type: 'string', description: 'Token symbol (e.g., BONK, WIF)' },
        take_profit_pct: { type: 'number', description: 'Sell when price rises this % above average buy (e.g., 100 = sell at 2x)' },
        stop_loss_pct: { type: 'number', description: 'Sell when price drops this % below average buy (e.g., 30 = sell at -30%)' },
        dca_interval_minutes: { type: 'number', description: 'DCA interval: swap every N minutes' },
        dca_amount_sol: { type: 'number', description: 'DCA amount: SOL to swap each interval' },
      },
      required: ['pocket_id', 'token_mint', 'token_symbol'],
    },
  },
  {
    name: 'remove_trade_rule',
    description: 'Remove a take profit, stop loss, or DCA rule.',
    input_schema: {
      type: 'object',
      properties: {
        rule_id: { type: 'string', description: 'Trade rule ID to remove' },
      },
      required: ['rule_id'],
    },
  },
  {
    name: 'sync_portfolio',
    description: 'Sync portfolio positions from on-chain data. Scans all active pockets for token balances and updates portfolio tracker. Run this when starting KausaOS for the first time or to refresh positions.',
    input_schema: {
      type: 'object',
      properties: {
        pocket_id: { type: 'string', description: 'Optional: sync only a specific pocket' },
      },
    },
  },

  // --- Maze Config (2) ---
  {
    name: 'set_maze_config',
    description: 'Set custom maze routing configuration for all future operations. Controls hop count, merge strategy, delay pattern, and more. Settings persist across sessions.',
    input_schema: {
      type: 'object',
      properties: {
        hop_count: { type: 'number', description: 'Number of hops (4-20, default: 10)' },
        split_ratio: { type: 'number', description: 'Split ratio for transactions (0.1-0.9)' },
        merge_strategy: { type: 'string', enum: ['fibonacci', 'random', 'equal', 'weighted'], description: 'How to merge split transactions back' },
        delay_pattern: { type: 'string', enum: ['none', 'fixed', 'random', 'exponential'], description: 'Delay pattern between hops' },
        delay_ms: { type: 'number', description: 'Delay in milliseconds between hops (0-10000)' },
        delay_scope: { type: 'string', enum: ['per_hop', 'per_level', 'total'], description: 'Where delay applies' },
      },
    },
  },
  {
    name: 'get_maze_config',
    description: 'Show current custom maze routing configuration. Returns null if using defaults.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'reset_maze_config',
    description: 'Reset maze routing configuration to defaults. Removes all custom settings.',
    input_schema: { type: 'object', properties: {} },
  },

  // --- KausaPay (1) ---
  {
    name: 'kausa_pay_now',
    description: 'Pay a x402 API endpoint using USDC from a pocket and return the response. Supports any HTTP API that accepts x402 payments (Perplexity, ScreenshotOne, etc).',
    input_schema: {
      type: 'object',
      properties: {
        pocket_id: { type: 'string', description: 'Pocket ID to pay from' },
        url: { type: 'string', description: 'x402 endpoint URL to call' },
        method: { type: 'string', enum: ['GET', 'POST', 'PUT'], description: 'HTTP method (default: POST)' },
        body: { type: 'string', description: 'Request body as JSON string' },
        max_amount_usdc: { type: 'number', description: 'Maximum USDC to pay (default: 0.01)' },
        extract_field: { type: 'string', description: 'Specific field to extract from response JSON' },
      },
      required: ['pocket_id', 'url'],
    },
  },

  // --- Paid API Catalog (2) ---
  {
    name: 'search_paid_apis',
    description: 'Search the pay.sh catalog for paid API providers that match a task. Returns provider name, description, category, service URL, and pricing. Use this when the user asks for data, services, or API access that might be available as a paid endpoint.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query describing the task (e.g. "instagram data", "translate text", "crypto prices")' },
        category: { type: 'string', description: 'Optional category filter (ai_ml, data, media, messaging, search, compute, maps, translation, security, finance, shopping, storage, devtools, cloud)' },
        max_results: { type: 'number', description: 'Max results to return (default: 5)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_api_details',
    description: 'Get detailed endpoint info for a specific paid API provider. Returns full usage notes, endpoint paths, methods, pricing, and request body format. Use after search_paid_apis to get the exact URL and parameters needed for kausa_pay_now.',
    input_schema: {
      type: 'object',
      properties: {
        fqn: { type: 'string', description: 'Provider FQN from search results (e.g. "paysponge/wolframalpha", "merit-systems/stablesocial/social-data")' },
      },
      required: ['fqn'],
    },
  },

  // --- Conduit Protocol (2) ---
  {
    name: 'conduit_discover',
    description: 'Discover available external capabilities on Conduit marketplace (inference, compute, scraping, translation, OCR, etc.). Returns providers with pricing and resource IDs. Use when agent needs external AI services and no specific URL is given.',
    input_schema: {
      type: 'object',
      properties: {
        pocket_id: { type: 'string', description: 'Any active pocket ID (used for API routing)' },
        category: { type: 'string', description: 'Optional filter: ai, agent, compute, data, storage, workflow, gpu, etc.' },
      },
      required: ['pocket_id'],
    },
  },
  {
    name: 'conduit_call',
    description: 'Call an external capability on Conduit marketplace. Payment in USDC from pocket stealth address. Requires pocket_id with USDC balance and resource_id from conduit_discover.',
    input_schema: {
      type: 'object',
      properties: {
        pocket_id: { type: 'string', description: 'Pocket ID to pay from (must have USDC balance)' },
        resource_id: { type: 'number', description: 'Capability resource ID from conduit_discover results' },
        payload: { type: 'object', description: 'Request payload for the capability (e.g. { "prompt": "..." })' },
      },
      required: ['pocket_id', 'resource_id', 'payload'],
    },
  },

  // --- UsePod Integration (3) ---
  {
    name: 'register_usepod_token',
    description: 'Register a UsePod inference token for a pocket. Creates a token with a deposit code on UsePod marketplace. Required before funding.',
    input_schema: {
      type: 'object',
      properties: {
        pocket_id: { type: 'string', description: 'Pocket ID to register UsePod token for' },
      },
      required: ['pocket_id'],
    },
  },
  {
    name: 'fund_usepod',
    description: 'Fund a UsePod token balance from a pocket. Swaps SOL to USDC via Jupiter, then deposits USDC to UsePod via on-chain program instruction. Pocket must have a registered UsePod token.',
    input_schema: {
      type: 'object',
      properties: {
        pocket_id: { type: 'string', description: 'Pocket ID to fund from (must have registered UsePod token)' },
        amount_sol: { type: 'number', description: 'Amount of SOL to convert to USDC and deposit (min 0.01)' },
      },
      required: ['pocket_id', 'amount_sol'],
    },
  },
  {
    name: 'check_usepod_balance',
    description: 'Check the UsePod token info and deposit code for a pocket. Shows registered token and deposit code.',
    input_schema: {
      type: 'object',
      properties: {
        pocket_id: { type: 'string', description: 'Pocket ID to check UsePod info for' },
      },
      required: ['pocket_id'],
    },
  },
  {
    name: 'usepod_query',
    description: 'Send an inference query to UsePod marketplace using a pocket\'s registered token. The pocket must have a registered and funded UsePod token. Returns the AI model response.',
    input_schema: {
      type: 'object',
      properties: {
        pocket_id: { type: 'string', description: 'Pocket ID with registered UsePod token' },
        prompt: { type: 'string', description: 'The prompt/question to send to the AI model' },
        model: { type: 'string', description: 'Model to use (default: claude-sonnet-4-6). 63 models available including: claude-sonnet-4-6, claude-opus-4-8, gpt-4o, gpt-5.4-mini, deepseek-v4-pro, qwen3-max, llama-3.3-70b, o3-mini, gemini-3-flash-preview' },
      },
      required: ['pocket_id', 'prompt'],
    },
  },


];

// ============================================================
// Tool Executor - routes tool calls to API client methods
// ============================================================

export async function executeTool(
  toolCall: ToolCall,
  apiClient: KausaLayerClient,
  context: { strategies?: any; systemStatus?: any; priceData?: any; strategyEngine?: any; tokenPriceMonitor?: any; telegramId?: string }
): Promise<string> {
  const { name, input } = toolCall;

  // Inject user's maze_config into maze-related operations
  const mazeConfig = (context.strategyEngine && context.telegramId)
    ? context.strategyEngine.getMazeConfig(context.telegramId)
    : null;

  try {
    let result: ApiResponse;

    switch (name) {
      // Pocket Operations
      case 'create_pocket':
        result = await apiClient.createPocket({ ...input, maze_config: mazeConfig || undefined } as any);
        break;
      case 'list_pockets':
        result = await apiClient.listPockets();
        break;
      case 'get_pocket_info':
        result = await apiClient.getPocket(input.pocket_id as string);
        break;
      case 'rename_pocket':
        result = await apiClient.renamePocket(input.pocket_id as string, input.label as string);
        break;
      case 'archive_pocket':
        result = await apiClient.archivePocket(input.pocket_id as string);
        break;
      case 'delete_pocket':
        result = await apiClient.deletePocket(input.pocket_id as string);
        break;
      case 'export_pocket_key':
        result = await apiClient.exportPocketKey(input.pocket_id as string);
        break;
      case 'get_pocket_transactions':
        result = await apiClient.getPocketTransactions(input.pocket_id as string);
        break;
      case 'get_token_balances':
        result = await apiClient.getTokenBalances(input.pocket_id as string);
        break;

      // Maze Routing
      case 'maze_route':
        result = await apiClient.createRoute({ ...input, maze_config: mazeConfig || undefined } as any);
        break;
      case 'check_route_status':
        result = await apiClient.getFundingStatus(input.request_id as string);
        break;
      case 'retry_route': {
        const retryId = input.request_id as string;
        if (retryId.startsWith('sweep_')) {
          result = await apiClient.resumeSweep(retryId);
        } else {
          result = { success: false, error: 'Retry only supported for sweep operations. Use recover_funding for funding issues.' };
        }
        break;
      }

      // Sweep
      case 'sweep_pocket':
        result = await apiClient.sweepPocket(input.pocket_id as string, { ...input, maze_config: mazeConfig || undefined } as any);
        break;
      case 'sweep_all_pockets':
        result = await apiClient.sweepAllPockets({ ...input, maze_config: mazeConfig || undefined } as any);
        break;
      case 'get_sweep_status':
        result = await apiClient.getSweepStatus(input.sweep_id as string);
        break;
      case 'resume_sweep':
        result = await apiClient.resumeSweep(input.sweep_id as string);
        break;
      case 'recover_sweep':
        result = await apiClient.recoverSweep(input.sweep_id as string);
        break;
      case 'recover_funding':
        result = await apiClient.recoverFunding(input.pocket_id as string);
        break;

      // P2P
      case 'send_to_pocket':
        result = await apiClient.sendToPocket(input.pocket_id as string, { ...input, maze_config: mazeConfig || undefined } as any);
        break;
      case 'get_p2p_status':
        result = await apiClient.getP2PStatus(input.transfer_id as string);
        break;
      case 'recover_p2p':
        result = await apiClient.recoverP2P(input.transfer_id as string);
        break;

      // Swap
      case 'swap_quote':
        result = await apiClient.swapQuote(input.pocket_id as string, input as any);
        break;
      case 'swap_execute': {
        result = await apiClient.swapExecute(input.pocket_id as string, input as any);
        // Record trade in portfolio tracker
        if (result.success && result.data && context.strategyEngine) {
          try {
            const swapData = result.data.swap_result || result.data;
            const inputMint = input.input_mint as string || 'SOL';
            const outputMint = input.output_mint as string || '';
            const amountSol = (input.amount as number) || 0;
            const isBuy = inputMint === 'SOL' || inputMint === 'So11111111111111111111111111111111111111112';
            const tokenMint = isBuy ? outputMint : inputMint;
            const outAmount = parseFloat(swapData.out_amount || swapData.in_amount || '0');

            // Calculate price_usd per token from current market data
            let priceUsd = 0;
            if (context.tokenPriceMonitor && tokenMint) {
              try {
                const tokenPrice = await context.tokenPriceMonitor.getTokenPrice(tokenMint);
                if (tokenPrice && tokenPrice.price_usd > 0) {
                  priceUsd = tokenPrice.price_usd;
                }
              } catch (_) {}
            }

            context.strategyEngine.recordTrade({
              pocket_id: input.pocket_id as string,
              token_mint: tokenMint,
              token_symbol: (swapData.output_symbol || swapData.input_symbol || outputMint || '').toUpperCase(),
              side: isBuy ? 'buy' : 'sell',
              amount_sol: amountSol,
              amount_token: outAmount,
              price_usd: priceUsd,
              tx_signature: swapData.tx_signature || null,
            });
          } catch (err: any) {
            console.warn('[Tools] Trade recording failed:', err.message);
          }
        }
        break;
      }

      // Wallet
      case 'list_wallets':
        result = await apiClient.listWallets();
        break;
      case 'add_wallet':
        result = await apiClient.addWallet(input as any);
        break;
      case 'delete_wallet':
        result = await apiClient.deleteWallet(input.slot as number);
        break;

      // Contacts
      case 'add_contact':
        result = await apiClient.addContact(input as any);
        break;
      case 'list_contacts':
        result = await apiClient.listContacts();
        break;
      case 'delete_contact':
        result = await apiClient.deleteContact(input.alias as string);
        break;

      // Analytics
      case 'get_stats':
        result = await apiClient.stats();
        break;
      case 'get_usage_stats':
        result = await apiClient.getUsageStats();
        break;
      case 'get_route_history': {
        const historyRes = await apiClient.getRouteHistory();
        if (historyRes.success && historyRes.data?.routes) {
          historyRes.data.routes = historyRes.data.routes.map((r: any) => ({
            ...r,
            created_at_date: r.created_at ? new Date(r.created_at * 1000).toISOString() : null,
            completed_at_date: r.completed_at ? new Date(r.completed_at * 1000).toISOString() : null,
          }));
        }
        result = historyRes;
        break;
      }
      case 'get_tier_info':
        result = await apiClient.getTierConfig();
        break;
      case 'estimate_fee': {
        const amountSol = (input.amount_sol as number) || 0;
        const tierInfo = context.systemStatus || {};
        const tierName = tierInfo.tierName || 'FREE';
        const feeRates: Record<string, number> = { FREE: 2.0, BASIC: 1.0, PRO: 0.5, ENTERPRISE: 0.25 };
        const feePercent = feeRates[tierName] || 2.0;
        const feeSol = amountSol * (feePercent / 100);
        const complexityHops: Record<string, number> = { low: 6, medium: 10, high: 15 };
        const hops = complexityHops[(input.complexity as string) || 'medium'] || 10;
        const txFeeSol = (hops * 5000) / 1_000_000_000;
        result = {
          success: true,
          data: {
            amount_sol: amountSol,
            fee_sol: feeSol,
            fee_percent: feePercent,
            tx_fee_sol: txFeeSol,
            total_required: amountSol + feeSol + txFeeSol,
            estimated_hops: hops,
            tier: tierName,
          },
        };
        break;
      }
      case 'health_check':
        result = await apiClient.health();
        break;

      // Strategy (local operations - handled by strategy engine)
      case 'create_strategy':
        if (context.strategyEngine) {
          // Auto-calculate cooldown from interval if not specified
          const intervalSec = (input.trigger_interval_seconds as number) || 60;
          const defaultCooldown = Math.max(1, Math.ceil(intervalSec / 60));
          const strat = context.strategyEngine.createStrategy({
            name: (input.name as string) || 'unnamed',
            trigger_type: input.trigger_type as any,
            trigger_condition: input.trigger_condition as string,
            trigger_interval_seconds: intervalSec,
            action_type: input.action_type as any,
            action_params: (input.action_params as any) || {},
            max_executions_per_day: (input.max_executions_per_day as number) || 1440,
            cooldown_minutes: (input.cooldown_minutes as number) || defaultCooldown,
            owner_telegram_id: context.telegramId,
            action_chain: (input.action_chain as string) || undefined,
          });
          result = { success: true, data: strat };
        } else {
          result = { success: false, error: 'Strategy engine not available' };
        }
        break;
      case 'list_strategies':
        if (context.strategyEngine) {
          let strats = context.strategyEngine.listStrategies();
          if (context.telegramId) {
            strats = strats.filter((s: any) => s.owner_telegram_id === context.telegramId);
          }
          result = { success: true, data: { strategies: strats, count: strats.length } };
        } else {
          result = { success: false, error: 'Strategy engine not available' };
        }
        break;
      case 'pause_strategy':
        if (context.strategyEngine) {
          const paused = context.strategyEngine.pauseStrategy(input.strategy_id as string);
          result = { success: paused, data: { paused }, error: paused ? undefined : 'Strategy not found' };
        } else {
          result = { success: false, error: 'Strategy engine not available' };
        }
        break;
      case 'resume_strategy':
        if (context.strategyEngine) {
          const resumed = context.strategyEngine.resumeStrategy(input.strategy_id as string);
          result = { success: resumed, data: { resumed }, error: resumed ? undefined : 'Strategy not found' };
        } else {
          result = { success: false, error: 'Strategy engine not available' };
        }
        break;
      case 'delete_strategy':
        if (context.strategyEngine) {
          const deleted = context.strategyEngine.deleteStrategy(input.strategy_id as string);
          result = { success: deleted, data: { deleted }, error: deleted ? undefined : 'Strategy not found' };
        } else {
          result = { success: false, error: 'Strategy engine not available' };
        }
        break;
      case 'update_strategy':
        if (context.strategyEngine) {
          const updated = context.strategyEngine.updateStrategy(input.strategy_id as string, {
            name: input.name as string | undefined,
            trigger_type: input.trigger_type as any,
            trigger_condition: input.trigger_condition as string | undefined,
            trigger_interval_seconds: input.trigger_interval_seconds as number | undefined,
            action_type: input.action_type as any,
            action_params: input.action_params as any,
            max_executions_per_day: input.max_executions_per_day as number | undefined,
            cooldown_minutes: input.cooldown_minutes as number | undefined,
            action_chain: input.action_chain as string | undefined,
          });
          result = updated
            ? { success: true, data: updated }
            : { success: false, error: 'Strategy not found' };
        } else {
          result = { success: false, error: 'Strategy engine not available' };
        }
        break;
      case 'get_strategy_logs':
        if (context.strategyEngine) {
          const logs = context.strategyEngine.getStrategyLogs(input.strategy_id as string);
          result = { success: true, data: { logs, count: logs.length } };
        } else {
          result = { success: false, error: 'Strategy engine not available' };
        }
        break;

      // System
      case 'get_sol_price':
        result = {
          success: true,
          data: context.priceData || { price: 0, change_h1: 0, change_h6: 0, change_h24: 0 },
        };
        break;
      case 'get_system_status':
        result = {
          success: true,
          data: context.systemStatus || { status: 'running', strategies: 0, last_heartbeat: null },
        };
        break;

      // Portfolio & Trading
      case 'portfolio_summary': {
        if (context.strategyEngine) {
          const positions = context.strategyEngine.getPortfolioPositions(input.pocket_id as string | undefined);
          if (positions.length === 0) {
            result = { success: true, data: { positions: [], message: 'No positions found. Positions are tracked when swaps are executed.' } };
          } else {
            // Fetch current prices for PnL
            const tokenPriceMonitor = context.tokenPriceMonitor;
            const enriched = [];
            for (const pos of positions) {
              let pnl = null;
              if (tokenPriceMonitor) {
                pnl = await tokenPriceMonitor.calculatePnL(
                  pos.token_mint, pos.average_buy_price_usd, pos.total_amount_token, pos.total_invested_sol
                );
              }
              enriched.push({
                ...pos,
                current_price_usd: pnl?.current_price_usd || null,
                pnl_pct: pnl?.pnl_pct || null,
                unrealized_value_usd: pnl?.unrealized_value_usd || null,
              });
            }
            result = { success: true, data: { positions: enriched, count: enriched.length } };
          }
        } else {
          result = { success: false, error: 'Strategy engine not available' };
        }
        break;
      }
      case 'get_trade_history': {
        if (context.strategyEngine) {
          const trades = context.strategyEngine.getTradeHistory(
            input.pocket_id as string | undefined,
            (input.limit as number) || 50
          );
          result = { success: true, data: { trades, count: trades.length } };
        } else {
          result = { success: false, error: 'Strategy engine not available' };
        }
        break;
      }
      case 'set_trade_rule': {
        if (context.strategyEngine) {
          const rule = context.strategyEngine.createTradeRule({
            pocket_id: input.pocket_id as string,
            token_mint: input.token_mint as string,
            token_symbol: input.token_symbol as string,
            take_profit_pct: input.take_profit_pct as number | undefined,
            stop_loss_pct: input.stop_loss_pct as number | undefined,
            dca_interval_minutes: input.dca_interval_minutes as number | undefined,
            dca_amount_sol: input.dca_amount_sol as number | undefined,
          });
          result = { success: true, data: rule };
        } else {
          result = { success: false, error: 'Strategy engine not available' };
        }
        break;
      }
      case 'remove_trade_rule': {
        if (context.strategyEngine) {
          const deleted = context.strategyEngine.deleteTradeRule(input.rule_id as string);
          result = { success: deleted, data: { deleted }, error: deleted ? undefined : 'Rule not found' };
        } else {
          result = { success: false, error: 'Strategy engine not available' };
        }
        break;
      }

      case 'sync_portfolio': {
        if (context.strategyEngine && context.tokenPriceMonitor) {
          try {
            const pocketsRes = await apiClient.listPockets();
            const pockets = pocketsRes.success && pocketsRes.data
              ? (Array.isArray(pocketsRes.data) ? pocketsRes.data : pocketsRes.data.pockets || [])
              : [];

            const activePockets = pockets.filter((p: any) => p.status === 'active');
            const targetPockets = input.pocket_id
              ? activePockets.filter((p: any) => (p.id || p.pocket_id) === input.pocket_id)
              : activePockets;

            let synced = 0;
            let tokensFound = 0;

            for (const pocket of targetPockets) {
              const pid = pocket.id || pocket.pocket_id;
              const balRes = await apiClient.getTokenBalances(pid);
              if (!balRes.success || !balRes.data) continue;

              const tokens = balRes.data.tokens || [];
              for (const token of tokens) {
                if (!token.mint || token.balance_formatted <= 0) continue;

                const existing = context.strategyEngine.getPosition(pid, token.mint);
                if (existing) {
                  // Update token amount only, keep average buy price
                  continue;
                }

                // New token not in portfolio — fetch price and add
                const priceInfo = await context.tokenPriceMonitor.getTokenPrice(token.mint);
                const priceUsd = priceInfo?.price_usd || 0;

                context.strategyEngine.recordTrade({
                  pocket_id: pid,
                  token_mint: token.mint,
                  token_symbol: token.symbol || 'UNKNOWN',
                  side: 'buy',
                  amount_sol: 0,
                  amount_token: token.balance_formatted,
                  price_usd: priceUsd,
                });
                tokensFound++;
              }
              synced++;
            }

            result = {
              success: true,
              data: {
                pockets_scanned: synced,
                new_tokens_found: tokensFound,
                message: tokensFound > 0
                  ? `Synced ${synced} pocket(s), found ${tokensFound} new token position(s). Note: entry price set to current market price for pre-existing tokens.`
                  : `Synced ${synced} pocket(s), no new tokens found.`,
              },
            };
          } catch (err: any) {
            result = { success: false, error: `Sync failed: ${err.message}` };
          }
        } else {
          result = { success: false, error: 'Strategy engine or token price monitor not available' };
        }
        break;
      }

      // Maze Config
      case 'set_maze_config': {
        if (context.strategyEngine && context.telegramId) {
          const config: Record<string, any> = {};
          if (input.hop_count !== undefined) config.hop_count = input.hop_count;
          if (input.split_ratio !== undefined) config.split_ratio = input.split_ratio;
          if (input.merge_strategy !== undefined) config.merge_strategy = input.merge_strategy;
          if (input.delay_pattern !== undefined) config.delay_pattern = input.delay_pattern;
          if (input.delay_ms !== undefined) config.delay_ms = input.delay_ms;
          if (input.delay_scope !== undefined) config.delay_scope = input.delay_scope;
          const saved = context.strategyEngine.setMazeConfig(context.telegramId, config);
          result = { success: true, data: { maze_config: saved, message: 'Maze routing config saved. All future operations will use this config.' } };
        } else {
          result = { success: false, error: 'Not available (requires Telegram session)' };
        }
        break;
      }
      case 'get_maze_config': {
        if (context.strategyEngine && context.telegramId) {
          const config = context.strategyEngine.getMazeConfig(context.telegramId);
          result = { success: true, data: { maze_config: config, message: config ? 'Custom config active' : 'Using default routing (no custom config set)' } };
        } else {
          result = { success: false, error: 'Not available (requires Telegram session)' };
        }
        break;
      }
      case 'reset_maze_config': {
        if (context.strategyEngine && context.telegramId) {
          context.strategyEngine.clearMazeConfig(context.telegramId);
          result = { success: true, data: { message: 'Maze routing config reset to defaults.' } };
        } else {
          result = { success: false, error: 'Not available (requires Telegram session)' };
        }
        break;
      }

      // Paid API Catalog
      case 'search_paid_apis': {
        const fs = await import('fs');
        const catalogPath = '/root/kausaos/data/pay-catalog.json';
        try {
          const raw = fs.readFileSync(catalogPath, 'utf-8');
          const catalog = JSON.parse(raw);
          const query = (input.query as string || '').toLowerCase();
          const category = (input.category as string || '').toLowerCase();
          const maxResults = (input.max_results as number) || 5;

          const scored = catalog.map((entry: any) => {
            let score = 0;
            const words = query.split(/\s+/);
            for (const word of words) {
              if (word.length < 2) continue;
              if (entry.title?.toLowerCase().includes(word)) score += 3;
              if (entry.name?.toLowerCase().includes(word)) score += 3;
              if (entry.description?.toLowerCase().includes(word)) score += 2;
              if (entry.use_case?.toLowerCase().includes(word)) score += 1;
            }
            if (category && entry.category?.toLowerCase() !== category) score = 0;
            return { ...entry, score };
          })
          .filter((e: any) => e.score > 0)
          .sort((a: any, b: any) => b.score - a.score)
          .slice(0, maxResults)
          .map((e: any) => ({
            name: e.title,
            fqn: e.fqn,
            category: e.category,
            description: e.description,
            service_url: e.service_url,
            pricing: e.pricing || [],
            use_case: e.use_case,
          }));

          result = { success: true, data: { results: scored, total_catalog: catalog.length, query } };
        } catch (err: any) {
          result = { success: false, error: `Catalog search failed: ${err.message}` };
        }
        break;
      }
      case 'get_api_details': {
        const fs = await import('fs');
        const fqn = input.fqn as string;
        if (!fqn) { result = { success: false, error: 'fqn is required' }; break; }

        const payMdPath = `/root/pay-skills/providers/${fqn}/PAY.md`;
        try {
          const mdContent = fs.readFileSync(payMdPath, 'utf-8');

          // Parse frontmatter
          const fmMatch = mdContent.match(/^---\s*\n([\s\S]*?)\n---/);
          const frontmatter = fmMatch ? fmMatch[1] : '';
          const body = fmMatch ? mdContent.slice(fmMatch[0].length).trim() : mdContent;

          // Extract service_url from frontmatter
          const urlMatch = frontmatter.match(/service_url:\s*(.+)/);
          const serviceUrl = urlMatch ? urlMatch[1].trim() : '';

          // Try to read openapi.json
          let endpoints: any[] = [];
          const openapiLocal = `/root/pay-skills/providers/${fqn}/openapi.json`;
          if (fs.existsSync(openapiLocal)) {
            try {
              const openapiRaw = fs.readFileSync(openapiLocal, 'utf-8');
              const openapi = JSON.parse(openapiRaw);
              if (openapi.paths) {
                for (const [path, methods] of Object.entries(openapi.paths)) {
                  for (const [method, spec] of Object.entries(methods as any)) {
                    if (['get', 'post', 'put', 'patch', 'delete'].includes(method)) {
                      const s = spec as any;
                      endpoints.push({
                        path,
                        method: method.toUpperCase(),
                        summary: s.summary || s.description || '',
                        parameters: s.parameters?.map((p: any) => ({ name: p.name, in: p.in, required: p.required, description: p.description })) || [],
                      });
                    }
                  }
                }
              }
            } catch (_) {}
          }

          // Extract openapi URL and version from frontmatter
          const openapiUrlMatch = frontmatter.match(/url:\s*(.+)/);
          const openapiUrl = openapiUrlMatch ? openapiUrlMatch[1].trim() : '';
          const versionMatch = frontmatter.match(/version:\s*(.+)/);
          const version = versionMatch ? versionMatch[1].trim() : '';

          result = {
            success: true,
            data: {
              fqn,
              service_url: serviceUrl,
              version,
              openapi_url: openapiUrl,
              usage_notes: body.slice(0, 1500),
              endpoints: endpoints.slice(0, 20),
              has_openapi: endpoints.length > 0,
            },
          };
        } catch (err: any) {
          result = { success: false, error: `Provider not found: ${fqn}. ${err.message}` };
        }
        break;
      }

      // KausaPay
      case 'kausa_pay_now': {
        const kpRes = await apiClient.kausaPay(input.pocket_id as string, {
          url: input.url as string,
          method: (input.method as string) || 'POST',
          body: input.body as string,
          max_amount_usdc: (input.max_amount_usdc as number) || 0.01,
        });
        if (kpRes.success && kpRes.data) {
          let extracted = '';
          const rd = kpRes.data;

          // Parse nested response_body (backend returns JSON string inside response_body)
          let parsed = rd;
          if (typeof rd.response_body === 'string') {
            try { parsed = JSON.parse(rd.response_body); } catch (_) {
              // response_body might be plain text (e.g. "343 million people")
              extracted = rd.response_body.replace(/^"|"$/g, '');
            }
          }

          if (!extracted) {
            if (input.extract_field && parsed[input.extract_field as string]) {
              extracted = String(parsed[input.extract_field as string]);
            } else if (typeof parsed === 'string') {
              extracted = parsed;
            } else {
              const fields = ['content', 'data', 'message', 'result', 'premiumContent', 'text', 'answer', 'response', 'token', 'access_token'];
              for (const f of fields) {
                if (parsed[f]) {
                  extracted = typeof parsed[f] === 'string' ? parsed[f] : JSON.stringify(parsed[f]);
                  break;
                }
              }
              if (!extracted) extracted = JSON.stringify(parsed).slice(0, 500);
            }
          }

          if (extracted.length > 2000) extracted = extracted.slice(0, 2000) + '...';

          // Return clean data: content + payment metadata (no raw dump)
          result = {
            success: true,
            data: {
              content: extracted,
              amount_paid: rd.amount_paid_usdc || rd.amount_paid || 0,
              protocol: rd.protocol_used || 'x402',
              token_symbol: rd.token_symbol || 'USDC',
              tx_signature: rd.payment_signature || rd.tx_signature || null,
            },
          };
        } else {
          result = kpRes;
        }
        break;
      }

      // Conduit Protocol
      case 'conduit_discover': {
        const cdRes = await apiClient.conduitDiscover(input.pocket_id as string, {
          category: input.category as string | undefined,
        });
        if (cdRes.success && cdRes.data) {
          const d = cdRes.data;
          // Summarize for LLM: show endpoints with top 3 providers each
          const endpoints = (d.endpoints || []).map((ep: any) => ({
            capability: ep.capabilityName || ep.capability,
            path: ep.path,
            unit: ep.unit,
            providers: (ep.providers || []).slice(0, 3).map((p: any) => ({
              id: p.id, name: p.name, price: p.pricePerUnit,
            })),
            total_providers: (ep.providers || []).length,
          }));
          result = {
            success: true,
            data: {
              network: d.network,
              asset: d.asset,
              endpoint_count: d.endpoint_count,
              api_listing_count: d.api_listing_count,
              endpoints,
            },
          };
        } else {
          result = cdRes;
        }
        break;
      }
      case 'conduit_call': {
        const ccRes = await apiClient.conduitCall(input.pocket_id as string, {
          resource_id: input.resource_id,
          payload: input.payload || {},
          password: '',
        });
        if (ccRes.success && ccRes.data) {
          result = {
            success: true,
            data: {
              status: ccRes.data.status,
              body: ccRes.data.body,
              signature: ccRes.data.signature,
            },
          };
        } else {
          result = ccRes;
        }
        break;
      }


      // UsePod Integration
      case 'register_usepod_token':
        result = await apiClient.usepodRegister(input.pocket_id as string);
        break;
      case 'fund_usepod':
        result = await apiClient.usepodFund(input.pocket_id as string, {
          amount_sol: input.amount_sol as number,
        });
        break;
      case 'check_usepod_balance': {
        const cbPocketRes = await apiClient.getPocket(input.pocket_id as string);
        if (cbPocketRes.success && cbPocketRes.data?.pocket) {
          const cbp = cbPocketRes.data.pocket;
          let cbBalance: string | null = null;
          let cbFunded = false;

          // Use last known balance from database (saved by usepod_query)
          const cbLastBalance = cbp.usepod_last_balance || null;
          if (cbLastBalance && cbLastBalance > 0) {
            cbFunded = true;
            cbBalance = String(cbLastBalance);
          }

          result = {
            success: true,
            data: {
              pocket_id: input.pocket_id,
              usepod_token: cbp.usepod_token || null,
              usepod_deposit_code: cbp.usepod_deposit_address || null,
              registered: !!cbp.usepod_token,
              funded: cbFunded,
              balance_remaining: cbBalance,
              message: !cbp.usepod_token
                ? 'No UsePod token registered. Use register_usepod_token first.'
                : cbFunded
                  ? `UsePod token active and funded. Balance: ${cbBalance} credits (~$${(parseFloat(cbBalance || '0') / 1000000).toFixed(2)} USDC) remaining.`
                  : 'UsePod token registered. Balance unknown - make a query to check.',
            },
          };

        } else {
          result = cbPocketRes;
        }
        break;
      }


      case 'usepod_query': {
        // Get pocket info to retrieve UsePod token
        const uqPocketRes = await apiClient.getPocket(input.pocket_id as string);
        if (!uqPocketRes.success || !uqPocketRes.data?.pocket) {
          result = { success: false, error: 'Pocket not found' };
          break;
        }
        const uqPocket = uqPocketRes.data.pocket;
        if (!uqPocket.usepod_token) {
          result = { success: false, error: 'No UsePod token registered for this pocket. Use register_usepod_token first.' };
          break;
        }

        // Call UsePod proxy directly
        const uqModel = (input.model as string) || 'claude-sonnet-4-6';
        const uqPrompt = input.prompt as string;
        try {
          const axios = (await import('axios')).default;
          const uqResp = await axios.post(
            `https://api.usepod.ai/proxy/${uqPocket.usepod_token}/v1/chat/completions`,
            {
              model: uqModel,
              messages: [{ role: 'user', content: uqPrompt }],
              max_tokens: 2048,
            },
            {
              headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer unused',
              },
              timeout: 60000,
            }
          );

          const uqData = uqResp.data;
          const uqText = uqData.choices?.[0]?.message?.content || '';
          const uqBalanceRaw = uqResp.headers?.['x-balance-remaining'] || null;
          const uqBalance = uqBalanceRaw ? String(uqBalanceRaw).split(',').pop()?.trim() || null : null;
          const uqRoute = uqResp.headers?.['x-pod-route'] || null;

          // Save balance to backend for persistent tracking
          if (uqBalance) {
            try {
              await apiClient.usepodUpdateBalance(input.pocket_id as string, parseFloat(uqBalance));
            } catch (_) {}
          }

          result = {
            success: true,
            data: {
              response: uqText,
              model: uqModel,
              balance_remaining: uqBalance,
                balance_remaining_usdc: uqBalance ? (parseFloat(uqBalance) / 1000000).toFixed(4) : null,
              route: uqRoute,
            },
          };
        } catch (uqErr: any) {
          const errMsg = uqErr.response?.data?.error?.message || uqErr.message || 'UsePod inference failed';
          result = { success: false, error: errMsg };
        }
        break;
      }


      default:
        result = { success: false, error: `Unknown tool: ${name}` };
    }

    if (!result.success) {
      return JSON.stringify({ error: result.error });
    }
    return JSON.stringify(result.data);
  } catch (err: any) {
    return JSON.stringify({ error: err.message || 'Tool execution failed' });
  }
}
