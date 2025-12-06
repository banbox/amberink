<script lang="ts">
	import * as m from '$lib/paraglide/messages';
</script>

<div class="flex min-h-[60vh] flex-col items-center justify-center px-4">
	<div class="text-center">
		<h1 class="mb-4 text-5xl font-bold text-gray-900">DBlog</h1>
		<p class="mb-8 text-xl text-gray-600">{m.tagline()}</p>
		<a
			href="/publish"
			class="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-3 text-lg font-medium text-white transition-colors hover:bg-blue-700"
		>
			{m.publish_article()}
			<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M13 7l5 5m0 0l-5 5m5-5H6"
				/>
			</svg>
		</a>
	</div>
</div>
