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
	let tipAmount = $state('0.001');
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
		if (!walletAddress) {
			showFeedback('error', m.please_connect_wallet({}));
			return;
		}
		if (isCollecting) return;

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
			const referrer = '0x0000000000000000000000000000000000000000' as const;
			if (hasValidSessionKey && sessionKey) {
				await collectArticleWithSessionKey(sessionKey, articleId, referrer, priceWei);
			} else {
				await collectArticle(articleId, referrer, priceWei);
			}
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
		if (!walletAddress) {
			showFeedback('error', m.please_connect_wallet({}));
			return;
		}
		isDisliking = true;
		try {
			const articleId = BigInt(article.id);
			const minValue = getMinActionValue();
			if (hasValidSessionKey && sessionKey) {
				await evaluateArticleWithSessionKey(
					sessionKey,
					articleId,
					EvaluationScore.Dislike,
					'',
					'0x0000000000000000000000000000000000000000',
					0n,
					minValue
				);
			} else {
				await evaluateArticle(
					articleId,
					EvaluationScore.Dislike,
					'',
					'0x0000000000000000000000000000000000000000',
					0n,
					minValue
				);
			}
			localDislikeAmount = (BigInt(localDislikeAmount) + minValue).toString();
			showFeedback('success', m.dislike_success({}));
		} catch (error) {
			showFeedback('error', m.interaction_failed({ error: getErrorMessage(error) }));
		} finally {
			isDisliking = false;
		}
	}

	// Handle Follow
	async function handleFollow() {
		if (!walletAddress) {
			showFeedback('error', m.please_connect_wallet({}));
			return;
		}
		isFollowing = true;
		try {
			const targetAddress = article.author.id as `0x${string}`;
			if (hasValidSessionKey && sessionKey) {
				await followUserWithSessionKey(sessionKey, targetAddress, true);
			} else {
				await followUser(targetAddress, true);
			}
			showFeedback('success', m.follow_success({}));
		} catch (error) {
			showFeedback('error', m.interaction_failed({ error: getErrorMessage(error) }));
		} finally {
			isFollowing = false;
		}
	}

	// Handle Tip
	async function handleTip() {
		if (!walletAddress) {
			showFeedback('error', m.please_connect_wallet({}));
			return;
		}
		const amount = parseFloat(tipAmount);
		if (isNaN(amount) || amount <= 0) {
			showFeedback('error', 'Invalid tip amount');
			return;
		}
		isTipping = true;
		try {
			const articleId = BigInt(article.id);
			const tipWei = parseEther(tipAmount);
			if (hasValidSessionKey && sessionKey) {
				await evaluateArticleWithSessionKey(
					sessionKey, articleId, EvaluationScore.Like, '',
					'0x0000000000000000000000000000000000000000', 0n, tipWei
				);
			} else {
				await evaluateArticle(
					articleId, EvaluationScore.Like, '',
					'0x0000000000000000000000000000000000000000', 0n, tipWei
				);
			}
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
		if (!walletAddress) {
			showFeedback('error', m.please_connect_wallet({}));
			return;
		}
		if (!commentText.trim()) return;
		isCommenting = true;
		try {
			const articleId = BigInt(article.id);
			// Comments require minActionValue to prevent spam (contract requirement)
			const minValue = getMinActionValue();
			if (hasValidSessionKey && sessionKey) {
				await evaluateArticleWithSessionKey(
					sessionKey, articleId, EvaluationScore.Neutral, commentText.trim(),
					'0x0000000000000000000000000000000000000000', 0n, minValue
				);
			} else {
				await evaluateArticle(articleId, EvaluationScore.Neutral, commentText.trim(),
					'0x0000000000000000000000000000000000000000', 0n, minValue);
			}
			showFeedback('success', m.comment_success({}));
		} catch (error) {
			showFeedback('error', m.interaction_failed({ error: getErrorMessage(error) }));
		} finally {
			isCommenting = false;
		}
	}

	const coverUrl = $derived(getCoverUrl(article.arweaveId));
	const categoryName = $derived(getCategoryName(article.categoryId));
	const authorDisplay = $derived(article.originalAuthor || shortAddress(article.author.id));
	const authorAddress = $derived(article.author.id);
	const readingTime = $derived(articleContent?.content ? getReadingTime(articleContent.content) : 0);
	const trueAuthorAddress = $derived(article.trueAuthor || article.author.id);
	const originalityLabel = $derived.by(() => {
		switch (article.originality) {
			case 0:
				return 'Original';
			case 1:
				return 'SemiOriginal';
			case 2:
				return 'Reprint';
			default:
				return String(article.originality);
		}
	});
	const maxCollectSupply = $derived(BigInt(article.maxCollectSupply));
	const collectAvailable = $derived(maxCollectSupply > 0n && BigInt(localCollectCount) < maxCollectSupply);

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
						class="text-sm font-medium text-emerald-600 hover:text-emerald-700 disabled:opacity-50"
						onclick={handleFollow}
						disabled={isFollowing}
					>
						{isFollowing ? m.processing({}) : m.follow({})}
					</button>
				</div>

				<!-- Read time & Date -->
				<div class="flex items-center gap-1 text-sm text-gray-500">
					{#if readingTime > 0}
						<span>{readingTime} {m.min_read({})}</span>
						<span class="mx-1">·</span>
					{/if}
					<time datetime={article.createdAt}>
						{formatDate(article.createdAt)}
					</time>
				</div>
				<div class="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
					<span>True Author: {shortAddress(trueAuthorAddress)}</span>
					<span>Originality: {originalityLabel}</span>
					<span>Collect Price: {formatTips(article.collectPrice)}</span>
					<span>Collect: {localCollectCount}/{article.maxCollectSupply}</span>
				</div>
			</div>
		</div>
	</header>

	{#snippet interactionBar(position: 'top' | 'bottom')}
	<div class={position === 'top' ? 'mb-8' : 'mt-12'} >
		<div class="flex items-center justify-between border-y border-gray-100 py-3">
			<div class="flex items-center gap-5">
				<!-- Tip/Appreciate -->
				<button
					type="button"
					class="group flex items-center gap-1.5 text-gray-500 transition-colors hover:text-amber-500"
					onclick={() => showTipModal = true}
					title={m.tip({})}
				>
					<svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
						<path stroke-linecap="round" stroke-linejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
					</svg>
					<span class="text-sm">{formatTips(article.totalTips)}</span>
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

				<button
					type="button"
					class="group flex items-center gap-1.5 text-gray-500 transition-colors hover:text-gray-900 disabled:opacity-50"
					onclick={handleCollect}
					disabled={isCollecting || !collectAvailable}
					title="Collect"
				>
					<svg class="h-5 w-5" class:animate-pulse={isCollecting} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							d="M16.5 18.75h-9A2.25 2.25 0 015.25 16.5v-9A2.25 2.25 0 017.5 5.25h9A2.25 2.25 0 0118.75 7.5v9A2.25 2.25 0 0116.5 18.75z"
						/>
						<path stroke-linecap="round" stroke-linejoin="round" d="M8.25 9.75h7.5M8.25 12.75h7.5" />
					</svg>
					<span class="text-sm">{localCollectCount}</span>
				</button>

				<!-- Dislike -->
				<button
					type="button"
					class="group flex items-center gap-1.5 text-gray-500 transition-colors hover:text-red-500 disabled:opacity-50"
					onclick={handleDislike}
					disabled={isDisliking}
					title={m.dislike({})}
				>
					<svg class="h-5 w-5" class:animate-pulse={isDisliking} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							d="M7.5 15h2.25m8.024-9.75c.011.05.028.1.052.148.591 1.2.924 2.55.924 3.977a8.96 8.96 0 01-.999 4.125m.023-8.25c-.076-.365.183-.75.575-.75h.908c.889 0 1.713.518 1.972 1.368.339 1.11.521 2.287.521 3.507 0 1.553-.295 3.036-.831 4.398C20.613 14.547 19.833 15 19 15h-1.053c-.472 0-.745-.556-.5-.96a8.95 8.95 0 00.303-.54m.023-8.25H16.48a4.5 4.5 0 01-1.423-.23l-3.114-1.04a4.5 4.5 0 00-1.423-.23H6.504c-.618 0-1.217.247-1.605.729A11.95 11.95 0 002.25 12c0 .434.023.863.068 1.285C2.427 14.306 3.346 15 4.372 15h3.126c.618 0 .991.724.725 1.282A7.471 7.471 0 007.5 19.5a2.25 2.25 0 002.25 2.25.75.75 0 00.75-.75v-.633c0-.573.11-1.14.322-1.672.304-.76.93-1.33 1.653-1.715a9.04 9.04 0 002.86-2.4c.498-.634 1.226-1.08 2.032-1.08h.384"
						/>
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

<!-- Tip Modal -->
{#if showTipModal}
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50" role="dialog" aria-modal="true" onclick={() => showTipModal = false}>
		<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
		<div class="mx-4 w-full max-w-sm rounded-xl bg-white p-6 shadow-xl" onclick={(e) => e.stopPropagation()}>
			<h3 class="mb-4 text-lg font-bold text-gray-900">{m.tip_author({})}</h3>
			
			<div class="mb-4">
				<label for="tip-amount" class="mb-2 block text-sm font-medium text-gray-700">{m.tip_amount({})}</label>
				<div class="flex items-center gap-2">
					<input
						id="tip-amount"
						type="number"
						bind:value={tipAmount}
						step="0.001"
						min="0.001"
						placeholder={m.tip_placeholder({})}
						class="flex-1 rounded-lg border border-gray-300 px-4 py-2 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
						disabled={isTipping}
					/>
					<span class="text-sm font-medium text-gray-600">{m.eth({})}</span>
				</div>
			</div>

			<!-- Quick amounts -->
			<div class="mb-6 flex gap-2">
				{#each ['0.001', '0.005', '0.01', '0.05'] as amount}
					<button
						type="button"
						onclick={() => tipAmount = amount}
						class="flex-1 rounded-lg border border-gray-200 py-1.5 text-sm transition-colors hover:border-emerald-500 hover:bg-emerald-50"
						class:border-emerald-500={tipAmount === amount}
						class:bg-emerald-50={tipAmount === amount}
					>
						{amount}
					</button>
				{/each}
			</div>

			<div class="flex gap-3">
				<button
					type="button"
					onclick={() => showTipModal = false}
					class="flex-1 rounded-lg border border-gray-300 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
					disabled={isTipping}
				>
					{m.cancel({})}
				</button>
				<button
					type="button"
					onclick={handleTip}
					disabled={isTipping || !tipAmount}
					class="flex-1 rounded-lg bg-amber-500 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-600 disabled:opacity-50"
				>
					{isTipping ? m.processing({}) : m.send_tip({})}
				</button>
			</div>
		</div>
	</div>
{/if}

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
