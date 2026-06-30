import { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import { networkConfig, SUI_NETWORK } from './sui';

/**
 * Server-side Sui RPC client. Needed by verifyPersonalMessageSignature to check
 * a zkLogin signature against the current epoch. Cached per warm function instance.
 */
let cached: SuiJsonRpcClient | null = null;

export function getSuiClient(): SuiJsonRpcClient {
  if (cached) return cached;
  const cfg = networkConfig[SUI_NETWORK] ?? networkConfig.testnet;
  cached = new SuiJsonRpcClient({ url: cfg.url, network: cfg.network });
  return cached;
}
