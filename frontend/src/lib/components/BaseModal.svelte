<script lang="ts">
	interface Props {
		open: boolean;
		onClose: () => void;
		title?: string;
		maxWidth?: string;
		children?: import('svelte').Snippet;
	}

	let { open, onClose, title, maxWidth = 'max-w-md', children }: Props = $props();
</script>

{#if open}
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions a11y_interactive_supports_focus -->
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
		role="dialog"
		aria-modal="true"
		tabindex="-1"
		onclick={onClose}
	>
		<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
		<div
			class="mx-4 w-full {maxWidth} rounded-xl bg-white p-6 shadow-xl"
			role="document"
			onclick={(e) => e.stopPropagation()}
		>
			{#if title}
				<h3 class="mb-4 text-lg font-bold text-gray-900">{title}</h3>
			{/if}
			{@render children?.()}
		</div>
	</div>
{/if}
