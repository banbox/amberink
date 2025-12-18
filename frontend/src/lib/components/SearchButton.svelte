<script lang="ts">
	import * as m from '$lib/paraglide/messages';

	interface Props {
		onclick: () => void;
		variant?: 'icon' | 'full' | 'compact';
		class?: string;
	}

	let { onclick, variant = 'full', class: className = '' }: Props = $props();
</script>

{#if variant === 'icon'}
	<button
		type="button"
		{onclick}
		class="rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 {className}"
		title={m.search()}
		aria-label={m.search()}
	>
		<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
			<path
				stroke-linecap="round"
				stroke-linejoin="round"
				stroke-width="2"
				d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
			/>
		</svg>
	</button>
{:else if variant === 'compact'}
	<button
		type="button"
		{onclick}
		class="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 {className}"
	>
		<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
			<path
				stroke-linecap="round"
				stroke-linejoin="round"
				stroke-width="2"
				d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
			/>
		</svg>
		<span>{m.search()}</span>
	</button>
{:else}
	<button
		type="button"
		{onclick}
		class="flex w-full items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-500 transition-colors hover:border-gray-300 hover:bg-gray-100 {className}"
	>
		<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
			<path
				stroke-linecap="round"
				stroke-linejoin="round"
				stroke-width="2"
				d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
			/>
		</svg>
		<span class="flex-1 text-left">{m.search_placeholder()}</span>
		<kbd class="hidden rounded bg-gray-200 px-1.5 py-0.5 text-xs text-gray-500 sm:inline">⌘K</kbd>
	</button>
{/if}
