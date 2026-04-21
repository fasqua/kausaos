/**
 * KausaOS - Strategy Engine
 * Declarative rules: trigger + action + constraints
 * Evaluated on heartbeat cycles
 */

import Database from 'better-sqlite3';


function generateId(): string {
  return `strat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export type TriggerType = 'balance_threshold' | 'time_based' | 'price_based' | 'status_based' | 'idle_time' | 'pocket_count';
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

  close(): void {
    this.db.close();
  }
}
