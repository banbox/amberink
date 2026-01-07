<script lang="ts">
	import { page } from '$app/state';
	import * as m from '$lib/paraglide/messages';
	import { client, USER_FOLLOWING_QUERY, type FollowData } from '$lib/graphql';
	import { shortAddress } from '$lib/utils';
	import { untrack } from 'svelte';
	import SearchButton from './SearchButton.svelte';
	import ArticleSearch from './ArticleSearch.svelte';
	import {
		HomeIcon,
		BookmarkIcon,
		UserIcon,
		PencilIcon,
		SpinnerIcon,
		ChevronLeftIcon,
		ChevronRightIcon,
		CloseIcon,
		SearchIcon
	} from './icons';
	import UserAvatar from './UserAvatar.svelte';
	import { getConfig, envName } from '$lib/config';
	import { SUPPORTED_CHAINS } from '$lib/chains';
	import { localizeHref } from '$lib/paraglide/runtime';

	interface Props {
		walletAddress?: string | null;
		collapsed?: boolean;
		mobileOpen?: boolean;
		onToggleCollapse?: () => void;
		onCloseMobile?: () => void;
	}

	let {
		walletAddress = null,
		collapsed = false,
		mobileOpen = false,
		onToggleCollapse,
		onCloseMobile
	}: Props = $props();

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

	// Close mobile sidebar when clicking a link
	function handleNavClick() {
		if (mobileOpen && onCloseMobile) {
			onCloseMobile();
		}
	}
</script>

<svelte:window onkeydown={handleGlobalKeydown} />

<!-- Mobile Overlay -->
{#if mobileOpen}
	<button
		type="button"
		class="fixed inset-0 z-40 bg-black/50 md:hidden"
		onclick={onCloseMobile}
		aria-label="Close menu"
	></button>
{/if}

<aside
	class="fixed left-0 top-0 z-50 flex h-screen flex-col border-r border-gray-200 bg-white transition-all duration-300"
	class:w-64={!collapsed}
	class:w-16={collapsed}
	class:-translate-x-full={!mobileOpen}
	class:translate-x-0={mobileOpen}
	class:md:translate-x-0={true}
>
	<!-- Logo -->
	<div
		class="flex h-16 items-center border-b border-gray-100 px-4"
		class:justify-center={collapsed}
	>
		<a
			href={localizeHref('/')}
			class="flex items-center gap-2"
			title={m.slogan()}
			onclick={handleNavClick}
		>
			<img src="/logo.png" alt="AmberInk" class="h-8 w-8 rounded-lg" />
			{#if !collapsed}
				<img src="/logo_t.png" alt="AmberInk" class="h-6" />
			{/if}
		</a>
		<!-- Mobile Close Button -->
		<button
			type="button"
			class="ml-auto rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 md:hidden"
			onclick={onCloseMobile}
			aria-label="Close menu"
		>
			<CloseIcon size={20} />
		</button>
	</div>

	<!-- Navigation Section -->
	<nav class="flex-1 overflow-y-auto px-2 py-4" class:px-3={!collapsed}>
		<!-- Search Button -->
		{#if collapsed}
			<div class="mb-4 flex justify-center">
				<button
					type="button"
					class="rounded-lg p-2.5 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
					onclick={openSearch}
					title={m.search()}
				>
					<SearchIcon size={20} />
				</button>
			</div>
		{:else}
			<div class="mb-4 px-3">
				<SearchButton onclick={openSearch} />
			</div>
		{/if}
		<ul class="space-y-1">
			{#each navItems as item}
				<li>
					<a
						href={localizeHref(item.href)}
						class="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors"
						class:justify-center={collapsed}
						class:bg-gray-100={isActive(item.href)}
						class:text-gray-900={isActive(item.href)}
						class:text-gray-600={!isActive(item.href)}
						class:hover:bg-gray-50={!isActive(item.href)}
						class:hover:text-gray-900={!isActive(item.href)}
						title={collapsed ? getLabel(item.labelKey) : undefined}
						onclick={handleNavClick}
					>
						{#if item.icon === 'home'}
							<HomeIcon size={20} />
						{:else if item.icon === 'library'}
							<BookmarkIcon size={20} />
						{:else if item.icon === 'profile'}
							<UserIcon size={20} />
						{/if}
						{#if !collapsed}
							<span>{getLabel(item.labelKey)}</span>
						{/if}
					</a>
				</li>
			{/each}
		</ul>

		<!-- Write Button -->
		<div
			class="mt-6"
			class:flex={collapsed}
			class:justify-center={collapsed}
			class:px-3={!collapsed}
		>
			{#if collapsed}
				<a
					href={localizeHref('/publish')}
					class="flex h-10 w-10 items-center justify-center rounded-full bg-blue-600 text-white transition-colors hover:bg-blue-700"
					title={m.write()}
					onclick={handleNavClick}
				>
					<PencilIcon size={20} />
				</a>
			{:else}
				<a
					href={localizeHref('/publish')}
					class="flex w-full items-center justify-center gap-2 rounded-full bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700"
					onclick={handleNavClick}
				>
					<PencilIcon size={16} />
					<span>{m.write()}</span>
				</a>
			{/if}
		</div>

		<!-- Following Users (hidden when collapsed) -->
		{#if !collapsed}
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
										onclick={handleNavClick}
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
		{/if}
	</nav>

	<!-- Environment Info (hidden when collapsed) -->
	{#if !collapsed}
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
	{/if}

	<!-- Footer Info (hidden when collapsed) -->
	{#if !collapsed}
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
				<a href={localizeHref('/')} class="transition-colors" onclick={handleNavClick}>
					{m.about()}
				</a>
			</div>
			<p class="mt-1 text-xs text-gray-400">
				© {new Date().getFullYear()} AmberInk
			</p>
		</div>
	{/if}

	<!-- Collapse Toggle Button (desktop only) -->
	<div class="hidden border-t border-gray-100 md:block">
		<button
			type="button"
			class="flex w-full items-center justify-center py-3 text-gray-400 transition-colors hover:bg-gray-50 hover:text-gray-600"
			onclick={onToggleCollapse}
			title={collapsed ? m.expand() : m.collapse()}
		>
			{#if collapsed}
				<ChevronRightIcon size={20} />
			{:else}
				<ChevronLeftIcon size={20} />
			{/if}
		</button>
	</div>
</aside>

<!-- Search Modal -->
<ArticleSearch bind:open={searchOpen} onClose={closeSearch} />
