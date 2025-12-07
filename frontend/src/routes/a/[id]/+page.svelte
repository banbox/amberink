<script lang="ts">
	import type { PageData } from './$types';
	import * as m from '$lib/paraglide/messages';
	import { CATEGORY_KEYS } from '$lib/data';
	import { getCoverImageUrl } from '$lib/arweave';
	import { getArticleWithCache } from '$lib/arweave/cache';
	import type { ArticleMetadata } from '$lib/arweave/types';
	import { onMount } from 'svelte';

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

	// Format date
	function formatDate(dateStr: string): string {
		const date = new Date(dateStr);
		return date.toLocaleDateString(undefined, {
			year: 'numeric',
			month: 'long',
			day: 'numeric'
		});
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
	// Cover image is accessed via arweaveId/coverImage path
	function getCoverUrl(arweaveId: string): string {
		return getCoverImageUrl(arweaveId, true);
	}

	const coverUrl = $derived(getCoverUrl(article.arweaveId));
	const categoryName = $derived(getCategoryName(article.categoryId));
	const authorDisplay = $derived(article.originalAuthor || shortAddress(article.author.id));
	const authorAddress = $derived(article.author.id);

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

<article class="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
	<!-- Back Button -->
	<a
		href="/"
		class="mb-6 inline-flex items-center gap-2 text-sm text-gray-500 transition-colors hover:text-gray-900"
	>
		<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
			<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
		</svg>
		{m.back_to_home?.() || 'Back to Home'}
	</a>

	<!-- Cover Image (loaded from Irys mutable folder: arweaveId/coverImage) -->
	<div class="mb-8 overflow-hidden rounded-2xl" id="cover-container">
		<img
			src={coverUrl}
			alt={article.title}
			class="h-auto w-full object-cover"
			style="max-height: 480px;"
			onerror={(e) => {
				// Hide container if cover image doesn't exist
				const target = e.currentTarget as HTMLImageElement;
				const container = target.parentElement;
				if (container) container.style.display = 'none';
			}}
		/>
	</div>

	<!-- Header -->
	<header class="mb-8">
		<!-- Category Badge -->
		{#if categoryName}
			<span
				class="mb-4 inline-block rounded-full bg-blue-50 px-3 py-1 text-sm font-medium text-blue-700"
			>
				{categoryName}
			</span>
		{/if}

		<!-- Title -->
		<h1 class="mb-4 text-3xl font-bold text-gray-900 sm:text-4xl lg:text-5xl">
			{article.title || `Article #${article.id}`}
		</h1>

		<!-- Meta Info -->
		<div class="flex flex-wrap items-center gap-4 text-gray-500">
			<!-- Author -->
			<div class="flex items-center gap-2">
				<div
					class="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 text-sm font-medium text-white"
				>
					{authorDisplay.slice(0, 2).toUpperCase()}
				</div>
				<div>
					<div class="font-medium text-gray-900">{authorDisplay}</div>
					{#if article.originalAuthor}
						<div class="text-xs text-gray-400" title={authorAddress}>
							{m.published_by?.() || 'Published by'} {shortAddress(authorAddress)}
						</div>
					{/if}
				</div>
			</div>

			<span class="text-gray-300">·</span>

			<!-- Date -->
			<time datetime={article.createdAt} class="text-sm">
				{formatDate(article.createdAt)}
			</time>

			<span class="text-gray-300">·</span>

			<!-- Reading time estimate -->
			{#if articleContent?.content}
				<span class="text-sm">
					{Math.max(1, Math.ceil(articleContent.content.length / 1000))} {m.min_read?.() ||
						'min read'}
				</span>
			{/if}
		</div>
	</header>

	<!-- Summary -->
	{#if articleContent?.summary}
		<div class="mb-8 rounded-xl border-l-4 border-blue-500 bg-blue-50 p-4 text-gray-700">
			<p class="italic">{articleContent.summary}</p>
		</div>
	{/if}

	<!-- Content -->
	<div class="prose prose-lg prose-gray max-w-none">
		{#if contentLoading}
			<div class="flex items-center justify-center py-16">
				<div class="flex items-center gap-3 text-gray-500">
					<svg class="h-6 w-6 animate-spin" fill="none" viewBox="0 0 24 24">
						<circle
							class="opacity-25"
							cx="12"
							cy="12"
							r="10"
							stroke="currentColor"
							stroke-width="4"
						></circle>
						<path
							class="opacity-75"
							fill="currentColor"
							d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
						></path>
					</svg>
					<span>{m.loading_content?.() || 'Loading content...'}</span>
				</div>
			</div>
		{:else if contentError}
			<div class="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
				<svg
					class="mx-auto mb-3 h-12 w-12 text-red-400"
					fill="none"
					stroke="currentColor"
					viewBox="0 0 24 24"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
					/>
				</svg>
				<p class="text-red-700">{contentError}</p>
				<a
					href={`https://gateway.irys.xyz/${article.arweaveId}`}
					target="_blank"
					rel="noopener noreferrer"
					class="mt-3 inline-block text-sm text-red-600 underline hover:text-red-800"
				>
					{m.view_on_arweave?.() || 'View on Arweave'}
				</a>
			</div>
		{:else if articleContent?.content}
			<!-- Render Markdown content as plain text for now -->
			<!-- TODO: Add proper Markdown rendering with mdsvex or marked -->
			<div class="whitespace-pre-wrap leading-relaxed text-gray-800">
				{articleContent.content}
			</div>
		{:else}
			<div class="py-8 text-center text-gray-500">
				<p>{m.no_content?.() || 'No content available'}</p>
			</div>
		{/if}
	</div>

	<!-- Stats & Actions -->
	<footer class="mt-12 border-t border-gray-200 pt-8">
		<div class="flex flex-wrap items-center justify-between gap-4">
			<!-- Stats -->
			<div class="flex items-center gap-6 text-gray-500">
				<!-- Likes -->
				<div class="flex items-center gap-2">
					<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
						/>
					</svg>
					<span class="font-medium">{article.likes}</span>
					<span class="text-sm">{m.likes?.() || 'Likes'}</span>
				</div>

				<!-- Dislikes -->
				<div class="flex items-center gap-2">
					<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M10 14H5.236a2 2 0 01-1.789-2.894l3.5-7A2 2 0 018.736 3h4.018a2 2 0 01.485.06l3.76.94m-7 10v5a2 2 0 002 2h.096c.5 0 .905-.405.905-.904 0-.715.211-1.413.608-2.008L17 13V4m-7 10h2m5-10h2a2 2 0 012 2v6a2 2 0 01-2 2h-2.5"
						/>
					</svg>
					<span class="font-medium">{article.dislikes}</span>
				</div>

				<!-- Tips -->
				<div class="flex items-center gap-2">
					<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
						/>
					</svg>
					<span class="font-medium">{formatTips(article.totalTips)}</span>
					<span class="text-sm">ETH</span>
				</div>
			</div>

			<!-- Actions -->
			<div class="flex items-center gap-3">
				<!-- Share Button -->
				<button
					type="button"
					onclick={() => {
						if (navigator.share) {
							navigator.share({
								title: article.title,
								url: window.location.href
							});
						} else {
							navigator.clipboard.writeText(window.location.href);
							alert(m.link_copied?.() || 'Link copied!');
						}
					}}
					class="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
				>
					<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
						/>
					</svg>
					{m.share?.() || 'Share'}
				</button>

				<!-- View on Arweave -->
				<a
					href={`https://gateway.irys.xyz/${article.arweaveId}`}
					target="_blank"
					rel="noopener noreferrer"
					class="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
				>
					<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
						/>
					</svg>
					Arweave
				</a>
			</div>
		</div>

		<!-- Transaction Info -->
		<div class="mt-6 rounded-lg bg-gray-50 p-4 text-sm text-gray-500">
			<div class="flex flex-wrap gap-x-6 gap-y-2">
				<div>
					<span class="font-medium text-gray-700">{m.article_id?.() || 'Article ID'}:</span>
					{article.id}
				</div>
				<div>
					<span class="font-medium text-gray-700">{m.block?.() || 'Block'}:</span>
					{article.blockNumber}
				</div>
				<div class="flex items-center gap-1">
					<span class="font-medium text-gray-700">{m.transaction?.() || 'Tx'}:</span>
					<a
						href={`https://sepolia-optimism.etherscan.io/tx/${article.txHash}`}
						target="_blank"
						rel="noopener noreferrer"
						class="text-blue-600 hover:underline"
					>
						{article.txHash.slice(0, 10)}...{article.txHash.slice(-8)}
					</a>
				</div>
			</div>
		</div>
	</footer>
</article>
