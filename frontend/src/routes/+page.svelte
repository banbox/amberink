<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import * as m from '$lib/paraglide/messages';
	import { client, ARTICLES_QUERY, ALL_ARTICLES_QUERY, type ArticleData } from '$lib/graphql';
	import ArticleListItem from '$lib/components/ArticleListItem.svelte';
	import CategoryFilter from '$lib/components/CategoryFilter.svelte';
	import LoadingState from '$lib/components/LoadingState.svelte';
	import EndOfList from '$lib/components/EndOfList.svelte';
	import { getConfig } from '$lib/config';
	import { infiniteScroll } from '$lib/utils';
	import { ArticleIcon } from '$lib/components/icons';
	import { shortAddress } from '$lib/utils';

	const PAGE_SIZE = 20;

	// State
	let articles = $state<ArticleData[]>([]);
	let loading = $state(false);
	let hasMore = $state(true);
	let offset = $state(0);
	let error = $state<string | null>(null);
	let selectedCategory = $state<number | null>(null);
	let searchAuthor = $state(''); // Author address for filtering
	let isSearchingAuthor = $state(false);

	// Initialize category from URL in browser only
	onMount(() => {
		const cat = page.url.searchParams.get('category');
		selectedCategory = cat ? parseInt(cat) : null;
		const author = page.url.searchParams.get('author');
		searchAuthor = author || '';
	});

	// Handle author search
	async function handleAuthorSearch() {
		if (!searchAuthor.trim()) {
			// Clear author filter
			const url = new URL(page.url);
			url.searchParams.delete('author');
			goto(url.toString(), { replaceState: true, keepFocus: true });
			fetchArticles(true);
			return;
		}

		// Validate address format (basic check)
		const trimmedAuthor = searchAuthor.trim().toLowerCase();
		if (!/^0x[a-f0-9]{40}$/.test(trimmedAuthor) && !/^0x[a-f0-9]{64}$/.test(trimmedAuthor)) {
			// Allow any input but log warning
			console.warn('Invalid address format for author search');
		}

		// Update URL
		const url = new URL(page.url);
		url.searchParams.set('author', trimmedAuthor);
		goto(url.toString(), { replaceState: true, keepFocus: true });
		fetchArticles(true);
	}

	// Clear author search
	function clearAuthorSearch() {
		searchAuthor = '';
		const url = new URL(page.url);
		url.searchParams.delete('author');
		goto(url.toString(), { replaceState: true, keepFocus: true });
		fetchArticles(true);
	}

	// Fetch articles from SubSquid
	async function fetchArticles(reset = false) {
		if (loading) return;

		loading = true;
		error = null;

		const currentOffset = reset ? 0 : offset;
		const authorFilter = searchAuthor.trim().toLowerCase() || undefined;

		try {
			// Build query based on filters
			let query, variables;
			
			if (authorFilter) {
				// Redirect to author page if valid address
				goto(`/u?id=${authorFilter}`, { replaceState: true });
				return;
			} else if (selectedCategory !== null) {
				query = ARTICLES_QUERY;
				variables = { limit: PAGE_SIZE, offset: currentOffset, categoryId: selectedCategory.toString() };
			} else {
				query = ALL_ARTICLES_QUERY;
				variables = { limit: PAGE_SIZE, offset: currentOffset };
			}

			// Use 'network-only' on reset to ensure fresh data, 'cache-first' for pagination
			const result = await client.query(query, variables, { 
				requestPolicy: reset ? 'network-only' : 'cache-first' 
			}).toPromise();

			if (result.error) {
				throw new Error(result.error.message);
			}

			const newArticles = result.data?.articles || [];

			if (reset) {
				articles = newArticles;
				offset = PAGE_SIZE;
			} else {
				articles = [...articles, ...newArticles];
				offset = currentOffset + PAGE_SIZE;
			}

			hasMore = newArticles.length === PAGE_SIZE;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to fetch articles';
			console.error('Failed to fetch articles:', e);
		} finally {
			loading = false;
		}
	}

	// Handle category change
	function handleCategoryChange(categoryId: number | null) {
		const url = new URL(page.url);
		if (categoryId !== null) {
			url.searchParams.set('category', categoryId.toString());
		} else {
			url.searchParams.delete('category');
		}
		selectedCategory = categoryId;
		goto(url.toString(), { replaceState: true, keepFocus: true });
	}

	// Track if initial fetch has been done
	let initialFetchDone = $state(false);

	// Watch for category changes and refetch
	$effect(() => {
		// Access selectedCategory to create dependency
		const _ = selectedCategory;
		untrack(() => {
			fetchArticles(true).then(() => {
				initialFetchDone = true;
			});
		});
	});

	// Use window scroll for infinite scroll - enabled only after initial fetch
	const scrollOptions = $derived({
		onLoadMore: () => fetchArticles(),
		canLoad: () => initialFetchDone && !loading && hasMore
	});
</script>

<svelte:head>
	<title>{getConfig().appName}</title>
</svelte:head>

<div class="mx-auto max-w-3xl px-6 py-8" use:infiniteScroll={scrollOptions}>
	<!-- Page Header -->
	<div class="mb-8">
		<h1 class="text-2xl font-bold text-gray-900">{m.home()}</h1>
		<p class="mt-1 text-gray-600">{m.tagline()}</p>
	</div>

	<!-- Author Search -->
	<div class="mb-6">
		<label for="authorSearch" class="mb-2 block text-sm font-medium text-gray-700">
			{m.search_articles()} ({m.by} {m.author()})
		</label>
		<div class="flex gap-2">
			<input
				id="authorSearch"
				type="text"
				bind:value={searchAuthor}
				placeholder="0x..."
				class="flex-1 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm text-gray-900 placeholder-gray-400 transition-colors focus:border-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-300"
				onkeydown={(e) => {
					if (e.key === 'Enter') handleAuthorSearch();
				}}
			/>
			{#if searchAuthor}
				<button
					type="button"
					onclick={clearAuthorSearch}
					class="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
				>
					{m.clear()}
				</button>
			{/if}
			<button
				type="button"
				onclick={handleAuthorSearch}
				class="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-800"
			>
				{m.search()}
			</button>
		</div>
	</div>

	<!-- Category Filter -->
	<CategoryFilter {selectedCategory} onSelect={handleCategoryChange} />

	<!-- Error State -->
	{#if error}
		<div class="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-center text-red-700">
			<p>{error}</p>
			<button
				type="button"
				onclick={() => fetchArticles(true)}
				class="mt-2 text-sm font-medium text-red-600 hover:text-red-800"
			>
				{m.retry()}
			</button>
		</div>
	{/if}

	<!-- Articles List (vertical, one per row) -->
	{#if articles.length > 0}
		<div class="divide-y divide-gray-100">
			{#each articles as article (article.id)}
				<ArticleListItem {article} />
			{/each}
		</div>
	{:else if !loading}
		<div class="py-16 text-center">
			<ArticleIcon size={64} class="mx-auto text-gray-300" />
			<h3 class="mt-4 text-lg font-medium text-gray-900">{m.no_items({ items: m.articles() })}</h3>
			<p class="mt-2 text-gray-500">{m.be_first()}</p>
		</div>
	{/if}

	<!-- Loading State -->
	{#if loading}
		<LoadingState />
	{/if}

	<!-- End of List -->
	<EndOfList show={!hasMore && articles.length > 0 && !loading} />
</div>
