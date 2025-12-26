/**
 * Chain configuration utilities
 * Dynamically selects chain based on environment variables
 */

import { getChainId, getRpcUrl } from '$lib/config';
import { BLOCK_EXPLORER_URLS, getViemChain } from './chains';

/**
 * Get block explorer URL for a transaction hash
 */
export function getBlockExplorerTxUrl(txHash: string): string {
	const chainId = getChainId();
	const baseUrl = BLOCK_EXPLORER_URLS[chainId] || '';
	if (!baseUrl) return '';
	return `${baseUrl}/tx/${txHash}`;
}

/**
 * Get chain configuration based on chainId from config
 * Uses centralized chain configuration from chains.ts
 */
export function getChainConfig() {
	const chainId = getChainId();
	const rpcUrl = getRpcUrl();
	return getViemChain(chainId, rpcUrl);
}

