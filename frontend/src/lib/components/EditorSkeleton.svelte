<script lang="ts">
	import * as m from '$lib/paraglide/messages';
</script>

<div class="min-h-screen bg-white">
	<div class="mx-auto max-w-3xl px-6 py-12">
		<!-- Header -->
		<header class="mb-12 animate-pulse">
			<div class="mb-2 h-10 w-48 rounded bg-gray-200"></div>
			<div class="h-5 w-80 rounded bg-gray-200"></div>
		</header>

		<!-- Form Skeleton -->
		<div class="space-y-8">
			<!-- Title Input -->
			<div class="animate-pulse">
				<div class="mb-2 h-5 w-16 rounded bg-gray-200"></div>
				<div class="h-12 w-full rounded-lg border-2 border-gray-200 bg-gray-50"></div>
			</div>

			<!-- Summary Input -->
			<div class="animate-pulse">
				<div class="mb-2 h-5 w-16 rounded bg-gray-200"></div>
				<div class="h-24 w-full rounded-lg border-2 border-gray-200 bg-gray-50"></div>
			</div>

			<!-- Category Select -->
			<div class="animate-pulse">
				<div class="mb-2 h-5 w-20 rounded bg-gray-200"></div>
				<div class="h-12 w-full rounded-lg border-2 border-gray-200 bg-gray-50"></div>
			</div>

			<!-- Cover Image -->
			<div class="animate-pulse">
				<div class="mb-2 h-5 w-24 rounded bg-gray-200"></div>
				<div class="h-48 w-full rounded-lg border-2 border-gray-200 bg-gray-50"></div>
			</div>

			<!-- Content Editor -->
			<div class="animate-pulse">
				<div class="mb-2 h-5 w-20 rounded bg-gray-200"></div>
				<div class="h-96 w-full rounded-lg border-2 border-gray-200 bg-gray-50"></div>
			</div>

			<!-- Loading Message -->
			<div
				class="flex items-center justify-center gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-blue-800"
			>
				<svg
					class="h-5 w-5 animate-spin"
					xmlns="http://www.w3.org/2000/svg"
					fill="none"
					viewBox="0 0 24 24"
				>
					<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"
					></circle>
					<path
						class="opacity-75"
						fill="currentColor"
						d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
					></path>
				</svg>
				<span class="text-sm font-medium">{m.loading_content()}</span>
			</div>

			<!-- Buttons Skeleton -->
			<div class="flex gap-3 animate-pulse">
				<div class="h-12 flex-1 rounded-lg bg-gray-200"></div>
				<div class="h-12 w-32 rounded-lg bg-gray-200"></div>
			</div>
		</div>
	</div>
</div>
