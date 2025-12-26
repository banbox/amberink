<script lang="ts">
	interface Props {
		size?: number;
		class?: string;
		strokeWidth?: number;
		filled?: boolean;
	}
	let { size = 20, class: className = '', strokeWidth = 2, filled = false }: Props = $props();
</script>

<svg
	class={className}
	width={size}
	height={size}
	fill={filled ? 'currentColor' : 'none'}
	stroke="currentColor"
	viewBox="0 0 24 24"
>
	{#if filled}
		<path
			d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
		/>
	{:else}
		<path
			stroke-linecap="round"
			stroke-linejoin="round"
			stroke-width={strokeWidth}
			d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
		/>
	{/if}
</svg>
