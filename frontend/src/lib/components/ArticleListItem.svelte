<script lang="ts">
	import type { ArticleData } from '$lib/graphql';
	import { CATEGORY_KEYS } from '$lib/data';
	import * as m from '$lib/paraglide/messages';
	import { getCoverImageUrl } from '$lib/arweave';

	interface Props {
		article: ArticleData;
	}

	let { article }: Props = $props();

	function shortAddress(address: string): string {
		if (!address) return '';
		return `${address.slice(0, 6)}...${address.slice(-4)}`;
	}

	function formatDate(dateStr: string): string {
		const date = new Date(dateStr);
		return date.toLocaleDateString(undefined, {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		});
	}

	function formatTips(tips: string): string {
		const wei = BigInt(tips);
		const eth = Number(wei) / 1e18;
		if (eth === 0) return '0';
		if (eth < 0.0001) return '<0.0001';
		return eth.toFixed(4);
	}

	function getCategoryName(categoryId: string): string {
		const id = parseInt(categoryId);
		const key = CATEGORY_KEYS[id];
		if (!key || key === 'unselected') return '';
		return (m as unknown as Record<string, () => string>)[key]?.() || key;
	}

	function getCoverUrl(arweaveId: string): string {
		return getCoverImageUrl(arweaveId, true);
	}

	const coverUrl = $derived(getCoverUrl(article.arweaveId));
	const categoryName = $derived(getCategoryName(article.categoryId));
	const authorDisplay = $derived(article.originalAuthor || shortAddress(article.author.id));
</script>

<a
	href="/a/{article.id}"
	class="group flex gap-4 border-b border-gray-100 py-5 transition-colors hover:bg-gray-50/50"
>
	<!-- Left: Text Content -->
	<div class="min-w-0 flex-1">
		<!-- Category & Author -->
		<div class="mb-2 flex items-center gap-2 text-sm">
			{#if categoryName}
				<span class="font-medium text-gray-500">{m.in_category()} {categoryName}</span>
				<span class="text-gray-300">·</span>
			{/if}
			<span class="text-gray-500">{m.by_author()} <span class="font-medium text-gray-700">{authorDisplay}</span></span>
		</div>

		<!-- Title -->
		<h3 class="mb-2 line-clamp-2 text-lg font-bold text-gray-900 group-hover:text-blue-600">
			{article.title || `Article #${article.id}`}
		</h3>

		<!-- Summary/Description placeholder - could be fetched from Arweave -->
		<p class="mb-3 line-clamp-2 text-sm text-gray-600">
			{article.title ? '' : 'Decentralized article stored on Arweave'}
		</p>

		<!-- Interaction Bar -->
		<div class="flex items-center gap-4 text-sm text-gray-500">
			<!-- Date -->
			<time datetime={article.createdAt}>{formatDate(article.createdAt)}</time>

			<!-- Likes -->
			<div class="flex items-center gap-1">
				<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
					/>
				</svg>
				<span>{formatTips(article.likeAmount)}</span>
			</div>

			<!-- Tips -->
			<div class="flex items-center gap-1">
				<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
					/>
				</svg>
				<span>{formatTips(article.totalTips)} ETH</span>
			</div>

			<!-- Read more -->
			<span class="ml-auto text-blue-600 opacity-0 transition-opacity group-hover:opacity-100">
				{m.read_more()} →
			</span>
		</div>
	</div>

	<!-- Right: Cover Image -->
	<div class="relative h-28 w-40 flex-shrink-0 overflow-hidden rounded-lg bg-gray-100">
		<img
			src={coverUrl}
			alt={article.title}
			class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
			loading="lazy"
			onerror={(e) => {
				const target = e.currentTarget as HTMLImageElement;
				target.style.display = 'none';
				const fallback = target.nextElementSibling as HTMLElement;
				if (fallback) fallback.style.display = 'flex';
			}}
		/>
		<!-- Fallback -->
		<div class="hidden h-full w-full items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100" style="display: none;">
			<svg class="h-8 w-8 text-blue-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="1.5"
					d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z"
				/>
			</svg>
		</div>
	</div>
</a>
