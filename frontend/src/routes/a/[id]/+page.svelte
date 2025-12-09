<script lang="ts">
	import type { PageData } from './$types';
	import * as m from '$lib/paraglide/messages';
	import { CATEGORY_KEYS } from '$lib/data';
	import { getCoverImageUrl } from '$lib/arweave';
	import { getArticleWithCache } from '$lib/arweave/cache';
	import type { ArticleMetadata } from '$lib/arweave/types';
	import { onMount } from 'svelte';
	import { marked } from 'marked';
	import DOMPurify from 'dompurify';

	let { data }: { data: PageData } = $props();
	const article = data.article;

	// Article content from Arweave
	let articleContent = $state<ArticleMetadata | null>(null);
	let contentLoading = $state(true);
	let contentError = $state<string | null>(null);

	// Format address to short form
	function shortAddress(address: string): string {
		if (!address) return '';
		return `${address.slice(0, 6)}...${address.slice(-4)}`;
	}

	// Format date - Medium style (e.g., "Dec 9, 2025")
	function formatDate(dateStr: string): string {
		const date = new Date(dateStr);
		return date.toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		});
	}

	// Calculate reading time (words per minute)
	function getReadingTime(content: string): number {
		const wordsPerMinute = 200;
		const wordCount = content.trim().split(/\s+/).length;
		return Math.max(1, Math.ceil(wordCount / wordsPerMinute));
	}

	// Format tips (wei to ETH)
	function formatTips(tips: string): string {
		const wei = BigInt(tips);
		const eth = Number(wei) / 1e18;
		if (eth === 0) return '0';
		if (eth < 0.0001) return '<0.0001';
		return eth.toFixed(4);
	}

	// Get category name
	function getCategoryName(categoryId: string): string {
		const id = parseInt(categoryId);
		const key = CATEGORY_KEYS[id];
		if (!key || key === 'unselected') return '';
		return (m as unknown as Record<string, () => string>)[key]?.() || key;
	}

	// Get cover image URL from Irys mutable folder
	function getCoverUrl(arweaveId: string): string {
		return getCoverImageUrl(arweaveId, true);
	}

	// Share article
	function handleShare() {
		if (navigator.share) {
			navigator.share({
				title: article.title,
				url: window.location.href
			});
		} else {
			navigator.clipboard.writeText(window.location.href);
			alert(m.link_copied());
		}
	}

	const coverUrl = $derived(getCoverUrl(article.arweaveId));
	const categoryName = $derived(getCategoryName(article.categoryId));
	const authorDisplay = $derived(article.originalAuthor || shortAddress(article.author.id));
	const authorAddress = $derived(article.author.id);
	const readingTime = $derived(articleContent?.content ? getReadingTime(articleContent.content) : 0);

	// Fetch article content from Arweave
	onMount(async () => {
		try {
			articleContent = await getArticleWithCache(article.arweaveId);
		} catch (e) {
			contentError = e instanceof Error ? e.message : 'Failed to load article content';
			console.error('Failed to fetch article content:', e);
		} finally {
			contentLoading = false;
		}
	});
</script>

<svelte:head>
	<title>{article.title || `Article #${article.id}`} - DBlog</title>
	<meta name="description" content={articleContent?.summary || article.title || 'DBlog Article'} />
</svelte:head>

<!-- Medium-style article layout -->
<article class="mx-auto w-full max-w-[680px] px-6 py-12">
	<!-- Title -->
	<header class="mb-8">
		<h1 class="mb-6 font-serif text-[32px] font-bold leading-tight text-gray-900 sm:text-[42px]">
			{article.title || `Article #${article.id}`}
		</h1>

		<!-- Author Info Bar -->
		<div class="flex items-center gap-3">
			<!-- Avatar -->
			<a href={`/u/${authorAddress}`} class="shrink-0">
				<div
					class="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 text-sm font-medium text-white"
				>
					{authorDisplay.slice(0, 2).toUpperCase()}
				</div>
			</a>

			<div class="flex flex-1 flex-col">
				<!-- Name & Follow -->
				<div class="flex items-center gap-2">
					<a href={`/u/${authorAddress}`} class="font-medium text-gray-900 hover:underline">
						{authorDisplay}
					</a>
					<span class="text-gray-300">·</span>
					<button
						type="button"
						class="text-sm font-medium text-emerald-600 hover:text-emerald-700"
					>
						{m.follow()}
					</button>
				</div>

				<!-- Read time & Date -->
				<div class="flex items-center gap-1 text-sm text-gray-500">
					{#if readingTime > 0}
						<span>{readingTime} {m.min_read()}</span>
						<span class="mx-1">·</span>
					{/if}
					<time datetime={article.createdAt}>
						{formatDate(article.createdAt)}
					</time>
				</div>
			</div>
		</div>
	</header>

	<!-- Interaction Bar (Top) -->
	<div class="mb-8 flex items-center justify-between border-y border-gray-100 py-3">
		<div class="flex items-center gap-5">
			<!-- Clap/Like -->
			<button
				type="button"
				class="group flex items-center gap-1.5 text-gray-500 transition-colors hover:text-gray-900"
			>
				<svg class="h-6 w-6" viewBox="0 0 24 24" fill="none">
					<path
						d="M8.5 14.5L5.5 11.5C4.67 10.67 4.67 9.33 5.5 8.5C6.33 7.67 7.67 7.67 8.5 8.5L11.5 11.5M11.5 11.5L8.5 8.5C7.67 7.67 7.67 6.33 8.5 5.5C9.33 4.67 10.67 4.67 11.5 5.5L14.5 8.5M11.5 11.5L14.5 8.5M14.5 8.5L17.5 5.5C18.33 4.67 19.67 4.67 20.5 5.5C21.33 6.33 21.33 7.67 20.5 8.5L12 17L8.5 20.5"
						stroke="currentColor"
						stroke-width="1.5"
						stroke-linecap="round"
						stroke-linejoin="round"
					/>
				</svg>
				<span class="text-sm">{article.likes}</span>
			</button>

			<!-- Dislike -->
			<button
				type="button"
				class="group flex items-center gap-1.5 text-gray-500 transition-colors hover:text-gray-900"
				title={m.dislike()}
			>
				<svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						d="M7.5 15h2.25m8.024-9.75c.011.05.028.1.052.148.591 1.2.924 2.55.924 3.977a8.96 8.96 0 01-.999 4.125m.023-8.25c-.076-.365.183-.75.575-.75h.908c.889 0 1.713.518 1.972 1.368.339 1.11.521 2.287.521 3.507 0 1.553-.295 3.036-.831 4.398C20.613 14.547 19.833 15 19 15h-1.053c-.472 0-.745-.556-.5-.96a8.95 8.95 0 00.303-.54m.023-8.25H16.48a4.5 4.5 0 01-1.423-.23l-3.114-1.04a4.5 4.5 0 00-1.423-.23H6.504c-.618 0-1.217.247-1.605.729A11.95 11.95 0 002.25 12c0 .434.023.863.068 1.285C2.427 14.306 3.346 15 4.372 15h3.126c.618 0 .991.724.725 1.282A7.471 7.471 0 007.5 19.5a2.25 2.25 0 002.25 2.25.75.75 0 00.75-.75v-.633c0-.573.11-1.14.322-1.672.304-.76.93-1.33 1.653-1.715a9.04 9.04 0 002.86-2.4c.498-.634 1.226-1.08 2.032-1.08h.384"
					/>
				</svg>
			</button>

			<!-- Comments -->
			<button
				type="button"
				class="group flex items-center gap-1.5 text-gray-500 transition-colors hover:text-gray-900"
				title={m.comments()}
			>
				<svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						d="M12 20.25c4.97 0 9-3.694 9-8.25s-4.03-8.25-9-8.25S3 7.444 3 12c0 2.104.859 4.023 2.273 5.48.432.447.74 1.04.586 1.641a4.483 4.483 0 01-.923 1.785A5.969 5.969 0 006 21c1.282 0 2.47-.402 3.445-1.087.81.22 1.668.337 2.555.337z"
					/>
				</svg>
				<span class="text-sm">0</span>
			</button>
		</div>

		<!-- Right side: Share -->
		<div class="flex items-center gap-3">
			<button
				type="button"
				onclick={handleShare}
				class="text-gray-500 transition-colors hover:text-gray-900"
				title={m.share()}
			>
				<svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						d="M9 8.25H7.5a2.25 2.25 0 00-2.25 2.25v9a2.25 2.25 0 002.25 2.25h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25H15m0-3l-3-3m0 0l-3 3m3-3V15"
					/>
				</svg>
			</button>
		</div>
	</div>

	<!-- Cover Image -->
	<div class="mb-10 overflow-hidden" id="cover-container">
		<img
			src={coverUrl}
			alt={article.title}
			class="h-auto w-full object-cover"
			onerror={(e) => {
				const target = e.currentTarget as HTMLImageElement;
				const container = target.parentElement;
				if (container) container.style.display = 'none';
			}}
		/>
	</div>

	<!-- Content -->
	<div class="prose prose-lg max-w-none">
		{#if contentLoading}
			<div class="flex items-center justify-center py-16">
				<div class="flex items-center gap-3 text-gray-500">
					<svg class="h-5 w-5 animate-spin" fill="none" viewBox="0 0 24 24">
						<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
						<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
					</svg>
					<span>{m.loading_content()}</span>
				</div>
			</div>
		{:else if contentError}
			<div class="rounded-lg border border-red-200 bg-red-50 p-6 text-center">
				<p class="text-red-700">{contentError}</p>
				<a
					href={`https://gateway.irys.xyz/${article.arweaveId}`}
					target="_blank"
					rel="noopener noreferrer"
					class="mt-3 inline-block text-sm text-red-600 underline hover:text-red-800"
				>
					{m.view_on_arweave()}
				</a>
			</div>
		{:else if articleContent?.content}
			<div class="prose prose-lg prose-gray max-w-none font-serif">
				{@html DOMPurify.sanitize(marked(articleContent.content) as string)}
			</div>
		{:else}
			<div class="py-8 text-center text-gray-500">
				<p>{m.no_content()}</p>
			</div>
		{/if}
	</div>

	<!-- Postscript / Summary -->
	{#if articleContent?.summary}
		<aside class="mt-12 border-l-2 border-gray-200 pl-5 text-gray-600 italic">
			<p>{articleContent.summary}</p>
		</aside>
	{/if}

	<!-- Interaction Bar (Bottom) -->
	<div class="mt-12 flex items-center justify-between border-y border-gray-100 py-3">
		<div class="flex items-center gap-5">
			<!-- Clap/Like -->
			<button
				type="button"
				class="group flex items-center gap-1.5 text-gray-500 transition-colors hover:text-gray-900"
			>
				<svg class="h-6 w-6" viewBox="0 0 24 24" fill="none">
					<path
						d="M8.5 14.5L5.5 11.5C4.67 10.67 4.67 9.33 5.5 8.5C6.33 7.67 7.67 7.67 8.5 8.5L11.5 11.5M11.5 11.5L8.5 8.5C7.67 7.67 7.67 6.33 8.5 5.5C9.33 4.67 10.67 4.67 11.5 5.5L14.5 8.5M11.5 11.5L14.5 8.5M14.5 8.5L17.5 5.5C18.33 4.67 19.67 4.67 20.5 5.5C21.33 6.33 21.33 7.67 20.5 8.5L12 17L8.5 20.5"
						stroke="currentColor"
						stroke-width="1.5"
						stroke-linecap="round"
						stroke-linejoin="round"
					/>
				</svg>
				<span class="text-sm">{article.likes}</span>
			</button>

			<!-- Dislike -->
			<button
				type="button"
				class="group flex items-center gap-1.5 text-gray-500 transition-colors hover:text-gray-900"
				title={m.dislike()}
			>
				<svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						d="M7.5 15h2.25m8.024-9.75c.011.05.028.1.052.148.591 1.2.924 2.55.924 3.977a8.96 8.96 0 01-.999 4.125m.023-8.25c-.076-.365.183-.75.575-.75h.908c.889 0 1.713.518 1.972 1.368.339 1.11.521 2.287.521 3.507 0 1.553-.295 3.036-.831 4.398C20.613 14.547 19.833 15 19 15h-1.053c-.472 0-.745-.556-.5-.96a8.95 8.95 0 00.303-.54m.023-8.25H16.48a4.5 4.5 0 01-1.423-.23l-3.114-1.04a4.5 4.5 0 00-1.423-.23H6.504c-.618 0-1.217.247-1.605.729A11.95 11.95 0 002.25 12c0 .434.023.863.068 1.285C2.427 14.306 3.346 15 4.372 15h3.126c.618 0 .991.724.725 1.282A7.471 7.471 0 007.5 19.5a2.25 2.25 0 002.25 2.25.75.75 0 00.75-.75v-.633c0-.573.11-1.14.322-1.672.304-.76.93-1.33 1.653-1.715a9.04 9.04 0 002.86-2.4c.498-.634 1.226-1.08 2.032-1.08h.384"
					/>
				</svg>
			</button>

			<!-- Comments -->
			<button
				type="button"
				class="group flex items-center gap-1.5 text-gray-500 transition-colors hover:text-gray-900"
				title={m.comments()}
			>
				<svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						d="M12 20.25c4.97 0 9-3.694 9-8.25s-4.03-8.25-9-8.25S3 7.444 3 12c0 2.104.859 4.023 2.273 5.48.432.447.74 1.04.586 1.641a4.483 4.483 0 01-.923 1.785A5.969 5.969 0 006 21c1.282 0 2.47-.402 3.445-1.087.81.22 1.668.337 2.555.337z"
					/>
				</svg>
				<span class="text-sm">0</span>
			</button>
		</div>

		<!-- Right side: Share -->
		<div class="flex items-center gap-3">
			<button
				type="button"
				onclick={handleShare}
				class="text-gray-500 transition-colors hover:text-gray-900"
				title={m.share()}
			>
				<svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						d="M9 8.25H7.5a2.25 2.25 0 00-2.25 2.25v9a2.25 2.25 0 002.25 2.25h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25H15m0-3l-3-3m0 0l-3 3m3-3V15"
					/>
				</svg>
			</button>
		</div>
	</div>

	<!-- Comments Section -->
	<section class="mt-10">
		<h2 class="mb-6 text-xl font-bold text-gray-900">
			{m.comments()}
		</h2>
		<div class="rounded-lg border border-gray-200 bg-gray-50 p-8 text-center text-gray-500">
			<p>{m.no_comments()}</p>
		</div>
	</section>

	<!-- Transaction Info (collapsed) -->
	<details class="mt-10 text-sm text-gray-500">
		<summary class="cursor-pointer font-medium text-gray-700 hover:text-gray-900">
			{m.blockchain_info()}
		</summary>
		<div class="mt-3 flex flex-wrap gap-x-6 gap-y-2 rounded-lg bg-gray-50 p-4">
			<div>
				<span class="font-medium text-gray-700">{m.article_id()}:</span>
				{article.id}
			</div>
			<div>
				<span class="font-medium text-gray-700">{m.block()}:</span>
				{article.blockNumber}
			</div>
			<div class="flex items-center gap-1">
				<span class="font-medium text-gray-700">{m.transaction()}:</span>
				<a
					href={`https://sepolia-optimism.etherscan.io/tx/${article.txHash}`}
					target="_blank"
					rel="noopener noreferrer"
					class="text-blue-600 hover:underline"
				>
					{article.txHash.slice(0, 10)}...{article.txHash.slice(-8)}
				</a>
			</div>
			<div class="flex items-center gap-1">
				<span class="font-medium text-gray-700">Arweave:</span>
				<a
					href={`https://gateway.irys.xyz/${article.arweaveId}`}
					target="_blank"
					rel="noopener noreferrer"
					class="text-blue-600 hover:underline"
				>
					{article.arweaveId.slice(0, 10)}...
				</a>
			</div>
		</div>
	</details>
</article>
