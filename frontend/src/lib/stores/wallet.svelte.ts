/**
 * Shared wallet state store using Svelte 5 runes
 */

const DISCONNECTED_KEY = 'wallet_disconnected';

// Wallet state - using module-level state with getter functions
let _address = $state<string | undefined>(undefined);
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
	_isConnected = connected;
}

export function setWalletLoading(loading: boolean) {
	_isLoading = loading;
}

export async function checkWalletConnection() {
	if (typeof window === 'undefined' || !window.ethereum) return;

	if (localStorage.getItem(DISCONNECTED_KEY) === 'true') {
		return;
	}

	try {
		const accounts = (await window.ethereum.request({ method: 'eth_accounts' })) as string[];
		if (accounts.length > 0) {
			_address = accounts[0];
			_isConnected = true;
		}
	} catch (error) {
		console.error('Failed to check connection:', error);
	}
}

export async function connectWallet() {
	if (typeof window === 'undefined' || !window.ethereum) {
		alert('Please install MetaMask or another Ethereum wallet');
		return;
	}

	_isLoading = true;
	try {
		await window.ethereum.request({
			method: 'wallet_requestPermissions',
			params: [{ eth_accounts: {} }]
		});

		const accounts = (await window.ethereum.request({
			method: 'eth_accounts'
		})) as string[];

		if (accounts.length > 0) {
			_address = accounts[0];
			_isConnected = true;
			localStorage.removeItem(DISCONNECTED_KEY);
		}

		await ensureCorrectChain();
	} catch (error) {
		console.error('Failed to connect:', error);
	} finally {
		_isLoading = false;
	}
}

export function disconnectWallet() {
	localStorage.setItem(DISCONNECTED_KEY, 'true');
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
	}
}

async function ensureCorrectChain() {
	if (typeof window === 'undefined' || !window.ethereum) return;

	const { getChainConfig } = await import('$lib/chain');
	const chain = getChainConfig();
	const targetChainId = chain.id;
	const targetChainIdHex = `0x${targetChainId.toString(16)}`;

	try {
		const currentChainIdHex = (await window.ethereum.request({
			method: 'eth_chainId'
		})) as string;
		const currentChainId = parseInt(currentChainIdHex, 16);

		if (currentChainId !== targetChainId) {
			try {
				await window.ethereum.request({
					method: 'wallet_switchEthereumChain',
					params: [{ chainId: targetChainIdHex }]
				});
			} catch (switchError: unknown) {
				if ((switchError as { code?: number })?.code === 4902) {
					await window.ethereum.request({
						method: 'wallet_addEthereumChain',
						params: [
							{
								chainId: targetChainIdHex,
								chainName: chain.name,
								nativeCurrency: chain.nativeCurrency,
								rpcUrls: [chain.rpcUrls.default.http[0]],
								blockExplorerUrls: chain.blockExplorers ? [chain.blockExplorers.default.url] : undefined
							}
						]
					});
				}
			}
		}
	} catch (error) {
		console.error('Failed to switch chain:', error);
	}
}
