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
	import { envName } from '$lib/config';

	let showDropdown = $state(false);

	let address = $derived(getWalletAddress());
	let isConnected = $derived(isWalletConnected());
	let isLoading = $derived(isWalletLoading());

	let displayAddress = $derived(
		address ? `${address.slice(0, 6)}...${address.slice(-4)}` : ''
	);

	// Environment-based colors
	// dev: green, test: yellow/orange, prod: dark blue/gray (default)
	const buttonColorClasses = $derived(
		envName() === 'dev'
			? 'bg-green-600 hover:bg-green-700'
			: envName() === 'test'
				? 'bg-orange-600 hover:bg-orange-700'
				: 'bg-gray-800 hover:bg-gray-700'
	);

	const dropdownColorClasses = $derived(
		envName() === 'dev'
			? 'bg-green-600'
			: envName() === 'test'
				? 'bg-orange-600'
				: 'bg-gray-800'
	);

	function handleChainChanged() {
		window.location.reload();
	}

	async function handleConnect() {
		const result = await connectWallet();
		if (!result.success && result.error) {
			alert(result.error);
		} else if (result.cached) {
			// Wallet used cached account without prompting user
			alert(m.wallet_cached_account());
		}
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
			class="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors {buttonColorClasses}"
			onclick={toggleDropdown}
		>
			<span class="h-2 w-2 rounded-full bg-green-400"></span>
			{displayAddress}
			<ChevronDownIcon size={16} class="transition-transform {showDropdown ? 'rotate-180' : ''}" />
		</button>
		{#if showDropdown}
			<div
				class="absolute right-0 top-full z-50 mt-2 w-48 rounded-lg py-2 shadow-lg {dropdownColorClasses}"
			>
				<button
					class="flex w-full items-center gap-2 px-4 py-2 text-sm text-red-400 transition-colors"
					class:hover:bg-green-700={envName() === 'dev'}
					class:hover:bg-orange-700={envName() === 'test'}
					class:hover:bg-gray-700={envName() === 'prod'}
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
		{isLoading ? m.loading_dots() : m.connect_wallet()}
	</button>
{/if}
