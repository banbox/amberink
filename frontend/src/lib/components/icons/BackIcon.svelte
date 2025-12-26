<script lang="ts">
	interface Props {
		size?: number;
		class?: string;
	}
	let { size = 24, class: className = '' }: Props = $props();
</script>

<svg
	class={className}
	width={size}
	height={size}
	viewBox="0 0 24 24"
	fill="none"
	stroke="currentColor"
	stroke-width="2"
>
	<path
		stroke-linecap="round"
		stroke-linejoin="round"
		d="M9 15 3 9m0 0 6-6M3 9h12a6 6 0 0 1 0 12h-3"
	/>
</svg>
