<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		/** Icon component to display */
		icon?: Snippet;
		/** Main title text */
		title: string;
		/** Optional subtitle/description */
		subtitle?: string;
		/** Icon size in pixels */
		iconSize?: number;
	}

	let { icon, title, subtitle, iconSize = 64 }: Props = $props();
</script>

<div class="py-16 text-center">
	{#if icon}
		<div class="mx-auto text-gray-300" style="width: {iconSize}px; height: {iconSize}px;">
			{@render icon()}
		</div>
	{/if}
	<h3 class="mt-4 text-lg font-medium text-gray-900">{title}</h3>
	{#if subtitle}
		<p class="mt-2 text-gray-500">{subtitle}</p>
	{/if}
</div>
