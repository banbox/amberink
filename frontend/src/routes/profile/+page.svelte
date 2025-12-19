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
	import { updateProfile } from '$lib/contracts';
	import ArticleListItem from '$lib/components/ArticleListItem.svelte';
	import { getAvatarUrl, uploadImage } from '$lib/arweave';
	import { getIrysNetwork } from '$lib/config';
	import { shortAddress, formatDate } from '$lib/utils';
	import ImageProcessor from '$lib/components/ImageProcessor.svelte';

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

	// Profile editing state (now stored on-chain via events)
	let editingProfile = $state(false);
	let nicknameInput = $state('');
	let avatarInput = $state('');
	let avatarFile = $state<File | null>(null);
	let avatarPreviewUrl = $state<string | null>(null);
	let bioInput = $state('');
	let savingProfile = $state(false);
	let profileError = $state('');

	let walletAddress = $derived(getWalletAddress());
	let connected = $derived(isWalletConnected());

	const tabs: { key: TabType; label: () => string }[] = [
		{ key: 'articles', label: () => m.articles() },
		{ key: 'followers', label: () => m.followers() },
		{ key: 'following', label: () => m.following_count() },
		{ key: 'about', label: () => m.about_me() }
	];

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

	function startEditProfile() {
		nicknameInput = user?.nickname || '';
		avatarInput = user?.avatar || '';
		avatarFile = null;
		avatarPreviewUrl = getAvatarUrl(user?.avatar) || null;
		bioInput = user?.bio || '';
		profileError = '';
		editingProfile = true;
	}

	function handleAvatarProcessed(file: File, previewUrl: string) {
		avatarFile = file;
		avatarPreviewUrl = previewUrl;
		// Clear text input since we're using file upload
		avatarInput = '';
	}

	function handleAvatarRemoved() {
		avatarFile = null;
		avatarPreviewUrl = null;
		avatarInput = '';
	}

	async function saveProfile() {
		if (!walletAddress) return;
		savingProfile = true;
		profileError = '';

		try {
			let finalAvatarId = avatarInput;

			// If there's a new avatar file, upload it to Arweave first
			if (avatarFile) {
				const network = getIrysNetwork();
				finalAvatarId = await uploadImage(avatarFile, network);
			}

			await updateProfile(nicknameInput, finalAvatarId, bioInput);
			// Wait a bit for SubSquid to index the event
			await new Promise(resolve => setTimeout(resolve, 2000));
			// Refresh user data
			await fetchUserProfile();
			editingProfile = false;
			avatarFile = null;
			avatarPreviewUrl = null;
		} catch (e) {
			console.error('Failed to update profile:', e);
			profileError = e instanceof Error ? e.message : 'Failed to update profile';
		} finally {
			savingProfile = false;
		}
	}

	function cancelEditProfile() {
		editingProfile = false;
		profileError = '';
	}


	$effect(() => {
		const addr = walletAddress;
		untrack(() => {
			if (addr) {
				fetchUserProfile();
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
				{#if getAvatarUrl(user?.avatar)}
					<img src={getAvatarUrl(user?.avatar)} alt="Avatar" class="h-20 w-20 rounded-full object-cover" />
				{:else}
					<div class="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-blue-400 to-purple-500 text-2xl font-bold text-white">
						{walletAddress?.slice(2, 4).toUpperCase()}
					</div>
				{/if}

				<div class="flex-1">
					<h1 class="text-2xl font-bold text-gray-900">
						{user?.nickname || shortAddress(walletAddress || '')}
					</h1>
					{#if user?.nickname}
						<p class="text-sm text-gray-500">{walletAddress}</p>
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
								{#if getAvatarUrl(follower.avatar)}
									<img src={getAvatarUrl(follower.avatar)} alt="" class="h-12 w-12 rounded-full object-cover" />
								{:else}
									<div class="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-blue-400 to-purple-500 text-sm font-medium text-white">
										{follower.nickname ? follower.nickname.slice(0, 2).toUpperCase() : follower.id.slice(2, 4).toUpperCase()}
									</div>
								{/if}
								<div class="flex-1">
									<p class="font-medium text-gray-900">{follower.nickname || shortAddress(follower.id)}</p>
									<p class="text-sm text-gray-500">{follower.totalArticles} {m.articles().toLowerCase()}</p>
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
								{#if getAvatarUrl(followingUser.avatar)}
									<img src={getAvatarUrl(followingUser.avatar)} alt="" class="h-12 w-12 rounded-full object-cover" />
								{:else}
									<div class="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-blue-400 to-purple-500 text-sm font-medium text-white">
										{followingUser.nickname ? followingUser.nickname.slice(0, 2).toUpperCase() : followingUser.id.slice(2, 4).toUpperCase()}
									</div>
								{/if}
								<div class="flex-1">
									<p class="font-medium text-gray-900">{followingUser.nickname || shortAddress(followingUser.id)}</p>
									<p class="text-sm text-gray-500">{followingUser.totalArticles} {m.articles().toLowerCase()}</p>
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
				<div class="mb-6 flex items-center justify-between">
					<h3 class="text-lg font-medium text-gray-900">{m.about_me()}</h3>
					{#if !editingProfile}
						<button
							type="button"
							onclick={startEditProfile}
							class="text-sm text-blue-600 hover:text-blue-700"
						>
							{m.edit_profile()}
						</button>
					{/if}
				</div>

				{#if editingProfile}
					<div class="space-y-4">
						<!-- Nickname -->
						<div>
							<label for="nickname" class="mb-1 block text-sm font-medium text-gray-700">
								{m.nickname()}
							</label>
							<input
								id="nickname"
								type="text"
								bind:value={nicknameInput}
								class="w-full rounded-lg border border-gray-300 p-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
								placeholder={m.nickname_placeholder()}
								maxlength="64"
							/>
							<p class="mt-1 text-xs text-gray-400">{m.max_chars({ count: 64 })}</p>
						</div>

						<!-- Avatar Upload -->
						<div>
							<ImageProcessor
								label={m.avatar()}
								aspectRatio={1}
								maxFileSize={100 * 1024}
								maxOutputWidth={400}
								maxOutputHeight={400}
								circular={true}
								previewHeightClass="h-32 w-32"
								initialPreviewUrl={avatarPreviewUrl ?? undefined}
								disabled={savingProfile}
								onImageProcessed={handleAvatarProcessed}
								onImageRemoved={handleAvatarRemoved}
							/>
						</div>

						<!-- Bio -->
						<div>
							<label for="bio" class="mb-1 block text-sm font-medium text-gray-700">
								{m.bio()}
							</label>
							<textarea
								id="bio"
								bind:value={bioInput}
								class="w-full rounded-lg border border-gray-300 p-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
								rows="4"
								placeholder={m.bio_placeholder()}
								maxlength="256"
							></textarea>
							<p class="mt-1 text-xs text-gray-400">{m.max_chars({ count: 256 })}</p>
						</div>

						<!-- Error message -->
						{#if profileError}
							<p class="text-sm text-red-600">{profileError}</p>
						{/if}

						<!-- Buttons -->
						<div class="flex gap-2">
							<button
								type="button"
								onclick={saveProfile}
								disabled={savingProfile}
								class="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
							>
								{savingProfile ? m.saving() : m.save()}
							</button>
							<button
								type="button"
								onclick={cancelEditProfile}
								disabled={savingProfile}
								class="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
							>
								{m.cancel()}
							</button>
						</div>
					</div>
				{:else}
					<!-- Display profile info -->
					<div class="space-y-4">
						<!-- Nickname -->
						<div>
							<p class="text-sm font-medium text-gray-500">{m.nickname()}</p>
							<p class="mt-1 text-gray-900">{user?.nickname || m.not_set()}</p>
						</div>

						<!-- Avatar -->
						{#if user?.avatar}
							{@const avatarUrl = getAvatarUrl(user.avatar)}
							{#if avatarUrl}
								<div>
									<p class="text-sm font-medium text-gray-500">{m.avatar()}</p>
									<img src={avatarUrl} alt="Avatar" class="mt-2 h-24 w-24 rounded-full object-cover" />
								</div>
							{/if}
						{/if}

						<!-- Bio -->
						<div>
							<p class="text-sm font-medium text-gray-500">{m.bio()}</p>
							<p class="mt-1 whitespace-pre-wrap text-gray-900">{user?.bio || m.no_bio()}</p>
						</div>
					</div>
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
