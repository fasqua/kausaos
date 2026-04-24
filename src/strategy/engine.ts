/**
 * KausaOS - Strategy Engine
 * Declarative rules: trigger + action + constraints
 * Evaluated on heartbeat cycles
 */

import Database from 'better-sqlite3';


function generateId(): string {
  return `strat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export type TriggerType = 'balance_threshold' | 'time_based' | 'price_based' | 'status_based' | 'idle_time' | 'pocket_count' | 'token_price';
export type ActionType = 'create_pocket' | 'sweep' | 'sweep_all' | 'send_p2p' | 'swap' | 'recover' | 'notify';
export type StrategyStatus = 'active' | 'paused' | 'deleted';

export interface Strategy {
  id: string;
  name: string;
  trigger_type: TriggerType;
  trigger_condition: string;
  trigger_interval_seconds: number;
  action_type: ActionType;
  action_params: Record<string, any>;
  max_executions_per_day: number;
  cooldown_minutes: number;
  status: StrategyStatus;
  executions_today: number;
  last_executed_at: string | null;
  created_at: string;
}

export interface StrategyLog {
  id: string;
  strategy_id: string;
  triggered_at: string;
  trigger_reason: string;
  action_type: string;
  action_result: string;
  success: boolean;
}

export class StrategyEngine {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.initTables();
  }

  private initTables(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS strategies (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        trigger_type TEXT NOT NULL,
        trigger_condition TEXT NOT NULL,
        trigger_interval_seconds INTEGER DEFAULT 60,
        action_type TEXT NOT NULL,
        action_params TEXT DEFAULT '{}',
        max_executions_per_day INTEGER DEFAULT 5,
        cooldown_minutes INTEGER DEFAULT 30,
        status TEXT DEFAULT 'active',
        executions_today INTEGER DEFAULT 0,
        last_executed_at TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS strategy_logs (
        id TEXT PRIMARY KEY,
        strategy_id TEXT NOT NULL,
        triggered_at TEXT NOT NULL,
        trigger_reason TEXT NOT NULL,
        action_type TEXT NOT NULL,
        action_result TEXT DEFAULT '',
        success INTEGER DEFAULT 0,
        FOREIGN KEY (strategy_id) REFERENCES strategies(id)
      );

      CREATE TABLE IF NOT EXISTS daily_reset (
        last_reset TEXT
      );

      CREATE TABLE IF NOT EXISTS trade_history (
        id TEXT PRIMARY KEY,
        pocket_id TEXT NOT NULL,
        token_mint TEXT NOT NULL,
        token_symbol TEXT NOT NULL,
        side TEXT NOT NULL,
        amount_sol REAL NOT NULL,
        amount_token REAL NOT NULL,
        price_usd REAL NOT NULL,
        tx_signature TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS portfolio_positions (
        pocket_id TEXT NOT NULL,
        token_mint TEXT NOT NULL,
        token_symbol TEXT NOT NULL,
        total_amount_token REAL DEFAULT 0,
        total_invested_sol REAL DEFAULT 0,
        average_buy_price_usd REAL DEFAULT 0,
        last_updated TEXT,
        PRIMARY KEY (pocket_id, token_mint)
      );

      CREATE TABLE IF NOT EXISTS trade_rules (
        id TEXT PRIMARY KEY,
        pocket_id TEXT NOT NULL,
        token_mint TEXT NOT NULL,
        token_symbol TEXT NOT NULL,
        take_profit_pct REAL,
        stop_loss_pct REAL,
        dca_interval_minutes INTEGER,
        dca_amount_sol REAL,
        status TEXT DEFAULT 'active',
        last_dca_at TEXT,
        created_at TEXT NOT NULL
      );
    `);
  }

  // Reset daily counters if new day
  resetDailyCounters(): void {
    const today = new Date().toISOString().split('T')[0];
    const row = this.db.prepare('SELECT last_reset FROM daily_reset LIMIT 1').get() as any;

    if (!row || row.last_reset !== today) {
      this.db.prepare('UPDATE strategies SET executions_today = 0').run();
      if (row) {
        this.db.prepare('UPDATE daily_reset SET last_reset = ?').run(today);
      } else {
        this.db.prepare('INSERT INTO daily_reset (last_reset) VALUES (?)').run(today);
      }
    }
  }

  createStrategy(params: {
    name: string;
    trigger_type: TriggerType;
    trigger_condition: string;
    trigger_interval_seconds?: number;
    action_type: ActionType;
    action_params?: Record<string, any>;
    max_executions_per_day?: number;
    cooldown_minutes?: number;
  }): Strategy {
    const id = generateId();
    const now = new Date().toISOString();

    this.db.prepare(`
      INSERT INTO strategies (id, name, trigger_type, trigger_condition, trigger_interval_seconds,
        action_type, action_params, max_executions_per_day, cooldown_minutes, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)
    `).run(
      id,
      params.name,
      params.trigger_type,
      params.trigger_condition,
      params.trigger_interval_seconds || 60,
      params.action_type,
      JSON.stringify(params.action_params || {}),
      params.max_executions_per_day || 5,
      params.cooldown_minutes || 30,
      now
    );

    return this.getStrategy(id)!;
  }

  getStrategy(id: string): Strategy | null {
    const row = this.db.prepare('SELECT * FROM strategies WHERE id = ? AND status != ?').get(id, 'deleted') as any;
    if (!row) return null;
    return { ...row, action_params: JSON.parse(row.action_params) };
  }

  listStrategies(status?: StrategyStatus): Strategy[] {
    let query = 'SELECT * FROM strategies WHERE status != ?';
    const params: string[] = ['deleted'];

    if (status) {
      query += ' AND status = ?';
      params.push(status);
    }

    const rows = this.db.prepare(query).all(...params) as any[];
    return rows.map((r) => ({ ...r, action_params: JSON.parse(r.action_params) }));
  }

  pauseStrategy(id: string): boolean {
    const result = this.db.prepare('UPDATE strategies SET status = ? WHERE id = ?').run('paused', id);
    return result.changes > 0;
  }

  resumeStrategy(id: string): boolean {
    const result = this.db.prepare('UPDATE strategies SET status = ? WHERE id = ?').run('active', id);
    return result.changes > 0;
  }

  deleteStrategy(id: string): boolean {
    const result = this.db.prepare('UPDATE strategies SET status = ? WHERE id = ?').run('deleted', id);
    return result.changes > 0;
  }

  updateStrategy(id: string, params: {
    name?: string;
    trigger_type?: TriggerType;
    trigger_condition?: string;
    trigger_interval_seconds?: number;
    action_type?: ActionType;
    action_params?: Record<string, any>;
    max_executions_per_day?: number;
    cooldown_minutes?: number;
  }): Strategy | null {
    const existing = this.getStrategy(id);
    if (!existing) return null;

    const fields: string[] = [];
    const values: any[] = [];

    if (params.name !== undefined) { fields.push('name = ?'); values.push(params.name); }
    if (params.trigger_type !== undefined) { fields.push('trigger_type = ?'); values.push(params.trigger_type); }
    if (params.trigger_condition !== undefined) { fields.push('trigger_condition = ?'); values.push(params.trigger_condition); }
    if (params.trigger_interval_seconds !== undefined) { fields.push('trigger_interval_seconds = ?'); values.push(params.trigger_interval_seconds); }
    if (params.action_type !== undefined) { fields.push('action_type = ?'); values.push(params.action_type); }
    if (params.action_params !== undefined) { fields.push('action_params = ?'); values.push(JSON.stringify(params.action_params)); }
    if (params.max_executions_per_day !== undefined) { fields.push('max_executions_per_day = ?'); values.push(params.max_executions_per_day); }
    if (params.cooldown_minutes !== undefined) { fields.push('cooldown_minutes = ?'); values.push(params.cooldown_minutes); }

    if (fields.length === 0) return existing;

    values.push(id);
    this.db.prepare(`UPDATE strategies SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    return this.getStrategy(id);
  }

  // Get active strategies ready to evaluate
  getActiveStrategies(): Strategy[] {
    const strategies = this.listStrategies('active');
    const now = Date.now();

    return strategies.filter((s) => {
      // Check daily limit
      if (s.executions_today >= s.max_executions_per_day) return false;

      // Check cooldown
      if (s.last_executed_at) {
        const lastExec = new Date(s.last_executed_at).getTime();
        const cooldownMs = s.cooldown_minutes * 60 * 1000;
        if (now - lastExec < cooldownMs) return false;
      }

      return true;
    });
  }

  // Record strategy execution
  logExecution(strategyId: string, triggerReason: string, actionResult: string, success: boolean): void {
    const logId = `log_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const now = new Date().toISOString();
    const strategy = this.getStrategy(strategyId);

    this.db.prepare(`
      INSERT INTO strategy_logs (id, strategy_id, triggered_at, trigger_reason, action_type, action_result, success)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(logId, strategyId, now, triggerReason, strategy?.action_type || 'unknown', actionResult, success ? 1 : 0);

    // Update strategy counters
    this.db.prepare(`
      UPDATE strategies SET executions_today = executions_today + 1, last_executed_at = ? WHERE id = ?
    `).run(now, strategyId);
  }

  getStrategyLogs(strategyId: string, limit: number = 20): StrategyLog[] {
    return this.db.prepare(
      'SELECT * FROM strategy_logs WHERE strategy_id = ? ORDER BY triggered_at DESC LIMIT ?'
    ).all(strategyId, limit) as StrategyLog[];
  }


  // ============ TRADE HISTORY ============

  recordTrade(params: {
    pocket_id: string;
    token_mint: string;
    token_symbol: string;
    side: 'buy' | 'sell';
    amount_sol: number;
    amount_token: number;
    price_usd: number;
    tx_signature?: string;
  }): void {
    const id = `trade_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const now = new Date().toISOString();

    this.db.prepare(`
      INSERT INTO trade_history (id, pocket_id, token_mint, token_symbol, side, amount_sol, amount_token, price_usd, tx_signature, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, params.pocket_id, params.token_mint, params.token_symbol, params.side, params.amount_sol, params.amount_token, params.price_usd, params.tx_signature || null, now);

    // Update portfolio position
    this.updatePosition(params.pocket_id, params.token_mint, params.token_symbol, params.side, params.amount_sol, params.amount_token, params.price_usd);
  }

  private updatePosition(
    pocketId: string, tokenMint: string, tokenSymbol: string,
    side: 'buy' | 'sell', amountSol: number, amountToken: number, priceUsd: number
  ): void {
    const now = new Date().toISOString();
    const existing = this.db.prepare(
      'SELECT * FROM portfolio_positions WHERE pocket_id = ? AND token_mint = ?'
    ).get(pocketId, tokenMint) as any;

    if (side === 'buy') {
      if (existing) {
        const newTotalToken = existing.total_amount_token + amountToken;
        const newTotalInvested = existing.total_invested_sol + amountSol;
        const newAvgPrice = newTotalInvested > 0 ? (existing.average_buy_price_usd * existing.total_invested_sol + priceUsd * amountSol) / newTotalInvested : priceUsd;
        this.db.prepare(`
          UPDATE portfolio_positions SET total_amount_token = ?, total_invested_sol = ?, average_buy_price_usd = ?, last_updated = ?
          WHERE pocket_id = ? AND token_mint = ?
        `).run(newTotalToken, newTotalInvested, newAvgPrice, now, pocketId, tokenMint);
      } else {
        this.db.prepare(`
          INSERT INTO portfolio_positions (pocket_id, token_mint, token_symbol, total_amount_token, total_invested_sol, average_buy_price_usd, last_updated)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(pocketId, tokenMint, tokenSymbol, amountToken, amountSol, priceUsd, now);
      }
    } else {
      // sell
      if (existing) {
        const newTotalToken = Math.max(0, existing.total_amount_token - amountToken);
        const ratio = existing.total_amount_token > 0 ? amountToken / existing.total_amount_token : 1;
        const soldInvestment = existing.total_invested_sol * ratio;
        const newTotalInvested = Math.max(0, existing.total_invested_sol - soldInvestment);
        this.db.prepare(`
          UPDATE portfolio_positions SET total_amount_token = ?, total_invested_sol = ?, last_updated = ?
          WHERE pocket_id = ? AND token_mint = ?
        `).run(newTotalToken, newTotalInvested, now, pocketId, tokenMint);
      }
    }
  }

  getTradeHistory(pocketId?: string, limit: number = 50): any[] {
    if (pocketId) {
      return this.db.prepare(
        'SELECT * FROM trade_history WHERE pocket_id = ? ORDER BY created_at DESC LIMIT ?'
      ).all(pocketId, limit);
    }
    return this.db.prepare(
      'SELECT * FROM trade_history ORDER BY created_at DESC LIMIT ?'
    ).all(limit);
  }

  getPortfolioPositions(pocketId?: string): any[] {
    if (pocketId) {
      return this.db.prepare(
        'SELECT * FROM portfolio_positions WHERE pocket_id = ? AND total_amount_token > 0'
      ).all(pocketId);
    }
    return this.db.prepare(
      'SELECT * FROM portfolio_positions WHERE total_amount_token > 0'
    ).all();
  }

  getPosition(pocketId: string, tokenMint: string): any | null {
    return this.db.prepare(
      'SELECT * FROM portfolio_positions WHERE pocket_id = ? AND token_mint = ?'
    ).get(pocketId, tokenMint) || null;
  }

  // ============ TRADE RULES ============

  createTradeRule(params: {
    pocket_id: string;
    token_mint: string;
    token_symbol: string;
    take_profit_pct?: number;
    stop_loss_pct?: number;
    dca_interval_minutes?: number;
    dca_amount_sol?: number;
  }): any {
    const id = `rule_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const now = new Date().toISOString();

    this.db.prepare(`
      INSERT OR REPLACE INTO trade_rules (id, pocket_id, token_mint, token_symbol, take_profit_pct, stop_loss_pct, dca_interval_minutes, dca_amount_sol, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)
    `).run(id, params.pocket_id, params.token_mint, params.token_symbol, params.take_profit_pct || null, params.stop_loss_pct || null, params.dca_interval_minutes || null, params.dca_amount_sol || null, now);

    return this.getTradeRule(id);
  }

  getTradeRule(id: string): any | null {
    return this.db.prepare('SELECT * FROM trade_rules WHERE id = ? AND status != ?').get(id, 'deleted') || null;
  }

  listTradeRules(pocketId?: string): any[] {
    if (pocketId) {
      return this.db.prepare(
        "SELECT * FROM trade_rules WHERE pocket_id = ? AND status != 'deleted'"
      ).all(pocketId);
    }
    return this.db.prepare(
      "SELECT * FROM trade_rules WHERE status != 'deleted'"
    ).all();
  }

  getActiveTradeRules(): any[] {
    return this.db.prepare(
      "SELECT * FROM trade_rules WHERE status = 'active'"
    ).all();
  }

  deleteTradeRule(id: string): boolean {
    const result = this.db.prepare("UPDATE trade_rules SET status = 'deleted' WHERE id = ?").run(id);
    return result.changes > 0;
  }

  updateTradeRuleDcaTime(id: string): void {
    const now = new Date().toISOString();
    this.db.prepare('UPDATE trade_rules SET last_dca_at = ? WHERE id = ?').run(now, id);
  }

  close(): void {
    this.db.close();
  }
}
