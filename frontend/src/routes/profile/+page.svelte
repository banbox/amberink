<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import * as m from '$lib/paraglide/messages';
	import {
		client,
		USER_BY_ID_QUERY,
		ARTICLES_BY_AUTHOR_QUERY,
		USER_FOLLOWERS_QUERY,
		USER_FOLLOWING_QUERY,
		type ArticleData,
		type UserData,
		type FollowData
	} from '$lib/graphql';
	import { getWalletAddress, isWalletConnected } from '$lib/stores/wallet.svelte';
	import ArticleListItem from '$lib/components/ArticleListItem.svelte';

	type TabType = 'articles' | 'followers' | 'following' | 'about';

	const PAGE_SIZE = 20;

	let activeTab = $state<TabType>('articles');
	let user = $state<UserData | null>(null);
	let articles = $state<ArticleData[]>([]);
	let followers = $state<FollowData[]>([]);
	let following = $state<FollowData[]>([]);
	let loading = $state(false);
	let hasMore = $state(true);
	let offset = $state(0);

	// Profile bio (stored in localStorage for now, could be on Arweave)
	let bio = $state('');
	let editingBio = $state(false);
	let bioInput = $state('');
	let savingBio = $state(false);

	let walletAddress = $derived(getWalletAddress());
	let connected = $derived(isWalletConnected());

	const tabs: { key: TabType; label: () => string }[] = [
		{ key: 'articles', label: () => m.profile_articles() },
		{ key: 'followers', label: () => m.profile_followers() },
		{ key: 'following', label: () => m.profile_following() },
		{ key: 'about', label: () => m.profile_about() }
	];

	function shortAddress(address: string): string {
		if (!address) return '';
		return `${address.slice(0, 6)}...${address.slice(-4)}`;
	}

	function formatDate(dateStr: string): string {
		return new Date(dateStr).toLocaleDateString(undefined, {
			year: 'numeric',
			month: 'long',
			day: 'numeric'
		});
	}

	async function fetchUserProfile() {
		if (!walletAddress) return;

		try {
			const result = await client
				.query(USER_BY_ID_QUERY, { id: walletAddress.toLowerCase() })
				.toPromise();

			if (result.data?.userById) {
				user = result.data.userById;
			}
		} catch (e) {
			console.error('Failed to fetch user profile:', e);
		}
	}

	async function fetchArticles(reset = false) {
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

	async function fetchFollowers(reset = false) {
		if (!walletAddress || loading) return;

		loading = true;
		const currentOffset = reset ? 0 : offset;

		try {
			const result = await client
				.query(USER_FOLLOWERS_QUERY, {
					userId: walletAddress.toLowerCase(),
					limit: PAGE_SIZE,
					offset: currentOffset
				})
				.toPromise();

			const newFollowers = result.data?.follows || [];

			if (reset) {
				followers = newFollowers;
				offset = PAGE_SIZE;
			} else {
				followers = [...followers, ...newFollowers];
				offset = currentOffset + PAGE_SIZE;
			}

			hasMore = newFollowers.length === PAGE_SIZE;
		} catch (e) {
			console.error('Failed to fetch followers:', e);
		} finally {
			loading = false;
		}
	}

	async function fetchFollowing(reset = false) {
		if (!walletAddress || loading) return;

		loading = true;
		const currentOffset = reset ? 0 : offset;

		try {
			const result = await client
				.query(USER_FOLLOWING_QUERY, {
					userId: walletAddress.toLowerCase(),
					limit: PAGE_SIZE,
					offset: currentOffset
				})
				.toPromise();

			const newFollowing = result.data?.follows || [];

			if (reset) {
				following = newFollowing;
				offset = PAGE_SIZE;
			} else {
				following = [...following, ...newFollowing];
				offset = currentOffset + PAGE_SIZE;
			}

			hasMore = newFollowing.length === PAGE_SIZE;
		} catch (e) {
			console.error('Failed to fetch following:', e);
		} finally {
			loading = false;
		}
	}

	function switchTab(tab: TabType) {
		if (tab === activeTab) return;
		activeTab = tab;
		offset = 0;
		hasMore = true;

		if (tab === 'articles') {
			fetchArticles(true);
		} else if (tab === 'followers') {
			fetchFollowers(true);
		} else if (tab === 'following') {
			fetchFollowing(true);
		}
	}

	function loadBio() {
		if (walletAddress) {
			const stored = localStorage.getItem(`profile_bio_${walletAddress.toLowerCase()}`);
			bio = stored || '';
		}
	}

	function startEditBio() {
		bioInput = bio;
		editingBio = true;
	}

	async function saveBio() {
		if (!walletAddress) return;
		savingBio = true;

		// For now, save to localStorage. In production, upload to Arweave with IPFS CID
		localStorage.setItem(`profile_bio_${walletAddress.toLowerCase()}`, bioInput);
		bio = bioInput;
		editingBio = false;
		savingBio = false;
	}

	function cancelEditBio() {
		editingBio = false;
		bioInput = '';
	}

	$effect(() => {
		const addr = walletAddress;
		untrack(() => {
			if (addr) {
				fetchUserProfile();
				loadBio();
				fetchArticles(true);
			} else {
				user = null;
				articles = [];
				followers = [];
				following = [];
			}
		});
	});

	onMount(() => {
		const handleScroll = () => {
			if (loading || !hasMore || activeTab === 'about') return;

			const scrollTop = window.scrollY;
			const scrollHeight = document.documentElement.scrollHeight;
			const clientHeight = window.innerHeight;

			if (scrollHeight - scrollTop - clientHeight < 200) {
				if (activeTab === 'articles') fetchArticles();
				else if (activeTab === 'followers') fetchFollowers();
				else if (activeTab === 'following') fetchFollowing();
			}
		};

		window.addEventListener('scroll', handleScroll);
		return () => window.removeEventListener('scroll', handleScroll);
	});
</script>

<div class="mx-auto max-w-3xl px-6 py-8">
	{#if !connected}
		<div class="py-16 text-center">
			<svg class="mx-auto h-16 w-16 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
			</svg>
			<h3 class="mt-4 text-lg font-medium text-gray-900">{m.please_connect_wallet()}</h3>
		</div>
	{:else}
		<!-- Profile Header -->
		<div class="mb-8">
			<div class="flex items-start gap-4">
				<!-- Avatar -->
				<div class="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-blue-400 to-purple-500 text-2xl font-bold text-white">
					{walletAddress?.slice(2, 4).toUpperCase()}
				</div>

				<div class="flex-1">
					<h1 class="text-2xl font-bold text-gray-900">{shortAddress(walletAddress || '')}</h1>
					{#if user}
						<div class="mt-2 flex items-center gap-4 text-sm text-gray-500">
							<span>{user.totalArticles} {m.profile_articles().toLowerCase()}</span>
							<span>{user.totalFollowers} {m.profile_followers().toLowerCase()}</span>
							<span>{user.totalFollowing} {m.profile_following().toLowerCase()}</span>
						</div>
						<p class="mt-1 text-sm text-gray-400">
							{m.profile_member_since()} {formatDate(user.createdAt)}
						</p>
					{/if}
				</div>
			</div>
		</div>

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

		<!-- Tab Content -->
		{#if activeTab === 'articles'}
			{#if articles.length > 0}
				<div class="divide-y divide-gray-100">
					{#each articles as article (article.id)}
						<ArticleListItem {article} />
					{/each}
				</div>
			{:else if !loading}
				<div class="py-16 text-center">
					<p class="text-gray-500">{m.no_articles()}</p>
				</div>
			{/if}
		{:else if activeTab === 'followers'}
			{#if followers.length > 0}
				<div class="divide-y divide-gray-100">
					{#each followers as follow}
						{@const follower = follow.follower}
						{#if follower}
							<a
								href="/author/{follower.id}"
								class="flex items-center gap-4 py-4 transition-colors hover:bg-gray-50"
							>
								<div class="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-blue-400 to-purple-500 text-sm font-medium text-white">
									{follower.id.slice(2, 4).toUpperCase()}
								</div>
								<div class="flex-1">
									<p class="font-medium text-gray-900">{shortAddress(follower.id)}</p>
									<p class="text-sm text-gray-500">{follower.totalArticles} {m.profile_articles().toLowerCase()}</p>
								</div>
							</a>
						{/if}
					{/each}
				</div>
			{:else if !loading}
				<div class="py-16 text-center">
					<p class="text-gray-500">{m.no_following()}</p>
				</div>
			{/if}
		{:else if activeTab === 'following'}
			{#if following.length > 0}
				<div class="divide-y divide-gray-100">
					{#each following as follow}
						{@const followingUser = follow.following}
						{#if followingUser}
							<a
								href="/author/{followingUser.id}"
								class="flex items-center gap-4 py-4 transition-colors hover:bg-gray-50"
							>
								<div class="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-blue-400 to-purple-500 text-sm font-medium text-white">
									{followingUser.id.slice(2, 4).toUpperCase()}
								</div>
								<div class="flex-1">
									<p class="font-medium text-gray-900">{shortAddress(followingUser.id)}</p>
									<p class="text-sm text-gray-500">{followingUser.totalArticles} {m.profile_articles().toLowerCase()}</p>
								</div>
							</a>
						{/if}
					{/each}
				</div>
			{:else if !loading}
				<div class="py-16 text-center">
					<p class="text-gray-500">{m.no_following()}</p>
				</div>
			{/if}
		{:else if activeTab === 'about'}
			<div class="py-4">
				<div class="mb-4 flex items-center justify-between">
					<h3 class="font-medium text-gray-900">{m.profile_bio()}</h3>
					{#if !editingBio}
						<button
							type="button"
							onclick={startEditBio}
							class="text-sm text-blue-600 hover:text-blue-700"
						>
							{m.profile_edit()}
						</button>
					{/if}
				</div>

				{#if editingBio}
					<div class="space-y-4">
						<textarea
							bind:value={bioInput}
							class="w-full rounded-lg border border-gray-300 p-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
							rows="4"
							placeholder={m.profile_bio_placeholder()}
						></textarea>
						<div class="flex gap-2">
							<button
								type="button"
								onclick={saveBio}
								disabled={savingBio}
								class="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
							>
								{savingBio ? m.profile_saving() : m.profile_save()}
							</button>
							<button
								type="button"
								onclick={cancelEditBio}
								class="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
							>
								{m.cancel()}
							</button>
						</div>
					</div>
				{:else}
					<p class="text-gray-600">
						{bio || m.profile_no_bio()}
					</p>
				{/if}
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
	{/if}
</div>
