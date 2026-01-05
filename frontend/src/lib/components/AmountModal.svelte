<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	import { getApproxNativeAmount } from '$lib/formatUtils';
	
	interface Props {
		show: boolean;
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
		show, 
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
</script>

{#if show}
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions a11y_interactive_supports_focus -->
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
		role="dialog"
		aria-modal="true"
		tabindex="-1"
		onclick={onClose}
	>
		<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_noninteractive_element_interactions -->
		<div
			class="mx-4 w-full max-w-sm rounded-xl bg-white p-6 shadow-xl"
			role="document"
			onclick={(e) => e.stopPropagation()}
		>
			<h3 class="mb-4 text-lg font-bold text-gray-900">{title}</h3>
			{#if description}
				<p class="mb-4 text-sm text-gray-500">{description}</p>
			{/if}

			<div class="mb-4">
				<label for={inputId} class="mb-2 block text-sm font-medium text-gray-700">{labelText}</label
				>
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
						class="flex-1 rounded-lg border border-gray-200 py-1.5 text-sm transition-colors hover:border-{colorScheme}-500 hover:bg-{colorScheme}-50"
						class:border-emerald-500={colorScheme === 'emerald' && value === amount}
						class:bg-emerald-50={colorScheme === 'emerald' && value === amount}
						class:border-amber-500={colorScheme === 'amber' && value === amount}
						class:bg-amber-50={colorScheme === 'amber' && value === amount}
						class:border-red-500={colorScheme === 'red' && value === amount}
						class:bg-red-50={colorScheme === 'red' && value === amount}
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
					class="flex-1 rounded-lg py-2 text-sm font-medium text-white transition-colors disabled:opacity-50"
					class:bg-emerald-500={colorScheme === 'emerald'}
					class:hover:bg-emerald-600={colorScheme === 'emerald'}
					class:bg-amber-500={colorScheme === 'amber'}
					class:hover:bg-amber-600={colorScheme === 'amber'}
					class:bg-red-500={colorScheme === 'red'}
					class:hover:bg-red-600={colorScheme === 'red'}
				>
					{isProcessing ? m.processing({}) : submitText}
				</button>
			</div>
		</div>
	</div>
{/if}
