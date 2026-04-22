/**
import dotenv from 'dotenv';
dotenv.config();
 * KausaOS - Daemon Manager
 * Main entry point. Starts brain, heartbeat, channels.
 */

import path from 'path';
import { loadConfig } from './config';
import { Brain } from './brain';
import { StrategyEngine } from './strategy';
import { Heartbeat } from './heartbeat';
import { TerminalChannel } from './channels';
import { PriceMonitor } from './monitor';

const BANNER = `
 _  __                       ___  ____  
| |/ /__ _ _   _ ___  __ _  / _ \\/ ___| 
| ' // _\` | | | / __|/ _\` || | | \\___ \\ 
| . \\ (_| | |_| \\__ \\ (_| || |_| |___) |
|_|\\_\\__,_|\\__,_|___/\\__,_| \\___/|____/ 
                                         
Privacy Agent Framework for Solana
Built on KausaLayer Protocol
`;

async function main(): Promise<void> {
  console.log(BANNER);

  const basePath = process.env.KAUSAOS_PATH || process.cwd();

  // Load config
  let config;
  try {
    config = loadConfig(basePath);
    console.log('[KausaOS] Config loaded');
    console.log(`[KausaOS] LLM: ${config.llm.provider} (${config.llm.model})`);
    console.log(`[KausaOS] Endpoint: ${config.kausalayer.endpoint}`);
  } catch (err: any) {
    console.error(`[KausaOS] Config error: ${err.message}`);
    process.exit(1);
  }

  // Initialize brain
  const brain = new Brain({ config, basePath });
  console.log('[KausaOS] Brain initialized');

  // Initialize API client (validate key, get meta_address, resolve tier)
  try {
    await brain.getApiClient().init();
    console.log('[KausaOS] API client authenticated');
  } catch (err: any) {
    console.error(`[KausaOS] API auth failed: ${err.message}`);
    console.error('[KausaOS] Check your kausalayer.api_key in kausaos.json');
    process.exit(1);
  }

  // Initialize strategy engine
  const dbPath = path.resolve(basePath, config.database.path);
  const strategyEngine = new StrategyEngine(dbPath);
  console.log('[KausaOS] Strategy engine initialized');

  // Connect strategy engine to brain
  brain.setStrategyEngine(strategyEngine);

  // Initialize heartbeat
  const heartbeat = new Heartbeat(
    config.heartbeat.interval_minutes,
    strategyEngine,
    brain.getApiClient()
  );
  heartbeat.start();
  console.log('[KausaOS] Heartbeat started');

  // Sync brain context from live data
  await syncBrainContext(brain, strategyEngine, heartbeat);

  // Re-sync after first heartbeat fires (5s + buffer)
  setTimeout(async () => {
    await syncBrainContext(brain, strategyEngine, heartbeat, true);
  }, 8000);


  // Re-sync brain context on each heartbeat cycle
  const syncInterval = setInterval(async () => {
    await syncBrainContext(brain, strategyEngine, heartbeat, true);
  }, config.heartbeat.interval_minutes * 60 * 1000);

  // Start channels
  if (config.channels.terminal.enabled) {
    heartbeat.setQuiet(true); // suppress routine logs in terminal mode
    const terminal = new TerminalChannel(brain);
    await terminal.start();
    console.log('[KausaOS] Terminal channel started');
  }

  // Graceful shutdown
  const shutdown = () => {
    console.log('\n[KausaOS] Shutting down...');
    heartbeat.stop();
    strategyEngine.close();
    clearInterval(syncInterval);
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

/**
 * Sync brain context from live API data
 */
async function syncBrainContext(
  brain: Brain,
  strategyEngine: StrategyEngine,
  heartbeat: Heartbeat,
  quiet: boolean = false
): Promise<void> {
  try {
    const apiClient = brain.getApiClient();
    const activePockets = await apiClient.getActivePocketCount();
    const strategies = strategyEngine.listStrategies('active');
    const tierInfo = apiClient.getTierInfo();

    brain.updateContext({
      activePockets,
      activeStrategies: strategies.length,
      lastHeartbeat: heartbeat.getLastBeat(),
      tierName: tierInfo.tier,
    });

    // Sync price data to brain
    try {
      const priceMonitor = heartbeat.getPriceMonitor();
      const priceInfo = await priceMonitor.getPriceInfo();
      brain.setPriceData(priceInfo);
    } catch (_) {}

    if (!quiet) console.log(`[KausaOS] Context synced: ${activePockets} pockets, ${strategies.length} strategies, tier: ${tierInfo.tier}`);
  } catch (err: any) {
    console.warn(`[KausaOS] Context sync failed: ${err.message}`);
  }
}

main().catch((err) => {
  console.error('[KausaOS] Fatal error:', err);
  process.exit(1);
});
