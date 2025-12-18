<script lang="ts">
	import type { PageData } from './$types';
	import * as m from '$lib/paraglide/messages';
	import { CATEGORY_KEYS } from '$lib/data';
	import SearchSelect, { type SelectOption } from '$lib/components/SearchSelect.svelte';
	import ImageProcessor from '$lib/components/ImageProcessor.svelte';
	import { updateArticleFolderWithSessionKey, type ArticleFolderUpdateParams } from '$lib/arweave';
	import { editArticleWithSessionKey } from '$lib/contracts';
	import { getArticleWithCache, removeCachedArticle } from '$lib/arweave/cache';
	import { getCoverImageUrl } from '$lib/arweave/folder';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import {
		getStoredSessionKey,
		createSessionKey,
		ensureSessionKeyBalance,
		isSessionKeyValidForCurrentWallet,
		type StoredSessionKey
	} from '$lib/sessionKey';

	let { data }: { data: PageData } = $props();
	const article = data.article;

	// Category options for SearchSelect
	let categoryOptions = $derived<SelectOption[]>(
		CATEGORY_KEYS.map((key, index) => ({
			key,
			label: getCategoryLabel(key),
			value: BigInt(index)
		}))
	);

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

	// Form state - initialized with article data
	let title = $state(article.title || '');
	let summary = $state('');
	let selectedCategory = $state<bigint | null>(BigInt(article.categoryId));
	let author = $state(article.originalAuthor || '');
	let content = $state('');
	let coverImageFile = $state<File | null>(null);
	let keepExistingCover = $state(true);
	let existingCoverUrl = $state<string | null>(null);

	// Loading state
	let isLoadingContent = $state(true);
	let loadError = $state<string | null>(null);

	// Submit state
	type SubmitStatus =
		| 'idle'
		| 'validating'
		| 'uploadingCover'
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

	// Load article content from Arweave
	onMount(async () => {
		// Check wallet connection
		await checkWalletConnection();

		// Load existing cover image URL
		existingCoverUrl = getCoverImageUrl(article.id, true);

		// Load article content from Arweave
		try {
			const articleContent = await getArticleWithCache(article.id);
			if (articleContent) {
				content = articleContent.content || '';
				summary = articleContent.summary || '';
			}
		} catch (e) {
			loadError = e instanceof Error ? e.message : 'Failed to load article content';
			console.error('Failed to load article content:', e);
		} finally {
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
				const articleAuthor = (article.author?.id || article.trueAuthor || '').toLowerCase();
				isAuthorized = walletAddress === articleAuthor;
			}
		} catch (e) {
			console.error('Failed to check wallet:', e);
		}
	}

	// Handle cover image processed
	function handleCoverImageProcessed(file: File) {
		coverImageFile = file;
		keepExistingCover = false;
		submitStatus = 'idle';
	}

	// Handle cover image removed
	function handleCoverImageRemoved() {
		coverImageFile = null;
		keepExistingCover = true;
	}

	// Get or create valid session key
	async function getOrCreateValidSessionKey(): Promise<StoredSessionKey> {
		let sessionKey = getStoredSessionKey();
		if (sessionKey) {
			const isValid = await isSessionKeyValidForCurrentWallet();
			if (isValid) {
				return sessionKey;
			}
		}
		sessionKey = await createSessionKey();
		return sessionKey;
	}

	// Handle form submission
	async function handleSubmit() {
		if (isSubmitting || !isAuthorized) return;

		try {
			isSubmitting = true;
			submitStatus = 'validating';
			statusMessage = m.validating();

			// Validation
			if (!title.trim()) {
				throw new Error(m.field_required({ field: m.title() }));
			}
			if (!content.trim()) {
				throw new Error(m.field_required({ field: m.content() }));
			}

			// Use selected category as tag
			const categoryId = selectedCategory ?? 0n;
			const selectedKey = CATEGORY_KEYS[Number(categoryId)];
			const tags = selectedKey ? [getCategoryLabel(selectedKey)] : [];

			// Get session key
			const sessionKey = await getOrCreateValidSessionKey();

			// Ensure session key has balance
			const hasBalance = await ensureSessionKeyBalance(sessionKey.address);
			if (!hasBalance) {
				throw new Error('Failed to fund session key. Please try again.');
			}

			// Update status
			if (coverImageFile) {
				submitStatus = 'uploadingCover';
				statusMessage = m.uploading_cover();
			}

			submitStatus = 'uploadingArticle';
			statusMessage = m.edit_uploading_to_arweave();

			// Prepare update params
			console.log('Edit page cover state:', {
				coverImageFile: coverImageFile ? `File(${coverImageFile.name}, ${coverImageFile.size} bytes)` : null,
				keepExistingCover,
				existingCoverUrl
			});
			const updateParams: ArticleFolderUpdateParams = {
				title: title.trim(),
				summary: summary.trim(),
				content: content.trim(),
				coverImage: coverImageFile || undefined,
				tags,
				keepExistingCover: keepExistingCover && !coverImageFile
			};
			console.log('Update params keepExistingCover:', updateParams.keepExistingCover);

			// Update article on Arweave
			const result = await updateArticleFolderWithSessionKey(
				sessionKey,
				article.id, // Original manifest ID
				updateParams,
				'devnet'
			);

			// Update on-chain metadata (title, author, category, originality)
			submitStatus = 'updatingContract';
			statusMessage = m.edit_updating_contract ? m.edit_updating_contract() : 'Updating on-chain metadata...';

			// Get article's chain ID and call editArticle contract function
			const chainArticleId = BigInt(article.articleId);
			
			// Try with current session key, if it fails due to missing selector, create a new one
			let currentSessionKey = sessionKey;
			let txHash: string;
			try {
				txHash = await editArticleWithSessionKey(
						currentSessionKey,
						chainArticleId,
						author.trim(),
						title.trim(),
						summary.trim(),
						categoryId,
						0 // originality - default to Original
					);
			} catch (editError) {
				// If the error is about unauthorized selector, create a new session key and retry
				if (editError instanceof Error && editError.message.includes('not authorized for this operation')) {
					console.log('Session key does not support editArticle, creating new session key...');
					currentSessionKey = await createSessionKey();
					await ensureSessionKeyBalance(currentSessionKey.address);
					txHash = await editArticleWithSessionKey(
							currentSessionKey,
							chainArticleId,
							author.trim(),
							title.trim(),
							summary.trim(),
							categoryId,
							0
						);
				} else {
					throw editError;
				}
			}

			console.log(`Article metadata updated on-chain. Tx: ${txHash}`);

			// Clear cache for this article
			removeCachedArticle(article.id);

			// Success
			submitStatus = 'success';
			statusMessage = m.edit_success({ txId: result.newManifestTxId });
			
			// 记录新的 manifest TX ID 用于调试
			console.log('New manifest TX ID:', result.newManifestTxId);
			console.log('New index TX ID:', result.indexTxId);

			// Redirect to article page after 5 seconds (给 Irys 网关时间索引新 manifest)
			setTimeout(() => {
				goto(`/a/${article.id}`);
			}, 5000);
		} catch (error) {
			submitStatus = 'error';
			const errorMessage = error instanceof Error ? error.message : String(error);
			statusMessage = m.edit_failed({ error: errorMessage });
		} finally {
			isSubmitting = false;
		}
	}

	// Button text based on submit status
	let submitButtonText = $derived.by(() => {
		if (!isSubmitting) return m.save_changes();
		switch (submitStatus) {
			case 'uploadingCover':
				return m.uploading_cover();
			case 'uploadingArticle':
				return m.edit_uploading_to_arweave();
			case 'updatingContract':
				return m.edit_updating_contract ? m.edit_updating_contract() : 'Updating on-chain...';
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
	<title>{m.edit_article()} - {article.title} - DBlog</title>
</svelte:head>

<div class="min-h-screen bg-white">
	<div class="mx-auto max-w-3xl px-6 py-12">
		<header class="mb-12">
			<h1 class="mb-2 text-4xl font-light tracking-tight">{m.edit_article()}</h1>
			<p class="text-gray-500">{m.edit_article_description()}</p>
		</header>

		{#if !walletAddress}
			<div class="rounded-lg border border-yellow-200 bg-yellow-50 p-6 text-center">
				<p class="text-yellow-800">{m.please_connect_wallet({})}</p>
			</div>
		{:else if !isAuthorized}
			<div class="rounded-lg border border-red-200 bg-red-50 p-6 text-center">
				<p class="text-red-800">{m.not_article_author()}</p>
				<a href={`/a/${article.id}`} class="mt-4 inline-block text-blue-600 hover:underline">
					{m.back_to_article()}
				</a>
			</div>
		{:else if isLoadingContent}
			<div class="flex items-center justify-center py-16">
				<div class="flex items-center gap-3 text-gray-500">
					<svg class="h-5 w-5 animate-spin" fill="none" viewBox="0 0 24 24">
						<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
						<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
					</svg>
					<span>{m.loading_content({})}</span>
				</div>
			</div>
		{:else if loadError}
			<div class="rounded-lg border border-red-200 bg-red-50 p-6 text-center">
				<p class="text-red-800">{loadError}</p>
			</div>
		{:else}
			<form onsubmit={(e) => { e.preventDefault(); handleSubmit(); }} class="space-y-8">
				<!-- Title -->
				<div>
					<label for="title" class="mb-2 block text-sm font-medium text-gray-700">
						{m.title()} *
					</label>
					<input
						id="title"
						bind:value={title}
						type="text"
						placeholder={m.input_article_title()}
						class="w-full rounded-lg border border-gray-200 bg-white px-4 py-3 text-base text-gray-900 placeholder-gray-400 transition-colors focus:border-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-300"
						disabled={isSubmitting}
					/>
				</div>

				<!-- Category & Author -->
				<div class="grid grid-cols-2 gap-4">
					<div>
						<span id="category-label" class="mb-2 block text-sm font-medium text-gray-700">
							{m.category()} *
						</span>
						<SearchSelect
							aria-labelledby="category-label"
							bind:value={selectedCategory}
							options={categoryOptions}
							placeholder={m.search()}
							disabled={isSubmitting}
							noResultsText={m.no_results()}
						/>
					</div>
					<div>
						<label for="author" class="mb-2 block text-sm font-medium text-gray-700">
							{m.author()}
						</label>
						<input
							id="author"
							bind:value={author}
							type="text"
							placeholder={m.name_or_penname()}
							class="w-full rounded-lg border border-gray-200 bg-white px-4 py-3 text-base text-gray-900 placeholder-gray-400 transition-colors focus:border-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-300"
							disabled={isSubmitting}
						/>
					</div>
				</div>

				<!-- Cover Image -->
				<div>
					<label class="mb-2 block text-sm font-medium text-gray-700">
						{m.cover()}
					</label>
					
					<!-- Existing cover preview -->
					{#if keepExistingCover && existingCoverUrl && !coverImageFile}
						<div class="mb-4">
							<p class="mb-2 text-sm text-gray-500">{m.current_cover()}</p>
							<div class="relative inline-block">
								<img 
									src={existingCoverUrl} 
									alt="Current cover" 
									class="max-h-48 rounded-lg object-cover"
									onerror={(e) => {
										const target = e.currentTarget as HTMLImageElement;
										target.style.display = 'none';
									}}
								/>
								<button
									type="button"
									onclick={() => { keepExistingCover = false; }}
									class="absolute -right-2 -top-2 rounded-full bg-red-500 p-1 text-white hover:bg-red-600"
									title={m.remove_cover()}
								>
									<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
									</svg>
								</button>
							</div>
						</div>
					{/if}

					<!-- Upload new cover -->
					<ImageProcessor
						label={coverImageFile ? m.new_cover() : (keepExistingCover ? m.replace_cover() : m.upload_cover())}
						aspectRatio={16 / 9}
						maxFileSize={100 * 1024}
						maxOutputWidth={1200}
						maxOutputHeight={675}
						disabled={isSubmitting}
						onImageProcessed={handleCoverImageProcessed}
						onImageRemoved={handleCoverImageRemoved}
					/>
				</div>

				<!-- Summary -->
				<div>
					<label for="summary" class="mb-2 block text-sm font-medium text-gray-700">
						{m.summary()}
					</label>
					<textarea
						id="summary"
						bind:value={summary}
						placeholder={m.optional_summary()}
						rows="3"
						class="w-full rounded-lg border border-gray-200 bg-white px-4 py-3 text-base text-gray-900 placeholder-gray-400 transition-colors focus:border-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-300"
						disabled={isSubmitting}
					></textarea>
				</div>

				<!-- Content -->
				<div>
					<label for="content" class="mb-2 block text-sm font-medium text-gray-700">
						{m.content()} ({m.markdown_supported()}) *
					</label>
					<textarea
						id="content"
						bind:value={content}
						placeholder={m.write_article_here()}
						rows="16"
						class="w-full rounded-lg border border-gray-200 bg-white px-4 py-3 font-mono text-sm text-gray-900 placeholder-gray-400 transition-colors focus:border-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-300"
						disabled={isSubmitting}
					></textarea>
				</div>

				<!-- Info box about limitations -->
				<div class="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
					<p class="font-medium">{m.edit_note_title()}</p>
					<ul class="mt-2 list-inside list-disc space-y-1">
						<li>{m.edit_note_content()}</li>
						<li>{m.edit_note_nft()}</li>
					</ul>
				</div>

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
						href={`/a/${article.id}`}
						class="rounded-lg border border-gray-200 px-6 py-3 font-medium text-gray-900 transition-colors hover:bg-gray-50 {isSubmitting ? 'pointer-events-none opacity-50' : ''}"
					>
						{m.cancel({})}
					</a>
				</div>

				<p class="text-xs text-gray-500">* {m.required()}</p>
			</form>
		{/if}
	</div>
</div>
