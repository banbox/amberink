/**
 * Chain configuration utilities
 * Dynamically selects chain based on environment variables
 */

import { defineChain } from 'viem';
import { optimismSepolia, optimism } from 'viem/chains';
import { getChainId, getRpcUrl } from '$lib/config';

/**
 * Get chain configuration based on chainId from config
 */
export function getChainConfig() {
	const chainId = getChainId();
	const rpcUrl = getRpcUrl();

	switch (chainId) {
		case 31337:
			// Local Anvil
			return defineChain({
				id: 31337,
				name: 'Anvil',
				nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
				rpcUrls: {
					default: { http: [rpcUrl] }
				}
			});
		case 11155420:
			// Optimism Sepolia
			return optimismSepolia;
		case 10:
			// Optimism Mainnet
			return optimism;
		default:
			// Fallback to custom chain
			return defineChain({
				id: chainId,
				name: `Chain ${chainId}`,
				nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
				rpcUrls: {
					default: { http: [rpcUrl] }
				}
			});
	}
}
