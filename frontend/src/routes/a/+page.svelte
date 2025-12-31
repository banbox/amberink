<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	import { CATEGORY_KEYS } from '$lib/data';
	import { shortAddress, formatTips, ZERO_ADDRESS } from '$lib/utils';
	import { getCoverImageUrl, getAvatarUrl, fetchArticleMetadata } from '$lib/arweave';
	import { queryArticleVersions, fetchArticleVersionContent, type ArticleVersion, getStaticFolderUrl, getMutableFolderUrl, ARTICLE_COVER_IMAGE_FILE } from '$lib/arweave/folder';
	import type { ArticleMetadata } from '$lib/arweave/types';
	import { onMount } from 'svelte';
	import { marked } from 'marked';
	import DOMPurify from 'dompurify';
	import CommentSection from '$lib/components/CommentSection.svelte';
	import { parseEther, formatUnits } from 'viem';
	import { client, USER_BY_ID_QUERY, ARTICLE_BY_ID_QUERY, type UserData, type ArticleDetailData } from '$lib/graphql';
	import { page } from '$app/stores';
	import { usdToWei, getNativeTokenPriceUsd, getNativeTokenSymbol, formatUsd } from '$lib/priceService';
	import { getDefaultTipAmountUsd, getDefaultDislikeAmountUsd, getMinActionValueUsd, getArweaveGateways, getIrysNetwork } from '$lib/config';
	import { getBlockExplorerTxUrl } from '$lib/chain';
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
		ensureSessionKeyReady,
		type StoredSessionKey
	} from '$lib/sessionKey';
	import { getMinActionValue } from '$lib/config';
	import { localizeHref } from '$lib/paraglide/runtime';
	import { ClockIcon, ThumbsUpIcon, ThumbsDownIcon, CommentIcon, BookmarkIcon, CloseIcon, BackIcon, EditIcon, ShareIcon, SpinnerIcon } from '$lib/components/icons';

	// Native token price state
	let nativeTokenPrice = $state<number | null>(null);
	let priceLoading = $state(false);
	let nativeSymbol = $state('ETH');

	let article = $state<ArticleDetailData | null>(null);
	let versionTxId = $state<string | null>(null);
	let articleLoading = $state(true);
	let articleError = $state<string | null>(null);

	// Article content from Arweave
	let articleContent = $state<ArticleMetadata | null>(null);
	let contentLoading = $state(true);
	let contentError = $state<string | null>(null);

	// Author data (fetched separately because SubSquid relation resolution has issues)
	let authorData = $state<UserData | null>(null);
	
	// Current user data (for comment section)
	let currentUserData = $state<UserData | null>(null);

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
	let showVersionsDropdown = $state(false);
	let tipAmountUsd = $state(getDefaultTipAmountUsd());
	let dislikeAmountUsd = $state(getDefaultDislikeAmountUsd());
	let feedbackMessage = $state<{ type: 'success' | 'error'; text: string } | null>(null);

	// History versions state
	let versions = $state<ArticleVersion[]>([]);
	let versionsLoading = $state(false);
	let versionsLoaded = $state(false);
	let currentVersionIndex = $state<number | null>(null);
	
	// Current viewing version metadata (for historical versions)
	let currentVersionMeta = $state<{ title?: string; summary?: string; owner?: string; timestamp?: number } | null>(null);

	// Local counts (optimistic updates)
	let localDislikeAmount = $state('0');
	let localCollectCount = $state(0);

	async function handleCollect() {
		if (!requireWallet() || isCollecting || !article) return;
		// Security check: prevent self-collect
		if (isAuthor) {
			showFeedback('error', m.cannot_action_own({ action: m.collect(), item: m.article() }));
			showCollectModal = false;
			return;
		}

		const maxSupply = BigInt(article.maxCollectSupply);
		const currentCount = BigInt(localCollectCount);
		if (maxSupply === 0n) {
			showFeedback('error', m.collect_not_enabled());
			return;
		}
		if (currentCount >= maxSupply) {
			showFeedback('error', m.sold_out());
			return;
		}

		isCollecting = true;
		try {
			// Use articleId for contract interaction (not arweaveId)
			const chainArticleId = BigInt(article.articleId);
			const priceWei = BigInt(article.collectPrice);
			await callWithSessionKey(
				(sk) => collectArticleWithSessionKey(sk, chainArticleId, ZERO_ADDRESS, priceWei),
				() => collectArticle(chainArticleId, ZERO_ADDRESS, priceWei)
			);
			localCollectCount = localCollectCount + 1;
			showFeedback('success', m.success({ action: m.collect() }));
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

	// Get Irys explorer transaction URL
	function getIrysExplorerUrl(txId: string): string {
		const network = getIrysNetwork();
		if (network === 'mainnet') {
			return `https://gateway.irys.xyz/tx/${txId}`;
		} else {
			return `https://devnet.irys.xyz/tx/${txId}`;
		}
	}

	// Share article
	function handleShare() {
		if (!article) return;
		if (navigator.share) {
			navigator.share({
				title: article.title,
				url: window.location.href
			});
		} else {
			navigator.clipboard.writeText(window.location.href);
			showFeedback('success', m.link_copied());
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
			showFeedback('error', m.connect_wallet_first());
			return false;
		}
		return true;
	}

	/**
	 * Execute contract call with session key, auto-creating if needed.
	 * Minimizes MetaMask popups:
	 * - Uses existing valid session key if available
	 * - Creates new session key only if needed (one popup)
	 * - Funds session key only if balance is low (one popup)
	 * - Falls back to regular wallet call if user rejects
	 * 
	 * @param withSessionKey - Function to call with session key
	 * @param withoutSessionKey - Fallback function for regular wallet call
	 * @param autoCreate - If true, auto-create session key if not available (default: true)
	 */
	async function callWithSessionKey<T>(
		withSessionKey: (sk: StoredSessionKey) => Promise<T>,
		withoutSessionKey: () => Promise<T>,
		autoCreate: boolean = true
	): Promise<T> {
		try {
			// Use unified ensureSessionKeyReady - handles validation, creation, and funding
			const sk = autoCreate 
				? await ensureSessionKeyReady()
				: (hasValidSessionKey && sessionKey ? sessionKey : null);
			
			if (sk) {
				// Update local state if we got a new session key
				if (!sessionKey || sessionKey.address !== sk.address) {
					sessionKey = sk;
					hasValidSessionKey = true;
				}
				return await withSessionKey(sk);
			}
			
			// User rejected or no session key available, fall back to regular wallet
			console.log('Session key not available, using regular wallet call');
			return await withoutSessionKey();
		} catch (error) {
			// If session key operation fails, try regular wallet as fallback
			console.error('Session key operation failed, falling back to regular wallet:', error);
			return await withoutSessionKey();
		}
	}

	// Get error message from ContractError
	function getErrorMessage(error: unknown): string {
		if (error instanceof ContractError) {
			const errorMessages: Record<string, string> = {
				user_rejected: m.user_rejected(),
				insufficient_funds: m.insufficient_funds(),
				network_error: m.network_error(),
				contract_reverted: m.contract_reverted(),
				gas_estimation_failed: m.gas_estimation_failed(),
				nonce_too_low: m.nonce_too_low(),
				replacement_underpriced: m.replacement_underpriced(),
				wallet_not_connected: m.wallet_not_connected(),
				wrong_network: m.wrong_network(),
				timeout: m.timeout(),
				unknown_error: m.unknown_error()
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
				// Fetch current user data
				fetchCurrentUserData(accounts[0]);
			}
		} catch (e) {
			console.error('Failed to check wallet:', e);
		}
	}
	
	// Fetch current user data for comment section
	async function fetchCurrentUserData(address: string) {
		if (!article) return;
		try {
			const result = await client
				.query(USER_BY_ID_QUERY, { id: address.toLowerCase() }, { requestPolicy: 'cache-first' })
				.toPromise();
			if (result.data?.userById) {
				currentUserData = result.data.userById;
			}
		} catch (e) {
			console.error('Failed to fetch current user data:', e);
		}
	}

	// Handle Dislike
	async function handleDislike() {
		if (!requireWallet() || !article) return;
		// Security check: prevent self-evaluation
		if (isAuthor) {
			showFeedback('error', m.cannot_self_evaluate({}));
			showDislikeModal = false;
			return;
		}
		const amount = parseFloat(dislikeAmountUsd);
		if (isNaN(amount) || amount <= 0) {
			showFeedback('error', m.invalid_amount());
			return;
		}
		isDisliking = true;
		try {
			// Use articleId for contract interaction (not arweaveId)
			const chainArticleId = BigInt(article.articleId);
			// Convert USD to wei using Pyth price
			const dislikeWei = await usdToWei(dislikeAmountUsd);
			await callWithSessionKey(
				(sk) => evaluateArticleWithSessionKey(sk, chainArticleId, EvaluationScore.Dislike, '', ZERO_ADDRESS, 0n, dislikeWei),
				() => evaluateArticle(chainArticleId, EvaluationScore.Dislike, '', ZERO_ADDRESS, 0n, dislikeWei)
			);
			localDislikeAmount = (BigInt(localDislikeAmount) + dislikeWei).toString();
			showDislikeModal = false;
			dislikeAmountUsd = getDefaultDislikeAmountUsd();
			showFeedback('success', m.success({ action: m.dislike() }));
		} catch (error) {
			showFeedback('error', m.interaction_failed({ error: getErrorMessage(error) }));
		} finally {
			isDisliking = false;
		}
	}

	// Handle Follow
	async function handleFollow() {
		if (!requireWallet() || isFollowing || !article) return;
		// Security check: prevent self-follow
		if (isAuthor) {
			showFeedback('error', m.cannot_self_action({ action: m.follow() }));
			return;
		}
		isFollowing = true;
		try {
			const targetAddress = (authorId || article.author?.id || '') as `0x${string}`;
			await callWithSessionKey(
				(sk) => followUserWithSessionKey(sk, targetAddress, true),
				() => followUser(targetAddress, true)
			);
			showFeedback('success', m.success({ action: m.follow() }));
		} catch (error) {
			showFeedback('error', m.interaction_failed({ error: getErrorMessage(error) }));
		} finally {
			isFollowing = false;
		}
	}

	// Handle Tip
	async function handleTip() {
		if (!requireWallet() || !article) return;
		// Security check: prevent self-evaluation
		if (isAuthor) {
			showFeedback('error', m.cannot_self_action({ action: 'evaluate' }));
			showTipModal = false;
			return;
		}
		const amount = parseFloat(tipAmountUsd);
		if (isNaN(amount) || amount <= 0) {
			showFeedback('error', m.invalid_amount());
			return;
		}
		isTipping = true;
		try {
			// Use articleId for contract interaction (not arweaveId)
			const chainArticleId = BigInt(article.articleId);
			// Convert USD to wei using Pyth price
			const tipWei = await usdToWei(tipAmountUsd);
			await callWithSessionKey(
				(sk) => evaluateArticleWithSessionKey(sk, chainArticleId, EvaluationScore.Like, '', ZERO_ADDRESS, 0n, tipWei),
				() => evaluateArticle(chainArticleId, EvaluationScore.Like, '', ZERO_ADDRESS, 0n, tipWei)
			);
			showTipModal = false;
			tipAmountUsd = getDefaultTipAmountUsd();
			showFeedback('success', m.success({ action: m.tip() }));
		} catch (error) {
			showFeedback('error', m.interaction_failed({ error: getErrorMessage(error) }));
		} finally {
			isTipping = false;
		}
	}

	// Handle Comment
	async function handleComment(commentText: string) {
		if (!requireWallet() || !commentText.trim() || !article) return;
		isCommenting = true;
		try {
			// Use articleId for contract interaction (not arweaveId)
			const chainArticleId = BigInt(article.articleId);
			// Convert minimum USD value to wei
			const minValueUsd = getMinActionValueUsd();
			const minValue = await usdToWei(minValueUsd);
			const text = commentText.trim();
			await callWithSessionKey(
				(sk) => evaluateArticleWithSessionKey(sk, chainArticleId, EvaluationScore.Neutral, text, ZERO_ADDRESS, 0n, minValue),
				() => evaluateArticle(chainArticleId, EvaluationScore.Neutral, text, ZERO_ADDRESS, 0n, minValue)
			);
			showFeedback('success', m.comment_success({}));
		} catch (error) {
			showFeedback('error', m.interaction_failed({ error: getErrorMessage(error) }));
		} finally {
			isCommenting = false;
		}
	}

	// Load native token price on mount
	async function loadNativeTokenPrice() {
		priceLoading = true;
		try {
			nativeTokenPrice = await getNativeTokenPriceUsd();
			nativeSymbol = getNativeTokenSymbol();
		} catch (e) {
			console.error('Failed to load native token price:', e);
		} finally {
			priceLoading = false;
		}
	}

	// Calculate approximate native token amount from USD
	function getApproxNativeAmount(usdAmount: string): string {
		if (!nativeTokenPrice || nativeTokenPrice <= 0) return '...';
		const usd = parseFloat(usdAmount);
		if (isNaN(usd) || usd <= 0) return '0';
		const nativeAmount = usd / nativeTokenPrice;
		return nativeAmount.toFixed(6);
	}

	// Get author ID from article data
	const articleAuthorId = $derived(
		(article?.author?.id || '').toLowerCase()
	);

	// Use fetched authorData if available, fallback to article.author
	const author = $derived(authorData ?? article?.author ?? { id: '', nickname: null, avatar: null });
	const authorId = $derived(author.id || articleAuthorId || '');

	// article.id is now arweaveId (primary key)
	const coverUrl = $derived(article ? getCoverUrl(article.id) : '');
	const categoryName = $derived(article ? getCategoryName(article.categoryId) : '');
	// Display author name: prefer fetched nickname > article.author.nickname > originalAuthor > short address
	const displayAuthor = $derived(
		authorData?.nickname ||
		author.nickname ||
		article?.originalAuthor ||
		shortAddress(authorId) ||
		'Anonymous'
	);
	// Get author avatar (prefer fetched data)
	const authorAvatar = $derived(authorData?.avatar || author.avatar);
	// Get author avatar initials safely
	const authorInitials = $derived(
		(authorData?.nickname || author.nickname)
			? (authorData?.nickname || author.nickname || '').slice(0, 2).toUpperCase()
			: (article?.originalAuthor
				? article.originalAuthor.slice(0, 2).toUpperCase()
				: (authorId ? authorId.slice(2, 4).toUpperCase() : '??'))
	);
	const authorAddress = $derived(authorId);
	const readingTime = $derived(articleContent?.content ? getReadingTime(articleContent.content) : 0);
	// Check if current user is the article author (for edit button)
	const isAuthor = $derived(
		walletAddress && article && walletAddress.toLowerCase() === authorId.toLowerCase()
	);
	const maxCollectSupply = $derived(article ? BigInt(article.maxCollectSupply) : 0n);
	const collectEnabled = $derived(maxCollectSupply > 0n);
	const collectAvailable = $derived(collectEnabled && localCollectCount < Number(maxCollectSupply));
	
	// Article quality score: round(likeAmount*10/(likeAmount+dislikeAmount*2), 1)
	const qualityScore = $derived(() => {
		if (!article) return null;
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

	// Fetch author data separately (SubSquid relation resolution has issues)
	async function fetchAuthorData() {
		if (!article) return;
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
	}

	// Load article history versions
	async function loadVersions() {
		if (versionsLoaded || versionsLoading || !article) return;
		versionsLoading = true;
		try {
			versions = await queryArticleVersions(article.id);
			versionsLoaded = true;
			// Find current version index
			if (versionTxId) {
				const idx = versions.findIndex(v => v.txId === versionTxId);
				if (idx >= 0) currentVersionIndex = idx;
			}
		} catch (e) {
			console.error('Failed to load versions:', e);
		} finally {
			versionsLoading = false;
		}
	}

	// Format timestamp to date string
	function formatTimestamp(ts: number): string {
		const date = new Date(ts);
		return date.toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	// Get word count from content
	function getWordCount(content: string): number {
		return content.trim().split(/\s+/).length;
	}

	// Toggle versions dropdown
	async function toggleVersionsDropdown() {
		if (!versionsLoaded) {
			await loadVersions();
		}
		showVersionsDropdown = !showVersionsDropdown;
	}

	// Check if viewing a specific version (not latest)
	const isViewingOldVersion = $derived(!!versionTxId && article && versionTxId !== article.id);

	// Get version cover URL (use static URL for specific version)
	function getVersionCoverUrl(txId: string): string {
		return getStaticFolderUrl(txId, ARTICLE_COVER_IMAGE_FILE);
	}

	/**
	 * Process article content to replace relative image URLs with full Irys URLs
	 * Handles two formats:
	 * 1. Markdown: ![alt](filename.png) -> ![alt](https://{host}/mutable/{arweaveId}/filename.png)
	 * 2. HTML: <img src="filename.jpg" ... /> -> <img src="https://{host}/mutable/{arweaveId}/filename.jpg" ... />
	 * @param content - The markdown content
	 * @param arweaveId - The article's arweave ID (manifest ID)
	 * @param useMutable - Whether to use mutable URL (true for latest, false for specific version)
	 */
	function processContentImages(content: string, arweaveId: string, useMutable = true): string {
		// Use getMutableFolderUrl/getStaticFolderUrl which handle devnet/mainnet correctly
		const baseUrl = useMutable 
			? getMutableFolderUrl(arweaveId)
			: getStaticFolderUrl(arweaveId);
		
		// Process Markdown image syntax: ![alt](relative-path)
		// Only replace if the path is relative (not starting with http://, https://, or /)
		let processed = content.replace(
			/!\[([^\]]*)\]\((?!https?:\/\/)(?!\/)([\w\-\.]+)\)/g,
			(_, alt, filename) => `![${alt}](${baseUrl}/${filename})`
		);
		
		// Process HTML img tags: <img src="relative-path" ... />
		// Only replace if src is relative (not starting with http://, https://, or /)
		processed = processed.replace(
			/<img\s+([^>]*?)src=["'](?!https?:\/\/)(?!\/)([^"']+)["']([^>]*?)>/gi,
			(_, before, filename, after) => `<img ${before}src="${baseUrl}/${filename}"${after}>`
		);

		return processed;
	}

	// Initialize local counts after article is loaded
	$effect(() => {
		if (article) {
			localDislikeAmount = String(article.dislikeAmount);
			localCollectCount = Number(article.collectCount);
		}
	});

	// Load article data and content
	onMount(async () => {
		// Get article ID and version from URL
		const articleId = $page.url.searchParams.get('id');
		versionTxId = $page.url.searchParams.get('v');
		
		if (!articleId) {
			articleError = 'Article ID is required';
			articleLoading = false;
			contentLoading = false;
			return;
		}

		// Load article metadata from GraphQL with retry logic
		// For newly published articles, the indexer may not have processed the event yet
		const MAX_RETRY_TIME = 5000; // 5 seconds max cumulative wait
		const RETRY_DELAYS = [500, 1000, 1500, 2000]; // Exponential backoff delays
		let totalWaitTime = 0;
		let retryIndex = 0;
		let loadedArticle: ArticleDetailData | null = null;

		while (totalWaitTime < MAX_RETRY_TIME) {
			try {
				const result = await client.query(ARTICLE_BY_ID_QUERY, { id: articleId }, { requestPolicy: 'network-only' }).toPromise();

				if (result.error) {
					articleError = result.error.message;
					articleLoading = false;
					contentLoading = false;
					return;
				}

				loadedArticle = result.data?.articleById ?? null;

				if (loadedArticle) {
					// Found the article, break out of retry loop
					break;
				}

				// Article not found, wait and retry
				if (retryIndex < RETRY_DELAYS.length) {
					const delay = RETRY_DELAYS[retryIndex];
					if (totalWaitTime + delay > MAX_RETRY_TIME) {
						// Would exceed max wait time, stop retrying
						break;
					}
					console.log(`Article not found in index, retrying in ${delay}ms... (attempt ${retryIndex + 1})`);
					await new Promise(resolve => setTimeout(resolve, delay));
					totalWaitTime += delay;
					retryIndex++;
				} else {
					// No more retries
					break;
				}
			} catch (e) {
				articleError = e instanceof Error ? e.message : 'Failed to load article';
				console.error('Failed to load article:', e);
				articleLoading = false;
				contentLoading = false;
				return;
			}
		}

		if (!loadedArticle) {
			articleError = 'Article not found';
			articleLoading = false;
			contentLoading = false;
			return;
		}

		article = loadedArticle;
		articleLoading = false;
		
		// Load native token price for USD conversion
		loadNativeTokenPrice();
		
		// Fetch author data first
		fetchAuthorData();
		
		// Close dropdown when clicking outside
		const handleClickOutside = (e: MouseEvent) => {
			if (showVersionsDropdown) {
				const target = e.target as HTMLElement;
				if (!target.closest('.relative')) {
					showVersionsDropdown = false;
				}
			}
		};
		document.addEventListener('click', handleClickOutside);
		
		await checkWalletConnection();
		const eth = typeof window !== 'undefined' ? window.ethereum : undefined;
		eth?.on?.('accountsChanged', async (accounts: unknown) => {
			const accts = accounts as string[];
			walletAddress = accts.length > 0 ? accts[0] : null;
			if (walletAddress) {
				sessionKey = getStoredSessionKey();
				hasValidSessionKey = await isSessionKeyValidForCurrentWallet();
				fetchCurrentUserData(walletAddress);
			} else {
				sessionKey = null;
				hasValidSessionKey = false;
				currentUserData = null;
			}
		});
		try {
			// If viewing a specific version, fetch that version's content and metadata
			if (versionTxId) {
				// Load versions to get metadata for the current version
				if (!versionsLoaded) {
					await loadVersions();
				}
				// Find the current version's metadata
				const versionInfo = versions.find(v => v.txId === versionTxId);
				if (versionInfo) {
					currentVersionMeta = {
						title: versionInfo.title,
						summary: versionInfo.summary,
						owner: versionInfo.owner,
						timestamp: versionInfo.timestamp
					};
				}
				const content = await fetchArticleVersionContent(versionTxId);
				articleContent = {
					title: currentVersionMeta?.title || '',
					content,
					summary: currentVersionMeta?.summary || '',
					tags: [],
					createdAt: currentVersionMeta?.timestamp || Date.now(),
					version: '1.0.0'
				};
			} else if (!articleContent) {
				// Content not loaded yet (initial load failed or skipped), try again
				// article.id is now arweaveId
				articleContent = await fetchArticleMetadata(article.id);
			}
		} catch (e) {
			contentError = e instanceof Error ? e.message : 'Failed to load article content';
			console.error('Failed to fetch article content:', e);
		} finally {
			contentLoading = false;
		}
	});
</script>

<svelte:head>
	<title>{currentVersionMeta?.title || article?.title || 'Article'} - AmberInk</title>
	<meta
		name="description"
		content={articleContent?.summary ||
			currentVersionMeta?.title ||
			article?.title ||
			'AmberInk Article'}
	/>
</svelte:head>

{#if articleLoading}
	<!-- Skeleton Screen -->
	<article class="mx-auto w-full max-w-[680px] px-6 py-12">
		<!-- Title Skeleton -->
		<header class="mb-8">
			<div class="mb-6 h-20 w-full animate-pulse rounded-lg bg-gray-200"></div>

			<!-- Author Info Skeleton -->
			<div class="flex items-center gap-3">
				<div class="h-11 w-11 shrink-0 animate-pulse rounded-full bg-gray-200"></div>
				<div class="flex flex-1 flex-col gap-2">
					<div class="h-5 w-32 animate-pulse rounded bg-gray-200"></div>
					<div class="h-4 w-48 animate-pulse rounded bg-gray-200"></div>
				</div>
			</div>
		</header>

		<!-- Interaction Bar Skeleton -->
		<div class="mb-8">
			<div class="flex items-center justify-between border-y border-gray-100 py-3">
				<div class="flex items-center gap-5">
					<div class="h-6 w-8 animate-pulse rounded bg-gray-200"></div>
					<div class="h-6 w-16 animate-pulse rounded bg-gray-200"></div>
					<div class="h-6 w-12 animate-pulse rounded bg-gray-200"></div>
					<div class="h-6 w-12 animate-pulse rounded bg-gray-200"></div>
				</div>
				<div class="flex items-center gap-3">
					<div class="h-6 w-6 animate-pulse rounded bg-gray-200"></div>
					<div class="h-6 w-6 animate-pulse rounded bg-gray-200"></div>
				</div>
			</div>
		</div>

		<!-- Cover Image Skeleton -->
		<div class="mb-10 h-96 w-full animate-pulse rounded-lg bg-gray-200"></div>

		<!-- Content Skeleton -->
		<div class="prose prose-lg max-w-none space-y-4">
			<div class="h-4 w-full animate-pulse rounded bg-gray-200"></div>
			<div class="h-4 w-full animate-pulse rounded bg-gray-200"></div>
			<div class="h-4 w-3/4 animate-pulse rounded bg-gray-200"></div>
			<div class="h-4 w-full animate-pulse rounded bg-gray-200"></div>
			<div class="h-4 w-5/6 animate-pulse rounded bg-gray-200"></div>
			<div class="h-4 w-full animate-pulse rounded bg-gray-200"></div>
			<div class="h-4 w-2/3 animate-pulse rounded bg-gray-200"></div>
		</div>
	</article>
{:else if articleError}
	<div class="mx-auto max-w-2xl px-6 py-16">
		<div class="rounded-lg border border-red-200 bg-red-50 p-6 text-center">
			<p class="text-red-800">{articleError}</p>
		</div>
	</div>
{:else if !article}
	<div class="mx-auto max-w-2xl px-6 py-16">
		<div class="rounded-lg border border-red-200 bg-red-50 p-6 text-center">
			<p class="text-red-800">{m.article_not_found()}</p>
		</div>
	</div>
{:else}
	<!-- Medium-style article layout -->
	<article class="mx-auto w-full max-w-[680px] px-6 py-12">
		<!-- Old Version Banner -->
		{#if isViewingOldVersion}
			<div
				class="mb-6 flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-4 py-3"
			>
				<div class="flex items-center gap-2 text-amber-800">
					<ClockIcon size={20} />
					<span class="text-sm font-medium">{m.viewing_historical_version()}</span>
				</div>
				<a
					href={localizeHref(`/a?id=${article.id}`)}
					class="rounded-md bg-amber-600 px-3 py-1 text-sm font-medium text-white transition-colors hover:bg-amber-700"
				>
					{m.view_latest()}
				</a>
			</div>
		{/if}

		<!-- Title -->
		<header class="mb-8">
			<h1 class="mb-6 font-serif text-[32px] font-bold leading-tight text-gray-900 sm:text-[42px]">
				{currentVersionMeta?.title || article.title || `Article #${article.articleId}`}
			</h1>

			<!-- Author Info Bar -->
			<div class="flex items-center gap-3">
				<!-- Avatar -->
				<a href={localizeHref(`/u?id=${authorAddress}`)} class="shrink-0">
					{#if getAvatarUrl(authorAvatar)}
						<img
							src={getAvatarUrl(authorAvatar)}
							alt=""
							class="h-11 w-11 rounded-full object-cover"
						/>
					{:else}
						<div
							class="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-blue-400 to-purple-500 text-sm font-medium text-white"
						>
							{authorInitials}
						</div>
					{/if}
				</a>

				<div class="flex flex-1 flex-col">
					<!-- Name & Follow -->
					<div class="flex items-center gap-2">
						<a
							href={localizeHref(`/u?id=${authorAddress}`)}
							class="font-medium text-gray-900 hover:underline"
						>
							{displayAuthor}
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

					<!-- Read time & Date & Originality Tag -->
					<div class="flex items-center gap-2 text-sm text-gray-500">
						{#if readingTime > 0}
							<span>{m.min_read({ count: readingTime })}</span>
							<span>·</span>
						{/if}
						<time datetime={article.createdAt}>
							{formatDate(article.createdAt)}
						</time>
						<span>·</span>
						<!-- Originality Tag with different background colors -->
						{#if article.originality === 0}
							<span
								class="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700"
								>{m.original()}</span
							>
						{:else if article.originality === 1}
							<span class="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700"
								>{m.semi_original()}</span
							>
						{:else}
							<span class="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600"
								>{m.reprint()}</span
							>
						{/if}
					</div>
				</div>
			</div>
		</header>

		{#snippet interactionBar(position: 'top' | 'bottom')}
			{#if article}
				<div class={position === 'top' ? 'mb-8' : 'mt-12'}>
					<div class="flex items-center justify-between border-y border-gray-100 py-3">
						<div class="flex items-center gap-5">
							<!-- Quality Score -->
							{#if qualityScore() !== null}
								<span
									class={`text-lg font-bold ${getScoreColor(qualityScore())}`}
									title={m.article_quality_score()}
								>
									{qualityScore()?.toFixed(1)}
								</span>
							{:else}
								<span class="text-lg font-bold text-gray-300" title={m.no_ratings()}>--</span>
							{/if}

							<!-- Like/Tip -->
							<button
								type="button"
								class="group flex items-center gap-1.5 text-gray-500 transition-colors hover:text-amber-500"
								onclick={() => (showTipModal = true)}
								title={m.tip({})}
							>
								<!-- Thumbs Up Icon -->
								<ThumbsUpIcon size={20} />
								<span class="text-sm">{formatTips(article.totalTips)} {nativeSymbol}</span>
							</button>

							<!-- Comments -->
							<a
								href={localizeHref('#comments')}
								class="group flex items-center gap-1.5 text-gray-500 transition-colors hover:text-gray-900"
								title={m.comments({})}
							>
								<CommentIcon size={20} />
								<span class="text-sm">{article.comments?.length || 0}</span>
							</a>

							<!-- Collect/Bookmark (only show when collecting is enabled) -->
							{#if collectEnabled}
								<button
									type="button"
									class="group flex items-center gap-1.5 text-gray-500 transition-colors hover:text-gray-900"
									onclick={() => (showCollectModal = true)}
									title={m.collect()}
								>
									<!-- Bookmark Icon -->
									<BookmarkIcon size={20} />
									<span class="text-sm">{localCollectCount}/{maxCollectSupply.toString()}</span>
								</button>
							{/if}

							<!-- Dislike -->
							<button
								type="button"
								class="group flex items-center gap-1.5 text-gray-500 transition-colors hover:text-red-500 disabled:opacity-50"
								onclick={() => (showDislikeModal = true)}
								disabled={isDisliking}
								title={m.dislike({})}
							>
								<!-- Thumbs Down Icon -->
								<ThumbsDownIcon size={20} />
								<span class="text-sm">{formatTips(localDislikeAmount)}</span>
							</button>
						</div>

						<!-- Right side: History, Edit & Share -->
						<div class="flex items-center gap-3">
							<!-- History versions button -->
							<div class="relative">
								<button
									type="button"
									onclick={toggleVersionsDropdown}
									class="flex items-center gap-1 text-gray-500 transition-colors hover:text-gray-900"
									title={m.view_history_versions()}
								>
									<!-- Clock/History Icon -->
									<ClockIcon size={20} />
									{#if versionsLoading}
										<SpinnerIcon size={12} />
									{/if}
								</button>

								<!-- Versions Dropdown -->
								{#if showVersionsDropdown}
									<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
									<div
										class="absolute right-0 top-full z-50 mt-2 w-80 rounded-lg border border-gray-200 bg-white shadow-lg"
										onclick={(e) => e.stopPropagation()}
									>
										<div class="border-b border-gray-100 px-4 py-3">
											<div class="flex items-center justify-between">
												<h4 class="font-medium text-gray-900">{m.history_versions()}</h4>
												<button
													type="button"
													onclick={() => (showVersionsDropdown = false)}
													class="text-gray-400 hover:text-gray-600"
													aria-label={m.close_versions_dropdown()}
												>
													<CloseIcon size={16} />
												</button>
											</div>
											{#if isViewingOldVersion}
												<a
													href={`/a?id=${article.id}`}
													class="mt-2 inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
												>
													<BackIcon size={12} />
													{m.back_to_latest_version()}
												</a>
											{/if}
										</div>
										<div class="max-h-64 overflow-y-auto">
											{#if versions.length === 0}
												<div class="px-4 py-6 text-center text-sm text-gray-500">
													{versionsLoading ? m.loading() : m.no_history()}
												</div>
											{:else}
												{#each versions as version, idx}
													<a
														href={localizeHref(
															idx === 0
																? `/a?id=${article.id}`
																: `/a?id=${article.id}&v=${version.txId}`
														)}
														class="flex items-start gap-3 border-b border-gray-50 px-4 py-3 transition-colors hover:bg-gray-50"
														class:bg-blue-50={versionTxId === version.txId ||
															(idx === 0 && !versionTxId)}
														onclick={() => (showVersionsDropdown = false)}
													>
														<div
															class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-medium text-gray-600"
														>
															{versions.length - idx}
														</div>
														<div class="min-w-0 flex-1">
															<div class="flex items-center gap-2">
																<span class="truncate font-medium text-gray-900">
																	{version.title || article.title || m.untitled()}
																</span>
																{#if idx === 0}
																	<span
																		class="rounded bg-emerald-100 px-1.5 py-0.5 text-xs font-medium text-emerald-700"
																		>{m.latest()}</span
																	>
																{/if}
															</div>
															<div class="mt-0.5 flex items-center gap-2 text-xs text-gray-500">
																<span>{formatTimestamp(version.timestamp)}</span>
																{#if version.owner}
																	<span>·</span>
																	<span>{shortAddress(version.owner)}</span>
																{/if}
															</div>
														</div>
													</a>
												{/each}
											{/if}
										</div>
									</div>
								{/if}
							</div>

							<!-- Edit button (only for author) -->
							{#if isAuthor}
								<a
									href={localizeHref(`/edit?id=${article.id}`)}
									class="text-gray-500 transition-colors hover:text-blue-600"
									title={m.edit({})}
								>
									<EditIcon size={20} />
								</a>
							{/if}
							<button
								type="button"
								onclick={handleShare}
								class="text-gray-500 transition-colors hover:text-gray-900"
								title={m.share({})}
							>
								<ShareIcon size={20} />
							</button>
						</div>
					</div>
				</div>
			{/if}
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
						<SpinnerIcon size={20} />
						<span>{m.loading_content({})}</span>
					</div>
				</div>
			{:else if contentError}
				<div class="rounded-lg border border-red-200 bg-red-50 p-6 text-center">
					<p class="text-red-700">{contentError}</p>
					{#if article}
						<a
							href={`${getArweaveGateways()[0]}/${article.id}`}
							target="_blank"
							rel="noopener noreferrer"
							class="mt-3 inline-block text-sm text-red-600 underline hover:text-red-800"
						>
							{m.view_on_arweave({})}
						</a>
					{/if}
				</div>
			{:else if articleContent?.content && article}
				<div class="prose prose-lg prose-gray max-w-none font-serif">
					{@html DOMPurify.sanitize(
						marked(
							processContentImages(articleContent.content, versionTxId || article.id, !versionTxId)
						) as string
					)}
				</div>
			{:else}
				<div class="py-8 text-center text-gray-500">
					<p>{m.no_items({ items: m.content() })}</p>
				</div>
			{/if}
		</div>

		<!-- Summary -->
		{#if articleContent?.summary}
			<aside class="mt-12 border-l-2 border-gray-200 pl-5 text-gray-600 italic">
				<p>{articleContent.summary}</p>
			</aside>
		{/if}

		<!-- Interaction Bar (Bottom) -->
		{@render interactionBar('bottom')}

		<!-- Comments Section -->
		<CommentSection
			articleId={article.articleId}
			comments={article.comments || []}
			{walletAddress}
			currentUserAvatar={currentUserData?.avatar}
			currentUserNickname={currentUserData?.nickname}
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
					{article.articleId}
				</div>
				<div>
					<span class="font-medium text-gray-700">{m.block({})}:</span>
					{article.blockNumber}
				</div>
				<div class="flex items-center gap-1">
					<span class="font-medium text-gray-700">{m.transaction({})}:</span>
					<a
						href={getBlockExplorerTxUrl(article.txHash)}
						target="_blank"
						rel="noopener noreferrer"
						class="text-blue-600 hover:underline"
					>
						{article.txHash.slice(0, 10)}...{article.txHash.slice(-8)}
					</a>
				</div>
				<div class="flex items-center gap-1">
					<span class="font-medium text-gray-700">{m.arweave()}:</span>
					<a
						href={getIrysExplorerUrl(article.id)}
						target="_blank"
						rel="noopener noreferrer"
						class="text-blue-600 hover:underline"
					>
						{article.id.slice(0, 10)}...
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
			<div
				class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
				role="dialog"
				aria-modal="true"
				tabindex="-1"
				onclick={config.onClose}
			>
				<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
				<div
					class="mx-4 w-full max-w-sm rounded-xl bg-white p-6 shadow-xl"
					role="document"
					onclick={(e) => e.stopPropagation()}
				>
					<h3 class="mb-4 text-lg font-bold text-gray-900">{config.title}</h3>
					{#if config.description}
						<p class="mb-4 text-sm text-gray-500">{config.description}</p>
					{/if}

					<div class="mb-4">
						<label for={config.inputId} class="mb-2 block text-sm font-medium text-gray-700"
							>{config.labelText}</label
						>
						<div class="flex items-center gap-2">
							<span class="text-sm font-medium text-gray-600">$</span>
							<input
								id={config.inputId}
								type="number"
								value={config.value}
								oninput={(e) => config.onValueChange(e.currentTarget.value)}
								step="0.01"
								min="0.01"
								class="flex-1 rounded-lg border border-gray-300 px-4 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
								disabled={config.isProcessing}
							/>
							<span class="text-sm font-medium text-gray-600">USD</span>
						</div>
						<!-- Show approximate native token amount -->
						<div class="mt-2 text-xs text-gray-500">
							{#if priceLoading}
								{m.price_loading({})}
							{:else if nativeTokenPrice}
								≈ {getApproxNativeAmount(config.value)} {nativeSymbol}
							{/if}
						</div>
					</div>

					<!-- Quick USD amounts -->
					<div class="mb-6 flex gap-2">
						{#each ['0.50', '1.00', '2.00', '5.00'] as amount}
							<button
								type="button"
								onclick={() => config.onValueChange(amount)}
								class="flex-1 rounded-lg border border-gray-200 py-1.5 text-sm transition-colors hover:border-{config.colorScheme}-500 hover:bg-{config.colorScheme}-50"
								class:border-emerald-500={config.colorScheme === 'emerald' &&
									config.value === amount}
								class:bg-emerald-50={config.colorScheme === 'emerald' && config.value === amount}
								class:border-amber-500={config.colorScheme === 'amber' && config.value === amount}
								class:bg-amber-50={config.colorScheme === 'amber' && config.value === amount}
								class:border-red-500={config.colorScheme === 'red' && config.value === amount}
								class:bg-red-50={config.colorScheme === 'red' && config.value === amount}
							>
								${amount}
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

	<!-- Collect Modal (only when collecting is enabled) -->
	{#if showCollectModal && collectEnabled && article}
		<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions a11y_interactive_supports_focus -->
		<div
			class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
			role="dialog"
			aria-modal="true"
			tabindex="-1"
			onclick={() => (showCollectModal = false)}
		>
			<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
			<div
				class="mx-4 w-full max-w-md rounded-xl bg-white p-6 shadow-xl"
				role="document"
				onclick={(e) => e.stopPropagation()}
			>
				<h3 class="mb-4 text-lg font-bold text-gray-900">{m.collect_article()}</h3>

				<!-- Collect Stats -->
				<div class="mb-6 grid grid-cols-3 gap-4">
					<div class="rounded-lg bg-gray-50 p-3 text-center">
						<div class="text-2xl font-bold text-gray-900">{localCollectCount}</div>
						<div class="text-xs text-gray-500">{m.collected_count()}</div>
					</div>
					<div class="rounded-lg bg-gray-50 p-3 text-center">
						<div class="text-2xl font-bold text-emerald-600">
							{formatTips(article?.collectPrice || '0')}
						</div>
						<div class="text-xs text-gray-500">{m.price_label()} ({nativeSymbol})</div>
					</div>
					<div class="rounded-lg bg-gray-50 p-3 text-center">
						<div class="text-2xl font-bold text-gray-900">
							{maxCollectSupply > 0n
								? (maxCollectSupply - BigInt(localCollectCount)).toString()
								: '∞'}
						</div>
						<div class="text-xs text-gray-500">{m.remaining()}</div>
					</div>
				</div>

				<!-- Collectors List -->
				{#if article?.collections && article.collections.length > 0}
					<div class="mb-6">
						<h4 class="mb-3 text-sm font-medium text-gray-700">
							{m.collectors()} ({article.collections.length})
						</h4>
						<div class="max-h-48 overflow-y-auto rounded-lg border border-gray-200">
							<table class="w-full text-sm">
								<thead class="sticky top-0 bg-gray-50">
									<tr class="text-left text-xs text-gray-500">
										<th class="px-3 py-2">{m.address()}</th>
										<th class="px-3 py-2 text-right">{m.amount()}</th>
										<th class="px-3 py-2 text-right">{m.time()}</th>
									</tr>
								</thead>
								<tbody class="divide-y divide-gray-100">
									{#each article.collections as collection}
										<tr class="hover:bg-gray-50">
											<td class="px-3 py-2">
												<a
													href={localizeHref(`/u?id=${collection.user.id}`)}
													class="flex items-center gap-2 hover:underline"
												>
													{#if getAvatarUrl(collection.user.avatar)}
														<img
															src={getAvatarUrl(collection.user.avatar)}
															alt=""
															class="h-6 w-6 rounded-full object-cover"
														/>
													{:else}
														<div
															class="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-blue-400 to-purple-500 text-xs font-medium text-white"
														>
															{collection.user.id.slice(2, 4).toUpperCase()}
														</div>
													{/if}
													<span class="truncate text-gray-700"
														>{collection.user.nickname || shortAddress(collection.user.id)}</span
													>
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
						{m.no_items({ items: m.collectors() })}
					</div>
				{/if}

				<!-- Action Buttons -->
				<div class="flex gap-3">
					<button
						type="button"
						onclick={() => (showCollectModal = false)}
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
							{m.sold_out()}
						{:else}
							{m.collect_for({
								price: formatTips(article?.collectPrice || '0'),
								symbol: nativeSymbol
							})}
						{/if}
					</button>
				</div>
			</div>
		</div>
	{/if}

	<!-- Tip Modal -->
	{@render amountModal({
		show: showTipModal,
		onClose: () => (showTipModal = false),
		title: m.tip_author({}),
		labelText: m.tip_in_usd({}),
		inputId: 'tip-amount',
		value: tipAmountUsd,
		onValueChange: (v: string) => (tipAmountUsd = v),
		isProcessing: isTipping,
		onSubmit: handleTip,
		submitText: m.send_tip({}),
		colorScheme: 'amber'
	})}

	<!-- Dislike Modal -->
	{@render amountModal({
		show: showDislikeModal,
		onClose: () => (showDislikeModal = false),
		title: m.dislike({}),
		description: m.dislike_description({}),
		labelText: m.dislike_in_usd({}),
		inputId: 'dislike-amount',
		value: dislikeAmountUsd,
		onValueChange: (v: string) => (dislikeAmountUsd = v),
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
{/if}
