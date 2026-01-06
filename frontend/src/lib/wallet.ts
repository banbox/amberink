/**
 * Shared wallet utilities
 * Common functions for wallet interaction used across contracts.ts, sessionKey.ts, and arweave modules
 */

import { createWalletClient, createPublicClient, custom, http, numberToHex } from 'viem';
import { getChainConfig } from '$lib/chain';
import { getChainId, getRpcUrl } from '$lib/config';
import { SUPPORTED_CHAINS } from './chains';

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
 * Switch wallet to the target chain configured in the app
 * @returns true if already on correct chain or switch was successful
 */
export async function switchToTargetChain(): Promise<boolean> {
	if (typeof window === 'undefined' || !window.ethereum) {
		throw new Error('Ethereum provider not found. Please install MetaMask or another wallet.');
	}

	const targetChainId = getChainId();
	const currentChainIdHex = await window.ethereum.request({ method: 'eth_chainId' }) as string;
	const currentChainId = parseInt(currentChainIdHex, 16);

	if (currentChainId === targetChainId) {
		return true;
	}

	console.log(`Chain mismatch: wallet is on ${currentChainId}, app expects ${targetChainId}. Requesting switch...`);

	try {
		// Try to switch to the target chain
		await window.ethereum.request({
			method: 'wallet_switchEthereumChain',
			params: [{ chainId: numberToHex(targetChainId) }]
		});
		return true;
	} catch (switchError: unknown) {
		// Error code 4902 means the chain hasn't been added to MetaMask
		if ((switchError as { code?: number })?.code === 4902) {
			// Try to add the chain
			const chainInfo = SUPPORTED_CHAINS[targetChainId];
			const chain = getChainConfig();

			if (!chainInfo) {
				throw new Error(`Chain ${targetChainId} is not configured. Please add it to your wallet manually.`);
			}

			try {
				await window.ethereum.request({
					method: 'wallet_addEthereumChain',
					params: [{
						chainId: numberToHex(targetChainId),
						chainName: chainInfo.name,
						nativeCurrency: {
							name: chainInfo.nativeToken === 'POL' ? 'POL' :
								chainInfo.nativeToken === 'MNT' ? 'Mantle' : 'Ether',
							symbol: chainInfo.nativeToken,
							decimals: 18
						},
						rpcUrls: chain.rpcUrls.default.http,
						blockExplorerUrls: chainInfo.explorerUrl ? [chainInfo.explorerUrl] : undefined
					}]
				});
				return true;
			} catch (addError) {
				console.error('Failed to add chain to wallet:', addError);
				throw new Error(`Failed to add ${chainInfo.name} to your wallet. Please add it manually.`);
			}
		}
		throw switchError;
	}
}

/**
 * Get wallet client for contract interaction
 * Automatically switches to the target chain if the wallet is on a different chain
 */
export async function getWalletClient() {
	if (typeof window === 'undefined' || !window.ethereum) {
		throw new Error('Ethereum provider not found. Please install MetaMask or another wallet.');
	}

	// Ensure wallet is on the correct chain before creating client
	await switchToTargetChain();

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

