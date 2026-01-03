<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	import { SpinnerIcon } from '$lib/components/icons';

	interface Props {
		/** Optional custom loading message */
		message?: string;
		/** Additional CSS classes */
		class?: string;
	}

	let { message, class: className = '' }: Props = $props();
</script>

<div class="flex justify-center py-8 {className}">
	<div class="flex items-center gap-3 text-gray-500">
		<SpinnerIcon size={24} />
		<span>{message ?? m.loading()}</span>
	</div>
</div>
