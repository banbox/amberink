<script lang="ts">
	interface Props {
		size?: number;
		class?: string;
	}
	let { size = 20, class: className = '' }: Props = $props();
</script>

<svg class={className} width={size} height={size} fill="currentColor" viewBox="0 0 24 24">
	<path
		d="M6 4h8a4 4 0 014 4 4 4 0 01-4 4H6V4zm0 8h9a4 4 0 014 4 4 4 0 01-4 4H6v-8zm3-5v2h5a1 1 0 000-2H9zm0 8v2h6a1 1 0 000-2H9z"
	/>
</svg>
