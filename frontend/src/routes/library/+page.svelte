<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import * as m from '$lib/paraglide/messages';
	import {
		client,
		USER_LIKED_ARTICLES_QUERY,
		USER_DISLIKED_ARTICLES_QUERY,
		USER_COLLECTED_ARTICLES_QUERY,
		USER_COMMENTED_ARTICLES_QUERY,
		type ArticleData,
		type EvaluationWithArticle,
		type CollectionWithArticle,
		type CommentWithArticle
	} from '$lib/graphql';
	import { getWalletAddress, isWalletConnected } from '$lib/stores/wallet.svelte';
	import ArticleListItem from '$lib/components/ArticleListItem.svelte';

	type TabType = 'liked' | 'disliked' | 'collected' | 'commented';

	const PAGE_SIZE = 20;

	let activeTab = $state<TabType>('liked');
	let articles = $state<ArticleData[]>([]);
	let loading = $state(false);
	let hasMore = $state(true);
	let offset = $state(0);

	let walletAddress = $derived(getWalletAddress());
	let connected = $derived(isWalletConnected());

	const tabs: { key: TabType; label: () => string }[] = [
		{ key: 'liked', label: () => m.library_liked() },
		{ key: 'disliked', label: () => m.library_disliked() },
		{ key: 'collected', label: () => m.library_collected() },
		{ key: 'commented', label: () => m.library_commented() }
	];

	function getQueryForTab(tab: TabType) {
		switch (tab) {
			case 'liked':
				return USER_LIKED_ARTICLES_QUERY;
			case 'disliked':
				return USER_DISLIKED_ARTICLES_QUERY;
			case 'collected':
				return USER_COLLECTED_ARTICLES_QUERY;
			case 'commented':
				return USER_COMMENTED_ARTICLES_QUERY;
		}
	}

	async function fetchArticles(reset = false) {
		if (!walletAddress || loading) return;

		loading = true;
		const currentOffset = reset ? 0 : offset;

		try {
			const query = getQueryForTab(activeTab);
			const result = await client
				.query(query, {
					userId: walletAddress.toLowerCase(),
					limit: PAGE_SIZE,
					offset: currentOffset
				})
				.toPromise();

			if (result.error) {
				throw new Error(result.error.message);
			}

			let newArticles: ArticleData[] = [];

			if (activeTab === 'liked' || activeTab === 'disliked') {
				const evaluations = (result.data?.evaluations || []) as EvaluationWithArticle[];
				newArticles = evaluations.map((e) => e.article);
			} else if (activeTab === 'collected') {
				const collections = (result.data?.collections || []) as CollectionWithArticle[];
				newArticles = collections.map((c) => c.article);
			} else if (activeTab === 'commented') {
				const comments = (result.data?.comments || []) as CommentWithArticle[];
				newArticles = comments.map((c) => c.article);
			}

			// Deduplicate articles by id
			const seen = new Set<string>();
			newArticles = newArticles.filter((a) => {
				if (seen.has(a.id)) return false;
				seen.add(a.id);
				return true;
			});

			if (reset) {
				articles = newArticles;
				offset = PAGE_SIZE;
			} else {
				const existingIds = new Set(articles.map((a) => a.id));
				const uniqueNew = newArticles.filter((a) => !existingIds.has(a.id));
				articles = [...articles, ...uniqueNew];
				offset = currentOffset + PAGE_SIZE;
			}

			hasMore = newArticles.length === PAGE_SIZE;
		} catch (e) {
			console.error('Failed to fetch articles:', e);
		} finally {
			loading = false;
		}
	}

	function switchTab(tab: TabType) {
		if (tab === activeTab) return;
		activeTab = tab;
		articles = [];
		offset = 0;
		hasMore = true;
		fetchArticles(true);
	}

	$effect(() => {
		const addr = walletAddress;
		untrack(() => {
			if (addr) {
				fetchArticles(true);
			} else {
				articles = [];
			}
		});
	});

	onMount(() => {
		const handleScroll = () => {
			if (loading || !hasMore) return;

			const scrollTop = window.scrollY;
			const scrollHeight = document.documentElement.scrollHeight;
			const clientHeight = window.innerHeight;

			if (scrollHeight - scrollTop - clientHeight < 200) {
				fetchArticles();
			}
		};

		window.addEventListener('scroll', handleScroll);
		return () => window.removeEventListener('scroll', handleScroll);
	});
</script>

<div class="mx-auto max-w-3xl px-6 py-8">
	<!-- Page Header -->
	<div class="mb-8">
		<h1 class="text-2xl font-bold text-gray-900">{m.nav_library()}</h1>
	</div>

	{#if !connected}
		<div class="py-16 text-center">
			<svg class="mx-auto h-16 w-16 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
			</svg>
			<h3 class="mt-4 text-lg font-medium text-gray-900">{m.please_connect_wallet()}</h3>
		</div>
	{:else}
		<!-- Tabs -->
		<div class="mb-6 border-b border-gray-200">
			<nav class="-mb-px flex gap-6">
				{#each tabs as tab}
					<button
						type="button"
						onclick={() => switchTab(tab.key)}
						class="whitespace-nowrap border-b-2 px-1 pb-3 text-sm font-medium transition-colors"
						class:border-blue-500={activeTab === tab.key}
						class:text-blue-600={activeTab === tab.key}
						class:border-transparent={activeTab !== tab.key}
						class:text-gray-500={activeTab !== tab.key}
						class:hover:border-gray-300={activeTab !== tab.key}
						class:hover:text-gray-700={activeTab !== tab.key}
					>
						{tab.label()}
					</button>
				{/each}
			</nav>
		</div>

		<!-- Articles List -->
		{#if articles.length > 0}
			<div class="divide-y divide-gray-100">
				{#each articles as article (article.id)}
					<ArticleListItem {article} />
				{/each}
			</div>
		{:else if !loading}
			<div class="py-16 text-center">
				<svg class="mx-auto h-16 w-16 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
				</svg>
				<h3 class="mt-4 text-lg font-medium text-gray-900">{m.library_empty()}</h3>
			</div>
		{/if}

		<!-- Loading -->
		{#if loading}
			<div class="flex justify-center py-8">
				<div class="flex items-center gap-3 text-gray-500">
					<svg class="h-6 w-6 animate-spin" fill="none" viewBox="0 0 24 24">
						<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
						<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
					</svg>
					<span>{m.loading()}</span>
				</div>
			</div>
		{/if}

		<!-- End of List -->
		{#if !hasMore && articles.length > 0 && !loading}
			<div class="py-8 text-center text-gray-500">
				<p>{m.no_more_articles()}</p>
			</div>
		{/if}
	{/if}
</div>
