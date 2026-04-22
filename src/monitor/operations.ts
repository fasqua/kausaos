/**
 * KausaOS - Operations Monitor
 * Tracks funding/sweep/P2P operation status from backend
 * Detects stuck or failed operations
 */

import { KausaLayerClient } from '../brain/api-client';

export interface StuckOperation {
  id: string;
  type: string;
  status: string;
  amount_sol: number;
  created_at: number;
  age_minutes: number;
}

export class OperationsMonitor {
  private stuckThresholdMinutes: number;

  constructor(stuckThresholdMinutes: number = 10) {
    this.stuckThresholdMinutes = stuckThresholdMinutes;
  }

  /**
   * Check route history for stuck/failed operations
   */
  async checkOperations(apiClient: KausaLayerClient): Promise<{
    stuck: StuckOperation[];
    failed: StuckOperation[];
    pending: number;
  }> {
    const stuck: StuckOperation[] = [];
    const failed: StuckOperation[] = [];
    let pending = 0;

    try {
      const res = await apiClient.getRouteHistory();
      if (!res.success || !res.data?.routes) {
        return { stuck, failed, pending };
      }

      const now = Math.floor(Date.now() / 1000);
      const routes = res.data.routes;

      for (const route of routes) {
        const status = route.status || '';
        const ageSeconds = now - (route.created_at || now);
        const ageMinutes = ageSeconds / 60;

        if (status === 'completed') continue;

        const op: StuckOperation = {
          id: route.id,
          type: route.route_type || 'unknown',
          status,
          amount_sol: route.amount_sol || 0,
          created_at: route.created_at,
          age_minutes: Math.round(ageMinutes),
        };

        if (status === 'failed') {
          failed.push(op);
        } else if (['pending', 'processing', 'funding', 'sweeping'].includes(status)) {
          pending++;
          if (ageMinutes > this.stuckThresholdMinutes) {
            stuck.push(op);
          }
        }
      }
    } catch (err: any) {
      console.warn(`[OpsMonitor] Check failed: ${err.message}`);
    }

    return { stuck, failed, pending };
  }
}
