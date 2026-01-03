<script lang="ts">
	import * as m from '$lib/paraglide/messages';

	interface Props {
		/** Error message to display */
		error: string;
		/** Optional retry callback */
		onRetry?: () => void;
	}

	let { error, onRetry }: Props = $props();
</script>

<div class="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-center text-red-700">
	<p>{error}</p>
	{#if onRetry}
		<button
			type="button"
			onclick={onRetry}
			class="mt-2 text-sm font-medium text-red-600 hover:text-red-800"
		>
			{m.retry()}
		</button>
	{/if}
</div>
