<script lang="ts">
	import { onMount } from 'svelte';
	import { formatEther } from 'viem';
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

	let hasSessionKey = $state(false);
	let validUntil = $state<Date | null>(null);
	let sessionKeyAddress = $state<string | null>(null);
	let balance = $state<bigint>(0n);
	let isBalanceSufficient = $state(true);
	let isLoading = $state(false);
	let isFunding = $state(false);
	let errorMessage = $state('');

	let formattedValidUntil = $derived(validUntil ? validUntil.toLocaleDateString() : '');
	let formattedBalance = $derived(balance ? formatEther(balance).slice(0, 8) : '0');

	async function checkSessionKey() {
		const sk = getStoredSessionKey();
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
			await createSessionKey();
			await checkSessionKey();
		} catch (error) {
			console.error('Failed to create session key:', error);
			errorMessage = m.session_key_error();
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
			errorMessage = m.session_key_error();
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
			errorMessage = m.session_key_error();
		} finally {
			isFunding = false;
		}
	}

	onMount(() => {
		checkSessionKey();
	});
</script>

<div class="rounded-lg border border-gray-200 bg-white p-4">
	<h3 class="mb-2 font-semibold text-gray-900">{m.seamless_mode()}</h3>

	{#if hasSessionKey}
		<p class="mb-2 flex items-center gap-1 text-green-600">
			<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
			</svg>
			{m.seamless_enabled()}
		</p>
		<p class="mb-2 text-sm text-gray-500">
			{m.seamless_valid_until()}: {formattedValidUntil}
		</p>
		
		<!-- Balance display -->
		<div class="mb-4 flex items-center gap-2">
			<span class="text-sm text-gray-500">{m.session_key_balance()}:</span>
			<span class={isBalanceSufficient ? 'text-sm text-gray-700' : 'text-sm font-medium text-orange-600'}>
				{formattedBalance} ETH
			</span>
			{#if !isBalanceSufficient}
				<span class="text-xs text-orange-500">({m.session_key_low_balance()})</span>
				<button
					class="rounded bg-orange-500 px-2 py-0.5 text-xs font-medium text-white transition-colors hover:bg-orange-600 disabled:opacity-50"
					disabled={isFunding}
					onclick={handleFund}
				>
					{isFunding ? m.session_key_funding() : m.session_key_fund()}
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
