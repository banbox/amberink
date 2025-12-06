<script lang="ts">
	import { onMount } from 'svelte';
	import * as m from '$lib/paraglide/messages';
	import {
		getStoredSessionKey,
		createSessionKey,
		revokeSessionKey,
		isSessionKeyValidForCurrentWallet
	} from '$lib/sessionKey';

	let hasSessionKey = $state(false);
	let validUntil = $state<Date | null>(null);
	let isLoading = $state(false);
	let errorMessage = $state('');

	let formattedValidUntil = $derived(validUntil ? validUntil.toLocaleDateString() : '');

	async function checkSessionKey() {
		const sk = getStoredSessionKey();
		if (sk) {
			// Verify it belongs to current wallet
			const isValid = await isSessionKeyValidForCurrentWallet();
			hasSessionKey = isValid;
			validUntil = isValid ? new Date(sk.validUntil * 1000) : null;
		} else {
			hasSessionKey = false;
			validUntil = null;
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
		<p class="mb-4 text-sm text-gray-500">
			{m.seamless_valid_until()}: {formattedValidUntil}
		</p>
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
