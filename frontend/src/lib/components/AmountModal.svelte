<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	import { getApproxNativeAmount } from '$lib/formatUtils';
	import BaseModal from '$lib/components/BaseModal.svelte';
	
	interface Props {
		open: boolean;
		onClose: () => void;
		title: string;
		description?: string;
		labelText: string;
		inputId: string;
		value: string;
		onValueChange: (v: string) => void;
		isProcessing: boolean;
		onSubmit: () => void;
		submitText: string;
		colorScheme: 'emerald' | 'amber' | 'red';
		nativeTokenPrice: number | null;
		nativeSymbol: string;
		priceLoading: boolean;
	}

	let { 
		open, 
		onClose, 
		title, 
		description, 
		labelText, 
		inputId, 
		value, 
		onValueChange, 
		isProcessing, 
		onSubmit, 
		submitText, 
		colorScheme,
		nativeTokenPrice,
		nativeSymbol,
		priceLoading
	}: Props = $props();

	const colorSchemes = {
		emerald: {
			active: 'border-emerald-500 bg-emerald-50',
			base: 'hover:border-emerald-500 hover:bg-emerald-50',
			submit: 'bg-emerald-500 hover:bg-emerald-600'
		},
		amber: {
			active: 'border-amber-500 bg-amber-50',
			base: 'hover:border-amber-500 hover:bg-amber-50',
			submit: 'bg-amber-500 hover:bg-amber-600'
		},
		red: {
			active: 'border-red-500 bg-red-50',
			base: 'hover:border-red-500 hover:bg-red-50',
			submit: 'bg-red-500 hover:bg-red-600'
		}
	};
	
	const activeScheme = $derived(colorSchemes[colorScheme]);
</script>

<BaseModal {open} {onClose} {title} maxWidth="max-w-sm">
	{#if description}
		<p class="mb-4 text-sm text-gray-500">{description}</p>
	{/if}

	<div class="mb-4">
		<label for={inputId} class="mb-2 block text-sm font-medium text-gray-700">{labelText}</label>
		<div class="flex items-center gap-2">
			<span class="text-sm font-medium text-gray-600">$</span>
			<input
				id={inputId}
				type="number"
				{value}
				oninput={(e) => onValueChange(e.currentTarget.value)}
				step="0.01"
				min="0.01"
				class="flex-1 rounded-lg border border-gray-300 px-4 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
				disabled={isProcessing}
			/>
			<span class="text-sm font-medium text-gray-600">USD</span>
		</div>
		<!-- Show approximate native token amount -->
		<div class="mt-2 text-xs text-gray-500">
			{#if priceLoading}
				{m.price_loading({})}
			{:else if nativeTokenPrice}
				≈ {getApproxNativeAmount(value, nativeTokenPrice)} {nativeSymbol}
			{/if}
		</div>
	</div>

	<!-- Quick USD amounts -->
	<div class="mb-6 flex gap-2">
		{#each ['0.10', '0.50', '2.00', '5.00'] as amount}
			<button
				type="button"
				onclick={() => onValueChange(amount)}
				class="flex-1 rounded-lg border py-1.5 text-sm transition-colors {activeScheme.base} {value ===
				amount
					? activeScheme.active
					: 'border-gray-200'}"
			>
				${amount}
			</button>
		{/each}
	</div>

	<div class="flex gap-3">
		<button
			type="button"
			onclick={onClose}
			class="flex-1 rounded-lg border border-gray-300 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
			disabled={isProcessing}
		>
			{m.cancel({})}
		</button>
		<button
			type="button"
			onclick={onSubmit}
			disabled={isProcessing || !value}
			class="flex-1 rounded-lg py-2 text-sm font-medium text-white transition-colors disabled:opacity-50 {activeScheme.submit}"
		>
			{isProcessing ? m.processing({}) : submitText}
		</button>
	</div>
</BaseModal>
