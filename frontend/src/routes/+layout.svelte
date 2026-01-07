<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import WalletButton from '$lib/components/WalletButton.svelte';
	import Sidebar from '$lib/components/Sidebar.svelte';
	import SearchButton from '$lib/components/SearchButton.svelte';
	import ArticleSearch from '$lib/components/ArticleSearch.svelte';
	import * as m from '$lib/paraglide/messages';
	import { page } from '$app/state';
	import { locales, getLocale, localizeHref } from '$lib/paraglide/runtime';
	import { getWalletAddress } from '$lib/stores/wallet.svelte';
	import { SettingsIcon, MenuIcon } from '$lib/components/icons';

	let { children } = $props();

	let walletAddress = $derived(getWalletAddress());

	// Search modal state (for header button)
	let searchOpen = $state(false);

	// Sidebar state
	let sidebarCollapsed = $state(false);
	let mobileMenuOpen = $state(false);

	function toggleSidebarCollapse() {
		sidebarCollapsed = !sidebarCollapsed;
	}

	function openMobileMenu() {
		mobileMenuOpen = true;
	}

	function closeMobileMenu() {
		mobileMenuOpen = false;
	}
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<div class="flex min-h-screen">
	<!-- Fixed Sidebar -->
	<Sidebar
		{walletAddress}
		collapsed={sidebarCollapsed}
		mobileOpen={mobileMenuOpen}
		onToggleCollapse={toggleSidebarCollapse}
		onCloseMobile={closeMobileMenu}
	/>

	<!-- Main Content Area (with left margin for sidebar) -->
	<div
		class="main-content flex min-h-screen flex-1 flex-col transition-all duration-300"
		style:--sidebar-width={sidebarCollapsed ? '4rem' : '16rem'}
	>
		<!-- Header -->
		<header class="sticky top-0 z-30 border-b border-gray-200 bg-white/80 backdrop-blur-sm">
			<div class="flex h-16 items-center justify-between px-4 md:justify-end md:px-6">
				<!-- Mobile Menu Button (visible on mobile only) -->
				<button
					type="button"
					class="rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 md:hidden"
					onclick={openMobileMenu}
					aria-label="Open menu"
				>
					<MenuIcon size={24} />
				</button>

				<!-- Right side: Search + Language switcher + Settings + Wallet -->
				<div class="flex items-center gap-4">
					<!-- Search Button (icon only in header) -->
					<SearchButton onclick={() => (searchOpen = true)} variant="icon" />

					<!-- Language Switcher -->
					<div class="relative">
						<div class="flex items-center gap-1 rounded-lg bg-gray-100 p-1">
							{#each locales as locale}
								<a
									href={localizeHref(page.url.pathname, { locale })}
									data-sveltekit-reload
									class="rounded-md px-3 py-1.5 text-sm font-medium transition-colors"
									class:bg-white={getLocale() === locale}
									class:text-gray-900={getLocale() === locale}
									class:shadow-sm={getLocale() === locale}
									class:text-gray-600={getLocale() !== locale}
									class:hover:text-gray-900={getLocale() !== locale}
								>
									{locale === 'en-us' ? 'EN' : '中'}
								</a>
							{/each}
						</div>
					</div>

					<!-- Settings Button -->
					<a
						href={localizeHref('/settings')}
						class="rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
						title={m.settings()}
					>
						<SettingsIcon size={20} />
					</a>

					<!-- Wallet Button -->
					<WalletButton />
				</div>
			</div>
		</header>

		<!-- Main Content -->
		<main class="flex-1">
			{@render children()}
		</main>
	</div>
</div>

<!-- Search Modal (for header button) -->
<ArticleSearch bind:open={searchOpen} onClose={() => (searchOpen = false)} />
