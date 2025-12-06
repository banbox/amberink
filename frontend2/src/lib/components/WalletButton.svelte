<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { optimismSepolia } from 'viem/chains';
	import * as m from '$lib/paraglide/messages';

	let address = $state<string | undefined>();
	let isConnected = $state(false);
	let isLoading = $state(false);

	let displayAddress = $derived(
		address ? `${address.slice(0, 6)}...${address.slice(-4)}` : ''
	);

	function handleAccountsChanged(accounts: unknown) {
		const accts = accounts as string[];
		if (accts.length === 0) {
			address = undefined;
			isConnected = false;
		} else {
			address = accts[0];
			isConnected = true;
		}
	}

	function handleChainChanged() {
		// Reload on chain change to ensure correct state
		window.location.reload();
	}

	async function checkConnection() {
		if (typeof window === 'undefined' || !window.ethereum) return;

		try {
			const accounts = (await window.ethereum.request({ method: 'eth_accounts' })) as string[];
			if (accounts.length > 0) {
				address = accounts[0];
				isConnected = true;
			}
		} catch (error) {
			console.error('Failed to check connection:', error);
		}
	}

	async function handleConnect() {
		if (typeof window === 'undefined' || !window.ethereum) {
			alert('Please install MetaMask or another Ethereum wallet');
			return;
		}

		isLoading = true;
		try {
			// Request accounts
			const accounts = (await window.ethereum.request({
				method: 'eth_requestAccounts'
			})) as string[];
			if (accounts.length > 0) {
				address = accounts[0];
				isConnected = true;
			}

			// Try to switch to correct chain
			await ensureCorrectChain();
		} catch (error) {
			console.error('Failed to connect:', error);
		} finally {
			isLoading = false;
		}
	}

	async function ensureCorrectChain() {
		if (typeof window === 'undefined' || !window.ethereum) return;

		const targetChainId = optimismSepolia.id;
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
					// Chain not added, try to add it
					if ((switchError as { code?: number })?.code === 4902) {
						await window.ethereum.request({
							method: 'wallet_addEthereumChain',
							params: [
								{
									chainId: targetChainIdHex,
									chainName: optimismSepolia.name,
									nativeCurrency: optimismSepolia.nativeCurrency,
									rpcUrls: [optimismSepolia.rpcUrls.default.http[0]],
									blockExplorerUrls: [optimismSepolia.blockExplorers?.default.url]
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

	async function handleDisconnect() {
		// Note: There's no standard way to disconnect from MetaMask
		// We just clear local state. User needs to disconnect from wallet UI
		address = undefined;
		isConnected = false;
	}

	onMount(() => {
		checkConnection();
		// Listen for account changes
		if (typeof window !== 'undefined' && window.ethereum?.on) {
			window.ethereum.on('accountsChanged', handleAccountsChanged as (...args: unknown[]) => void);
			window.ethereum.on('chainChanged', handleChainChanged);
		}
	});

	onDestroy(() => {
		// Cleanup listeners
		if (typeof window !== 'undefined' && window.ethereum?.removeListener) {
			window.ethereum.removeListener(
				'accountsChanged',
				handleAccountsChanged as (...args: unknown[]) => void
			);
			window.ethereum.removeListener('chainChanged', handleChainChanged);
		}
	});
</script>

{#if isConnected}
	<button
		class="flex items-center gap-2 rounded-lg bg-gray-800 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-700"
		onclick={handleDisconnect}
	>
		<span class="h-2 w-2 rounded-full bg-green-400"></span>
		{displayAddress}
	</button>
{:else}
	<button
		class="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
		disabled={isLoading}
		onclick={handleConnect}
	>
		{isLoading ? '...' : m.connect_wallet()}
	</button>
{/if}
