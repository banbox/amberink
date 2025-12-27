<script lang="ts">
	import { CATEGORY_KEYS, type CategoryKey } from '$lib/data';
	import * as m from '$lib/paraglide/messages';
	import { ChevronUpIcon, ChevronDownIcon } from './icons';

	interface Props {
		selectedCategory: number | null;
		onSelect: (categoryId: number | null) => void;
	}

	let { selectedCategory, onSelect }: Props = $props();

	// Hot categories to show (excluding 'unselected')
	const HOT_CATEGORIES: CategoryKey[] = [
		'technology',
		'blockchain',
		'ai',
		'programming',
		'finance',
		'design',
		'travel',
		'food',
		'gaming',
		'music'
	];

	// Get category name from key
	function getCategoryName(key: CategoryKey): string {
		return (m as unknown as Record<string, () => string>)[key]?.() || key;
	}

	// Get category ID from key
	function getCategoryId(key: CategoryKey): number {
		return CATEGORY_KEYS.indexOf(key);
	}

	// Check if category is selected
	function isSelected(key: CategoryKey | 'all'): boolean {
		if (key === 'all') return selectedCategory === null;
		return getCategoryId(key) === selectedCategory;
	}

	// Handle category click
	function handleClick(key: CategoryKey | 'all') {
		if (key === 'all') {
			onSelect(null);
		} else {
			const id = getCategoryId(key);
			onSelect(id === selectedCategory ? null : id);
		}
	}

	let showAll = $state(false);

	// All valid categories (excluding 'unselected')
	const allCategories = $derived(
		CATEGORY_KEYS.filter((k) => k !== 'unselected') as CategoryKey[]
	);

	const displayCategories = $derived(showAll ? allCategories : HOT_CATEGORIES);
</script>

<div class="mb-6">
	<!-- Category Pills -->
	<div class="flex flex-wrap items-center gap-2">
		<!-- All Button -->
		<button
			type="button"
			onclick={() => handleClick('all')}
			class="rounded-full px-4 py-2 text-sm font-medium transition-colors {isSelected('all')
				? 'bg-blue-600 text-white'
				: 'bg-gray-100 text-gray-700 hover:bg-gray-200'}"
		>
			{m.all()}
		</button>

		<!-- Category Buttons -->
		{#each displayCategories as key}
			<button
				type="button"
				onclick={() => handleClick(key)}
				class="rounded-full px-4 py-2 text-sm font-medium transition-colors {isSelected(key)
					? 'bg-blue-600 text-white'
					: 'bg-gray-100 text-gray-700 hover:bg-gray-200'}"
			>
				{getCategoryName(key)}
			</button>
		{/each}

		<!-- Show More/Less Button -->
		<button
			type="button"
			onclick={() => (showAll = !showAll)}
			class="flex items-center gap-1 rounded-full px-4 py-2 text-sm font-medium text-blue-600 transition-colors hover:bg-blue-50"
		>
			{#if showAll}
				<span>{m.less()}</span>
				<ChevronUpIcon size={16} />
			{:else}
				<span>{m.more()}</span>
				<ChevronDownIcon size={16} />
			{/if}
		</button>
	</div>
</div>
