<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { page } from '$app/stores';
	import * as m from '$lib/paraglide/messages';
	import {
		client,
		USER_BY_ID_QUERY,
		ARTICLES_BY_AUTHOR_QUERY,
		USER_FOLLOWERS_QUERY,
		USER_FOLLOWING_QUERY,
		USER_TRANSACTIONS_QUERY,
		type ArticleData,
		type UserData,
		type FollowData,
		type TransactionData
	} from '$lib/graphql';
	import { getWalletAddress, isWalletConnected } from '$lib/stores/wallet.svelte';
	import { updateProfile } from '$lib/contracts';
	import ArticleListItem from '$lib/components/ArticleListItem.svelte';
	import { getAvatarUrl, uploadImage } from '$lib/arweave';
	import { getIrysNetwork, getConfig } from '$lib/config';
	import { shortAddress, formatDate, formatEth } from '$lib/utils';
	import ImageProcessor from '$lib/components/ImageProcessor.svelte';
	import { LockIcon, SpinnerIcon } from '$lib/components/icons';
	import { 
		getStoredSessionKey, 
		isSessionKeyExpired, 
		getSessionKeyBalance,
		reauthorizeSessionKey,
		extendSessionKey,
		revokeSessionKey,
		withdrawAllFromSessionKey,
		createNewSessionKey,
		type StoredSessionKey
	} from '$lib/sessionKey';
	import { formatEthDisplay } from '$lib/data';
	import { getBlockExplorerTxUrl } from '$lib/chain';
	import { getNativeTokenSymbol } from '$lib/priceService';

	type TabType = 'articles' | 'followers' | 'following' | 'about' | 'sessionkey';

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

	// Session Key state
	let sessionKey = $state<StoredSessionKey | null>(null);
	let sessionKeyBalance = $state<bigint>(0n);
	let sessionKeyTransactions = $state<TransactionData[]>([]);
	let loadingSessionKey = $state(false);
	let loadingTransactions = $state(false);
	let reauthorizing = $state(false);
	let withdrawing = $state(false);
	let creatingNewKey = $state(false);
	let extending = $state(false);
	let sessionKeyError = $state('');
	let transactionsOffset = $state(0);
	let hasMoreTransactions = $state(true);
	const TRANSACTIONS_PAGE_SIZE = 10;
	let nativeSymbol = $state('ETH');

	const tabs: { key: TabType; label: () => string }[] = [
		{ key: 'articles', label: () => m.articles() },
		{ key: 'followers', label: () => m.followers() },
		{ key: 'following', label: () => m.following_count() },
		{ key: 'about', label: () => m.about_me() },
		{ key: 'sessionkey', label: () => 'Session Key' }
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

	async function fetchSessionKeyInfo() {
		if (loadingSessionKey) return;
		loadingSessionKey = true;

		try {
			const sk = getStoredSessionKey();
			if (sk) {
				sessionKey = sk;
				const balance = await getSessionKeyBalance(sk.address);
				sessionKeyBalance = balance;
			} else {
				sessionKey = null;
				sessionKeyBalance = 0n;
			}
			// Always fetch transactions by user wallet address
			await fetchUserTransactions(true);
		} catch (e) {
			console.error('Failed to fetch session key info:', e);
		} finally {
			loadingSessionKey = false;
		}
	}

	async function fetchUserTransactions(reset = false) {
		if (!walletAddress || loadingTransactions) return;

		loadingTransactions = true;
		const currentOffset = reset ? 0 : transactionsOffset;

		try {
			const result = await client
				.query(USER_TRANSACTIONS_QUERY, {
					userId: walletAddress.toLowerCase(),
					limit: TRANSACTIONS_PAGE_SIZE,
					offset: currentOffset
				})
				.toPromise();

			const newTransactions = result.data?.transactions || [];

			if (reset) {
				sessionKeyTransactions = newTransactions;
				transactionsOffset = TRANSACTIONS_PAGE_SIZE;
			} else {
				sessionKeyTransactions = [...sessionKeyTransactions, ...newTransactions];
				transactionsOffset = currentOffset + TRANSACTIONS_PAGE_SIZE;
			}

			hasMoreTransactions = newTransactions.length === TRANSACTIONS_PAGE_SIZE;
		} catch (e) {
			console.error('Failed to fetch user transactions:', e);
		} finally {
			loadingTransactions = false;
		}
	}

	async function handleReauthorize() {
		if (!sessionKey || reauthorizing) return;
		reauthorizing = true;
		sessionKeyError = '';

		try {
			const updated = await reauthorizeSessionKey(sessionKey);
			sessionKey = updated;
			await fetchSessionKeyInfo();
		} catch (e) {
			console.error('Failed to reauthorize session key:', e);
			sessionKeyError = 'Failed to reauthorize: ' + (e instanceof Error ? e.message : 'Unknown error');
		} finally {
			reauthorizing = false;
		}
	}

	async function handleWithdrawAll() {
		if (!sessionKey || withdrawing) return;
		
		const balance = sessionKeyBalance;
		if (balance === 0n) {
			sessionKeyError = 'No balance to withdraw';
			return;
		}

		if (!confirm(`Withdraw all balance (${formatEthDisplay(balance)} ${nativeSymbol}) from Session Key to your main wallet?`)) {
			return;
		}

		withdrawing = true;
		sessionKeyError = '';

		try {
			await withdrawAllFromSessionKey(sessionKey.address);
			await fetchSessionKeyInfo();
		} catch (e) {
			console.error('Failed to withdraw:', e);
			sessionKeyError = 'Failed to withdraw: ' + (e instanceof Error ? e.message : 'Unknown error');
		} finally {
			withdrawing = false;
		}
	}

	async function handleCreateNewKey() {
		if (creatingNewKey) return;
		creatingNewKey = true;
		sessionKeyError = '';

		try {
			const newKey = await createNewSessionKey(false);
			sessionKey = newKey;
			await fetchSessionKeyInfo();
		} catch (e) {
			if (e instanceof Error && e.message === 'User cancelled Session Key creation') {
				// User cancelled, do nothing
				console.log('User cancelled Session Key creation');
			} else {
				console.error('Failed to create session key:', e);
				sessionKeyError = 'Failed to create: ' + (e instanceof Error ? e.message : 'Unknown error');
			}
		} finally {
			creatingNewKey = false;
		}
	}

	async function handleRevoke() {
		if (!sessionKey || !confirm('Are you sure you want to revoke this Session Key? This action cannot be undone.')) return;
		sessionKeyError = '';

		try {
			await revokeSessionKey();
			await fetchSessionKeyInfo();
		} catch (e) {
			console.error('Failed to revoke session key:', e);
			sessionKeyError = 'Failed to revoke: ' + (e instanceof Error ? e.message : 'Unknown error');
		}
	}

	async function handleExtendSessionKey() {
		if (!sessionKey || extending) return;
		extending = true;
		sessionKeyError = '';

		try {
			const updated = await extendSessionKey(sessionKey);
			sessionKey = updated;
			await fetchSessionKeyInfo();
		} catch (e) {
			console.error('Failed to extend session key:', e);
			sessionKeyError = 'Failed to extend: ' + (e instanceof Error ? e.message : 'Unknown error');
		} finally {
			extending = false;
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
		} else if (tab === 'sessionkey') {
			fetchSessionKeyInfo();
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
				
				// Check URL parameter for tab
				const urlTab = $page.url.searchParams.get('tab');
				if (urlTab && ['articles', 'followers', 'following', 'about', 'sessionkey'].includes(urlTab)) {
					activeTab = urlTab as TabType;
					if (urlTab === 'sessionkey') {
						fetchSessionKeyInfo();
					}
				}
			} else {
				user = null;
				articles = [];
				followers = [];
				following = [];
			}
		});
	});

	onMount(async () => {
		nativeSymbol = getNativeTokenSymbol();
		
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

<svelte:head>
	<title>{m.profile ? m.profile() : 'Profile'} - {getConfig().appName}</title>
</svelte:head>

<div class="mx-auto max-w-3xl px-6 py-8">
	{#if !connected}
		<div class="py-16 text-center">
			<LockIcon size={64} class="mx-auto text-gray-300" />
			<h3 class="mt-4 text-lg font-medium text-gray-900">{m.please_connect_wallet()}</h3>
		</div>
	{:else}
		<!-- Profile Header -->
		<div class="mb-8">
			<div class="flex items-start gap-4">
				<!-- Avatar -->
				{#if getAvatarUrl(user?.avatar)}
					<img
						src={getAvatarUrl(user?.avatar)}
						alt="Avatar"
						class="h-20 w-20 rounded-full object-cover"
					/>
				{:else}
					<div
						class="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-blue-400 to-purple-500 text-2xl font-bold text-white"
					>
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
							{m.member_since()}
							{formatDate(user.createdAt)}
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
									<img
										src={getAvatarUrl(follower.avatar)}
										alt=""
										class="h-12 w-12 rounded-full object-cover"
									/>
								{:else}
									<div
										class="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-blue-400 to-purple-500 text-sm font-medium text-white"
									>
										{follower.nickname
											? follower.nickname.slice(0, 2).toUpperCase()
											: follower.id.slice(2, 4).toUpperCase()}
									</div>
								{/if}
								<div class="flex-1">
									<p class="font-medium text-gray-900">
										{follower.nickname || shortAddress(follower.id)}
									</p>
									<p class="text-sm text-gray-500">
										{follower.totalArticles}
										{m.articles().toLowerCase()}
									</p>
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
									<img
										src={getAvatarUrl(followingUser.avatar)}
										alt=""
										class="h-12 w-12 rounded-full object-cover"
									/>
								{:else}
									<div
										class="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-blue-400 to-purple-500 text-sm font-medium text-white"
									>
										{followingUser.nickname
											? followingUser.nickname.slice(0, 2).toUpperCase()
											: followingUser.id.slice(2, 4).toUpperCase()}
									</div>
								{/if}
								<div class="flex-1">
									<p class="font-medium text-gray-900">
										{followingUser.nickname || shortAddress(followingUser.id)}
									</p>
									<p class="text-sm text-gray-500">
										{followingUser.totalArticles}
										{m.articles().toLowerCase()}
									</p>
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
									<img
										src={avatarUrl}
										alt="Avatar"
										class="mt-2 h-24 w-24 rounded-full object-cover"
									/>
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
					<SpinnerIcon size={24} class="text-gray-500" />
					<span>{m.loading()}</span>
				</div>
			</div>
		{:else if activeTab === 'sessionkey'}
			<div class="py-4">
				{#if loadingSessionKey}
					<div class="flex justify-center py-8">
						<SpinnerIcon size={32} class="text-gray-500" />
					</div>
				{:else}
					<div class="space-y-6">
						<!-- Error Message -->
						{#if sessionKeyError}
							<div class="rounded-lg border border-red-200 bg-red-50 p-4">
								<p class="text-sm text-red-800">{sessionKeyError}</p>
							</div>
						{/if}

						{#if sessionKey}
							<!-- Session Key Info -->
							<div class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
								<div class="mb-6 flex items-center justify-between">
									<h3 class="text-lg font-semibold text-gray-900">Session Key Information</h3>
									<button
										type="button"
										onclick={handleCreateNewKey}
										disabled={creatingNewKey}
										class="text-sm text-blue-600 hover:text-blue-700 disabled:opacity-50"
									>
										{creatingNewKey ? 'Creating...' : 'Create New'}
									</button>
								</div>

								<!-- Two-column grid layout -->
								<div class="grid grid-cols-1 gap-6 md:grid-cols-2">
									<!-- Left Column: Key Details -->
									<div class="space-y-4">
										<!-- Address -->
										<div>
											<p class="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">Address</p>
											<p class="break-all font-mono text-xs text-gray-700">{sessionKey.address}</p>
										</div>

										<!-- Balance -->
										<div>
											<p class="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">Balance</p>
											<p class="text-2xl font-bold text-gray-900">
												{formatEthDisplay(sessionKeyBalance)}
												<span class="ml-1 text-base font-normal text-gray-500">{nativeSymbol}</span>
											</p>
										</div>
									</div>

									<!-- Right Column: Status & Actions -->
									<div class="space-y-4">
										<!-- Status & Expiry Time in one row -->
										<div class="flex items-start justify-between gap-4">
											<!-- Status Badge -->
											<div>
												<p class="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">Status</p>
												{#if isSessionKeyExpired(sessionKey)}
													<span class="inline-flex items-center gap-1.5 rounded-full bg-red-100 px-3 py-1.5 text-sm font-medium text-red-800">
														<svg class="h-2 w-2 fill-current" viewBox="0 0 8 8"><circle cx="4" cy="4" r="4" /></svg>
														Expired
													</span>
												{:else}
													<span class="inline-flex items-center gap-1.5 rounded-full bg-green-100 px-3 py-1.5 text-sm font-medium text-green-800">
														<svg class="h-2 w-2 fill-current" viewBox="0 0 8 8"><circle cx="4" cy="4" r="4" /></svg>
														Active
													</span>
												{/if}
											</div>

											<!-- Expiry Time -->
											<div class="text-right">
												<p class="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">
													{isSessionKeyExpired(sessionKey) ? 'Expired At' : 'Expires At'}
												</p>
												<p class="text-sm text-gray-700">
													{new Date(sessionKey.validUntil * 1000).toLocaleDateString('en-US', {
														year: 'numeric',
														month: 'short',
														day: 'numeric'
													})}
												</p>
												<p class="text-xs text-gray-500">
													{new Date(sessionKey.validUntil * 1000).toLocaleTimeString('en-US', {
														hour: '2-digit',
														minute: '2-digit'
													})}
												</p>
											</div>
										</div>

										<!-- Action Buttons -->
										<div class="flex gap-2">
											{#if !isSessionKeyExpired(sessionKey)}
												<button
													type="button"
													onclick={handleExtendSessionKey}
													disabled={extending}
													class="flex-1 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
												>
													{extending ? '...' : '延期'}
												</button>
											{:else}
												<button
													type="button"
													onclick={handleReauthorize}
													disabled={reauthorizing}
													class="flex-1 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
												>
													{reauthorizing ? '...' : '重授权'}
												</button>
											{/if}

											<button
												type="button"
												onclick={handleWithdrawAll}
												disabled={withdrawing || sessionKeyBalance === 0n}
												class="flex-1 rounded-lg bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
											>
												{withdrawing ? '...' : '提现'}
											</button>

											<button
												type="button"
												onclick={handleRevoke}
												class="flex-1 rounded-lg border border-red-300 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
											>
												撤销
											</button>
										</div>
									</div>
								</div>
							</div>
						{:else}
							<!-- No Session Key -->
							<div class="rounded-lg border border-gray-200 bg-gray-50 p-8 text-center">
								<p class="text-gray-600">No Session Key found</p>
								<p class="mt-2 text-sm text-gray-500">
									Session Keys are automatically created when you perform actions like publishing articles or commenting.
								</p>
								<button
									type="button"
									onclick={handleCreateNewKey}
									disabled={creatingNewKey}
									class="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
								>
									{creatingNewKey ? 'Creating...' : 'Create Session Key Now'}
								</button>
							</div>
						{/if}

						<!-- Recent Transactions (always shown) -->
						<div class="rounded-lg border border-gray-200 bg-white p-6">
							<h3 class="mb-4 text-lg font-semibold text-gray-900">Recent Transactions</h3>

							{#if sessionKeyTransactions.length > 0}
								<div class="divide-y divide-gray-100">
									{#each sessionKeyTransactions as tx}
										{@const viewUrl = getBlockExplorerTxUrl(tx.txHash)}
										<div class="py-3">
											<div class="grid grid-cols-1 gap-3 md:grid-cols-2">
												<div class="flex items-center gap-2">
													<span class="inline-flex items-center rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-800">
														{tx.method}
													</span>
													<span class="font-semibold text-gray-900">
														{formatEthDisplay(BigInt(tx.value))} {nativeSymbol}
													</span>
												</div>
												<div class="flex items-center justify-between gap-4 md:justify-end">
													<span class="text-xs text-gray-500">
														Fee: {formatEthDisplay(BigInt(tx.feeAmount))} {nativeSymbol}
													</span>
													{#if viewUrl}
														<a
															href={viewUrl}
															target="_blank"
															rel="noopener noreferrer"
															class="whitespace-nowrap text-sm text-blue-600 hover:text-blue-700"
														>
															View →
														</a>
													{/if}
												</div>
												<div class="text-xs text-gray-500">
													Contract: {shortAddress(tx.target)}
												</div>
												<div class="text-xs text-gray-400 md:text-right">
													{new Date(tx.createdAt).toLocaleString()}
												</div>
											</div>
										</div>
									{/each}
								</div>

								<!-- Load More Button -->
								{#if hasMoreTransactions}
									<div class="mt-4 text-center">
										<button
											type="button"
											onclick={() => fetchUserTransactions(false)}
											disabled={loadingTransactions}
											class="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
										>
											{loadingTransactions ? 'Loading...' : 'Load More'}
										</button>
									</div>
								{/if}
							{:else}
								<p class="text-sm text-gray-500">No transactions found</p>
							{/if}
						</div>
					</div>
				{/if}
			</div>
		{/if}
	{/if}
</div>
