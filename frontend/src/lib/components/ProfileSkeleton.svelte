<script lang="ts">
	// Props
	export let showArticles = true;
</script>

<div class="mx-auto max-w-3xl px-6 py-8">
	<!-- Author Header Skeleton -->
	<div class="mb-8 animate-pulse">
		<div class="flex items-start gap-4">
			<!-- Avatar Skeleton -->
			<div class="h-20 w-20 rounded-full bg-gray-200"></div>

			<div class="flex-1">
				<!-- Name Skeleton -->
				<div class="mb-2 h-8 w-48 rounded bg-gray-200"></div>

				<!-- Stats Skeleton -->
				<div class="flex items-center gap-4">
					<div class="h-4 w-20 rounded bg-gray-200"></div>
					<div class="h-4 w-20 rounded bg-gray-200"></div>
					<div class="h-4 w-20 rounded bg-gray-200"></div>
				</div>

				<!-- Member Since Skeleton -->
				<div class="mt-2 h-4 w-40 rounded bg-gray-200"></div>

				<!-- Bio Skeleton -->
				<div class="mt-3 space-y-2">
					<div class="h-4 w-full rounded bg-gray-200"></div>
					<div class="h-4 w-3/4 rounded bg-gray-200"></div>
				</div>
			</div>
		</div>
	</div>

	{#if showArticles}
		<!-- Section Header Skeleton -->
		<div class="mb-4 animate-pulse border-b border-gray-200 pb-2">
			<div class="h-6 w-24 rounded bg-gray-200"></div>
		</div>

		<!-- Articles List Skeleton -->
		<div class="divide-y divide-gray-100">
			{#each Array(3) as _, i}
				<div class="animate-pulse py-6">
					<!-- Article Title -->
					<div class="mb-3 h-6 w-3/4 rounded bg-gray-200"></div>

					<!-- Article Summary -->
					<div class="mb-4 space-y-2">
						<div class="h-4 w-full rounded bg-gray-200"></div>
						<div class="h-4 w-5/6 rounded bg-gray-200"></div>
					</div>

					<!-- Article Meta -->
					<div class="flex items-center gap-4">
						<div class="h-3 w-24 rounded bg-gray-200"></div>
						<div class="h-3 w-20 rounded bg-gray-200"></div>
						<div class="h-3 w-16 rounded bg-gray-200"></div>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>
