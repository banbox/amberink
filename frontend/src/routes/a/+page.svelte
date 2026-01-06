<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	import { shortAddress, ZERO_ADDRESS } from '$lib/utils';
	import { getCategoryName } from '$lib/categoryUtils';
	import { formatDateMedium, formatTimestamp, getReadingTime, formatWeiToEth } from '$lib/formatUtils';
	import { getContractErrorMessage } from '$lib/contractErrors';
	import { getCoverImageUrl, getAvatarUrl, fetchArticleMarkdown, fetchArticleMetadataFromIrys, type IrysArticleMetadata } from '$lib/arweave';
	import { getSignMessageForArticle, deriveEncryptionKey } from '$lib/arweave/crypto';
	import { getCachedEncryptionKey, cacheEncryptionSignature } from '$lib/arweave/encryptionKeyCache';
	import { getWalletClient, getEthereumAccount } from '$lib/wallet';
	import { queryArticleVersions, fetchArticleVersionContent, queryLatestIrysTxId, type ArticleVersion } from '$lib/arweave/folder';
	import { onMount, untrack } from 'svelte';
	import { marked } from 'marked';
	import DOMPurify from 'dompurify';
	import CommentSection from '$lib/components/CommentSection.svelte';
	import { client, ARTICLE_BY_ID_QUERY, type UserData, type ArticleDetailData } from '$lib/graphql';
	import { page } from '$app/stores';
	import { usdToWei, getNativeTokenPriceUsd, getNativeTokenSymbol } from '$lib/priceService';
	import { getDefaultTipAmountUsd, getDefaultDislikeAmountUsd, getMinActionValueUsd, getArweaveGateways, getIrysNetwork, setEphemeralEnvName } from '$lib/config';
	import { getBlockExplorerTxUrl, getViewblockArweaveUrl, getBlockExplorerAddressUrl } from '$lib/chain';
	import {
		EvaluationScore,
		collectArticle,
		collectArticleWithSessionKey,
		evaluateArticle,
		evaluateArticleWithSessionKey,
		followUser,
		followUserWithSessionKey
	} from '$lib/contracts';
	import {type StoredSessionKey, callWithSessionKey} from '$lib/sessionKey';
	import { fetchUserData, checkWalletConnection, setupWalletAccountListener } from '$lib/sessionKey';
	import { getMinActionValue } from '$lib/config';
	import { localizeHref } from '$lib/paraglide/runtime';
	import { ClockIcon, ThumbsUpIcon, ThumbsDownIcon, CommentIcon, BookmarkIcon, CloseIcon, BackIcon, EditIcon, ShareIcon, SpinnerIcon } from '$lib/components/icons';
	import OriginalityTag from '$lib/components/OriginalityTag.svelte';
	import AmountModal from '$lib/components/AmountModal.svelte';
	import ArticleSkeleton from '$lib/components/ArticleSkeleton.svelte';
	import UserAvatar from '$lib/components/UserAvatar.svelte';
	import CollectModal from '$lib/components/CollectModal.svelte';  // new component
	import { processContentImages, getScoreColor, pollForArticleWithRetry } from '$lib/utils/articleUtils';

	// Native token price state
	let nativeTokenPrice = $state<number | null>(null);
	let priceLoading = $state(false);
	let nativeSymbol = $state('ETH');

	let article = $state<ArticleDetailData | null>(null);
	let versionTxId = $state<string | null>(null);
	let currentIrysTxId = $state<string | null>(null);
	let articleLoading = $state(true);
	let articleError = $state<string | null>(null);

	// Article content from Arweave
	let articleContent = $state<string | null>(null);
	let contentLoading = $state(true);
	let contentError = $state<string | null>(null);

	// Author data (fetched separately because SubSquid relation resolution has issues)
	let authorData = $state<UserData | null>(null);
	
	// Current user data (for comment section)
	let currentUserData = $state<UserData | null>(null);

	// Irys metadata (for cross-chain display when Subsquid is unavailable)
	let irysMetadata = $state<IrysArticleMetadata | null>(null);
	let irysMetadataLoading = $state(false);

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

	// Article ID and version from URL - initialized in onMount to avoid prerendering issues
	let currentArticleId = $state<string | null>(null);
	let currentVersionTxId = $state<string | null>(null);
	let isMounted = $state(false);

	// Check if current user can perform action on article (prevent self-action)
	function canPerformAction(actionName: string): boolean {
		if (!walletAddress) {
			showFeedback('error', m.connect_wallet_first());
			return false;
		}
		if (!article) return false;
		if (isAuthor) {
			showFeedback('error', m.cannot_action_own({ action: actionName, item: m.article() }));
			return false;
		}
		return true;
	}

	// Generic interaction handler to reduce redundancy
	async function executeInteraction(
		loadingSetter: (val: boolean) => void,
		task: () => Promise<void>,
		successMessage?: string,
		onSuccess?: () => void
	) {
		loadingSetter(true);
		try {
			await task();
			if (successMessage) showFeedback('success', successMessage);
			if (onSuccess) onSuccess();
		} catch (error) {
			showFeedback('error', m.interaction_failed({ error: getContractErrorMessage(error) }));
		} finally {
			loadingSetter(false);
		}
	}

	async function handleCollect() {
		if (!canPerformAction(m.collect()) || !article || isCollecting) {
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

		await executeInteraction(
			(v) => isCollecting = v,
			async () => {
				if(!article) return;
				// Use articleId for contract interaction (not arweaveId)
				const chainArticleId = BigInt(article.articleId);
				const priceWei = BigInt(article.collectPrice);
				await callWithSessionKey(
					(sk) => collectArticleWithSessionKey(sk, chainArticleId, ZERO_ADDRESS, priceWei),
					() => collectArticle(chainArticleId, ZERO_ADDRESS, priceWei),
					{ txValue: priceWei }
				);
				localCollectCount = localCollectCount + 1;
			},
			m.success({ action: m.collect() })
		);
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

	// Show feedback message (inline implementation)
	function showFeedback(type: 'success' | 'error', text: string) {
		feedbackMessage = { type, text };
		setTimeout(() => {
			feedbackMessage = null;
		}, 3000);
	}

	// Handle Dislike
	async function handleDislike() {
		if (!canPerformAction(m.dislike())) {
			showDislikeModal = false;
			return;
		}
		const amount = parseFloat(dislikeAmountUsd);
		if (isNaN(amount) || amount <= 0) {
			showFeedback('error', m.invalid_amount());
			return;
		}
		
		await executeInteraction(
			(v) => isDisliking = v,
			async () => {
				if(!article) return;
				const chainArticleId = BigInt(article.articleId);
				const dislikeWei = await usdToWei(dislikeAmountUsd);
				await callWithSessionKey(
					(sk) => evaluateArticleWithSessionKey(sk, chainArticleId, EvaluationScore.Dislike, '', ZERO_ADDRESS, 0n, dislikeWei),
					() => evaluateArticle(chainArticleId, EvaluationScore.Dislike, '', ZERO_ADDRESS, 0n, dislikeWei),
					{ txValue: dislikeWei }
				);
				localDislikeAmount = (BigInt(localDislikeAmount) + dislikeWei).toString();
			},
			m.success({ action: m.dislike() }),
			() => {
				showDislikeModal = false;
				dislikeAmountUsd = getDefaultDislikeAmountUsd();
			}
		);
	}

	// Handle Follow
	async function handleFollow() {
		if (!canPerformAction(m.follow()) || isFollowing) return;
		
		await executeInteraction(
			(v) => isFollowing = v,
			async () => {
				const targetAddress = (authorId || article?.author?.id || '') as `0x${string}`;
				await callWithSessionKey(
					(sk) => followUserWithSessionKey(sk, targetAddress, true),
					() => followUser(targetAddress, true),
					{ txValue: 0n }
				);
			},
			m.success({ action: m.follow() })
		);
	}

	// Handle Tip
	async function handleTip() {
		if (!canPerformAction(m.tip())) {
			showTipModal = false;
			return;
		}
		const amount = parseFloat(tipAmountUsd);
		if (isNaN(amount) || amount <= 0) {
			showFeedback('error', m.invalid_amount());
			return;
		}

		await executeInteraction(
			(v) => isTipping = v,
			async () => {
				if(!article) return;
				const chainArticleId = BigInt(article.articleId);
				const tipWei = await usdToWei(tipAmountUsd);
				await callWithSessionKey(
					(sk) => evaluateArticleWithSessionKey(sk, chainArticleId, EvaluationScore.Like, '', ZERO_ADDRESS, 0n, tipWei),
					() => evaluateArticle(chainArticleId, EvaluationScore.Like, '', ZERO_ADDRESS, 0n, tipWei),
					{ txValue: tipWei }
				);
			},
			m.success({ action: m.tip() }),
			() => {
				showTipModal = false;
				tipAmountUsd = getDefaultTipAmountUsd();
			}
		);
	}

	// Handle Comment
	async function handleComment(commentText: string): Promise<boolean> {
		if (!walletAddress) {
			showFeedback('error', m.connect_wallet_first());
			return false;
		}
		if (!commentText.trim()) return false;
		
		let success = false;
		await executeInteraction(
			(v) => isCommenting = v,
			async () => {
				if(!article) return;
				const chainArticleId = BigInt(article.articleId);
				const minValueUsd = getMinActionValueUsd();
				const minValueFromUsd = await usdToWei(minValueUsd);
				const contractMinValue = getMinActionValue();
				const minValue = minValueFromUsd > contractMinValue ? minValueFromUsd : contractMinValue;
				const text = commentText.trim();
				await callWithSessionKey(
					(sk) => evaluateArticleWithSessionKey(sk, chainArticleId, EvaluationScore.Neutral, text, ZERO_ADDRESS, 0n, minValue),
					() => evaluateArticle(chainArticleId, EvaluationScore.Neutral, text, ZERO_ADDRESS, 0n, minValue),
					{ txValue: minValue }
				);
				// Refresh comments after successful submission (wait for indexer)
				await refreshArticleComments();
				success = true;
			},
			m.comment_success({})
		);
		return success;
	}

	// Refresh article comments from GraphQL (waits for indexer to process)
	async function refreshArticleComments() {
		if (!article) return;
		// Wait briefly for Subsquid indexer to process the event
		await new Promise(resolve => setTimeout(resolve, 2000));
		try {
			const result = await client.query(ARTICLE_BY_ID_QUERY, { id: article.id }, { requestPolicy: 'network-only' }).toPromise();
			if (result.data?.articleById) {
				article = result.data.articleById;
			}
		} catch (e) {
			console.error('Failed to refresh comments:', e);
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



	// Get author ID from article data or Irys metadata
	const articleAuthorId = $derived(
		(article?.author?.id || irysMetadata?.author || '').toLowerCase()
	);

	// Use fetched authorData if available, fallback to article.author
	const author = $derived(authorData ?? article?.author ?? { id: irysMetadata?.author || '', nickname: null, avatar: null });
	const authorId = $derived(author.id || articleAuthorId || '');

	// article.id is now arweaveId (primary key), also available as currentArticleId in Irys-only mode
	const articleIdForDisplay = $derived(article?.id || currentArticleId || '');
	const coverUrl = $derived(articleIdForDisplay ? getCoverImageUrl(articleIdForDisplay, true) : '');
	const categoryName = $derived(article ? getCategoryName(article.categoryId) : '');
	
	// Display title: prefer version meta > article > irysMetadata
	const displayTitle = $derived(
		currentVersionMeta?.title || article?.title || irysMetadata?.title || 'Untitled'
	);
	
	// Display author name: prefer fetched nickname > article.author.nickname > originalAuthor > irysMetadata author > short address
	const displayAuthor = $derived(
		authorData?.nickname ||
		author.nickname ||
		article?.originalAuthor ||
		shortAddress(authorId || irysMetadata?.author || '') ||
		'Anonymous'
	);

	// Check if author is address-only (no nickname)
	const isAddressOnlyAuthor = $derived(
		authorId && 
		!authorData?.nickname &&
		!author.nickname &&
		!article?.originalAuthor
	);

	const authorAddress = $derived(authorId || irysMetadata?.author || '');
	const authorLink = $derived(
		isAddressOnlyAuthor 
			? getBlockExplorerAddressUrl(authorAddress) 
			: localizeHref(`/u?id=${authorAddress}`)
	);
	
	const authorTarget = $derived(isAddressOnlyAuthor ? '_blank' : '_self');
	// Get author avatar (prefer fetched data)
	const authorAvatar = $derived(authorData?.avatar || author.avatar);
	// Get author avatar initials safely
	const authorInitials = $derived(
		(authorData?.nickname || author.nickname)
			? (authorData?.nickname || author.nickname || '').slice(0, 2).toUpperCase()
			: (article?.originalAuthor
				? article.originalAuthor.slice(0, 2).toUpperCase()
				: (authorAddress ? authorAddress.slice(2, 4).toUpperCase() : '??'))
	);
	const readingTime = $derived(articleContent ? getReadingTime(articleContent) : 0);
	// Check if current user is the article author (for edit button)
	const isAuthor = $derived(
		walletAddress && article && authorAddress && walletAddress.toLowerCase() === authorAddress.toLowerCase()
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
	


	// Fetch author data separately (SubSquid relation resolution has issues)
	async function fetchAuthorData() {
		if (!article) return;
		const targetAuthorId = articleAuthorId;
		if (!targetAuthorId || targetAuthorId === ZERO_ADDRESS) return;
		
		authorData = await fetchUserData(targetAuthorId);
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

	// Toggle versions dropdown
	async function toggleVersionsDropdown() {
		if (!versionsLoaded) {
			await loadVersions();
		}
		showVersionsDropdown = !showVersionsDropdown;
	}

	// Check if viewing a specific version (not latest)
	const isViewingOldVersion = $derived(!!versionTxId && article && versionTxId !== article.id);


	// Initialize local counts after article is loaded
	$effect(() => {
		if (article) {
			localDislikeAmount = String(article.dislikeAmount);
			localCollectCount = Number(article.collectCount);
		}
	});

	// Reset article state for new article load
	function resetArticleState() {
		article = null;
		articleContent = null;
		articleError = null;
		contentError = null;
		articleLoading = true;
		contentLoading = true;
		authorData = null;
		currentUserData = null;
		versions = [];
		versionsLoaded = false;
		versionsLoading = false;
		currentVersionIndex = null;
		currentVersionMeta = null;
		currentIrysTxId = null;
		localDislikeAmount = '0';
		localCollectCount = 0;
		showVersionsDropdown = false;
		// Reset Irys metadata
		irysMetadata = null;
		irysMetadataLoading = false;
	}

	/**
	 * Load article content from Arweave
	 * This function works independently of Subsquid data, using only Irys data
	 * @param articleId - The manifest ID of the article
	 * @param versionId - Optional version TX ID for historical versions
	 * @param metadata - Optional Irys metadata (visibility, author) to avoid repeated fetching
	 */
	async function loadArticleContent(articleId: string, versionId: string | null, metadata?: IrysArticleMetadata | null) {
		try {
			// Use passed metadata, or fall back to stored irysMetadata, or fetch if not available
			let meta = metadata || irysMetadata;
			if (!meta) {
				meta = await fetchArticleMetadataFromIrys(articleId);
				if (meta) {
					irysMetadata = meta;
				}
			}

			// Determine visibility and author from Irys metadata or Subsquid data
			const visibility = meta?.visibility ?? article?.visibility ?? 0;
			const authorAddress = meta?.author?.toLowerCase() || article?.author?.id?.toLowerCase() || '';

			// If viewing a specific version, fetch that version's content and metadata
			if (versionId) {
				// Load versions to get metadata for the current version
				if (!versionsLoaded) {
					await loadVersions();
				}
				// Find the current version's metadata
				const versionInfo = versions.find(v => v.txId === versionId);
				if (versionInfo) {
					currentVersionMeta = {
						title: versionInfo.title,
						owner: versionInfo.owner,
						timestamp: versionInfo.timestamp
					};
				}
				// Use the version tx ID for the Irys explorer link
				currentIrysTxId = versionId;
				articleContent = await fetchArticleVersionContent(versionId);
			} else {
				// Check if article is encrypted (visibility === 2)
				if (visibility === 2) {
					console.log('Encrypted article detected, checking if current user is author...');
					// Check if current user is the author
					if (walletAddress && walletAddress.toLowerCase() === authorAddress) {
						console.log('Current user is author, attempting to decrypt...');
						try {
							const wClient = await getWalletClient();
							const account = await getEthereumAccount();
							if (wClient && account) {
								// 首先尝试从缓存获取解密密钥
								let decryptionKey = await getCachedEncryptionKey(articleId);
								
								if (decryptionKey) {
									console.log('Using cached encryption key');
									try {
										articleContent = await fetchArticleMarkdown(articleId, true, decryptionKey);
										console.log('Article decrypted successfully with cached key');
									} catch (cacheDecryptError) {
										// 缓存的密钥无效，清除缓存并重新请求签名
										console.warn('Cached key failed, requesting new signature...', cacheDecryptError);
										decryptionKey = null;
									}
								}
								
								// 如果缓存不存在或无效，请求新签名
								if (!decryptionKey || !articleContent) {
									console.log('Requesting wallet signature for decryption key...');
									const message = getSignMessageForArticle(articleId);
									const signature = await wClient.signMessage({ account, message });
									console.log('Wallet signature obtained');
									
									// 缓存签名以供下次使用
									cacheEncryptionSignature(articleId, signature);
									
									// 从签名派生密钥
									decryptionKey = await deriveEncryptionKey(signature);
									articleContent = await fetchArticleMarkdown(articleId, true, decryptionKey);
									console.log('Article decrypted successfully with new key');
								}
							} else {
								contentError = 'Please connect your wallet to decrypt this article.';
							}
						} catch (decryptError) {
							console.error('Failed to decrypt article:', decryptError);
							contentError = 'Failed to decrypt article. Please try again.';
						}
					} else {
						// Not the author - show encrypted message
						console.log('Current user is not author, showing encrypted message');
						contentError = 'This article is encrypted and can only be read by the author.';
					}
				} else {
					// Normal (non-encrypted) article
					articleContent = await fetchArticleMarkdown(articleId);
				}
				// Query the latest Irys tx ID for the explorer link
				currentIrysTxId = await queryLatestIrysTxId(articleId);
			}
		} catch (e) {
			contentError = e instanceof Error ? e.message : 'Failed to load article content';
			console.error('Failed to fetch article content:', e);
		} finally {
			contentLoading = false;
		}
	}

	// Load article data from GraphQL and content from Arweave
	// Implements parallel loading: Irys content loads immediately while waiting for Subsquid
	async function loadArticle(articleId: string, versionId: string | null) {
		if (!articleId) {
			articleError = 'Article ID is required';
			articleLoading = false;
			contentLoading = false;
			return;
		}

		// Reset state for new article
		resetArticleState();
		versionTxId = versionId;

		// Start loading content from Irys immediately (parallel with Subsquid query)
		// This enables cross-chain display even when Subsquid hasn't indexed yet
		// We capture the promise to await it later if needed
		const irysLoadPromise = loadArticleFromIrys(articleId, versionId);

		// Load article metadata from GraphQL with retry logic
		// For newly published articles, the indexer may not have processed the event yet
		let loadedArticle = await pollForArticleWithRetry(client, articleId);

		// If we have article from Subsquid, use it and load additional content
		if (loadedArticle) {
			article = loadedArticle;
			articleLoading = false;
			
			// Load native token price for USD conversion
			loadNativeTokenPrice();
			
			// Fetch author data
			fetchAuthorData();
			
			// Fetch current user data if wallet is connected
			if (walletAddress) {
				currentUserData = await fetchUserData(walletAddress);
			}
			
			// If content wasn't loaded by Irys loading (e.g. encrypted article), load it now
			if (!articleContent && !contentError) {
				await loadArticleContent(loadedArticle.id, versionId, irysMetadata);
			} else {
				contentLoading = false;
			}
		} else {
			// No Subsquid data available - use Irys-only mode
			// This ensures we don't show "Article not found" while Irys is still fetching
			await irysLoadPromise;

			// Check if we already have a partial article from Irys loading
			if (article) {
				console.log('Using Irys-only display mode (already loaded)');
				// We already have the placeholder article, just ensure content is fine
				if (!articleContent && !contentError) {
					await loadArticleContent(articleId, versionId, irysMetadata);
				}
			} else if (irysMetadata || articleContent) {
				// Fallback if Irys loaded but didn't set article yet (edge case)
				console.log('Using Irys-only display mode (constructing now)');
				article = createPlaceholderArticle(articleId, irysMetadata, articleContent);
				
				if (!articleContent && !contentError) {
					await loadArticleContent(articleId, versionId, irysMetadata);
				} else {
					contentLoading = false;
				}
			} else {
				articleError = 'Article not found';
				articleLoading = false;
				contentLoading = false;
			}
		}
	}

	// Construct a placeholder article object from Irys metadata
	function createPlaceholderArticle(id: string, metadata: IrysArticleMetadata | null, content: string | null): ArticleDetailData {
		return {
			id: id,
			articleId: '0', // Placeholder, not on chain yet
			title: metadata?.title || 'Untitled',
			summary: metadata?.summary || '',
			author: {
				id: metadata?.author || '',
				nickname: null,
				avatar: null
			},
			originalAuthor: null,
			categoryId: '0', // Default category
			visibility: metadata?.visibility ?? 0,
			originality: metadata?.originality ?? 0,
			createdAt: metadata?.timestamp ? new Date(metadata.timestamp).toISOString() : new Date().toISOString(),
			blockNumber: 0,
			txHash: '',
			// Default stats
			totalTips: '0',
			likeAmount: '0',
			dislikeAmount: '0',
			collectCount: '0',
			royaltyBps: 0,
			collectPrice: '0',
			maxCollectSupply: '0',
			comments: [],
			collections: []
		};
	}

	/**
	 * Load article content and metadata from Irys
	 * This is called in parallel with Subsquid query for faster display
	 */
	async function loadArticleFromIrys(articleId: string, versionId: string | null) {
		try {
			irysMetadataLoading = true;

			// Start both content and metadata loading in parallel
			const metadataPromise = fetchArticleMetadataFromIrys(articleId);
			const contentPromise = (async () => {
				try {
					if (versionId) {
						// For specific version, load from static URL
						return await fetchArticleVersionContent(versionId);
					} else {
						// For latest version, use mutable URL
						// Note: encrypted articles need special handling (done by loadArticleContent later)
						return await fetchArticleMarkdown(articleId);
					}
				} catch (e) {
					console.warn('Failed to load article content from Irys:', e);
					return null;
				}
			})();

			const [metadata, content] = await Promise.all([metadataPromise, contentPromise]);

			// Update state with Irys data
			if (metadata) {
				irysMetadata = metadata;
				console.log('Irys metadata loaded:', metadata);
			}

			if (content) {
				// Check if content is encrypted (starts with enc: prefix)
				if (metadata?.encrypted || content.startsWith('enc:')) {
					// Encrypted content - don't set articleContent here
					// It will be handled by loadArticleContent which has access to wallet
					console.log('Article is encrypted, deferring decryption to loadArticleContent');
				} else {
					articleContent = content;
					console.log('Article content loaded from Irys');
				}
			}

			// Update current Irys TX ID for explorer link
			currentIrysTxId = versionId || await queryLatestIrysTxId(articleId);

			// If we have data and main article is still loading (or null), show what we have
			if (!article && (metadata || content)) {
				console.log('Irys data loaded, showing partial article');
				article = createPlaceholderArticle(articleId, metadata || null, content || null);
				articleLoading = false;
			}

		} catch (e) {
			console.error('Error loading from Irys:', e);
		} finally {
			irysMetadataLoading = false;
			// Mark content loading as complete if we got content
			if (articleContent) {
				contentLoading = false;
			}
		}
	}

	// React to article ID changes from URL navigation (only after mount)
	$effect(() => {
		// Guard: only run when mounted (client-side) and URL is accessible
		if (!isMounted) return;
		
		// Read URL params reactively - this creates the dependency
		const articleId = $page.url.searchParams.get('id');
		const versionId = $page.url.searchParams.get('v');
		
		// Update state and trigger article load if changed
		untrack(() => {
			const idChanged = articleId !== currentArticleId;
			const versionChanged = versionId !== currentVersionTxId;
			
			if (idChanged || versionChanged) {
				currentArticleId = articleId;
				currentVersionTxId = versionId;
				if (articleId) {
					loadArticle(articleId, versionId);
				}
			}
		});
	});

	// One-time initialization: event listeners and wallet setup
	onMount(() => {
		// Initialize URL params from client-side (avoid prerendering issues)
		currentArticleId = $page.url.searchParams.get('id');
		currentVersionTxId = $page.url.searchParams.get('v');
		
		// Check for ephemeral env parameter
		const envParam = $page.url.searchParams.get('env');
		if (envParam && (envParam === 'dev' || envParam === 'test' || envParam === 'prod')) {
			console.log(`Setting ephemeral environment to: ${envParam}`);
			setEphemeralEnvName(envParam);
		}

		// Mark as mounted - this triggers the $effect to start watching URL changes
		isMounted = true;
		
		// Initial article load
		if (currentArticleId) {
			loadArticle(currentArticleId, currentVersionTxId);
		}
		
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
		
		// Async initialization (wallet setup) - wrapped in IIFE to keep onMount sync
		(async () => {
			// Check wallet connection using utility function
			const walletState = await checkWalletConnection();
			walletAddress = walletState.walletAddress;
			sessionKey = walletState.sessionKey;
			hasValidSessionKey = walletState.hasValidSessionKey;
			currentUserData = walletState.currentUserData;
			
			// Setup account change listener using utility function
			setupWalletAccountListener((state) => {
				walletAddress = state.walletAddress;
				sessionKey = state.sessionKey;
				hasValidSessionKey = state.hasValidSessionKey;
				currentUserData = state.currentUserData;
			});
		})();
		
		// Cleanup on unmount (must be returned synchronously)
		return () => {
			document.removeEventListener('click', handleClickOutside);
			// Reset ephemeral environment on unmount
			setEphemeralEnvName(null);
		};
	});
</script>

<svelte:head>
	<title>{currentVersionMeta?.title || article?.title || 'Article'} - AmberInk</title>
</svelte:head>

{#if articleLoading}
	<ArticleSkeleton />
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
				{displayTitle}
			</h1>

			<!-- Author Info Bar -->
			<div class="flex items-center gap-3">
				<!-- Avatar -->
				<a href={authorLink} target={authorTarget} class="shrink-0">
					<UserAvatar url={getAvatarUrl(authorAvatar)} initials={authorInitials} size="lg" />
				</a>

				<div class="flex flex-1 flex-col">
					<!-- Name & Follow -->
					<div class="flex items-center gap-2">
						<a
							href={authorLink}
							target={authorTarget}
							class="font-medium text-gray-900 hover:underline"
						>
							{displayAuthor}
						</a>
						{#if !isAuthor && !isAddressOnlyAuthor}
							<span class="text-gray-300">·</span>
							<button
								type="button"
								class="text-sm font-medium text-emerald-600 hover:text-emerald-700 disabled:opacity-50"
								onclick={handleFollow}
								disabled={isFollowing}
							>
								{isFollowing ? m.processing({}) : m.follow({})}
							</button>
						{/if}
					</div>

					<!-- Read time & Date & Originality Tag -->
					<div class="flex items-center gap-2 text-sm text-gray-500">
						{#if readingTime > 0}
							<span>{m.min_read({ count: readingTime })}</span>
							<span>·</span>
						{/if}
						{#if article?.createdAt}
							<time datetime={article.createdAt}>
								{formatDateMedium(article.createdAt)}
							</time>
							<span>·</span>
						{/if}
						<!-- Originality Tag -->
						<OriginalityTag originality={article?.originality ?? 0} />
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
								<span class="text-sm"
									>{formatWeiToEth(article.totalTips, 4, { minDisplay: 0.0001 })}
									{nativeSymbol}</span
								>
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
								<span class="text-sm"
									>{formatWeiToEth(localDislikeAmount, 4, { minDisplay: 0.0001 })}</span
								>
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
							{#if article.visibility !== 2}
								<button
									type="button"
									onclick={handleShare}
									class="text-gray-500 transition-colors hover:text-gray-900"
									title={m.share({})}
								>
									<ShareIcon size={20} />
								</button>
							{/if}
						</div>
					</div>
				</div>
			{/if}
		{/snippet}

		<!-- Interaction Bar (Top) -->
		{#if article && article.articleId !== '0'}
			{@render interactionBar('top')}
		{/if}

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
			{:else if articleContent && article}
				<div class="prose prose-lg prose-gray max-w-none font-serif">
					{@html DOMPurify.sanitize(
						marked(
							processContentImages(articleContent, versionTxId || article.id, !versionTxId)
						) as string
					)}
				</div>
			{:else}
				<div class="py-8 text-center text-gray-500">
					<p>{m.no_items({ items: m.content() })}</p>
				</div>
			{/if}
		</div>

		<!-- Interaction Bar (Bottom) - only show when content is loaded and long enough -->
		{#if articleContent && !contentLoading && (readingTime > 2 || articleContent.length > 800)}
			{#if article && article.articleId !== '0'}
				{@render interactionBar('bottom')}
			{/if}
		{/if}

		<!-- Comments Section -->
		{#if article && article.articleId !== '0'}
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
		{/if}

		<!-- Transaction Info (collapsed) -->
		<details class="mt-10 text-sm text-gray-500">
			<summary class="cursor-pointer font-medium text-gray-700 hover:text-gray-900">
				{m.blockchain_info({})}
			</summary>
			<div class="mt-3 flex flex-wrap gap-x-6 gap-y-2 rounded-lg bg-gray-50 p-4">
				{#if article.txHash}
					<div class="flex items-center gap-1">
						<span class="font-medium text-gray-700">{m.contract_tx()}:</span>
						<a
							href={getBlockExplorerTxUrl(article.txHash)}
							target="_blank"
							rel="noopener noreferrer"
							class="text-blue-600 hover:underline"
						>
							{article.txHash.slice(0, 10)}...{article.txHash.slice(-8)}
						</a>
					</div>
				{/if}
				<div class="flex items-center gap-1">
					<span class="font-medium text-gray-700">{m.storage_tx()}:</span>
					<a
						href={getViewblockArweaveUrl(currentIrysTxId || article.id, getIrysNetwork())}
						target="_blank"
						rel="noopener noreferrer"
						class="text-blue-600 hover:underline"
					>
						{(currentIrysTxId || article.id).slice(0, 10)}...
					</a>
				</div>
			</div>
		</details>
	</article>

	<!-- Collect Modal (only when collecting is enabled) -->
	<CollectModal
		open={showCollectModal}
		{article}
		{collectEnabled}
		{localCollectCount}
		{maxCollectSupply}
		{nativeTokenPrice}
		{nativeSymbol}
		{isCollecting}
		onClose={() => (showCollectModal = false)}
		onCollect={handleCollect}
	/>

	<!-- Tip Modal -->
	<AmountModal
		open={showTipModal}
		onClose={() => (showTipModal = false)}
		title={m.tip_author({})}
		labelText={m.tip_in_usd({})}
		inputId="tip-amount"
		value={tipAmountUsd}
		onValueChange={(v) => (tipAmountUsd = v)}
		isProcessing={isTipping}
		onSubmit={handleTip}
		submitText={m.send_tip({})}
		colorScheme="amber"
		{nativeTokenPrice}
		{nativeSymbol}
		{priceLoading}
	/>

	<!-- Dislike Modal -->
	<AmountModal
		open={showDislikeModal}
		onClose={() => (showDislikeModal = false)}
		title={m.dislike({})}
		description={m.dislike_description({})}
		labelText={m.dislike_in_usd({})}
		inputId="dislike-amount"
		value={dislikeAmountUsd}
		onValueChange={(v) => (dislikeAmountUsd = v)}
		isProcessing={isDisliking}
		onSubmit={handleDislike}
		submitText={m.send_dislike({})}
		colorScheme="red"
		{nativeTokenPrice}
		{nativeSymbol}
		{priceLoading}
	/>

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
