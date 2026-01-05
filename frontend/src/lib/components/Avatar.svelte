<script lang="ts">
	interface Props {
		url: string | null | undefined;
		initials: string;
		size?: string;
		textSize?: string;
	}

	let { url, initials, size = 'h-11 w-11', textSize = 'text-sm' }: Props = $props();
</script>

{#if url}
	<img src={url} alt="" class="{size} rounded-full object-cover" />
{:else}
	<div
		class="flex {size} items-center justify-center rounded-full bg-gradient-to-br from-blue-400 to-purple-500 {textSize} font-medium text-white"
	>
		{initials}
	</div>
{/if}
