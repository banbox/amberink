/**
 * Chain configuration utilities
 * Dynamically selects chain based on environment variables
 */

import { getChainId, getRpcUrl } from '$lib/config';
import { BLOCK_EXPLORER_URLS, getViemChain } from './chains';
import { IRYS_EXPLORER_URL } from './constants';

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
 * Get block explorer URL for an address
 */
export function getBlockExplorerAddressUrl(address: string): string {
	const chainId = getChainId();
	const baseUrl = BLOCK_EXPLORER_URLS[chainId] || '';
	if (!baseUrl) return '';
	return `${baseUrl}/address/${address}`;
}

export function getIrysExplorerUrl(irysTxId: string, network: 'mainnet' | 'devnet'): string {
	if (!irysTxId) return '';
	// Use testnet explorer for devnet, mainnet explorer for mainnet
	const explorerBase = network === 'devnet' 
		? 'https://testnet-explorer.irys.xyz'
		: IRYS_EXPLORER_URL;
	return `${explorerBase}/tx/${irysTxId}`;
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

