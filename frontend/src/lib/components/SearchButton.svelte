<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	import { SearchIcon } from './icons';

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
		<SearchIcon size={20} />
	</button>
{:else if variant === 'compact'}
	<button
		type="button"
		{onclick}
		class="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 {className}"
	>
		<SearchIcon size={16} />
		<span>{m.search()}</span>
	</button>
{:else}
	<button
		type="button"
		{onclick}
		class="flex w-full items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-500 transition-colors hover:border-gray-300 hover:bg-gray-100 {className}"
	>
		<SearchIcon size={16} />
		<span class="flex-1 text-left">{m.search_placeholder()}</span>
		<kbd class="hidden rounded bg-gray-200 px-1.5 py-0.5 text-xs text-gray-500 sm:inline">⌘K</kbd>
	</button>
{/if}
