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

	const PAGE_SIZE = 20;

	// State
	let articles = $state<ArticleData[]>([]);
	let loading = $state(false);
	let hasMore = $state(true);
	let offset = $state(0);
	let error = $state<string | null>(null);
	let selectedCategory = $state<number | null>(null);

	// Initialize category from URL in browser only
	onMount(() => {
		const cat = page.url.searchParams.get('category');
		selectedCategory = cat ? parseInt(cat) : null;
	});

	// Fetch articles from SubSquid
	async function fetchArticles(reset = false) {
		if (loading) return;

		loading = true;
		error = null;

		const currentOffset = reset ? 0 : offset;

		try {
			const query = selectedCategory !== null ? ARTICLES_QUERY : ALL_ARTICLES_QUERY;
			const variables =
				selectedCategory !== null
					? { limit: PAGE_SIZE, offset: currentOffset, categoryId: selectedCategory.toString() }
					: { limit: PAGE_SIZE, offset: currentOffset };

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
