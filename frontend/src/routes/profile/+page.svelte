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
	import { getBlockExplorerTxUrl, getBlockExplorerAddressUrl } from '$lib/chain';
	import { getNativeTokenSymbol } from '$lib/priceService';
	import { localizeHref } from '$lib/paraglide/runtime';

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
		{ key: 'following', label: () => m.following_list() },
		{ key: 'about', label: () => m.about() },
		{ key: 'sessionkey', label: () => m.session_key() }
	];

	async function executeQuery<T>(query: any, variables: Record<string, any>, listKey: string): Promise<T[]> {
		const result = await client.query(query, variables).toPromise();
		return result.data?.[listKey] || [];
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

	async function fetchTabContent(reset = false) {
		if (!walletAddress || loading) return;

		loading = true;
		const currentOffset = reset ? 0 : offset;

		try {
			let newItems: any[] = [];
			if (activeTab === 'articles') {
				newItems = await executeQuery(ARTICLES_BY_AUTHOR_QUERY, {
					authorId: walletAddress.toLowerCase(),
					limit: PAGE_SIZE,
					offset: currentOffset
				}, 'articles');
				articles = reset ? newItems : [...articles, ...newItems];
			} else if (activeTab === 'followers') {
				newItems = await executeQuery(USER_FOLLOWERS_QUERY, {
					userId: walletAddress.toLowerCase(),
					limit: PAGE_SIZE,
					offset: currentOffset
				}, 'follows');
				followers = reset ? newItems : [...followers, ...newItems];
			} else if (activeTab === 'following') {
				newItems = await executeQuery(USER_FOLLOWING_QUERY, {
					userId: walletAddress.toLowerCase(),
					limit: PAGE_SIZE,
					offset: currentOffset
				}, 'follows');
				following = reset ? newItems : [...following, ...newItems];
			}

			if (reset) {
				offset = PAGE_SIZE;
			} else {
				offset = currentOffset + PAGE_SIZE;
			}

			hasMore = newItems.length === PAGE_SIZE;
		} catch (e) {
			console.error(`Failed to fetch ${activeTab}:`, e);
		} finally {
			loading = false;
		}
	}

	async function fetchSessionKeyInfo() {
		if (loadingSessionKey || !walletAddress) return;
		loadingSessionKey = true;

		try {
			const sk = getStoredSessionKey(walletAddress);
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

	async function executeSessionAction(
		actionName: string,
		action: () => Promise<void>,
		errorMessagePrefix: string,
		loadingSetter?: (v: boolean) => void
	) {
		if (loadingSetter) loadingSetter(true);
		sessionKeyError = '';

		try {
			await action();
			await fetchSessionKeyInfo();
		} catch (e) {
			console.error(`Failed to ${actionName}:`, e);
			sessionKeyError = `${errorMessagePrefix}: ` + (e instanceof Error ? e.message : 'Unknown error');
		} finally {
			if (loadingSetter) loadingSetter(false);
		}
	}

	async function handleReauthorize() {
		if (!sessionKey || reauthorizing) return;
		await executeSessionAction(
			'reauthorize session key',
			async () => { sessionKey = await reauthorizeSessionKey(sessionKey!); },
			'Failed to reauthorize',
			(v) => reauthorizing = v
		);
	}

	async function handleWithdrawAll() {
		if (!sessionKey || withdrawing) return;
		
		const balance = sessionKeyBalance;
		if (balance === 0n) {
			sessionKeyError = m.no_balance();
			return;
		}

		if (!confirm(`Withdraw all balance (${formatEthDisplay(balance)} ${nativeSymbol}) from Session Key to your main wallet?`)) {
			return;
		}

		await executeSessionAction(
			'withdraw',
			async () => { await withdrawAllFromSessionKey(sessionKey!.address); },
			'Failed to withdraw',
			(v) => withdrawing = v
		);
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
		if (!sessionKey || !confirm(m.confirm_revoke())) return;
		await executeSessionAction(
			'revoke session key',
			async () => { await revokeSessionKey(); },
			'Failed to revoke'
		);
	}

	async function handleExtendSessionKey() {
		if (!sessionKey || extending) return;
		await executeSessionAction(
			'extend session key',
			async () => { sessionKey = await extendSessionKey(sessionKey!); },
			'Failed to extend',
			(v) => extending = v
		);
	}

	function switchTab(tab: TabType) {
		if (tab === activeTab) return;
		activeTab = tab;
		offset = 0;
		hasMore = true;

		if (tab === 'sessionkey') {
			fetchSessionKeyInfo();
		} else if (tab !== 'about') {
			fetchTabContent(true);
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
				// Use the unified fetch function
				fetchTabContent(true);
			} else {
				user = null;
				articles = [];
				followers = [];
				following = [];
			}
		});
	});

	onMount(() => {
		nativeSymbol = getNativeTokenSymbol();
		
		// Check URL parameter for tab
		const urlTab = $page.url.searchParams.get('tab');
		if (urlTab && ['articles', 'followers', 'following', 'about', 'sessionkey'].includes(urlTab)) {
			activeTab = urlTab as TabType;
			if (urlTab === 'sessionkey') {
				fetchSessionKeyInfo();
			}
		}
		
		const handleScroll = () => {
			if (loading || !hasMore || activeTab === 'about') return;

			const scrollTop = window.scrollY;
			const scrollHeight = document.documentElement.scrollHeight;
			const clientHeight = window.innerHeight;

			if (scrollHeight - scrollTop - clientHeight < 200) {
				if (['articles', 'followers', 'following'].includes(activeTab)) {
					fetchTabContent();
				}
			}
		};

		window.addEventListener('scroll', handleScroll);
		return () => window.removeEventListener('scroll', handleScroll);
	});
</script>

	<title>{m.profile ? m.profile() : 'Profile'} - {getConfig().appName}</title>
</svelte:head>

{#snippet avatar(url: string | undefined | null, name: string | undefined, id: string, sizeClass: string = "h-12 w-12")}
	{#if getAvatarUrl(url)}
		<img
			src={getAvatarUrl(url)}
			alt="Avatar"
			class="{sizeClass} rounded-full object-cover"
		/>
	{:else}
		<div
			class="flex {sizeClass} items-center justify-center rounded-full bg-gradient-to-br from-blue-400 to-purple-500 font-bold text-white shadow-sm"
		>
			<span class="text-sm">
				{name ? name.slice(0, 2).toUpperCase() : id.slice(2, 4).toUpperCase()}
			</span>
		</div>
	{/if}
{/snippet}

{#snippet userList(items: FollowData[], type: 'follower' | 'following', emptyMessage: string)}
	{#if items.length > 0}
		<div class="divide-y divide-gray-100">
			{#each items as item}
				{@const listUser = type === 'follower' ? item.follower : item.following}
				{#if listUser}
					<a
						href={localizeHref(`/u?id=${listUser.id}`)}
						class="flex items-center gap-4 py-4 transition-colors hover:bg-gray-50"
					>
						{@render avatar(listUser.avatar, listUser.nickname, listUser.id)}
						<div class="flex-1">
							<p class="font-medium text-gray-900">
								{listUser.nickname || shortAddress(listUser.id)}
							</p>
							<p class="text-sm text-gray-500">
								{listUser.totalArticles}
								{m.articles().toLowerCase()}
							</p>
						</div>
					</a>
				{/if}
			{/each}
		</div>
	{:else if !loading}
		<div class="py-16 text-center">
			<p class="text-gray-500">{emptyMessage}</p>
		</div>
	{/if}
{/snippet}

<div class="mx-auto max-w-3xl px-6 py-8">
	{#if !connected}
		<div class="py-16 text-center">
			<LockIcon size={64} class="mx-auto text-gray-300" />
			<h3 class="mt-4 text-lg font-medium text-gray-900">{m.connect_wallet_first()}</h3>
		</div>
	{:else}
		<!-- Profile Header -->
		<div class="mb-8">
			<div class="flex items-start gap-4">
				<!-- Avatar -->
				{@render avatar(user?.avatar, user?.nickname, walletAddress || '', "h-20 w-20 text-2xl")}

				<div class="flex-1">
					<h1 class="text-2xl font-bold text-gray-900">
						{user?.nickname || shortAddress(walletAddress || '')}
					</h1>
					{#if user?.nickname}
						{@const userAddressUrl = getBlockExplorerAddressUrl(walletAddress || '')}
						{#if userAddressUrl}
							<a
								href={userAddressUrl}
								target="_blank"
								rel="noopener noreferrer"
								class="text-sm text-blue-600 hover:text-blue-700 hover:underline"
							>
								{walletAddress}
							</a>
						{:else}
							<p class="text-sm text-gray-500">{walletAddress}</p>
						{/if}
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
					<p class="text-gray-500">{m.no_items({ items: m.articles() })}</p>
				</div>
			{/if}
		{:else if activeTab === 'followers'}
			{@render userList(followers, 'follower', m.no_items({ items: 'followers' }))}
		{:else if activeTab === 'following'}
			{@render userList(following, 'following', m.no_items({ items: 'following' }))}
		{:else if activeTab === 'about'}
			<div class="py-4">
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
								placeholder={m.enter_nickname()}
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
					<div class="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
						<div
							class="flex items-center justify-between border-b border-gray-100 bg-gray-50/50 px-6 py-4"
						>
							<h3 class="font-semibold text-gray-900">{m.information()}</h3>
							<button
								type="button"
								onclick={startEditProfile}
								class="rounded-lg bg-white px-4 py-2 text-sm font-medium text-blue-600 shadow-sm ring-1 ring-gray-200 transition-all hover:bg-blue-50 hover:text-blue-700 hover:shadow-md"
							>
								{m.edit_profile()}
							</button>
						</div>

						<div class="p-6 md:p-8">
							<div class="flex flex-col gap-8 md:flex-row md:items-start md:gap-12">
								<!-- Left Column: Avatar -->
								<div class="flex flex-shrink-0 flex-col items-center md:items-start">
									<p class="mb-3 pl-1 text-xs font-bold uppercase tracking-wider text-gray-400">
										{m.avatar()}
									</p>
									{#if user?.avatar}
										{@const avatarUrl = getAvatarUrl(user.avatar)}
										{#if avatarUrl}
											<div class="relative">
												<img
													src={avatarUrl}
													alt="Avatar"
													class="h-40 w-40 rounded-full object-cover shadow-md ring-4 ring-white"
												/>
												<div class="absolute inset-0 rounded-full ring-1 ring-black/5"></div>
											</div>
										{:else}
											<div
												class="flex h-40 w-40 items-center justify-center rounded-full bg-gray-100 text-gray-400 shadow-inner"
											>
												<svg class="h-16 w-16" fill="none" stroke="currentColor" viewBox="0 0 24 24"
													><path
														stroke-linecap="round"
														stroke-linejoin="round"
														stroke-width="1.5"
														d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
													></path></svg
												>
											</div>
										{/if}
									{:else}
										<div
											class="flex h-40 w-40 items-center justify-center rounded-full bg-gradient-to-br from-blue-50 to-indigo-50 text-blue-300 shadow-inner"
										>
											<svg class="h-16 w-16" fill="currentColor" viewBox="0 0 24 24"
												><path
													d="M24 20.993V24H0v-2.996A14.977 14.977 0 0112.004 15c4.904 0 9.26 2.354 11.996 5.993zM16.002 8.999a4 4 0 11-8 0 4 4 0 018 0z"
												/></svg
											>
										</div>
									{/if}
								</div>

								<!-- Right Column: Info -->
								<div class="flex-1 space-y-8 md:mt-2">
									<!-- Nickname -->
									<div>
										<p class="mb-2 text-xs font-bold uppercase tracking-wider text-gray-400">
											{m.nickname()}
										</p>
										<div class="text-xl font-medium text-gray-900 md:text-2xl">
											{user?.nickname || m.not_set()}
										</div>
									</div>

									<!-- Bio -->
									<div>
										<p class="mb-2 text-xs font-bold uppercase tracking-wider text-gray-400">
											{m.bio()}
										</p>
										<div
											class="min-h-[8rem] rounded-xl border border-gray-100 bg-gray-50 p-5 text-base leading-relaxed text-gray-700"
										>
											{user?.bio || m.no_bio()}
										</div>
									</div>
								</div>
							</div>
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
							{@const addressUrl = getBlockExplorerAddressUrl(sessionKey.address)}
							<!-- Session Key Info -->
							<div class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
								<div class="mb-6 flex items-center justify-between">
									<h3 class="text-lg font-semibold text-gray-900">{m.information()}</h3>
									<button
										type="button"
										onclick={handleCreateNewKey}
										disabled={creatingNewKey}
										class="text-sm text-blue-600 hover:text-blue-700 disabled:opacity-50"
									>
										{creatingNewKey ? m.creating() : m.create_new()}
									</button>
								</div>

								<!-- Two-column grid layout -->
								<div class="grid grid-cols-1 gap-6 md:grid-cols-2">
									<!-- Left Column: Key Details -->
									<div class="space-y-4">
										<!-- Address -->
										<div>
											<p class="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">
												{m.address()}
											</p>
											{#if addressUrl}
												<a
													href={addressUrl}
													target="_blank"
													rel="noopener noreferrer"
													class="break-all font-mono text-xs text-blue-600 hover:text-blue-700 hover:underline"
												>
													{sessionKey.address}
												</a>
											{:else}
												<p class="break-all font-mono text-xs text-gray-700">
													{sessionKey.address}
												</p>
											{/if}
										</div>

										<!-- Balance -->
										<div>
											<p class="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">
												{m.balance()}
											</p>
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
												<p class="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">
													{m.status()}
												</p>
												{#if isSessionKeyExpired(sessionKey)}
													<span
														class="inline-flex items-center gap-1.5 rounded-full bg-red-100 px-3 py-1.5 text-sm font-medium text-red-800"
													>
														<svg class="h-2 w-2 fill-current" viewBox="0 0 8 8"
															><circle cx="4" cy="4" r="4" /></svg
														>
														{m.expired()}
													</span>
												{:else}
													<span
														class="inline-flex items-center gap-1.5 rounded-full bg-green-100 px-3 py-1.5 text-sm font-medium text-green-800"
													>
														<svg class="h-2 w-2 fill-current" viewBox="0 0 8 8"
															><circle cx="4" cy="4" r="4" /></svg
														>
														{m.active()}
													</span>
												{/if}
											</div>

											<!-- Expiry Time -->
											<div class="text-right">
												<p class="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">
													{isSessionKeyExpired(sessionKey) ? m.expired_at() : m.expires_at()}
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
													{extending ? m.dots() : m.extend()}
												</button>
											{:else}
												<button
													type="button"
													onclick={handleReauthorize}
													disabled={reauthorizing}
													class="flex-1 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
												>
													{reauthorizing ? m.dots() : m.reauthorize()}
												</button>
											{/if}

											<button
												type="button"
												onclick={handleWithdrawAll}
												disabled={withdrawing || sessionKeyBalance === 0n}
												class="flex-1 rounded-lg bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
											>
												{withdrawing ? m.dots() : m.withdraw()}
											</button>

											<button
												type="button"
												onclick={handleRevoke}
												class="flex-1 rounded-lg border border-red-300 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
											>
												{m.revoke()}
											</button>
										</div>
									</div>
								</div>
							</div>
						{:else}
							<!-- No Session Key -->
							<div class="rounded-lg border border-gray-200 bg-gray-50 p-8 text-center">
								<p class="text-gray-600">{m.no_session_found()}</p>
								<p class="mt-2 text-sm text-gray-500">
									{m.session_auto_create()}
								</p>
								<button
									type="button"
									onclick={handleCreateNewKey}
									disabled={creatingNewKey}
									class="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
								>
									{creatingNewKey ? m.creating() : m.create_now()}
								</button>
							</div>
						{/if}

						<!-- Recent Transactions (always shown) -->
						<div class="rounded-lg border border-gray-200 bg-white p-6">
							<h3 class="mb-4 text-lg font-semibold text-gray-900">{m.recent_transactions()}</h3>

							{#if sessionKeyTransactions.length > 0}
								<div class="divide-y divide-gray-100">
									{#each sessionKeyTransactions as tx}
										{@const viewUrl = getBlockExplorerTxUrl(tx.txHash)}
										<div class="py-3">
											<div class="grid grid-cols-1 gap-3 md:grid-cols-2">
												<div class="flex items-center gap-2">
													<span
														class="inline-flex items-center rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-800"
													>
														{tx.method}
													</span>
													<span class="font-semibold text-gray-900">
														{formatEthDisplay(BigInt(tx.value))}
														{nativeSymbol}
													</span>
												</div>
												<div class="flex items-center justify-between gap-4 md:justify-end">
													<span class="text-xs text-gray-500">
														{m.fee()}: {formatEthDisplay(BigInt(tx.feeAmount))}
														{nativeSymbol}
													</span>
													{#if viewUrl}
														<a
															href={viewUrl}
															target="_blank"
															rel="noopener noreferrer"
															class="whitespace-nowrap text-sm text-blue-600 hover:text-blue-700"
														>
															→
														</a>
													{/if}
												</div>
												<div class="text-xs text-gray-500">
													{m.contract()}: {shortAddress(tx.target)}
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
								<p class="text-sm text-gray-500">{m.data_empty()}</p>
							{/if}
						</div>
					</div>
				{/if}
			</div>
		{/if}
	{/if}
</div>
