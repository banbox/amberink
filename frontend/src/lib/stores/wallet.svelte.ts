/**
 * Shared wallet state store using Svelte 5 runes
 */

import { switchToTargetChain } from '$lib/wallet';
import { envName } from '$lib/stores/config.svelte';

/** Get the storage key for wallet disconnected state based on current environment */
function getDisconnectedKey(): string {
	return `wallet_disconnected_${envName}`;
}

// Wallet state - using module-level state with getter functions
let _address = $state<string | undefined>(undefined);
let _lastAddress = $state<string>("");
let _isConnected = $state(false);
let _isLoading = $state(false);

export function getWalletAddress(): string | undefined {
	return _address;
}

export function isWalletConnected(): boolean {
	return _isConnected;
}

export function isWalletLoading(): boolean {
	return _isLoading;
}

export function setWalletState(address: string | undefined, connected: boolean) {
	_address = address;
	if (address) {
		_lastAddress = address;
	}
	_isConnected = connected;
}

export function setWalletLoading(loading: boolean) {
	_isLoading = loading;
}

export async function checkWalletConnection() {
	if (typeof window === 'undefined' || !window.ethereum) return;

	if (localStorage.getItem(getDisconnectedKey()) === 'true') {
		return;
	}

	try {
		const accounts = (await window.ethereum.request({ method: 'eth_accounts' })) as string[];
		if (accounts.length > 0) {
			_address = accounts[0];
			_lastAddress = accounts[0];
			_isConnected = true;
		}
	} catch (error) {
		console.error('Failed to check connection:', error);
	}
}

// Minimum time (in ms) expected for a real user authorization interaction
// If wallet returns faster than this with the same address, it likely used cached credentials
const MIN_AUTH_TIME_MS = 200;

export async function connectWallet(): Promise<{ success: boolean; error?: string; cached?: boolean }> {
	if (typeof window === 'undefined' || !window.ethereum) {
		const errorMessage = 'Please install MetaMask or another Ethereum wallet';
		return { success: false, error: errorMessage };
	}

	_isLoading = true;

	// Record the previous address and start time to detect cached responses
	const startTime = Date.now();

	try {
		// Always request new permissions to force the wallet to show account selector
		// This ensures users can switch accounts when reconnecting
		await window.ethereum.request({
			method: 'wallet_requestPermissions',
			params: [{ eth_accounts: {} }]
		});

		// After permissions are granted, get the selected account
		const accounts = (await window.ethereum.request({
			method: 'eth_requestAccounts'
		})) as string[];

		const elapsedTime = Date.now() - startTime;

		if (accounts.length > 0) {
			const newAddress = accounts[0];

			// Detect if wallet used cached credentials:
			// - Response was very fast (< MIN_AUTH_TIME_MS)
			// - Address is the same as before
			// This indicates the wallet didn't show an account selector
			const usedCachedAccount = newAddress.toLowerCase() === _lastAddress.toLowerCase() &&
				elapsedTime < MIN_AUTH_TIME_MS;

			_address = newAddress;
			_lastAddress = newAddress;
			_isConnected = true;
			localStorage.removeItem(getDisconnectedKey());

			await switchToTargetChain();

			if (usedCachedAccount) {
				return { success: true, cached: true };
			} else {
				console.log('New account connected:', newAddress, elapsedTime);
			}
		}

		await switchToTargetChain();
		return { success: true };
	} catch (error) {
		console.error('Failed to connect:', error);
		const errorMessage = error && (error as any).message ? (error as any).message : 'Failed to connect wallet';
		return { success: false, error: errorMessage };
	} finally {
		_isLoading = false;
	}
}

export function disconnectWallet() {
	localStorage.setItem(getDisconnectedKey(), 'true');
	_address = undefined;
	_isConnected = false;
}

export function handleAccountsChanged(accounts: unknown) {
	const accts = accounts as string[];
	if (accts.length === 0) {
		_address = undefined;
		_isConnected = false;
	} else if (_isConnected) {
		_address = accts[0];
		_lastAddress = accts[0];
	}
}
