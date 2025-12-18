<script lang="ts">
	import { page } from '$app/state';
	import * as m from '$lib/paraglide/messages';
	import { client, USER_FOLLOWING_QUERY, type FollowData } from '$lib/graphql';
	import { getAvatarUrl } from '$lib/arweave';
	import { shortAddress } from '$lib/utils';
	import { untrack } from 'svelte';
	import SearchButton from './SearchButton.svelte';
	import ArticleSearch from './ArticleSearch.svelte';

	interface Props {
		walletAddress?: string | null;
	}

	let { walletAddress = null }: Props = $props();

	// Search modal state
	let searchOpen = $state(false);

	function openSearch() {
		searchOpen = true;
	}

	function closeSearch() {
		searchOpen = false;
	}

	// Keyboard shortcut for search (Cmd/Ctrl + K)
	function handleGlobalKeydown(e: KeyboardEvent) {
		if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
			e.preventDefault();
			searchOpen = true;
		}
	}

	let followingUsers = $state<FollowData[]>([]);
	let loadingFollowing = $state(false);

	// Navigation items
	const navItems = [
		{ href: '/', icon: 'home', labelKey: 'home_page' },
		{ href: '/library', icon: 'library', labelKey: 'library' },
		{ href: '/profile', icon: 'profile', labelKey: 'profile' },
		{ href: '/stories', icon: 'stories', labelKey: 'my_stories' }
	];

	// Check if current path matches nav item
	function isActive(href: string): boolean {
		if (href === '/') {
			return page.url.pathname === '/';
		}
		return page.url.pathname.startsWith(href);
	}

	// Fetch following users
	async function fetchFollowingUsers() {
		if (!walletAddress) {
			followingUsers = [];
			return;
		}

		loadingFollowing = true;
		try {
			const result = await client
				.query(USER_FOLLOWING_QUERY, {
					userId: walletAddress.toLowerCase(),
					limit: 20,
					offset: 0
				})
				.toPromise();

			if (result.data?.follows) {
				followingUsers = result.data.follows;
			}
		} catch (e) {
			console.error('Failed to fetch following users:', e);
		} finally {
			loadingFollowing = false;
		}
	}

	// Watch for wallet address changes
	$effect(() => {
		const addr = walletAddress;
		untrack(() => {
			if (addr) {
				fetchFollowingUsers();
			} else {
				followingUsers = [];
			}
		});
	});

	// Get label from message key
	function getLabel(key: string): string {
		return (m as unknown as Record<string, () => string>)[key]?.() || key;
	}
</script>

<svelte:window onkeydown={handleGlobalKeydown} />

<aside class="fixed left-0 top-0 z-40 flex h-screen w-64 flex-col border-r border-gray-200 bg-white">
	<!-- Logo -->
	<div class="flex h-16 items-center border-b border-gray-100 px-6">
		<a href="/" class="flex items-center gap-2">
			<div class="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600">
				<svg class="h-5 w-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
					/>
				</svg>
			</div>
			<span class="text-xl font-bold text-gray-900">DBlog</span>
		</a>
	</div>

	<!-- Navigation Section -->
	<nav class="flex-1 overflow-y-auto px-3 py-4">
		<!-- Search Button -->
		<div class="mb-4 px-3">
			<SearchButton onclick={openSearch} />
		</div>
		<ul class="space-y-1">
			{#each navItems as item}
				<li>
					<a
						href={item.href}
						class="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors"
						class:bg-gray-100={isActive(item.href)}
						class:text-gray-900={isActive(item.href)}
						class:text-gray-600={!isActive(item.href)}
						class:hover:bg-gray-50={!isActive(item.href)}
						class:hover:text-gray-900={!isActive(item.href)}
					>
						{#if item.icon === 'home'}
							<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
							</svg>
						{:else if item.icon === 'library'}
							<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
							</svg>
						{:else if item.icon === 'profile'}
							<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
							</svg>
						{:else if item.icon === 'stories'}
							<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
							</svg>
						{/if}
						<span>{getLabel(item.labelKey)}</span>
					</a>
				</li>
			{/each}
		</ul>

		<!-- Write Button -->
		<div class="mt-6 px-3">
			<a
				href="/publish"
				class="flex w-full items-center justify-center gap-2 rounded-full bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700"
			>
				<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
				</svg>
				<span>{m.write()}</span>
			</a>
		</div>

		<!-- Following Users -->
		<div class="mt-6 border-t border-gray-200 pt-6">
			<h3 class="mb-3 px-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
			{m.following_list()}
		</h3>

				{#if !walletAddress}
				<p class="px-3 text-sm text-gray-400">{m.please_connect_wallet()}</p>
			{:else if loadingFollowing}
				<div class="flex items-center justify-center py-4">
					<svg class="h-5 w-5 animate-spin text-gray-400" fill="none" viewBox="0 0 24 24">
						<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
						<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
					</svg>
				</div>
			{:else if followingUsers.length === 0}
				<p class="px-3 text-sm text-gray-400">{m.no_following()}</p>
			{:else}
				<ul class="space-y-1">
					{#each followingUsers as follow}
						{@const user = follow.following}
						{#if user}
							<li>
								<a
									href="/u/{user.id}"
									class="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm transition-colors hover:bg-gray-50"
								>
									{#if getAvatarUrl(user.avatar)}
										<img src={getAvatarUrl(user.avatar)} alt="" class="h-6 w-6 rounded-full object-cover" />
									{:else}
										<div class="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-blue-400 to-purple-500 text-xs font-medium text-white">
											{user.id.slice(2, 4).toUpperCase()}
										</div>
									{/if}
									<span class="truncate text-gray-700">{user.nickname || shortAddress(user.id)}</span>
								</a>
							</li>
						{/if}
					{/each}
				</ul>
			{/if}
		</div>
	</nav>
</aside>

<!-- Search Modal -->
<ArticleSearch bind:open={searchOpen} onClose={closeSearch} />
