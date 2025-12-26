<script lang="ts">
	interface Props {
		size?: number;
		class?: string;
	}
	let { size = 20, class: className = '' }: Props = $props();
</script>

<svg class={className} width={size} height={size} fill="currentColor" viewBox="0 0 24 24">
	<path d="M10 4v2h2.21l-3.42 12H6v2h8v-2h-2.21l3.42-12H18V4h-8z" />
</svg>
