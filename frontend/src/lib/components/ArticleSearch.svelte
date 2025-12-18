<script lang="ts">
	import { onMount } from 'svelte';
	import * as m from '$lib/paraglide/messages';
	import { CATEGORY_KEYS, type CategoryKey } from '$lib/data';
	import { client } from '$lib/graphql';
	import { gql } from '@urql/svelte';

	interface Props {
		open: boolean;
		onClose: () => void;
	}

	let { open = $bindable(), onClose }: Props = $props();

	// Search state
	let searchQuery = $state('');
	let selectedCategory = $state<number | null>(null);
	let selectedOriginality = $state<number | null>(null);
	let orderBy = $state<'createdAt' | 'likeAmount' | 'totalTips' | 'collectCount'>('createdAt');
	let orderDirection = $state<'DESC' | 'ASC'>('DESC');

	// Results state
	let isSearching = $state(false);
	let searchResults = $state<any[]>([]);
	let totalResults = $state(0);
	let currentPage = $state(1);
	let pageSize = 10;
	let searchError = $state<string | null>(null);
	let hasSearched = $state(false);

	let inputRef: HTMLInputElement | null = $state(null);
	let dialogRef: HTMLDialogElement | null = $state(null);

	// Search query using standard SubSquid filters
	const SEARCH_ARTICLES_QUERY = gql`
		query SearchArticles(
			$where: ArticleWhereInput
			$orderBy: [ArticleOrderByInput!]
			$limit: Int
			$offset: Int
		) {
			articles(where: $where, orderBy: $orderBy, limit: $limit, offset: $offset) {
				id
				articleId
				title
				categoryId
				originality
				likeAmount
				dislikeAmount
				totalTips
				collectCount
				createdAt
				author {
					id
					nickname
					avatar
				}
			}
			articlesConnection(where: $where, orderBy: id_ASC) {
				totalCount
			}
		}
	`;

	// Helper function to get category label
	function getCategoryLabel(key: string): string {
		return (m as unknown as Record<string, () => string>)[key]?.() || key;
	}

	// Perform search
	async function performSearch() {
		isSearching = true;
		searchError = null;
		hasSearched = true;

		try {
			// Build where clause
			const whereConditions: any[] = [];

			if (searchQuery.trim()) {
				const term = searchQuery.trim();
				whereConditions.push({
					title_containsInsensitive: term
				});
			}

			if (selectedCategory !== null) {
				whereConditions.push({ categoryId_eq: selectedCategory.toString() });
			}

			if (selectedOriginality !== null) {
				whereConditions.push({ originality_eq: selectedOriginality });
			}

			const where = whereConditions.length > 0 ? { AND: whereConditions } : {};

			// Build order by
			const orderByField = `${orderBy}_${orderDirection}`;

			const result = await client
				.query(SEARCH_ARTICLES_QUERY, {
					where,
					orderBy: [orderByField],
					limit: pageSize,
					offset: (currentPage - 1) * pageSize
				})
				.toPromise();

			if (result.error) {
				throw new Error(result.error.message);
			}

			searchResults = result.data?.articles || [];
			totalResults = result.data?.articlesConnection?.totalCount || 0;
		} catch (error) {
			searchError = error instanceof Error ? error.message : 'Search failed';
			searchResults = [];
			totalResults = 0;
		} finally {
			isSearching = false;
		}
	}

	// Handle search form submit
	function handleSearch(e: Event) {
		e.preventDefault();
		currentPage = 1;
		performSearch();
	}

	// Handle page change
	function goToPage(page: number) {
		currentPage = page;
		performSearch();
	}

	// Reset filters
	function resetFilters() {
		searchQuery = '';
		selectedCategory = null;
		selectedOriginality = null;
		orderBy = 'createdAt';
		orderDirection = 'DESC';
		currentPage = 1;
		searchResults = [];
		totalResults = 0;
		hasSearched = false;
		searchError = null;
	}

	// Close modal
	function handleClose() {
		open = false;
		onClose();
	}

	// Handle backdrop click
	function handleBackdropClick(e: MouseEvent) {
		if (e.target === dialogRef) {
			handleClose();
		}
	}

	// Handle escape key
	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			handleClose();
		}
	}

	// Computed values
	let totalPages = $derived(Math.ceil(totalResults / pageSize));

	// Format date
	function formatDate(dateString: string): string {
		return new Date(dateString).toLocaleDateString();
	}

	// Format ETH amount
	function formatEth(wei: string): string {
		const ethValue = Number(wei) / 1e18;
		if (ethValue === 0) return '0';
		if (ethValue < 0.001) return '<0.001';
		return ethValue.toFixed(3);
	}

	// Focus input when modal opens
	$effect(() => {
		if (open && inputRef) {
			setTimeout(() => inputRef?.focus(), 100);
		}
	});

	// Show/hide dialog
	$effect(() => {
		if (dialogRef) {
			if (open) {
				dialogRef.showModal();
			} else {
				dialogRef.close();
			}
		}
	});
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<dialog
	bind:this={dialogRef}
	class="m-0 h-full max-h-full w-full max-w-full bg-transparent p-0 backdrop:bg-black/50 md:m-auto md:h-auto md:max-h-[85vh] md:max-w-3xl md:rounded-xl md:p-0"
	onclick={handleBackdropClick}
	onkeydown={handleKeydown}
>
	<div class="flex h-full flex-col bg-white md:rounded-xl md:shadow-2xl">
		<!-- Header -->
		<div class="flex items-center justify-between border-b border-gray-200 px-4 py-3 md:px-6">
			<h2 class="text-lg font-semibold text-gray-900">{m.search_articles()}</h2>
			<button
				type="button"
				onclick={handleClose}
				class="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
				aria-label={m.close()}
			>
				<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M6 18L18 6M6 6l12 12"
					/>
				</svg>
			</button>
		</div>

		<!-- Search Form -->
		<form onsubmit={handleSearch} class="border-b border-gray-100 px-4 py-4 md:px-6">
			<!-- Search Input -->
			<div class="mb-4 flex gap-2">
				<div class="relative flex-1">
					<svg
						class="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400"
						fill="none"
						stroke="currentColor"
						viewBox="0 0 24 24"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
						/>
					</svg>
					<input
						bind:this={inputRef}
						type="text"
						bind:value={searchQuery}
						placeholder={m.search_placeholder()}
						class="w-full rounded-lg border border-gray-200 bg-gray-50 py-2.5 pl-10 pr-4 text-sm text-gray-900 placeholder-gray-400 transition-colors focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
						disabled={isSearching}
					/>
				</div>
				<button
					type="submit"
					disabled={isSearching}
					class="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
				>
					{isSearching ? m.searching() : m.search()}
				</button>
			</div>

			<!-- Filters Row -->
			<div class="flex flex-wrap gap-2">
				<!-- Category Filter -->
				<select
					bind:value={selectedCategory}
					class="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 focus:border-blue-500 focus:outline-none"
					disabled={isSearching}
				>
					<option value={null}>{m.all_categories()}</option>
					{#each CATEGORY_KEYS as key, index}
						{#if key !== 'unselected'}
							<option value={index}>{getCategoryLabel(key)}</option>
						{/if}
					{/each}
				</select>

				<!-- Originality Filter -->
				<select
					bind:value={selectedOriginality}
					class="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 focus:border-blue-500 focus:outline-none"
					disabled={isSearching}
				>
					<option value={null}>{m.all_originality()}</option>
					<option value={0}>{m.original()}</option>
					<option value={1}>{m.semi_original()}</option>
					<option value={2}>{m.reprint()}</option>
				</select>

				<!-- Sort By -->
				<select
					bind:value={orderBy}
					class="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 focus:border-blue-500 focus:outline-none"
					disabled={isSearching}
				>
					<option value="createdAt">{m.sort_date()}</option>
					<option value="likeAmount">{m.sort_likes()}</option>
					<option value="totalTips">{m.sort_tips()}</option>
					<option value="collectCount">{m.sort_collects()}</option>
				</select>

				<!-- Order Direction -->
				<select
					bind:value={orderDirection}
					class="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 focus:border-blue-500 focus:outline-none"
					disabled={isSearching}
				>
					<option value="DESC">{m.order_desc()}</option>
					<option value="ASC">{m.order_asc()}</option>
				</select>

				<!-- Reset Button -->
				<button
					type="button"
					onclick={resetFilters}
					class="rounded-lg px-3 py-1.5 text-sm text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
					disabled={isSearching}
				>
					{m.reset_filters()}
				</button>
			</div>
		</form>

		<!-- Results -->
		<div class="flex-1 overflow-y-auto px-4 py-4 md:px-6">
			<!-- Error Message -->
			{#if searchError}
				<div class="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
					{m.search_error({ error: searchError })}
				</div>
			{/if}

			<!-- Results List -->
			{#if searchResults.length > 0}
				<div class="mb-3 text-sm text-gray-500">
					{m.found_articles({ count: totalResults })}
				</div>

				<div class="space-y-3">
					{#each searchResults as article}
						<a
							href="/a/{article.id}"
							onclick={handleClose}
							class="block rounded-lg border border-gray-200 p-3 transition-colors hover:border-blue-300 hover:bg-blue-50/50"
						>
							<div class="mb-1.5 flex items-start justify-between gap-2">
								<h3 class="font-medium text-gray-900 line-clamp-1">{article.title}</h3>
								<span class="shrink-0 rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
									{getCategoryLabel(CATEGORY_KEYS[Number(article.categoryId)] || 'other')}
								</span>
							</div>

							{#if article.summary}
								<p class="mb-2 text-sm text-gray-600 line-clamp-2">{article.summary}</p>
							{/if}

							<div class="flex flex-wrap items-center gap-3 text-xs text-gray-500">
								<span
									>{article.author?.nickname ||
										article.author?.id?.slice(0, 8) ||
										m.anonymous()}</span
								>
								<span>{formatDate(article.createdAt)}</span>
								<span>👍 {formatEth(article.likeAmount)}</span>
								<span>💰 {formatEth(article.totalTips)}</span>
								<span>🔖 {article.collectCount}</span>
							</div>
						</a>
					{/each}
				</div>

				<!-- Pagination -->
				{#if totalPages > 1}
					<div class="mt-4 flex items-center justify-center gap-2">
						<button
							type="button"
							onclick={() => goToPage(currentPage - 1)}
							disabled={currentPage === 1 || isSearching}
							class="rounded border border-gray-200 px-3 py-1 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
						>
							←
						</button>
						<span class="px-3 text-sm text-gray-600">
							{currentPage} / {totalPages}
						</span>
						<button
							type="button"
							onclick={() => goToPage(currentPage + 1)}
							disabled={currentPage === totalPages || isSearching}
							class="rounded border border-gray-200 px-3 py-1 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
						>
							→
						</button>
					</div>
				{/if}
			{:else if hasSearched && !isSearching && !searchError}
				<div class="py-12 text-center text-gray-500">
					<svg
						class="mx-auto mb-4 h-12 w-12 text-gray-300"
						fill="none"
						stroke="currentColor"
						viewBox="0 0 24 24"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="1.5"
							d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
						/>
					</svg>
					<p class="text-sm">{m.no_results()}</p>
					<p class="mt-1 text-xs text-gray-400">{m.try_different_keywords()}</p>
				</div>
			{:else if !hasSearched}
				<div class="py-12 text-center text-gray-400">
					<svg
						class="mx-auto mb-4 h-12 w-12 text-gray-300"
						fill="none"
						stroke="currentColor"
						viewBox="0 0 24 24"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="1.5"
							d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
						/>
					</svg>
					<p class="text-sm">{m.search_placeholder()}</p>
				</div>
			{/if}

			<!-- Loading State -->
			{#if isSearching}
				<div class="flex items-center justify-center py-12">
					<svg class="h-8 w-8 animate-spin text-blue-600" fill="none" viewBox="0 0 24 24">
						<circle
							class="opacity-25"
							cx="12"
							cy="12"
							r="10"
							stroke="currentColor"
							stroke-width="4"
						></circle>
						<path
							class="opacity-75"
							fill="currentColor"
							d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
						></path>
					</svg>
				</div>
			{/if}
		</div>
	</div>
</dialog>
