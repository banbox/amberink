<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { page } from '$app/state';
	import * as m from '$lib/paraglide/messages';
	import {
		client,
		USER_BY_ID_QUERY,
		ARTICLES_BY_AUTHOR_QUERY,
		CHECK_FOLLOW_STATUS_QUERY,
		type ArticleData,
		type UserData
	} from '$lib/graphql';
	import { getWalletAddress, isWalletConnected } from '$lib/stores/wallet.svelte';
	import { followUser } from '$lib/contracts';
	import { getAvatarUrl } from '$lib/arweave';
	import ArticleListItem from '$lib/components/ArticleListItem.svelte';

	const PAGE_SIZE = 20;

	let authorId = $derived(page.params.id?.toLowerCase() || '');
	let user = $state<UserData | null>(null);
	let articles = $state<ArticleData[]>([]);
	let loading = $state(false);
	let hasMore = $state(true);
	let offset = $state(0);
	let isFollowing = $state(false);
	let followLoading = $state(false);

	let walletAddress = $derived(getWalletAddress());
	let connected = $derived(isWalletConnected());
	let isOwnProfile = $derived(walletAddress?.toLowerCase() === authorId);

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

	async function fetchAuthorProfile() {
		if (!authorId) return;

		try {
			const result = await client
				.query(USER_BY_ID_QUERY, { id: authorId })
				.toPromise();

			if (result.data?.userById) {
				user = result.data.userById;
			}
		} catch (e) {
			console.error('Failed to fetch author profile:', e);
		}
	}

	async function checkFollowStatus() {
		if (!walletAddress || !authorId || isOwnProfile) return;

		try {
			const result = await client
				.query(CHECK_FOLLOW_STATUS_QUERY, {
					followerId: walletAddress.toLowerCase(),
					followingId: authorId
				})
				.toPromise();

			isFollowing = (result.data?.follows?.length || 0) > 0;
		} catch (e) {
			console.error('Failed to check follow status:', e);
		}
	}

	async function fetchArticles(reset = false) {
		if (!authorId || loading) return;

		loading = true;
		const currentOffset = reset ? 0 : offset;

		try {
			const result = await client
				.query(ARTICLES_BY_AUTHOR_QUERY, {
					authorId: authorId,
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

	async function handleFollow() {
		if (!connected || !authorId || isOwnProfile) return;

		followLoading = true;
		try {
			await followUser(authorId as `0x${string}`, !isFollowing);
			isFollowing = !isFollowing;
		} catch (e) {
			console.error('Failed to follow/unfollow:', e);
		} finally {
			followLoading = false;
		}
	}

	$effect(() => {
		const id = authorId;
		untrack(() => {
			if (id) {
				fetchAuthorProfile();
				fetchArticles(true);
				checkFollowStatus();
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
	<!-- Author Header -->
	<div class="mb-8">
		<div class="flex items-start gap-4">
			<!-- Avatar -->
			{#if getAvatarUrl(user?.avatar)}
				<img src={getAvatarUrl(user?.avatar)} alt="Avatar" class="h-20 w-20 rounded-full object-cover" />
			{:else}
				<div class="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-blue-400 to-purple-500 text-2xl font-bold text-white">
					{authorId.slice(2, 4).toUpperCase()}
				</div>
			{/if}

			<div class="flex-1">
				<div class="flex items-center gap-4">
					<h1 class="text-2xl font-bold text-gray-900">{user?.nickname || shortAddress(authorId)}</h1>
					{#if connected && !isOwnProfile}
						<button
							type="button"
							onclick={handleFollow}
							disabled={followLoading}
							class="rounded-full px-4 py-1.5 text-sm font-medium transition-colors"
							class:bg-blue-600={!isFollowing}
							class:text-white={!isFollowing}
							class:hover:bg-blue-700={!isFollowing}
							class:bg-gray-100={isFollowing}
							class:text-gray-700={isFollowing}
							class:hover:bg-gray-200={isFollowing}
						>
							{#if followLoading}
								{m.processing()}
							{:else if isFollowing}
								{m.following()}
							{:else}
								{m.follow()}
							{/if}
						</button>
					{/if}
				</div>

				{#if user?.nickname}
					<p class="text-sm text-gray-500">{shortAddress(authorId)}</p>
				{/if}

				{#if user}
					<div class="mt-2 flex items-center gap-4 text-sm text-gray-500">
						<span>{user.totalArticles} {m.articles().toLowerCase()}</span>
						<span>{user.totalFollowers} {m.followers().toLowerCase()}</span>
						<span>{user.totalFollowing} {m.following_count().toLowerCase()}</span>
					</div>
					<p class="mt-1 text-sm text-gray-400">
						{m.member_since()} {formatDate(user.createdAt)}
					</p>
					{#if user.bio}
						<p class="mt-3 whitespace-pre-wrap text-gray-600">{user.bio}</p>
					{/if}
				{/if}
			</div>
		</div>
	</div>

	<!-- Section Header -->
	<div class="mb-4 border-b border-gray-200 pb-2">
		<h2 class="text-lg font-semibold text-gray-900">{m.published()}</h2>
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
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
			</svg>
			<h3 class="mt-4 text-lg font-medium text-gray-900">{m.no_articles()}</h3>
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
</div>
