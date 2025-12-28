<script lang="ts">
	import type { ArticleData, UserData } from '$lib/graphql';
	import { client, USER_BY_ID_QUERY } from '$lib/graphql';
	import { CATEGORY_KEYS } from '$lib/data';
	import { shortAddress, formatDate, formatTips } from '$lib/utils';
	import * as m from '$lib/paraglide/messages';
	import { getCoverImageUrl, getAvatarUrl } from '$lib/arweave';
	import { onMount } from 'svelte';
	import { getNativeTokenSymbol } from '$lib/priceService';
	import { localizeHref } from '$lib/paraglide/runtime';
	import { HeartIcon, CoinIcon, ArticleIcon } from './icons';

	interface Props {
		article: ArticleData;
	}

	let { article }: Props = $props();

	// Author data (fetched separately because SubSquid relation resolution has issues)
	let authorData = $state<UserData | null>(null);

	function getCategoryName(categoryId: string): string {
		const id = parseInt(categoryId);
		const key = CATEGORY_KEYS[id];
		if (!key || key === 'unselected') return '';
		return (m as unknown as Record<string, () => string>)[key]?.() || key;
	}

	function getCoverUrl(arweaveId: string): string {
		return getCoverImageUrl(arweaveId, true);
	}

	// Get author ID from article data
	const articleAuthorId = $derived(
		(article.author?.id || '').toLowerCase()
	);

	// Use fetched authorData if available, fallback to article.author
	const author = $derived(authorData ?? article.author ?? { id: '', nickname: null, avatar: null });
	const authorId = $derived(author.id || articleAuthorId || '');

	// article.id is now arweaveId (primary key)
	const coverUrl = $derived(getCoverUrl(article.id));
	const categoryName = $derived(getCategoryName(article.categoryId));
	// Priority: originalAuthor (for reposts) > fetched nickname > article.author.nickname > short address
	const authorDisplay = $derived(
		article.originalAuthor || authorData?.nickname || author.nickname || shortAddress(authorId) || 'Anonymous'
	);
	// Get author avatar (prefer fetched data)
	const authorAvatar = $derived(authorData?.avatar || author.avatar);
	// Get avatar initials safely
	const authorInitials = $derived(
		authorId ? authorId.slice(2, 4).toUpperCase() : '??'
	);

	// Fetch author data separately (SubSquid relation resolution has issues)
	onMount(async () => {
		const targetAuthorId = articleAuthorId;
		if (!targetAuthorId || targetAuthorId === '0x0000000000000000000000000000000000000000') return;
		
		try {
			const result = await client
				.query(USER_BY_ID_QUERY, { id: targetAuthorId }, { requestPolicy: 'cache-first' })
				.toPromise();
			
			if (result.data?.userById) {
				authorData = result.data.userById;
			}
		} catch (e) {
			console.error('Failed to fetch author data:', e);
		}
	});
</script>

<a href={localizeHref(`/a?id=${article.id}`)} class="group flex gap-4 border-b border-gray-100 py-5 transition-colors">
	<!-- Left: Text Content -->
	<div class="min-w-0 flex-1">
		<!-- Category & Author -->
		<div class="mb-2 flex items-center gap-2 text-sm">
			<!-- Author Avatar -->
			{#if getAvatarUrl(authorAvatar)}
				<img src={getAvatarUrl(authorAvatar)} alt="" class="h-6 w-6 rounded-full object-cover" />
			{:else}
				<div
					class="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-blue-400 to-purple-500 text-xs font-medium text-white"
				>
					{authorInitials}
				</div>
			{/if}
			<span class="truncate text-gray-700"
				>{authorData?.nickname || author.nickname || authorDisplay}</span
			>
			{#if categoryName}
				<span class="text-gray-300">·</span>
				<span class="text-gray-500">{m.in()} {categoryName}</span>
			{/if}
		</div>

		<!-- Title -->
		<h3 class="mb-2 line-clamp-2 text-lg font-bold text-gray-900 group-hover:text-blue-600">
			{article.title || `Article #${article.id}`}
		</h3>

		<!-- Summary/Description placeholder - could be fetched from Arweave -->
		<p class="mb-3 line-clamp-2 text-sm text-gray-600">
			{'no summary'}
		</p>

		<!-- Interaction Bar -->
		<div class="flex items-center gap-4 text-sm text-gray-500">
			<!-- Date -->
			<time datetime={article.createdAt}>{formatDate(article.createdAt)}</time>

			<!-- Likes -->
			<div class="flex items-center gap-1">
				<HeartIcon size={16} />
				<span>{formatTips(article.likeAmount)}</span>
			</div>

			<!-- Tips -->
			<div class="flex items-center gap-1">
				<CoinIcon size={16} />
				<span>{formatTips(article.totalTips)} {getNativeTokenSymbol()}</span>
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
		<div
			class="hidden h-full w-full items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100"
			style="display: none;"
		>
			<ArticleIcon size={32} class="text-blue-300" />
		</div>
	</div>
</a>
