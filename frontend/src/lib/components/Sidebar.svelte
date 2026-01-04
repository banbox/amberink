<script lang="ts">
	import { page } from '$app/state';
	import * as m from '$lib/paraglide/messages';
	import { client, USER_FOLLOWING_QUERY, type FollowData } from '$lib/graphql';
	import { shortAddress } from '$lib/utils';
	import { untrack } from 'svelte';
	import SearchButton from './SearchButton.svelte';
	import ArticleSearch from './ArticleSearch.svelte';
	import { HomeIcon, BookmarkIcon, UserIcon, PencilIcon, SpinnerIcon } from './icons';
	import UserAvatar from './UserAvatar.svelte';
	import { getConfig, envName } from '$lib/config';
	import { SUPPORTED_CHAINS } from '$lib/chains';
	import { localizeHref } from '$lib/paraglide/runtime';

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

	// Environment info
	const config = $derived(getConfig());
	const chainInfo = $derived(SUPPORTED_CHAINS[config.chainId]);
	const chainName = $derived(chainInfo?.name || `Chain ${config.chainId}`);
	const rpcHost = $derived.by(() => {
		try {
			return new URL(config.rpcUrl).host;
		} catch {
			return config.rpcUrl;
		}
	});

	// Navigation items
	const navItems = [
		{ href: '/', icon: 'home', labelKey: 'home' },
		{ href: '/library', icon: 'library', labelKey: 'library' },
		{ href: '/profile', icon: 'profile', labelKey: 'profile' }
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

<aside
	class="fixed left-0 top-0 z-40 flex h-screen w-64 flex-col border-r border-gray-200 bg-white"
>
	<!-- Logo -->
	<div class="flex h-16 items-center border-b border-gray-100 px-6">
		<a href={localizeHref('/')} class="flex items-center gap-2" title={m.slogan()}>
			<img src="/logo.png" alt="AmberInk" class="h-8 w-8 rounded-lg" />
			<img src="/logo_t.png" alt="AmberInk" class="h-6" />
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
						href={localizeHref(item.href)}
						class="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors"
						class:bg-gray-100={isActive(item.href)}
						class:text-gray-900={isActive(item.href)}
						class:text-gray-600={!isActive(item.href)}
						class:hover:bg-gray-50={!isActive(item.href)}
						class:hover:text-gray-900={!isActive(item.href)}
					>
						{#if item.icon === 'home'}
							<HomeIcon size={20} />
						{:else if item.icon === 'library'}
							<BookmarkIcon size={20} />
						{:else if item.icon === 'profile'}
							<UserIcon size={20} />
						{/if}
						<span>{getLabel(item.labelKey)}</span>
					</a>
				</li>
			{/each}
		</ul>

		<!-- Write Button -->
		<div class="mt-6 px-3">
			<a
				href={localizeHref('/publish')}
				class="flex w-full items-center justify-center gap-2 rounded-full bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700"
			>
				<PencilIcon size={16} />
				<span>{m.write()}</span>
			</a>
		</div>

		<!-- Following Users -->
		<div class="mt-6 border-t border-gray-200 pt-6">
			<h3 class="mb-3 px-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
				{m.following_list()}
			</h3>

			{#if !walletAddress}
				<p class="px-3 text-sm text-gray-400">{m.connect_wallet_first()}</p>
			{:else if loadingFollowing}
				<div class="flex items-center justify-center py-4">
					<SpinnerIcon size={20} class="text-gray-400" />
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
									href={localizeHref(`/u?id=${user.id}`)}
									class="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm transition-colors hover:bg-gray-50"
								>
									<UserAvatar {user} size="xs" />
									<span class="truncate text-gray-700"
										>{user.nickname || shortAddress(user.id)}</span
									>
								</a>
							</li>
						{/if}
					{/each}
				</ul>
			{/if}
		</div>
	</nav>

	<!-- Environment Info -->
	<div class="border-t border-gray-100 px-4 py-3">
		<div class="space-y-1 text-xs">
			<div class="flex flex-row gap-1">
				<span class="font-medium text-gray-600">Chain:</span>
				<span class="text-gray-700">{chainName}</span>
			</div>
			<div class="flex flex-col gap-0.5">
				<span class="break-all text-gray-700">{rpcHost}</span>
			</div>
		</div>
	</div>

	<!-- Footer Info -->
	<div class="border-t border-gray-100 px-4 py-3">
		<div class="flex items-center gap-3 text-xs text-gray-600">
			<a
				href="https://github.com/banbox/amberink"
				target="_blank"
				rel="noopener"
				class="transition-colors"
			>
				GitHub
			</a>
			<span class="text-gray-300">·</span>
			<a href={localizeHref('/')} class="transition-colors">
				{m.about()}
			</a>
		</div>
		<p class="mt-1 text-xs text-gray-400">
			© {new Date().getFullYear()} AmberInk
		</p>
	</div>
</aside>

<!-- Search Modal -->
<ArticleSearch bind:open={searchOpen} onClose={closeSearch} />
