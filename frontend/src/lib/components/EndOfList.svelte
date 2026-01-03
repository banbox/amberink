<script lang="ts">
	import * as m from '$lib/paraglide/messages';

	interface Props {
		/** Whether to show the message */
		show: boolean;
		/** Item type for the message (defaults to articles) */
		itemType?: string;
		/** Additional CSS classes */
		class?: string;
	}

	let { show, itemType, class: className = '' }: Props = $props();

	const items = $derived(itemType ?? m.articles());
</script>

{#if show}
	<div class="py-8 text-center text-gray-500 {className}">
		<p>{m.no_more({ items })}</p>
	</div>
{/if}
