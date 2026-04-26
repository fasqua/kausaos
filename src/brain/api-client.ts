/**
 * KausaOS - KausaLayer API Client
 * HTTP client wrapping all sdp-mazepocket endpoints
 * All requests include meta_address derived from wallet
 */

import crypto from 'crypto';
import axios, { AxiosInstance, AxiosError } from 'axios';
import { KausaLayerConfig } from '../config';

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface TierInfo {
  tier: string;
  kausaBalance: number;
}

const KAUSA_MINT = 'BWXSNRBKMviG68MqavyssnzDq4qSArcN7eNYjqEfpump';
const HELIUS_RPC = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';

export class KausaLayerClient {
  private http: AxiosInstance;
  private endpoint: string;
  private apiKey: string;
  private metaAddress: string;
  private walletAddress: string;
  private initialized: boolean;
  private tierInfo: TierInfo;

  constructor(config: KausaLayerConfig) {
    this.endpoint = config.endpoint;
    this.apiKey = config.api_key;
    this.metaAddress = '';
    this.walletAddress = '';
    this.initialized = false;
    this.tierInfo = { tier: 'FREE', kausaBalance: 0 };

    this.http = axios.create({
      baseURL: config.endpoint,
      timeout: 60000,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  /**
   * Initialize: validate API key, get wallet address, resolve tier
   */
  async init(): Promise<void> {
    if (this.initialized) return;

    try {
      // Step 1: Validate API key
      const response = await this.http.post('/mcp/validate-key', {
        api_key: this.apiKey,
      });

      const data = response.data;
      if (data.valid && data.wallet_address) {
        this.walletAddress = data.wallet_address;
        this.metaAddress = data.meta_address || crypto.createHash('sha256').update(data.wallet_address).digest('hex');
        console.log(`[API] Authenticated. Wallet: ${this.walletAddress.slice(0, 8)}...`);
      } else {
        throw new Error('Invalid API key or wallet not found');
      }

      // Step 2: Resolve tier from KAUSA balance
      await this.resolveTier();

      this.initialized = true;
    } catch (err: any) {
      throw new Error(`API key validation failed: ${err.message}`);
    }
  }

  /**
   * Resolve tier by checking KAUSA token balance on-chain via Solana RPC
   */
  private async resolveTier(): Promise<void> {
    try {
      // Get KAUSA token accounts for wallet
      const rpcResponse = await axios.post(HELIUS_RPC, {
        jsonrpc: '2.0',
        id: 1,
        method: 'getTokenAccountsByOwner',
        params: [
          this.walletAddress,
          { mint: KAUSA_MINT },
          { encoding: 'jsonParsed' },
        ],
      }, { timeout: 15000 });

      let kausaBalance = 0;
      const accounts = rpcResponse.data?.result?.value || [];
      if (accounts.length > 0) {
        const tokenAmount = accounts[0]?.account?.data?.parsed?.info?.tokenAmount;
        if (tokenAmount) {
          kausaBalance = parseFloat(tokenAmount.uiAmountString || '0');
        }
      }

      // Determine tier from balance
      let tier = 'FREE';
      if (kausaBalance >= 100000) tier = 'ENTERPRISE';
      else if (kausaBalance >= 10000) tier = 'PRO';
      else if (kausaBalance >= 1000) tier = 'BASIC';

      this.tierInfo = { tier, kausaBalance };
      console.log(`[API] Tier: ${tier} (${kausaBalance.toLocaleString()} KAUSA)`);
    } catch (err: any) {
      console.warn(`[API] Tier resolution failed: ${err.message}. Defaulting to FREE.`);
      this.tierInfo = { tier: 'FREE', kausaBalance: 0 };
    }
  }

  private async ensureInit(): Promise<void> {
    if (!this.initialized) await this.init();
  }

  getMetaAddress(): string {
    return this.metaAddress;
  }

  getWalletAddress(): string {
    return this.walletAddress;
  }

  getEndpoint(): string {
    return this.endpoint;
  }

  getTierInfo(): TierInfo {
    return this.tierInfo;
  }

  /**
   * Get active pocket count from API (for brain context sync)
   */
  async getActivePocketCount(): Promise<number> {
    const res = await this.listPockets();
    if (res.success && res.data) {
      const pockets = Array.isArray(res.data) ? res.data : res.data.pockets || [];
      return pockets.filter((p: any) => p.status === 'active').length;
    }
    return 0;
  }

  private async request<T>(method: string, url: string, data?: any, query?: any): Promise<ApiResponse<T>> {
    await this.ensureInit();
    try {
      const params = { ...query, meta_address: this.metaAddress };
      let response;
      if (method === 'get') {
        response = await this.http.get(url, { params });
      } else if (method === 'delete') {
        response = await this.http.delete(url, { params });
      } else {
        response = await this.http.post(url, { ...data, meta_address: this.metaAddress }, { params: query });
      }
      return { success: true, data: response.data };
    } catch (err) {
      const axiosErr = err as AxiosError;
      const errMsg = (axiosErr.response?.data as any)?.error
        || (axiosErr.response?.data as any)
        || axiosErr.message
        || 'Unknown API error';
      return { success: false, error: typeof errMsg === 'string' ? errMsg : JSON.stringify(errMsg) };
    }
  }

  // === Health (no auth needed) ===
  async health(): Promise<ApiResponse> {
    try {
      const res = await this.http.get('/health');
      return { success: true, data: res.data };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  async stats(): Promise<ApiResponse> {
    try {
      const res = await this.http.get('/stats');
      return { success: true, data: res.data };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  // === Pocket Operations ===
  async createPocket(params: {
    amount_sol: number;
    label?: string;
    complexity?: string;
  }): Promise<ApiResponse> {
    return this.request('post', '/pocket', params);
  }

  async listPockets(): Promise<ApiResponse> {
    return this.request('get', '/pockets');
  }

  async getPocket(pocketId: string): Promise<ApiResponse> {
    return this.request('get', `/pocket/${pocketId}`);
  }

  async deletePocket(pocketId: string): Promise<ApiResponse> {
    return this.request('delete', `/pocket/${pocketId}`);
  }

  async renamePocket(pocketId: string, label: string): Promise<ApiResponse> {
    return this.request('post', `/pocket/${pocketId}/rename`, { label });
  }

  async archivePocket(pocketId: string): Promise<ApiResponse> {
    return this.request('post', `/pocket/${pocketId}/archive`);
  }

  async exportPocketKey(pocketId: string): Promise<ApiResponse> {
    return this.request('get', `/pocket/${pocketId}`);
  }

  async getPocketTransactions(pocketId: string): Promise<ApiResponse> {
    return this.request('get', `/pocket/${pocketId}/transactions`);
  }

  async getTokenBalances(pocketId: string): Promise<ApiResponse> {
    return this.request('get', `/pocket/${pocketId}/token-balances`);
  }

  // === Maze Routing ===
  async createRoute(params: {
    destination?: string;
    destination_slot?: number;
    amount_sol: number;
    complexity?: string;
  }): Promise<ApiResponse> {
    return this.request('post', '/route', params);
  }

  // === Sweep ===
  async sweepPocket(pocketId: string, params: {
    destination?: string;
    destination_slot?: number;
  }): Promise<ApiResponse> {
    return this.request('post', `/pocket/${pocketId}/sweep`, params);
  }

  async sweepAllPockets(params: {
    destination?: string;
    destination_slot?: number;
  }): Promise<ApiResponse> {
    return this.request('post', '/pockets/sweep-all', params);
  }

  async getSweepStatus(sweepId: string): Promise<ApiResponse> {
    return this.request('get', `/sweep/${sweepId}/status`);
  }

  async resumeSweep(sweepId: string): Promise<ApiResponse> {
    return this.request('post', `/sweep/${sweepId}/resume`);
  }

  async recoverSweep(sweepId: string): Promise<ApiResponse> {
    return this.request('post', `/sweep/${sweepId}/recover`);
  }

  // === P2P Transfer ===
  async sendToPocket(pocketId: string, params: {
    recipient_pocket_id: string;
    amount_sol: number;
  }): Promise<ApiResponse> {
    return this.request('post', `/pocket/${pocketId}/send`, params);
  }

  async getP2PStatus(transferId: string): Promise<ApiResponse> {
    return this.request('get', `/p2p/${transferId}/status`);
  }

  async recoverP2P(transferId: string): Promise<ApiResponse> {
    return this.request('post', `/p2p/${transferId}/recover`);
  }

  // === Funding Status ===
  async getFundingStatus(requestId: string): Promise<ApiResponse> {
    return this.request('get', `/status/${requestId}`);
  }

  async recoverFunding(pocketId: string): Promise<ApiResponse> {
    return this.request('post', `/pocket/${pocketId}/recover`);
  }

  // === Wallet Management ===
  async listWallets(): Promise<ApiResponse> {
    return this.request('get', '/wallets');
  }

  async addWallet(params: {
    slot: number;
    address: string;
    label?: string;
  }): Promise<ApiResponse> {
    return this.request('post', '/wallet', params);
  }

  async deleteWallet(slot: number): Promise<ApiResponse> {
    return this.request('delete', `/wallet/${slot}`);
  }

  // === Contacts ===
  async addContact(params: {
    alias: string;
    pocket_id: string;
  }): Promise<ApiResponse> {
    return this.request('post', '/contact', params);
  }

  async listContacts(): Promise<ApiResponse> {
    return this.request('get', '/contacts');
  }

  async deleteContact(alias: string): Promise<ApiResponse> {
    return this.request('delete', `/contact/${alias}`);
  }

  // === Swap ===
  async swapQuote(pocketId: string, params: {
    input_mint: string;
    output_mint: string;
    amount: number;
  }): Promise<ApiResponse> {
    // Map field names to match backend: output_token, amount_sol
    const query = {
      output_token: params.output_mint,
      amount_sol: params.amount,
      slippage_bps: undefined as number | undefined,
    };
    return this.request('get', `/pocket/${pocketId}/swap/quote`, undefined, query);
  }

  async swapExecute(pocketId: string, params: {
    input_mint: string;
    output_mint: string;
    amount: number;
    slippage_bps?: number;
    amount_raw?: number;
  }): Promise<ApiResponse> {
    // Determine swap direction
    const isBuy = !params.input_mint || params.input_mint === 'SOL' || params.input_mint === 'So11111111111111111111111111111111111111112';

    let body: any;
    if (isBuy) {
      // Buy: SOL -> Token
      body = {
        output_token: params.output_mint,
        amount_sol: params.amount,
        slippage_bps: params.slippage_bps,
      };
    } else {
      // Sell: Token -> SOL
      body = {
        output_token: params.output_mint || 'SOL',
        input_token: params.input_mint,
        amount_sol: 0,
        amount_raw: params.amount_raw || Math.floor(params.amount * 1_000_000), // default 6 decimals
        slippage_bps: params.slippage_bps,
      };
    }
    return this.request('post', `/pocket/${pocketId}/swap`, body);
  }

  // === Analytics ===
  async getRouteHistory(): Promise<ApiResponse> {
    return this.request('get', '/route-history');
  }

  async getUsageStats(): Promise<ApiResponse> {
    return this.request('get', '/usage-stats');
  }

  async getTierConfig(): Promise<ApiResponse> {
    return this.request('get', '/tier-config');
  }

  async getAirdropVerify(): Promise<ApiResponse> {
    return this.request('get', '/airdrop/verify');
  }
}
