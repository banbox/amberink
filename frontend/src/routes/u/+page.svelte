<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { page } from '$app/stores';
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
	import { shortAddress, formatDate, infiniteScroll } from '$lib/utils';
	import ArticleListItem from '$lib/components/ArticleListItem.svelte';
	import ProfileSkeleton from '$lib/components/ProfileSkeleton.svelte';
	import LoadingState from '$lib/components/LoadingState.svelte';
	import EndOfList from '$lib/components/EndOfList.svelte';
	import UserAvatar from '$lib/components/UserAvatar.svelte';
	import { getConfig } from '$lib/config';
	import { getBlockExplorerAddressUrl } from '$lib/chain';
	import { DocumentIcon } from '$lib/components/icons';

	const PAGE_SIZE = 20;

	let authorId = $state('');
	let user = $state<UserData | null>(null);
	let articles = $state<ArticleData[]>([]);
	let loading = $state(false);
	let isInitialLoading = $state(true); // Track initial page load
	let hasMore = $state(true);
	let offset = $state(0);
	let isFollowing = $state(false);
	let followLoading = $state(false);

	let walletAddress = $derived(getWalletAddress());
	let connected = $derived(isWalletConnected());
	let isOwnProfile = $derived(walletAddress?.toLowerCase() === authorId);

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
			isInitialLoading = false; // Mark initial loading as complete
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
		// Read authorId from URL search params
		authorId = $page.url.searchParams.get('id')?.toLowerCase() || '';
	});

	// Derived user for avatar component
	const avatarUser = $derived({ id: authorId, avatar: user?.avatar });

	// Scroll options for infinite scroll
	const scrollOptions = $derived({
		onLoadMore: () => fetchArticles(),
		canLoad: () => !loading && hasMore
	});
</script>

<svelte:head>
	<title>{user?.nickname || shortAddress(authorId)} - {getConfig().appName}</title>
</svelte:head>

{#if isInitialLoading}
	<!-- Show skeleton during initial load -->
	<ProfileSkeleton />
{:else}
	{@const authorAddressUrl = getBlockExplorerAddressUrl(authorId)}
	<div class="mx-auto max-w-3xl px-6 py-8" use:infiniteScroll={scrollOptions}>
		<!-- Author Header -->
		<div class="mb-8">
			<div class="flex items-start gap-4">
				<!-- Avatar -->
				<UserAvatar user={avatarUser} size="xl" />

				<div class="flex-1">
					<div class="flex items-center gap-4">
						<h1 class="text-2xl font-bold text-gray-900">
							{user?.nickname || shortAddress(authorId)}
						</h1>
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

					{#if authorAddressUrl}
						<a
							href={authorAddressUrl}
							target="_blank"
							rel="noopener noreferrer"
							class="text-sm text-blue-600 hover:text-blue-700 hover:underline"
						>
							{authorId}
						</a>
					{:else}
						<p class="text-sm text-gray-500">{authorId}</p>
					{/if}

					{#if user}
						<div class="mt-2 flex items-center gap-4 text-sm text-gray-500">
							<span>{user.totalArticles} {m.articles().toLowerCase()}</span>
							<span>{user.totalFollowers} {m.followers().toLowerCase()}</span>
							<span>{user.totalFollowing} {m.following().toLowerCase()}</span>
						</div>
						<p class="mt-1 text-sm text-gray-400">
							{m.member_since()}
							{formatDate(user.createdAt)}
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
				<DocumentIcon size={64} class="mx-auto text-gray-300" />
				<h3 class="mt-4 text-lg font-medium text-gray-900">
					{m.no_items({ items: m.articles() })}
				</h3>
			</div>
		{/if}

		<!-- Loading -->
		{#if loading}
			<LoadingState />
		{/if}

		<!-- End of List -->
		<EndOfList show={!hasMore && articles.length > 0 && !loading} />
	</div>
{/if}
