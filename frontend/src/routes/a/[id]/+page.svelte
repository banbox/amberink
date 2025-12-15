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
	import CommentSection from '$lib/components/CommentSection.svelte';
	import { parseEther } from 'viem';
	import {
		EvaluationScore,
		collectArticle,
		collectArticleWithSessionKey,
		evaluateArticle,
		evaluateArticleWithSessionKey,
		followUser,
		followUserWithSessionKey,
		ContractError
	} from '$lib/contracts';
	import {
		getStoredSessionKey,
		isSessionKeyValidForCurrentWallet,
		type StoredSessionKey
	} from '$lib/sessionKey';
	import { getMinActionValue } from '$lib/config';

	const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as const;

	let { data }: { data: PageData } = $props();
	const article = data.article;

	// Article content from Arweave
	let articleContent = $state<ArticleMetadata | null>(null);
	let contentLoading = $state(true);
	let contentError = $state<string | null>(null);

	// Wallet & Session Key state
	let walletAddress = $state<string | null>(null);
	let sessionKey = $state<StoredSessionKey | null>(null);
	let hasValidSessionKey = $state(false);

	// Interaction state
	let isDisliking = $state(false);
	let isCollecting = $state(false);
	let isFollowing = $state(false);
	let isCommenting = $state(false);
	let isTipping = $state(false);

	// UI state
	let showTipModal = $state(false);
	let showCollectModal = $state(false);
	let showDislikeModal = $state(false);
	let tipAmount = $state('0.001');
	let dislikeAmount = $state('0.001');
	let feedbackMessage = $state<{ type: 'success' | 'error'; text: string } | null>(null);

	// Local counts (optimistic updates)
	let localDislikeAmount = $state(article.dislikeAmount);
	let localCollectCount = $state(article.collectCount);

	// Format address to short form
	function shortAddress(address: string): string {
		if (!address) return '';
		return `${address.slice(0, 6)}...${address.slice(-4)}`;
	}

	async function handleCollect() {
		if (!requireWallet() || isCollecting) return;

		const maxSupply = BigInt(article.maxCollectSupply);
		const currentCount = BigInt(localCollectCount);
		if (maxSupply === 0n) {
			showFeedback('error', 'Collect not enabled');
			return;
		}
		if (currentCount >= maxSupply) {
			showFeedback('error', 'Sold out');
			return;
		}

		isCollecting = true;
		try {
			const articleId = BigInt(article.id);
			const priceWei = BigInt(article.collectPrice);
			await callWithSessionKey(
				(sk) => collectArticleWithSessionKey(sk, articleId, ZERO_ADDRESS, priceWei),
				() => collectArticle(articleId, ZERO_ADDRESS, priceWei)
			);
			localCollectCount = (BigInt(localCollectCount) + 1n).toString();
			showFeedback('success', 'Collected');
		} catch (error) {
			showFeedback('error', m.interaction_failed({ error: getErrorMessage(error) }));
		} finally {
			isCollecting = false;
		}
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
			showFeedback('success', m.link_copied({}));
		}
	}

	// Show feedback message
	function showFeedback(type: 'success' | 'error', text: string) {
		feedbackMessage = { type, text };
		setTimeout(() => {
			feedbackMessage = null;
		}, 3000);
	}

	// Check wallet and show error if not connected, returns true if wallet is connected
	function requireWallet(): boolean {
		if (!walletAddress) {
			showFeedback('error', m.please_connect_wallet({}));
			return false;
		}
		return true;
	}

	// Execute contract call with session key if available, otherwise use regular call
	async function callWithSessionKey<T>(
		withSessionKey: (sk: StoredSessionKey) => Promise<T>,
		withoutSessionKey: () => Promise<T>
	): Promise<T> {
		if (hasValidSessionKey && sessionKey) {
			return withSessionKey(sessionKey);
		}
		return withoutSessionKey();
	}

	// Get error message from ContractError
	function getErrorMessage(error: unknown): string {
		if (error instanceof ContractError) {
			const errorMessages: Record<string, string> = {
				user_rejected: m.error_user_rejected({}),
				insufficient_funds: m.error_insufficient_funds({}),
				network_error: m.error_network_error({}),
				contract_reverted: m.error_contract_reverted({}),
				gas_estimation_failed: m.error_gas_estimation_failed({}),
				nonce_too_low: m.error_nonce_too_low({}),
				replacement_underpriced: m.error_replacement_underpriced({}),
				wallet_not_connected: m.error_wallet_not_connected({}),
				wrong_network: m.error_wrong_network({}),
				timeout: m.error_timeout({}),
				unknown_error: m.error_unknown({})
			};
			return errorMessages[error.code] || error.message;
		}
		return error instanceof Error ? error.message : String(error);
	}

	// Check wallet connection
	async function checkWalletConnection() {
		if (typeof window === 'undefined' || !window.ethereum) return;
		try {
			const accounts = (await window.ethereum.request({ method: 'eth_accounts' })) as string[];
			if (accounts.length > 0) {
				walletAddress = accounts[0];
				sessionKey = getStoredSessionKey();
				hasValidSessionKey = await isSessionKeyValidForCurrentWallet();
			}
		} catch (e) {
			console.error('Failed to check wallet:', e);
		}
	}

	// Handle Dislike
	async function handleDislike() {
		if (!requireWallet()) return;
		const amount = parseFloat(dislikeAmount);
		if (isNaN(amount) || amount <= 0) {
			showFeedback('error', 'Invalid amount');
			return;
		}
		isDisliking = true;
		try {
			const articleId = BigInt(article.id);
			const dislikeWei = parseEther(dislikeAmount);
			await callWithSessionKey(
				(sk) => evaluateArticleWithSessionKey(sk, articleId, EvaluationScore.Dislike, '', ZERO_ADDRESS, 0n, dislikeWei),
				() => evaluateArticle(articleId, EvaluationScore.Dislike, '', ZERO_ADDRESS, 0n, dislikeWei)
			);
			localDislikeAmount = (BigInt(localDislikeAmount) + dislikeWei).toString();
			showDislikeModal = false;
			dislikeAmount = '0.001';
			showFeedback('success', m.dislike_success({}));
		} catch (error) {
			showFeedback('error', m.interaction_failed({ error: getErrorMessage(error) }));
		} finally {
			isDisliking = false;
		}
	}

	// Handle Follow
	async function handleFollow() {
		if (!requireWallet()) return;
		isFollowing = true;
		try {
			const targetAddress = article.author.id as `0x${string}`;
			await callWithSessionKey(
				(sk) => followUserWithSessionKey(sk, targetAddress, true),
				() => followUser(targetAddress, true)
			);
			showFeedback('success', m.follow_success({}));
		} catch (error) {
			showFeedback('error', m.interaction_failed({ error: getErrorMessage(error) }));
		} finally {
			isFollowing = false;
		}
	}

	// Handle Tip
	async function handleTip() {
		if (!requireWallet()) return;
		const amount = parseFloat(tipAmount);
		if (isNaN(amount) || amount <= 0) {
			showFeedback('error', 'Invalid tip amount');
			return;
		}
		isTipping = true;
		try {
			const articleId = BigInt(article.id);
			const tipWei = parseEther(tipAmount);
			await callWithSessionKey(
				(sk) => evaluateArticleWithSessionKey(sk, articleId, EvaluationScore.Like, '', ZERO_ADDRESS, 0n, tipWei),
				() => evaluateArticle(articleId, EvaluationScore.Like, '', ZERO_ADDRESS, 0n, tipWei)
			);
			showTipModal = false;
			tipAmount = '0.001';
			showFeedback('success', m.tip_success({}));
		} catch (error) {
			showFeedback('error', m.interaction_failed({ error: getErrorMessage(error) }));
		} finally {
			isTipping = false;
		}
	}

	// Handle Comment
	async function handleComment(commentText: string) {
		if (!requireWallet() || !commentText.trim()) return;
		isCommenting = true;
		try {
			const articleId = BigInt(article.id);
			const minValue = getMinActionValue();
			const text = commentText.trim();
			await callWithSessionKey(
				(sk) => evaluateArticleWithSessionKey(sk, articleId, EvaluationScore.Neutral, text, ZERO_ADDRESS, 0n, minValue),
				() => evaluateArticle(articleId, EvaluationScore.Neutral, text, ZERO_ADDRESS, 0n, minValue)
			);
			showFeedback('success', m.comment_success({}));
		} catch (error) {
			showFeedback('error', m.interaction_failed({ error: getErrorMessage(error) }));
		} finally {
			isCommenting = false;
		}
	}

	const coverUrl = $derived(getCoverUrl(article.arweaveId));
	const categoryName = $derived(getCategoryName(article.categoryId));
	// Display trueAuthor if available, otherwise author
	const displayAuthor = $derived(
		article.trueAuthor && article.trueAuthor !== '0x0000000000000000000000000000000000000000'
			? shortAddress(article.trueAuthor)
			: (article.originalAuthor || shortAddress(article.author.id))
	);
	// Check if article is published on behalf of trueAuthor by author
	const isProxyPublish = $derived(
		article.trueAuthor && 
		article.trueAuthor !== '0x0000000000000000000000000000000000000000' &&
		article.trueAuthor.toLowerCase() !== article.author.id.toLowerCase()
	);
	const authorAddress = $derived(article.author.id);
	const readingTime = $derived(articleContent?.content ? getReadingTime(articleContent.content) : 0);
	const trueAuthorAddress = $derived(article.trueAuthor || article.author.id);
	const maxCollectSupply = $derived(BigInt(article.maxCollectSupply));
	const collectAvailable = $derived(maxCollectSupply > 0n && BigInt(localCollectCount) < maxCollectSupply);
	
	// Article quality score: round(likeAmount*10/(likeAmount+dislikeAmount*2), 1)
	const qualityScore = $derived(() => {
		const like = BigInt(article.totalTips);
		const dislike = BigInt(localDislikeAmount) * 2n;
		const total = like + dislike;
		if (total === 0n) return null;
		// Calculate score with 1 decimal precision
		const score = Number(like * 100n / total) / 10;
		return Math.round(score * 10) / 10;
	});
	
	// Get gradient color based on score (0-10)
	function getScoreColor(score: number | null): string {
		if (score === null) return 'text-gray-400';
		if (score >= 8) return 'bg-gradient-to-r from-emerald-500 to-green-400 bg-clip-text text-transparent';
		if (score >= 6) return 'bg-gradient-to-r from-lime-500 to-emerald-400 bg-clip-text text-transparent';
		if (score >= 4) return 'bg-gradient-to-r from-amber-500 to-yellow-400 bg-clip-text text-transparent';
		if (score >= 2) return 'bg-gradient-to-r from-orange-500 to-amber-400 bg-clip-text text-transparent';
		return 'bg-gradient-to-r from-red-500 to-orange-400 bg-clip-text text-transparent';
	}

	onMount(async () => {
		await checkWalletConnection();
		const eth = typeof window !== 'undefined' ? window.ethereum : undefined;
		eth?.on?.('accountsChanged', async (accounts: unknown) => {
			const accts = accounts as string[];
			walletAddress = accts.length > 0 ? accts[0] : null;
			if (walletAddress) {
				sessionKey = getStoredSessionKey();
				hasValidSessionKey = await isSessionKeyValidForCurrentWallet();
			} else {
				sessionKey = null;
				hasValidSessionKey = false;
			}
		});
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
					{displayAuthor.slice(0, 2).toUpperCase()}
				</div>
			</a>

			<div class="flex flex-1 flex-col">
				<!-- Name & Follow -->
				<div class="flex items-center gap-2">
					{#if isProxyPublish}
						<span class="group relative">
							<a href={`/u/${trueAuthorAddress}`} class="font-medium text-gray-900 hover:underline">
								{displayAuthor}
							</a>
							<span class="pointer-events-none absolute bottom-full left-1/2 mb-2 -translate-x-1/2 whitespace-nowrap rounded bg-gray-800 px-2 py-1 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100">
								Published by {shortAddress(article.author.id)}
							</span>
						</span>
					{:else}
						<a href={`/u/${authorAddress}`} class="font-medium text-gray-900 hover:underline">
							{displayAuthor}
						</a>
					{/if}
					<span class="text-gray-300">·</span>
					<button
						type="button"
						class="text-sm font-medium text-emerald-600 hover:text-emerald-700 disabled:opacity-50"
						onclick={handleFollow}
						disabled={isFollowing}
					>
						{isFollowing ? m.processing({}) : m.follow({})}
					</button>
				</div>

				<!-- Read time & Date & Originality Tag -->
				<div class="flex items-center gap-2 text-sm text-gray-500">
					{#if readingTime > 0}
						<span>{readingTime} {m.min_read({})}</span>
						<span>·</span>
					{/if}
					<time datetime={article.createdAt}>
						{formatDate(article.createdAt)}
					</time>
					<span>·</span>
					<!-- Originality Tag with different background colors -->
					{#if article.originality === 0}
						<span class="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">Original</span>
					{:else if article.originality === 1}
						<span class="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">Semi-Original</span>
					{:else}
						<span class="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">Reprint</span>
					{/if}
				</div>
			</div>
		</div>
	</header>

	{#snippet interactionBar(position: 'top' | 'bottom')}
	<div class={position === 'top' ? 'mb-8' : 'mt-12'} >
		<div class="flex items-center justify-between border-y border-gray-100 py-3">
			<div class="flex items-center gap-5">
				<!-- Quality Score -->
				{#if qualityScore() !== null}
					<span class={`text-lg font-bold ${getScoreColor(qualityScore())}`} title="Article Quality Score">
						{qualityScore()?.toFixed(1)}
					</span>
				{:else}
					<span class="text-lg font-bold text-gray-300" title="No ratings yet">--</span>
				{/if}

				<!-- Like/Tip -->
				<button
					type="button"
					class="group flex items-center gap-1.5 text-gray-500 transition-colors hover:text-amber-500"
					onclick={() => showTipModal = true}
					title={m.tip({})}
				>
					<!-- Thumbs Up Icon -->
					<svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
						<path stroke-linecap="round" stroke-linejoin="round" d="M6.633 10.25c.806 0 1.533-.446 2.031-1.08a9.041 9.041 0 0 1 2.861-2.4c.723-.384 1.35-.956 1.653-1.715a4.498 4.498 0 0 0 .322-1.672V2.75a.75.75 0 0 1 .75-.75 2.25 2.25 0 0 1 2.25 2.25c0 1.152-.26 2.243-.723 3.218-.266.558.107 1.282.725 1.282m0 0h3.126c1.026 0 1.945.694 2.054 1.715.045.422.068.85.068 1.285a11.95 11.95 0 0 1-2.649 7.521c-.388.482-.987.729-1.605.729H13.48c-.483 0-.964-.078-1.423-.23l-3.114-1.04a4.501 4.501 0 0 0-1.423-.23H5.904m10.598-9.75H14.25M5.904 18.5c.083.205.173.405.27.602.197.4-.078.898-.523.898h-.908c-.889 0-1.713-.518-1.972-1.368a12 12 0 0 1-.521-3.507c0-1.553.295-3.036.831-4.398C3.387 9.953 4.167 9.5 5 9.5h1.053c.472 0 .745.556.5.96a8.958 8.958 0 0 0-1.302 4.665c0 1.194.232 2.333.652 3.375Z" />
					</svg>
					<span class="text-sm">{formatTips(article.totalTips)} ETH</span>
				</button>

				<!-- Comments -->
				<a
					href="#comments"
					class="group flex items-center gap-1.5 text-gray-500 transition-colors hover:text-gray-900"
					title={m.comments({})}
				>
					<svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							d="M12 20.25c4.97 0 9-3.694 9-8.25s-4.03-8.25-9-8.25S3 7.444 3 12c0 2.104.859 4.023 2.273 5.48.432.447.74 1.04.586 1.641a4.483 4.483 0 01-.923 1.785A5.969 5.969 0 006 21c1.282 0 2.47-.402 3.445-1.087.81.22 1.668.337 2.555.337z"
						/>
					</svg>
					<span class="text-sm">{article.comments?.length || 0}</span>
				</a>

				<!-- Collect/Bookmark -->
				<button
					type="button"
					class="group flex items-center gap-1.5 text-gray-500 transition-colors hover:text-gray-900"
					onclick={() => showCollectModal = true}
					title="Collect"
				>
					<!-- Bookmark Icon -->
					<svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
						<path stroke-linecap="round" stroke-linejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0 1 11.186 0Z" />
					</svg>
					<span class="text-sm">{localCollectCount}</span>
				</button>

				<!-- Dislike -->
				<button
					type="button"
					class="group flex items-center gap-1.5 text-gray-500 transition-colors hover:text-red-500 disabled:opacity-50"
					onclick={() => showDislikeModal = true}
					disabled={isDisliking}
					title={m.dislike({})}
				>
					<!-- Thumbs Down Icon -->
					<svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
						<path stroke-linecap="round" stroke-linejoin="round" d="M7.498 15.25H4.372c-1.026 0-1.945-.694-2.054-1.715a12.137 12.137 0 0 1-.068-1.285c0-2.848.992-5.464 2.649-7.521C5.287 4.247 5.886 4 6.504 4h4.016a4.5 4.5 0 0 1 1.423.23l3.114 1.04a4.5 4.5 0 0 0 1.423.23h1.294M7.498 15.25c.618 0 .991.724.725 1.282A7.471 7.471 0 0 0 7.5 19.5a2.25 2.25 0 0 0 2.25 2.25.75.75 0 0 0 .75-.75v-.633c0-.573.11-1.14.322-1.672.304-.76.93-1.33 1.653-1.715a9.04 9.04 0 0 0 2.86-2.4c.498-.634 1.226-1.08 2.032-1.08h.384m-10.253 0H4.372M18.75 5.5h-.908c-.392 0-.651.385-.575.75.076.364.183.75.183.75.591 1.2.924 2.55.924 3.977a8.96 8.96 0 0 1-.999 4.125m0-8.852c.339 1.11.521 2.287.521 3.507 0 1.553-.295 3.036-.831 4.398-.306.78-1.086 1.233-1.919 1.233h-1.053c-.472 0-.745-.556-.5-.96a8.95 8.95 0 0 0 .303-.54" />
					</svg>
					<span class="text-sm">{formatTips(localDislikeAmount)}</span>
				</button>
			</div>

			<!-- Right side: Share -->
			<div class="flex items-center gap-3">
				<button
					type="button"
					onclick={handleShare}
					class="text-gray-500 transition-colors hover:text-gray-900"
					title={m.share({})}
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
	</div>
{/snippet}

	<!-- Interaction Bar (Top) -->
	{@render interactionBar('top')}

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
					<span>{m.loading_content({})}</span>
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
					{m.view_on_arweave({})}
				</a>
			</div>
		{:else if articleContent?.content}
			<div class="prose prose-lg prose-gray max-w-none font-serif">
				{@html DOMPurify.sanitize(marked(articleContent.content) as string)}
			</div>
		{:else}
			<div class="py-8 text-center text-gray-500">
				<p>{m.no_content({})}</p>
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
	{@render interactionBar('bottom')}

	<!-- Comments Section -->
	<CommentSection
		articleId={article.id}
		comments={article.comments || []}
		{walletAddress}
		{sessionKey}
		{hasValidSessionKey}
		{isCommenting}
		onComment={handleComment}
	/>

	<!-- Transaction Info (collapsed) -->
	<details class="mt-10 text-sm text-gray-500">
		<summary class="cursor-pointer font-medium text-gray-700 hover:text-gray-900">
			{m.blockchain_info({})}
		</summary>
		<div class="mt-3 flex flex-wrap gap-x-6 gap-y-2 rounded-lg bg-gray-50 p-4">
			<div>
				<span class="font-medium text-gray-700">{m.article_id({})}:</span>
				{article.id}
			</div>
			<div>
				<span class="font-medium text-gray-700">{m.block({})}:</span>
				{article.blockNumber}
			</div>
			<div class="flex items-center gap-1">
				<span class="font-medium text-gray-700">{m.transaction({})}:</span>
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

{#snippet amountModal(config: {
	show: boolean,
	onClose: () => void,
	title: string,
	description?: string,
	labelText: string,
	inputId: string,
	value: string,
	onValueChange: (v: string) => void,
	isProcessing: boolean,
	onSubmit: () => void,
	submitText: string,
	colorScheme: 'emerald' | 'amber' | 'red'
})}
	{#if config.show}
		<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions a11y_interactive_supports_focus -->
		<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50" role="dialog" aria-modal="true" tabindex="-1" onclick={config.onClose}>
			<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
			<div class="mx-4 w-full max-w-sm rounded-xl bg-white p-6 shadow-xl" role="document" onclick={(e) => e.stopPropagation()}>
				<h3 class="mb-4 text-lg font-bold text-gray-900">{config.title}</h3>
				{#if config.description}
					<p class="mb-4 text-sm text-gray-500">{config.description}</p>
				{/if}
				
				<div class="mb-4">
					<label for={config.inputId} class="mb-2 block text-sm font-medium text-gray-700">{config.labelText}</label>
					<div class="flex items-center gap-2">
						<input
							id={config.inputId}
							type="number"
							value={config.value}
							oninput={(e) => config.onValueChange(e.currentTarget.value)}
							step="0.001"
							min="0.001"
							class="flex-1 rounded-lg border border-gray-300 px-4 py-2 focus:border-{config.colorScheme}-500 focus:outline-none focus:ring-1 focus:ring-{config.colorScheme}-500"
							disabled={config.isProcessing}
						/>
						<span class="text-sm font-medium text-gray-600">{m.eth({})}</span>
					</div>
				</div>

				<!-- Quick amounts -->
				<div class="mb-6 flex gap-2">
					{#each ['0.001', '0.005', '0.01', '0.05'] as amount}
						<button
							type="button"
							onclick={() => config.onValueChange(amount)}
							class="flex-1 rounded-lg border border-gray-200 py-1.5 text-sm transition-colors hover:border-{config.colorScheme}-500 hover:bg-{config.colorScheme}-50"
							class:border-emerald-500={config.colorScheme === 'emerald' && config.value === amount}
							class:bg-emerald-50={config.colorScheme === 'emerald' && config.value === amount}
							class:border-amber-500={config.colorScheme === 'amber' && config.value === amount}
							class:bg-amber-50={config.colorScheme === 'amber' && config.value === amount}
							class:border-red-500={config.colorScheme === 'red' && config.value === amount}
							class:bg-red-50={config.colorScheme === 'red' && config.value === amount}
						>
							{amount}
						</button>
					{/each}
				</div>

				<div class="flex gap-3">
					<button
						type="button"
						onclick={config.onClose}
						class="flex-1 rounded-lg border border-gray-300 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
						disabled={config.isProcessing}
					>
						{m.cancel({})}
					</button>
					<button
						type="button"
						onclick={config.onSubmit}
						disabled={config.isProcessing || !config.value}
						class="flex-1 rounded-lg py-2 text-sm font-medium text-white transition-colors disabled:opacity-50"
						class:bg-emerald-500={config.colorScheme === 'emerald'}
						class:hover:bg-emerald-600={config.colorScheme === 'emerald'}
						class:bg-amber-500={config.colorScheme === 'amber'}
						class:hover:bg-amber-600={config.colorScheme === 'amber'}
						class:bg-red-500={config.colorScheme === 'red'}
						class:hover:bg-red-600={config.colorScheme === 'red'}
					>
						{config.isProcessing ? m.processing({}) : config.submitText}
					</button>
				</div>
			</div>
		</div>
	{/if}
{/snippet}

<!-- Collect Modal -->
{#if showCollectModal}
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions a11y_interactive_supports_focus -->
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50" role="dialog" aria-modal="true" tabindex="-1" onclick={() => showCollectModal = false}>
		<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
		<div class="mx-4 w-full max-w-md rounded-xl bg-white p-6 shadow-xl" role="document" onclick={(e) => e.stopPropagation()}>
			<h3 class="mb-4 text-lg font-bold text-gray-900">Collect Article</h3>
			
			<!-- Collect Stats -->
			<div class="mb-6 grid grid-cols-3 gap-4">
				<div class="rounded-lg bg-gray-50 p-3 text-center">
					<div class="text-2xl font-bold text-gray-900">{localCollectCount}</div>
					<div class="text-xs text-gray-500">Collected</div>
				</div>
				<div class="rounded-lg bg-gray-50 p-3 text-center">
					<div class="text-2xl font-bold text-emerald-600">{formatTips(article.collectPrice)}</div>
					<div class="text-xs text-gray-500">Price (ETH)</div>
				</div>
				<div class="rounded-lg bg-gray-50 p-3 text-center">
					<div class="text-2xl font-bold text-gray-900">
						{maxCollectSupply > 0n ? (maxCollectSupply - BigInt(localCollectCount)).toString() : '∞'}
					</div>
					<div class="text-xs text-gray-500">Remaining</div>
				</div>
			</div>

			<!-- Collectors List -->
			{#if article.collections && article.collections.length > 0}
				<div class="mb-6">
					<h4 class="mb-3 text-sm font-medium text-gray-700">Collectors ({article.collections.length})</h4>
					<div class="max-h-48 overflow-y-auto rounded-lg border border-gray-200">
						<table class="w-full text-sm">
							<thead class="sticky top-0 bg-gray-50">
								<tr class="text-left text-xs text-gray-500">
									<th class="px-3 py-2">Address</th>
									<th class="px-3 py-2 text-right">Amount</th>
									<th class="px-3 py-2 text-right">Time</th>
								</tr>
							</thead>
							<tbody class="divide-y divide-gray-100">
								{#each article.collections as collection}
									<tr class="hover:bg-gray-50">
										<td class="px-3 py-2">
											<a href={`/u/${collection.user.id}`} class="text-blue-600 hover:underline">
												{shortAddress(collection.user.id)}
											</a>
										</td>
										<td class="px-3 py-2 text-right font-medium text-emerald-600">
											{formatTips(collection.amount)}
										</td>
										<td class="px-3 py-2 text-right text-gray-500">
											{formatDate(collection.createdAt)}
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				</div>
			{:else}
				<div class="mb-6 rounded-lg border border-gray-200 p-4 text-center text-sm text-gray-500">
					No collectors yet. Be the first!
				</div>
			{/if}

			<!-- Action Buttons -->
			<div class="flex gap-3">
				<button
					type="button"
					onclick={() => showCollectModal = false}
					class="flex-1 rounded-lg border border-gray-300 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
					disabled={isCollecting}
				>
					{m.cancel({})}
				</button>
				<button
					type="button"
					onclick={handleCollect}
					disabled={isCollecting || !collectAvailable}
					class="flex-1 rounded-lg bg-emerald-500 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-600 disabled:opacity-50"
				>
					{#if isCollecting}
						{m.processing({})}
					{:else if !collectAvailable}
						Sold Out
					{:else}
						Collect for {formatTips(article.collectPrice)} ETH
					{/if}
				</button>
			</div>
		</div>
	</div>
{/if}

<!-- Tip Modal -->
{@render amountModal({
	show: showTipModal,
	onClose: () => showTipModal = false,
	title: m.tip_author({}),
	labelText: m.tip_amount({}),
	inputId: 'tip-amount',
	value: tipAmount,
	onValueChange: (v: string) => tipAmount = v,
	isProcessing: isTipping,
	onSubmit: handleTip,
	submitText: m.send_tip({}),
	colorScheme: 'amber'
})}

<!-- Dislike Modal -->
{@render amountModal({
	show: showDislikeModal,
	onClose: () => showDislikeModal = false,
	title: m.dislike({}),
	description: m.dislike_description({}),
	labelText: m.dislike_amount({}),
	inputId: 'dislike-amount',
	value: dislikeAmount,
	onValueChange: (v: string) => dislikeAmount = v,
	isProcessing: isDisliking,
	onSubmit: handleDislike,
	submitText: m.send_dislike({}),
	colorScheme: 'red'
})}

<!-- Feedback Toast -->
{#if feedbackMessage}
	<div
		class="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 transform rounded-lg px-6 py-3 shadow-lg transition-all"
		class:bg-emerald-600={feedbackMessage.type === 'success'}
		class:bg-red-600={feedbackMessage.type === 'error'}
	>
		<p class="text-sm font-medium text-white">{feedbackMessage.text}</p>
	</div>
{/if}
