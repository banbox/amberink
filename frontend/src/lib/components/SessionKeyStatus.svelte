<script lang="ts">
	import { onMount } from 'svelte';
	import { formatEthDisplay } from '$lib/formatUtils';
	import * as m from '$lib/paraglide/messages';
	import {
		getStoredSessionKey,
		createSessionKey,
		revokeSessionKey,
		isSessionKeyValidForCurrentWallet,
		getSessionKeyBalance,
		hasSessionKeySufficientBalance,
		fundSessionKey
	} from '$lib/sessionKey';
	import { getNativeTokenSymbol } from '$lib/priceService';
	import { CheckIcon } from './icons';

	import { getWalletAddress, isWalletConnected } from '$lib/stores/wallet.svelte';

	let hasSessionKey = $state(false);
	let validUntil = $state<Date | null>(null);
	let sessionKeyAddress = $state<string | null>(null);
	let balance = $state<bigint>(0n);
	let isBalanceSufficient = $state(true);
	let isLoading = $state(false);
	let isFunding = $state(false);
	let errorMessage = $state('');

	let formattedValidUntil = $derived(validUntil ? validUntil.toLocaleDateString() : '');
	let formattedBalance = $derived(balance ? formatEthDisplay(balance) : '0');

	// Use store properly
	let walletAddress = $derived(getWalletAddress());

	async function checkSessionKey() {
		// Wait for wallet address to be available
		if (!walletAddress) {
			hasSessionKey = false;
			return;
		}
		
		const sk = getStoredSessionKey(walletAddress);
		if (sk) {
			// Verify it belongs to current wallet
			const isValid = await isSessionKeyValidForCurrentWallet();
			hasSessionKey = isValid;
			validUntil = isValid ? new Date(sk.validUntil * 1000) : null;
			sessionKeyAddress = isValid ? sk.address : null;
			
			if (isValid) {
				// Check balance
				balance = await getSessionKeyBalance(sk.address);
				isBalanceSufficient = await hasSessionKeySufficientBalance(sk.address);
			}
		} else {
			hasSessionKey = false;
			validUntil = null;
			sessionKeyAddress = null;
			balance = 0n;
			isBalanceSufficient = true;
		}
	}

	async function handleCreate() {
		isLoading = true;
		errorMessage = '';
		try {
			// Create session key with funding enabled (user explicitly requested creation)
			await createSessionKey({ skipFunding: false, skipIrysApproval: false });
			await checkSessionKey();
		} catch (error) {
			console.error('Failed to create session key:', error);
			errorMessage = m.session_error();
		} finally {
			isLoading = false;
		}
	}

	async function handleRevoke() {
		isLoading = true;
		errorMessage = '';
		try {
			await revokeSessionKey();
			await checkSessionKey();
		} catch (error) {
			console.error('Failed to revoke session key:', error);
			errorMessage = m.session_error();
		} finally {
			isLoading = false;
		}
	}

	async function handleFund() {
		if (!sessionKeyAddress) return;
		
		isFunding = true;
		errorMessage = '';
		try {
			await fundSessionKey(sessionKeyAddress);
			await checkSessionKey();
		} catch (error) {
			console.error('Failed to fund session key:', error);
			errorMessage = m.session_error();
		} finally {
			isFunding = false;
		}
	}

	// React to wallet address changes
	$effect(() => {
		if (walletAddress) {
			checkSessionKey();
		} else {
			hasSessionKey = false;
			validUntil = null;
			sessionKeyAddress = null;
		}
	});

	onMount(() => {
		checkSessionKey();
	});
</script>

<div class="rounded-lg border border-gray-200 bg-white p-4">
	<h3 class="mb-2 font-semibold text-gray-900">{m.seamless_mode()}</h3>

	{#if hasSessionKey}
		<p class="mb-2 flex items-center gap-1 text-green-600">
			<CheckIcon size={16} />
			{m.seamless_enabled()}
		</p>
		<p class="mb-2 text-sm text-gray-500">
			{m.seamless_valid_until()}: {formattedValidUntil}
		</p>

		<!-- Balance display -->
		<div class="mb-4 flex items-center gap-2">
			<span class="text-sm text-gray-500">{m.balance()}:</span>
			<span
				class={isBalanceSufficient
					? 'text-sm text-gray-700'
					: 'text-sm font-medium text-orange-600'}
			>
				{formattedBalance}
				{getNativeTokenSymbol()}
			</span>
			{#if !isBalanceSufficient}
				<span class="text-xs text-orange-500">({m.low_balance()})</span>
				<button
					class="rounded bg-orange-500 px-2 py-0.5 text-xs font-medium text-white transition-colors hover:bg-orange-600 disabled:opacity-50"
					disabled={isFunding}
					onclick={handleFund}
				>
					{isFunding ? m.funding() : m.fund()}
				</button>
			{/if}
		</div>

		<button
			class="rounded px-3 py-1.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
			disabled={isLoading}
			onclick={handleRevoke}
		>
			{m.revoke_authorization()}
		</button>
	{:else}
		<p class="mb-2 text-gray-500">{m.seamless_disabled()}</p>
		<p class="mb-4 text-sm text-gray-400">
			{m.seamless_description()}
		</p>
		<button
			class="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
			disabled={isLoading}
			onclick={handleCreate}
		>
			{isLoading ? m.authorizing() : m.enable_seamless()}
		</button>
	{/if}

	<!-- Error message -->
	{#if errorMessage}
		<p class="mt-2 text-sm text-red-600">
			{errorMessage}
		</p>
	{/if}
</div>
