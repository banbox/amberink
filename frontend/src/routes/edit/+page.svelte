<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	import { CATEGORY_KEYS } from '$lib/data';
	import ArticleEditor, { type ArticleFormData, type ContentImage } from '$lib/components/ArticleEditor.svelte';
	import { updateArticleFolderWithSessionKey, type ArticleFolderUpdateParams, fetchArticleMarkdown, fetchArticleSummaryFromTags } from '$lib/arweave';
	import { editArticleWithSessionKey, FUNCTION_SELECTORS } from '$lib/contracts';
	import { getCoverImageUrl } from '$lib/arweave/folder';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { localizeHref } from '$lib/paraglide/runtime';
	import {
		ensureSessionKeyReady,
		type StoredSessionKey
	} from '$lib/sessionKey';
	import { SpinnerIcon } from '$lib/components/icons';
	import { page } from '$app/stores';
	import { client } from '$lib/graphql/client';
	import { ARTICLE_BY_ID_QUERY, type ArticleDetailData } from '$lib/graphql/queries';

	let article = $state<ArticleDetailData | null>(null);

	// Helper function to get category label
	function getCategoryLabel(key: string): string {
		const labels: Record<string, () => string> = {
			unselected: m.unselected,
			other: m.other,
			technology: m.technology,
			finance: m.finance,
			entertainment: m.entertainment,
			sports: m.sports,
			health: m.health,
			education: m.education,
			travel: m.travel,
			food: m.food,
			fashion: m.fashion,
			automotive: m.automotive,
			real_estate: m.real_estate,
			culture: m.culture,
			art: m.art,
			music: m.music,
			film: m.film,
			gaming: m.gaming,
			science: m.science,
			history: m.history,
			politics: m.politics,
			military: m.military,
			law: m.law,
			society: m.society,
			environment: m.environment,
			parenting: m.parenting,
			pets: m.pets,
			photography: m.photography,
			design: m.design,
			programming: m.programming,
			blockchain: m.blockchain,
			ai: m.ai,
			startup: m.startup,
			career: m.career,
			psychology: m.psychology,
			philosophy: m.philosophy,
			literature: m.literature,
			comics: m.comics,
			digital_life: m.digital_life,
			home: m.home,
			agriculture: m.agriculture
		};
		return labels[key]?.() ?? key;
	}

	// Form state - will be initialized once article is loaded
	let formData = $state<ArticleFormData>({
		title: '',
		summary: '',
		categoryId: 0n,
		author: '',
		content: '',
		coverImageFile: null,
		contentImages: [],
		royaltyBps: 500n,
		collectPriceUsd: '0',
		maxCollectSupply: '0',
		originality: '0'
	});

	let keepExistingCover = $state(true);
	let existingCoverUrl = $state<string | null>(null);

	// Loading state
	let isLoadingArticle = $state(true);
	let isLoadingContent = $state(false);
	let loadError = $state<string | null>(null);

	// Submit state
	type SubmitStatus =
		| 'idle'
		| 'validating'
		| 'uploadingCover'
		| 'uploadingImages'
		| 'uploadingArticle'
		| 'updatingContract'
		| 'success'
		| 'error';
	let isSubmitting = $state(false);
	let submitStatus = $state<SubmitStatus>('idle');
	let statusMessage = $state('');

	// Wallet state
	let walletAddress = $state<string | null>(null);
	let isAuthorized = $state(false);

	// Load article data and content
	onMount(async () => {
		// Get article ID from URL
		const articleId = $page.url.searchParams.get('id');
		
		if (!articleId) {
			loadError = 'Article ID is required';
			isLoadingArticle = false;
			return;
		}

		// Load article metadata from GraphQL
		try {
			const result = await client.query(ARTICLE_BY_ID_QUERY, { id: articleId }, { requestPolicy: 'network-only' }).toPromise();

			if (result.error) {
				loadError = result.error.message;
				isLoadingArticle = false;
				return;
			}

			const loadedArticle: ArticleDetailData | null = result.data?.articleById;

			if (!loadedArticle) {
				loadError = 'Article not found';
				isLoadingArticle = false;
				return;
			}

			article = loadedArticle;
			
			// Initialize form data with article metadata
			formData.title = article.title || '';
			formData.categoryId = BigInt(article.categoryId);
			formData.author = article.originalAuthor || '';
			
			// Load existing cover image URL
			existingCoverUrl = getCoverImageUrl(article.id, true);
			
			isLoadingArticle = false;
			isLoadingContent = true;
			
			// Check wallet connection
			await checkWalletConnection();

			// Load article content and summary from Arweave in parallel
			const [content, summary] = await Promise.all([
				fetchArticleMarkdown(article.id),
				fetchArticleSummaryFromTags(article.id)
			]);
			formData.content = content || '';
			formData.summary = summary || '';
			isLoadingContent = false;
		} catch (e) {
			loadError = e instanceof Error ? e.message : 'Failed to load article';
			console.error('Failed to load article:', e);
			isLoadingArticle = false;
			isLoadingContent = false;
		}
	});

	// Check wallet connection and authorization
	async function checkWalletConnection() {
		if (typeof window === 'undefined' || !window.ethereum) return;
		try {
			const accounts = (await window.ethereum.request({ method: 'eth_accounts' })) as string[];
			if (accounts.length > 0) {
				walletAddress = accounts[0].toLowerCase();
				// Check if user is the author
				const articleAuthor = (article?.author?.id || '').toLowerCase();
				isAuthorized = walletAddress === articleAuthor;
				if(!isAuthorized){
					console.log('not author:', articleAuthor, walletAddress);
				}
			}
		} catch (e) {
			console.error('Failed to check wallet:', e);
		}
	}

	// Convert ContentImage to ContentImageInfo for upload
	function convertContentImages(images: ContentImage[]) {
		return images.map(img => ({
			id: img.id,
			file: img.file,
			extension: img.extension,
			width: img.width,
			height: img.height
		}));
	}

	// Handle form submission
	async function handleSubmit() {
		if (isSubmitting || !isAuthorized || !article) return;

		try {
			isSubmitting = true;
			submitStatus = 'validating';
			statusMessage = m.validating();

			// Validation
			if (!formData.title.trim()) {
				throw new Error(m.field_required({ field: m.title() }));
			}
			if (!formData.content.trim()) {
				throw new Error(m.field_required({ field: m.content() }));
			}

			// Use selected category as tag
			const selectedKey = CATEGORY_KEYS[Number(formData.categoryId)];
			const tags = selectedKey ? [getCategoryLabel(selectedKey)] : [];

			// Get or create valid session key with balance check
			const sessionKey = await ensureSessionKeyReady({ requiredSelector: FUNCTION_SELECTORS.editArticle });
			if (!sessionKey) {
				throw new Error(m.failed_prepare());
			}

			// Update status
			if (formData.coverImageFile) {
				submitStatus = 'uploadingCover';
				statusMessage = m.uploading();
			}

			// Update status for content images upload
			if (formData.contentImages.length > 0) {
				submitStatus = 'uploadingImages';
				statusMessage = m.uploading();
			}

			submitStatus = 'uploadingArticle';
			statusMessage = m.uploading_to({ destination: m.arweave() });

			// Prepare update params
			console.log('Edit page cover state:', {
				coverImageFile: formData.coverImageFile ? `File(${formData.coverImageFile.name}, ${formData.coverImageFile.size} bytes)` : null,
				keepExistingCover,
				existingCoverUrl
			});

			const updateParams: ArticleFolderUpdateParams = {
				title: formData.title.trim(),
				summary: formData.summary.trim(),
				content: formData.content.trim(),
				coverImage: formData.coverImageFile || undefined,
				tags,
				keepExistingCover: keepExistingCover && !formData.coverImageFile
			};
			console.log('Update params keepExistingCover:', updateParams.keepExistingCover);

			// Update article on Arweave
			const result = await updateArticleFolderWithSessionKey(
				sessionKey,
				article.id,
				updateParams,
				'devnet'
			);

			// Update on-chain metadata (title, author, category)
			submitStatus = 'updatingContract';
			statusMessage = m.updating_onchain();

			// Get article's chain ID and call editArticle contract function
			const chainArticleId = BigInt(article.articleId);
			
			const txHash = await editArticleWithSessionKey(
				sessionKey,
				chainArticleId,
				formData.author.trim(),
				formData.title.trim(),
				formData.summary.trim(),
				formData.categoryId
			);

			console.log(`Article metadata updated on-chain. Tx: ${txHash}`);

			// Success
			submitStatus = 'success';
			statusMessage = m.edit_success({ txId: result.newManifestTxId });
			
			console.log('New manifest TX ID:', result.newManifestTxId);
			console.log('New index TX ID:', result.indexTxId);

			// Redirect to article page after 2 seconds
			const goUrl = `/a?id=${article.id}`;
			setTimeout(() => {
				goto(goUrl);
			}, 2000);
		} catch (error) {
			submitStatus = 'error';
			const errorMessage = error instanceof Error ? error.message : String(error);
			statusMessage = m.failed({ error: errorMessage });
		} finally {
			isSubmitting = false;
		}
	}

	// Button text based on submit status
	let submitButtonText = $derived.by(() => {
		if (!isSubmitting) return m.save_changes();
		switch (submitStatus) {
			case 'uploadingCover':
				return m.uploading();
			case 'uploadingImages':
				return m.uploading();
			case 'uploadingArticle':
				return m.uploading_to({ destination: m.arweave() });
			case 'updatingContract':
				return m.updating_onchain();
			default:
				return m.save_changes();
		}
	});

	// Status message styling
	let statusClass = $derived.by(() => {
		switch (submitStatus) {
			case 'success':
				return 'border border-green-200 bg-green-50 text-green-800';
			case 'error':
				return 'border border-red-200 bg-red-50 text-red-800';
			default:
				return 'border border-blue-200 bg-blue-50 text-blue-800';
		}
	});
</script>

<svelte:head>
	<title>{m.edit_article()} - {article?.title || ''} - AmberInk</title>
</svelte:head>

<div class="min-h-screen bg-white">
	<div class="mx-auto max-w-3xl px-6 py-12">
		{#if isLoadingArticle}
			<div class="flex items-center justify-center py-16">
				<div class="flex items-center gap-3 text-gray-500">
					<SpinnerIcon size={20} class="text-gray-500" />
					<span>{m.loading()}</span>
				</div>
			</div>
		{:else if loadError}
			<div class="rounded-lg border border-red-200 bg-red-50 p-6 text-center">
				<p class="text-red-800">{loadError}</p>
			</div>
		{:else if !article}
			<div class="rounded-lg border border-red-200 bg-red-50 p-6 text-center">
				<p class="text-red-800">{m.article_not_found()}</p>
			</div>
		{:else if !walletAddress}
			<div class="rounded-lg border border-yellow-200 bg-yellow-50 p-6 text-center">
				<p class="text-yellow-800">{m.connect_wallet_first()}</p>
			</div>
		{:else if !isAuthorized}
			<div class="rounded-lg border border-red-200 bg-red-50 p-6 text-center">
				<p class="text-red-800">{m.not_author()}</p>
				<a
					href={localizeHref(`/a?id=${article.id}`)}
					class="mt-4 inline-block text-blue-600 hover:underline"
				>
					{m.back_to({ destination: m.article() })}
				</a>
			</div>
		{:else if isLoadingContent}
			<div class="flex items-center justify-center py-16">
				<div class="flex items-center gap-3 text-gray-500">
					<SpinnerIcon size={20} class="text-gray-500" />
					<span>{m.loading_content()}</span>
				</div>
			</div>
		{:else}
			<header class="mb-12">
				<h1 class="mb-2 text-4xl font-light tracking-tight">{m.edit_article()}</h1>
				<p class="text-gray-500">{m.edit_description()}</p>
			</header>

			<form
				onsubmit={(e) => {
					e.preventDefault();
					handleSubmit();
				}}
				class="space-y-8"
			>
				<ArticleEditor
					bind:formData
					disabled={isSubmitting}
					mode="edit"
					{existingCoverUrl}
					bind:keepExistingCover
					showNftSettings={false}
				/>

				<!-- Status Message -->
				{#if submitStatus !== 'idle'}
					<div class="whitespace-pre-wrap rounded-lg px-4 py-3 text-sm {statusClass}">
						{statusMessage}
					</div>
				{/if}

				<!-- Buttons -->
				<div class="flex gap-3">
					<button
						type="submit"
						disabled={isSubmitting}
						class="flex-1 rounded-lg bg-gray-900 px-6 py-3 font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
					>
						{submitButtonText}
					</button>
					<a
						href={localizeHref(`/a?id=${article.id}`)}
						class="rounded-lg border border-gray-200 px-6 py-3 font-medium text-gray-900 transition-colors hover:bg-gray-50 {isSubmitting
							? 'pointer-events-none opacity-50'
							: ''}"
					>
						{m.cancel()}
					</a>
				</div>

				<p class="text-xs text-gray-500">* {m.required()}</p>
			</form>
		{/if}
	</div>
</div>
