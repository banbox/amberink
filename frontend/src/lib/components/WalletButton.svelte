<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import * as m from '$lib/paraglide/messages';
	import {
		getWalletAddress,
		isWalletConnected,
		isWalletLoading,
		connectWallet,
		disconnectWallet,
		checkWalletConnection,
		handleAccountsChanged
	} from '$lib/stores/wallet.svelte';
	import { ChevronDownIcon, LogoutIcon } from './icons';

	let showDropdown = $state(false);

	let address = $derived(getWalletAddress());
	let isConnected = $derived(isWalletConnected());
	let isLoading = $derived(isWalletLoading());

	let displayAddress = $derived(
		address ? `${address.slice(0, 6)}...${address.slice(-4)}` : ''
	);

	function handleChainChanged() {
		window.location.reload();
	}

	async function handleConnect() {
		await connectWallet();
	}

	function handleDisconnect() {
		disconnectWallet();
		showDropdown = false;
	}

	function toggleDropdown() {
		showDropdown = !showDropdown;
	}

	function handleClickOutside(event: MouseEvent) {
		const target = event.target as HTMLElement;
		if (!target.closest('.wallet-dropdown')) {
			showDropdown = false;
		}
	}

	onMount(() => {
		checkWalletConnection();
		if (typeof window !== 'undefined' && window.ethereum?.on) {
			window.ethereum.on('accountsChanged', handleAccountsChanged as (...args: unknown[]) => void);
			window.ethereum.on('chainChanged', handleChainChanged);
		}
		document.addEventListener('click', handleClickOutside);
	});

	onDestroy(() => {
		if (typeof window !== 'undefined') {
			if (window.ethereum?.removeListener) {
				window.ethereum.removeListener(
					'accountsChanged',
					handleAccountsChanged as (...args: unknown[]) => void
				);
				window.ethereum.removeListener('chainChanged', handleChainChanged);
			}
			document.removeEventListener('click', handleClickOutside);
		}
	});
</script>

{#if isConnected}
	<div class="wallet-dropdown relative">
		<button
			class="flex items-center gap-2 rounded-lg bg-gray-800 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-700"
			onclick={toggleDropdown}
		>
			<span class="h-2 w-2 rounded-full bg-green-400"></span>
			{displayAddress}
			<ChevronDownIcon size={16} class="transition-transform {showDropdown ? 'rotate-180' : ''}" />
		</button>
		{#if showDropdown}
			<div class="absolute right-0 top-full z-50 mt-2 w-48 rounded-lg bg-gray-800 py-2 shadow-lg">
				<button
					class="flex w-full items-center gap-2 px-4 py-2 text-sm text-red-400 hover:bg-gray-700"
					onclick={handleDisconnect}
				>
					<LogoutIcon size={16} />
					{m.disconnect()}
				</button>
			</div>
		{/if}
	</div>
{:else}
	<button
		class="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
		disabled={isLoading}
		onclick={handleConnect}
	>
		{isLoading ? '...' : m.connect_wallet()}
	</button>
{/if}
