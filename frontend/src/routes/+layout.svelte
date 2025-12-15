<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import WalletButton from '$lib/components/WalletButton.svelte';
	import Sidebar from '$lib/components/Sidebar.svelte';
	import * as m from '$lib/paraglide/messages';
	import { page } from '$app/state';
	import { locales, getLocale, localizeHref } from '$lib/paraglide/runtime';
	import { getWalletAddress } from '$lib/stores/wallet.svelte';

	let { children } = $props();

	let walletAddress = $derived(getWalletAddress());
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<div class="flex min-h-screen">
	<!-- Fixed Sidebar -->
	<Sidebar {walletAddress} />

	<!-- Main Content Area (with left margin for sidebar) -->
	<div class="ml-64 flex min-h-screen flex-1 flex-col">
		<!-- Header -->
		<header class="sticky top-0 z-30 border-b border-gray-200 bg-white/80 backdrop-blur-sm">
			<div class="flex h-16 items-center justify-end px-6">
				<!-- Right side: Language switcher + Wallet -->
				<div class="flex items-center gap-4">
					<!-- Language Switcher -->
					<div class="relative">
						<div class="flex items-center gap-1 rounded-lg bg-gray-100 p-1">
							{#each locales as locale}
								<a
									href={localizeHref(page.url.pathname, { locale })}
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

					<!-- Wallet Button -->
					<WalletButton />
				</div>
			</div>
		</header>

		<!-- Main Content -->
		<main class="flex-1">
			{@render children()}
		</main>

		<!-- Footer -->
		<footer class="border-t border-gray-200 bg-white">
			<div class="px-6 py-8">
				<div class="flex flex-col items-center justify-between gap-4 sm:flex-row">
					<!-- Left: Brand & Description -->
					<div class="flex items-center gap-2 text-gray-600">
						<div class="flex h-6 w-6 items-center justify-center rounded bg-blue-600">
							<svg class="h-4 w-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
								/>
							</svg>
						</div>
						<span class="text-sm">{m.tagline()}</span>
					</div>

					<!-- Center: Links -->
					<nav class="flex items-center gap-6 text-sm text-gray-500">
						<a
							href="https://github.com"
							target="_blank"
							rel="noopener"
							class="transition-colors hover:text-gray-900"
						>
							GitHub
						</a>
						<a href="/" class="transition-colors hover:text-gray-900">
							{m.docs()}
						</a>
						<a href="/" class="transition-colors hover:text-gray-900">
							{m.about()}
						</a>
					</nav>

					<!-- Right: Copyright -->
					<p class="text-sm text-gray-400">
						© {new Date().getFullYear()} DBlog. {m.rights_reserved()}
					</p>
				</div>
			</div>
		</footer>
	</div>
</div>
