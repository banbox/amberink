<script lang="ts">
	interface Props {
		size?: number;
		class?: string;
		strokeWidth?: number;
	}
	let { size = 20, class: className = '', strokeWidth = 2 }: Props = $props();
</script>

<svg
	class={className}
	width={size}
	height={size}
	fill="none"
	stroke="currentColor"
	viewBox="0 0 24 24"
>
	<path
		stroke-linecap="round"
		stroke-linejoin="round"
		stroke-width={strokeWidth}
		d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
	/>
</svg>
