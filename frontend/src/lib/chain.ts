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

const VIEWBLOCK_ARWEAVE_BASE_URL = 'https://viewblock.io/arweave';

export function getViewblockArweaveUrl(arweaveId: string, network: 'mainnet' | 'devnet'): string {
	if (!arweaveId) return '';
	// Viewblock only supports Arweave mainnet
	if (network !== 'mainnet') return `https://devnet.irys.xyz/tx/${arweaveId}`;
	return `${VIEWBLOCK_ARWEAVE_BASE_URL}/tx/${arweaveId}`;
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

