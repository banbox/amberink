<script lang="ts">
	import * as m from '$lib/paraglide/messages';

	interface Props {
		/** Originality value: 0=Original, 1=SemiOriginal, 2=Reprint */
		originality: number;
	}

	let { originality }: Props = $props();
</script>

{#if originality === 0}
	<span class="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
		{m.original()}
	</span>
{:else if originality === 1}
	<span class="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
		{m.semi_original()}
	</span>
{:else}
	<span class="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
		{m.reprint()}
	</span>
{/if}
