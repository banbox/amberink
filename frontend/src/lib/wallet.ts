/**
 * Shared wallet utilities
 * Common functions for wallet interaction used across contracts.ts, sessionKey.ts, and arweave modules
 */

import { createWalletClient, createPublicClient, custom, http } from 'viem';
import { getChainConfig } from '$lib/chain';
import { getRpcUrl } from '$lib/config';

/**
 * Get Ethereum account from wallet
 */
export async function getEthereumAccount(): Promise<`0x${string}`> {
	if (typeof window === 'undefined' || !window.ethereum) {
		throw new Error('Ethereum provider not found. Please install MetaMask or another wallet.');
	}
	const accounts = (await window.ethereum.request({ method: 'eth_requestAccounts' })) as `0x${string}`[];
	const account = accounts?.[0];
	if (!account) {
		throw new Error('No accounts found. Please connect your wallet.');
	}
	return account;
}

/**
 * Get wallet client for contract interaction
 */
export async function getWalletClient() {
	if (typeof window === 'undefined' || !window.ethereum) {
		throw new Error('Ethereum provider not found. Please install MetaMask or another wallet.');
	}

	const account = await getEthereumAccount();
	const chain = getChainConfig();

	return createWalletClient({
		account,
		chain,
		transport: custom(window.ethereum)
	});
}

/**
 * Get public client for read-only contract calls
 */
export function getPublicClient() {
	const chain = getChainConfig();
	return createPublicClient({
		chain,
		transport: http(getRpcUrl())
	});
}
