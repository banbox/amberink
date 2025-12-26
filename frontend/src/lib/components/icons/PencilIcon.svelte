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
		d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
	/>
</svg>
