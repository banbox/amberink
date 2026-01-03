<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	import { SpinnerIcon } from '$lib/components/icons';

	interface Props {
		/** Size of the spinner icon in pixels */
		size?: number;
		/** Optional loading text, defaults to i18n "loading" */
		text?: string;
		/** Whether to show the text */
		showText?: boolean;
	}

	let { size = 24, text = m.loading(), showText = true }: Props = $props();
</script>

<div class="flex justify-center py-8">
	<div class="flex items-center gap-3 text-gray-500">
		<SpinnerIcon {size} />
		{#if showText}
			<span>{text}</span>
		{/if}
	</div>
</div>
