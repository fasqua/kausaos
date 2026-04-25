/**
 * KausaOS - Telegram Onboarding Module
 * Handles wallet creation, API key generation, account setup
 * Zero-setup: user types /start, everything is created automatically
 */

import crypto from 'crypto';
import axios from 'axios';
import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import nacl from 'tweetnacl';
import { StrategyEngine } from '../strategy/engine';
import { KausaLayerConfig } from '../config';

export interface OnboardingResult {
  success: boolean;
  wallet_address?: string;
  private_key?: string;
  api_key?: string;
  meta_address?: string;
  error?: string;
}

/**
 * SDP_AUTH_MESSAGE - same as frontend flow
 * Wallet signs this message to derive stealth keys
 */
const SDP_AUTH_MESSAGE = 'KausaLayer SDP Authentication';

/**
 * Encrypt private key with AES-256-GCM
 * Master key from environment variable
 */
function encryptPrivateKey(privateKeyBytes: Uint8Array, masterKey: string): string {
  const key = Buffer.from(masterKey, 'base64');
  if (key.length !== 32) {
    throw new Error('Master key must be 32 bytes (base64 encoded)');
  }

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  const encrypted = Buffer.concat([
    cipher.update(Buffer.from(privateKeyBytes)),
    cipher.final(),
  ]);

  const authTag = cipher.getAuthTag();

  // Format: iv:authTag:encrypted (all base64)
  return [
    iv.toString('base64'),
    authTag.toString('base64'),
    encrypted.toString('base64'),
  ].join(':');
}

/**
 * Decrypt private key from stored format
 */
export function decryptPrivateKey(encryptedStr: string, masterKey: string): Uint8Array {
  const key = Buffer.from(masterKey, 'base64');
  const [ivB64, tagB64, dataB64] = encryptedStr.split(':');

  const iv = Buffer.from(ivB64, 'base64');
  const authTag = Buffer.from(tagB64, 'base64');
  const encrypted = Buffer.from(dataB64, 'base64');

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);

  return new Uint8Array(decrypted);
}

/**
 * Derive meta_address from wallet keypair
 * Signs SDP_AUTH_MESSAGE and hashes the signature
 */
function deriveMetaAddress(keypair: Keypair): string {
  const messageBytes = new TextEncoder().encode(SDP_AUTH_MESSAGE);
  const signature = nacl.sign.detached(messageBytes, keypair.secretKey);
  const hash = crypto.createHash('sha256').update(Buffer.from(signature)).digest('hex');
  return `kl_${hash}`;
}

/**
 * Register API key with KausaLayer backend
 * Signs a message with the keypair for verification
 */
async function registerApiKey(
  endpoint: string,
  walletAddress: string,
  metaAddress: string,
  keypair: Keypair
): Promise<string> {
  const timestamp = Date.now();
  const message = `KausaLayer API Registration:${walletAddress}:${timestamp}`;
  const messageBytes = new TextEncoder().encode(message);
  const signature = nacl.sign.detached(messageBytes, keypair.secretKey);
  const signatureB58 = bs58.encode(signature);

  const response = await axios.post(`${endpoint}/mcp/register`, {
    wallet_address: walletAddress,
    meta_address: metaAddress,
    signature: signatureB58,
    message: message,
    timestamp: timestamp,
  }, {
    timeout: 30000,
    headers: { 'Content-Type': 'application/json' },
  });

  const data = response.data;
  if (data.api_key) {
    return data.api_key;
  }

  throw new Error(data.error || 'API key registration failed');
}

/**
 * Full onboarding flow for a new Telegram user
 * 1. Generate Solana keypair
 * 2. Encrypt private key
 * 3. Derive meta_address
 * 4. Register API key with backend
 * 5. Store in database
 */
export async function onboardTelegramUser(
  telegramId: string,
  telegramUsername: string | undefined,
  strategyEngine: StrategyEngine,
  kausalayerConfig: KausaLayerConfig,
  masterKey: string
): Promise<OnboardingResult> {
  try {
    // Check if user already exists
    const existing = strategyEngine.getTelegramUser(telegramId);
    if (existing) {
      return {
        success: true,
        wallet_address: existing.wallet_address,
        api_key: existing.api_key,
        meta_address: existing.meta_address,
      };
    }

    // Step 1: Generate Solana keypair
    const keypair = Keypair.generate();
    const walletAddress = keypair.publicKey.toBase58();
    const privateKeyB58 = bs58.encode(keypair.secretKey);

    console.log(`[Onboarding] Wallet created: ${walletAddress.slice(0, 8)}...`);

    // Step 2: Encrypt private key
    const walletEncrypted = encryptPrivateKey(keypair.secretKey, masterKey);

    // Step 3: Derive meta_address
    const metaAddress = deriveMetaAddress(keypair);
    console.log(`[Onboarding] Meta address derived: ${metaAddress.slice(0, 12)}...`);

    // Step 4: Register API key with KausaLayer backend
    const apiKey = await registerApiKey(
      kausalayerConfig.endpoint,
      walletAddress,
      metaAddress,
      keypair
    );
    console.log(`[Onboarding] API key registered: ${apiKey.slice(0, 8)}...`);

    // Step 5: Store in database
    strategyEngine.createTelegramUser({
      telegram_id: telegramId,
      telegram_username: telegramUsername,
      wallet_address: walletAddress,
      wallet_encrypted: walletEncrypted,
      api_key: apiKey,
      meta_address: metaAddress,
    });

    console.log(`[Onboarding] User ${telegramId} onboarded successfully`);

    return {
      success: true,
      wallet_address: walletAddress,
      private_key: privateKeyB58,
      api_key: apiKey,
      meta_address: metaAddress,
    };
  } catch (err: any) {
    console.error(`[Onboarding] Failed for ${telegramId}: ${err.message}`);
    return {
      success: false,
      error: err.message,
    };
  }
}

/**
 * Export private key for existing user (for /export command)
 */
export function exportUserPrivateKey(
  telegramId: string,
  strategyEngine: StrategyEngine,
  masterKey: string
): { success: boolean; private_key?: string; error?: string } {
  const user = strategyEngine.getTelegramUser(telegramId);
  if (!user) {
    return { success: false, error: 'User not found' };
  }

  try {
    const secretKeyBytes = decryptPrivateKey(user.wallet_encrypted, masterKey);
    const privateKeyB58 = bs58.encode(secretKeyBytes);
    return { success: true, private_key: privateKeyB58 };
  } catch (err: any) {
    return { success: false, error: `Decryption failed: ${err.message}` };
  }
}
