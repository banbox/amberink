<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import * as m from '$lib/paraglide/messages';
	import { client, ARTICLES_BY_AUTHOR_QUERY, type ArticleData } from '$lib/graphql';
	import { getWalletAddress, isWalletConnected } from '$lib/stores/wallet.svelte';
	import ArticleListItem from '$lib/components/ArticleListItem.svelte';

	type TabType = 'drafts' | 'published';

	const PAGE_SIZE = 20;
	const DRAFTS_KEY = 'article_drafts';

	interface Draft {
		id: string;
		title: string;
		content: string;
		categoryId: number;
		coverImage?: string;
		createdAt: string;
		updatedAt: string;
	}

	let activeTab = $state<TabType>('published');
	let articles = $state<ArticleData[]>([]);
	let drafts = $state<Draft[]>([]);
	let loading = $state(false);
	let hasMore = $state(true);
	let offset = $state(0);

	let walletAddress = $derived(getWalletAddress());
	let connected = $derived(isWalletConnected());

	const tabs: { key: TabType; label: () => string }[] = [
		{ key: 'drafts', label: () => m.stories_drafts() },
		{ key: 'published', label: () => m.stories_published() }
	];

	function formatDate(dateStr: string): string {
		return new Date(dateStr).toLocaleDateString(undefined, {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		});
	}

	function loadDrafts() {
		if (!walletAddress) {
			drafts = [];
			return;
		}

		const stored = localStorage.getItem(`${DRAFTS_KEY}_${walletAddress.toLowerCase()}`);
		if (stored) {
			try {
				drafts = JSON.parse(stored);
			} catch {
				drafts = [];
			}
		} else {
			drafts = [];
		}
	}

	function deleteDraft(id: string) {
		if (!walletAddress) return;

		drafts = drafts.filter((d) => d.id !== id);
		localStorage.setItem(`${DRAFTS_KEY}_${walletAddress.toLowerCase()}`, JSON.stringify(drafts));
	}

	async function fetchPublished(reset = false) {
		if (!walletAddress || loading) return;

		loading = true;
		const currentOffset = reset ? 0 : offset;

		try {
			const result = await client
				.query(ARTICLES_BY_AUTHOR_QUERY, {
					authorId: walletAddress.toLowerCase(),
					limit: PAGE_SIZE,
					offset: currentOffset
				})
				.toPromise();

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
			console.error('Failed to fetch articles:', e);
		} finally {
			loading = false;
		}
	}

	function switchTab(tab: TabType) {
		if (tab === activeTab) return;
		activeTab = tab;
		offset = 0;
		hasMore = true;

		if (tab === 'published') {
			fetchPublished(true);
		} else {
			loadDrafts();
		}
	}

	$effect(() => {
		const addr = walletAddress;
		const tab = activeTab;
		untrack(() => {
			if (addr) {
				if (tab === 'published') {
					fetchPublished(true);
				} else {
					loadDrafts();
				}
			} else {
				articles = [];
				drafts = [];
			}
		});
	});

	onMount(() => {
		const handleScroll = () => {
			if (loading || !hasMore || activeTab !== 'published') return;

			const scrollTop = window.scrollY;
			const scrollHeight = document.documentElement.scrollHeight;
			const clientHeight = window.innerHeight;

			if (scrollHeight - scrollTop - clientHeight < 200) {
				fetchPublished();
			}
		};

		window.addEventListener('scroll', handleScroll);
		return () => window.removeEventListener('scroll', handleScroll);
	});
</script>

<div class="mx-auto max-w-3xl px-6 py-8">
	<!-- Page Header -->
	<div class="mb-8 flex items-center justify-between">
		<h1 class="text-2xl font-bold text-gray-900">{m.nav_stories()}</h1>
		<a
			href="/publish"
			class="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
		>
			<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
			</svg>
			{m.nav_write()}
		</a>
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
						{#if tab.key === 'drafts' && drafts.length > 0}
							<span class="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
								{drafts.length}
							</span>
						{/if}
					</button>
				{/each}
			</nav>
		</div>

		<!-- Tab Content -->
		{#if activeTab === 'drafts'}
			{#if drafts.length > 0}
				<div class="divide-y divide-gray-100">
					{#each drafts as draft (draft.id)}
						<div class="flex items-start gap-4 py-5">
							<div class="min-w-0 flex-1">
								<h3 class="mb-1 text-lg font-medium text-gray-900">
									{draft.title || 'Untitled Draft'}
								</h3>
								<p class="mb-2 line-clamp-2 text-sm text-gray-600">
									{draft.content?.slice(0, 150) || 'No content'}...
								</p>
								<p class="text-xs text-gray-400">
									Last edited: {formatDate(draft.updatedAt)}
								</p>
							</div>
							<div class="flex gap-2">
								<a
									href="/publish?draft={draft.id}"
									class="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
								>
									Edit
								</a>
								<button
									type="button"
									onclick={() => deleteDraft(draft.id)}
									class="rounded-lg border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50"
								>
									Delete
								</button>
							</div>
						</div>
					{/each}
				</div>
			{:else}
				<div class="py-16 text-center">
					<svg class="mx-auto h-16 w-16 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
					</svg>
					<h3 class="mt-4 text-lg font-medium text-gray-900">{m.stories_empty()}</h3>
					<p class="mt-2 text-gray-500">
						<a href="/publish" class="text-blue-600 hover:underline">{m.nav_write()}</a>
					</p>
				</div>
			{/if}
		{:else}
			{#if articles.length > 0}
				<div class="divide-y divide-gray-100">
					{#each articles as article (article.id)}
						<ArticleListItem {article} />
					{/each}
				</div>
			{:else if !loading}
				<div class="py-16 text-center">
					<svg class="mx-auto h-16 w-16 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
					</svg>
					<h3 class="mt-4 text-lg font-medium text-gray-900">{m.stories_empty()}</h3>
					<p class="mt-2 text-gray-500">
						<a href="/publish" class="text-blue-600 hover:underline">{m.nav_write()}</a>
					</p>
				</div>
			{/if}
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
		{#if !hasMore && articles.length > 0 && !loading && activeTab === 'published'}
			<div class="py-8 text-center text-gray-500">
				<p>{m.no_more_articles()}</p>
			</div>
		{/if}
	{/if}
</div>
