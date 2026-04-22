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
          enum: ['balance_threshold', 'time_based', 'price_based', 'status_based', 'idle_time', 'pocket_count'],
          description: 'Type of trigger condition',
        },
        trigger_condition: { type: 'string', description: 'Condition expression (e.g., "pocket.balance > 0.5")' },
        trigger_interval_seconds: { type: 'number', description: 'How often to check (default: 60)' },
        action_type: {
          type: 'string',
          enum: ['create_pocket', 'sweep', 'sweep_all', 'send_p2p', 'swap', 'recover', 'notify'],
          description: 'Action to execute when triggered',
        },
        action_params: { type: 'object', description: 'Parameters for the action' },
        max_executions_per_day: { type: 'number', description: 'Max times this strategy can fire per day' },
        cooldown_minutes: { type: 'number', description: 'Minimum minutes between executions' },
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
];

// ============================================================
// Tool Executor - routes tool calls to API client methods
// ============================================================

export async function executeTool(
  toolCall: ToolCall,
  apiClient: KausaLayerClient,
  context: { strategies?: any; systemStatus?: any; priceData?: any; strategyEngine?: any }
): Promise<string> {
  const { name, input } = toolCall;

  try {
    let result: ApiResponse;

    switch (name) {
      // Pocket Operations
      case 'create_pocket':
        result = await apiClient.createPocket(input as any);
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
        result = await apiClient.createRoute(input as any);
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
        result = await apiClient.sweepPocket(input.pocket_id as string, input as any);
        break;
      case 'sweep_all_pockets':
        result = await apiClient.sweepAllPockets(input as any);
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
        result = await apiClient.sendToPocket(input.pocket_id as string, input as any);
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
      case 'swap_execute':
        result = await apiClient.swapExecute(input.pocket_id as string, input as any);
        break;

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
      case 'get_route_history':
        result = await apiClient.getRouteHistory();
        break;
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
          const strat = context.strategyEngine.createStrategy({
            name: (input.name as string) || 'unnamed',
            trigger_type: input.trigger_type as any,
            trigger_condition: input.trigger_condition as string,
            trigger_interval_seconds: (input.trigger_interval_seconds as number) || 60,
            action_type: input.action_type as any,
            action_params: (input.action_params as any) || {},
            max_executions_per_day: (input.max_executions_per_day as number) || 5,
            cooldown_minutes: (input.cooldown_minutes as number) || 30,
          });
          result = { success: true, data: strat };
        } else {
          result = { success: false, error: 'Strategy engine not available' };
        }
        break;
      case 'list_strategies':
        if (context.strategyEngine) {
          const strats = context.strategyEngine.listStrategies();
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
