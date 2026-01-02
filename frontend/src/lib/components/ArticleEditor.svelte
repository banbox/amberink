<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	import { CATEGORY_KEYS } from '$lib/data';
	import SearchSelect, { type SelectOption } from '$lib/components/SearchSelect.svelte';
	import ImageProcessor from '$lib/components/ImageProcessor.svelte';
	import ContentImageManager from '$lib/components/ContentImageManager.svelte';
	import { onMount } from 'svelte';
	import { getNativeTokenPriceUsd, getNativeTokenSymbol } from '$lib/priceService';
	import { getDefaultCollectPriceUsd } from '$lib/config';
	import { CloseIcon } from '$lib/components/icons';

	/**
	 * Article Editor Component
	 * 
	 * Shared component for publish and edit pages.
	 * Handles form fields, cover image, content images, and markdown editing.
	 */

	export interface ContentImage {
		id: string;
		file: File;
		previewUrl: string;
		extension: string;
		width?: number;
		height?: number;
	}

	export interface ArticleFormData {
		title: string;
		summary: string;
		categoryId: bigint;
		author: string;
		content: string;
		coverImageFile: File | null;
		contentImages: ContentImage[];
		royaltyBps: bigint;
		collectPriceUsd: string | number; // Changed from ETH to USD
		maxCollectSupply: string | number;
		originality: '0' | '1' | '2';
		visibility: '0' | '1' | '2'; // 0:Public, 1:Private, 2:Encrypted
	}

	interface Props {
		/** Form data (two-way binding) */
		formData?: ArticleFormData;
		/** Whether form is disabled (during submission) */
		disabled?: boolean;
		/** Mode: 'publish' or 'edit' */
		mode?: 'publish' | 'edit';
		/** Existing cover URL (for edit mode) */
		existingCoverUrl?: string | null;
		/** Whether to keep existing cover (for edit mode) */
		keepExistingCover?: boolean;
		/** Callback when cover is processed */
		onCoverProcessed?: (file: File) => void;
		/** Callback when cover is removed */
		onCoverRemoved?: () => void;
		/** Show NFT settings (price, supply) - only for publish */
		showNftSettings?: boolean;
		/** Reset key to force component reset */
		resetKey?: number;
	}

	// Native token price state for USD conversion display
	let nativeTokenPrice = $state<number | null>(null);
	let priceLoading = $state(false);
	let nativeSymbol = $state('ETH');

	// Load native token price on mount
	onMount(async () => {
		priceLoading = true;
		try {
			nativeTokenPrice = await getNativeTokenPriceUsd();
			nativeSymbol = getNativeTokenSymbol();
		} catch (e) {
			console.error('Failed to load native token price:', e);
		} finally {
			priceLoading = false;
		}
	});

	// Calculate approximate native token amount from USD
	function getApproxNativeAmount(usdAmount: string | number): string {
		if (!nativeTokenPrice || nativeTokenPrice <= 0) return '...';
		const usd = typeof usdAmount === 'string' ? parseFloat(usdAmount) : usdAmount;
		if (isNaN(usd) || usd <= 0) return '0';
		const nativeAmount = usd / nativeTokenPrice;
		return nativeAmount.toFixed(6);
	}

	let {
		formData = $bindable({
			title: '',
			summary: '',
			categoryId: 0n,
			author: '',
			content: '',
			coverImageFile: null,
			contentImages: [],
			royaltyBps: 500n,
			collectPriceUsd: getDefaultCollectPriceUsd(),
			maxCollectSupply: '0',
			originality: '0',
			visibility: '0'
		}),
		disabled = false,
		mode = 'publish',
		existingCoverUrl = null,
		keepExistingCover = $bindable(true),
		onCoverProcessed = () => {},
		onCoverRemoved = () => {},
		showNftSettings = true,
		resetKey = 0
	}: Props = $props();

	// Category options for SearchSelect
	let categoryOptions = $derived<SelectOption[]>(
		CATEGORY_KEYS.map((key, index) => ({
			key,
			label: getCategoryLabel(key),
			value: BigInt(index)
		}))
	);

	// Selected category for SearchSelect binding
	let selectedCategory = $state<bigint | null>(formData.categoryId);

	// Sync selectedCategory with formData.categoryId
	$effect(() => {
		if (selectedCategory !== null) {
			formData.categoryId = selectedCategory;
		}
	});

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

	// Content textarea reference for cursor position
	let contentTextarea = $state<HTMLTextAreaElement | null>(null);

	// Handle cover image processed
	function handleCoverImageProcessed(file: File) {
		formData.coverImageFile = file;
		keepExistingCover = false;
		onCoverProcessed(file);
	}

	// Handle cover image removed
	function handleCoverImageRemoved() {
		formData.coverImageFile = null;
		onCoverRemoved();
	}

	// Handle content images change
	function handleContentImagesChange(images: ContentImage[]) {
		formData.contentImages = images;
	}

	// Insert markdown at cursor position in content textarea
	function insertMarkdownAtCursor(markdown: string) {
		if (!contentTextarea) return;

		const start = contentTextarea.selectionStart;
		const end = contentTextarea.selectionEnd;
		const text = formData.content;

		// Insert markdown at cursor position
		formData.content = text.substring(0, start) + markdown + text.substring(end);

		// Move cursor after inserted text
		setTimeout(() => {
			if (contentTextarea) {
				const newPos = start + markdown.length;
				contentTextarea.selectionStart = newPos;
				contentTextarea.selectionEnd = newPos;
				contentTextarea.focus();
			}
		}, 0);
	}
</script>

<div class="article-editor space-y-8">
	<!-- Title -->
	<div>
		<label for="title" class="mb-2 block text-sm font-medium text-gray-700">
			{m.title()} *
		</label>
		<input
			id="title"
			bind:value={formData.title}
			type="text"
			placeholder={m.enter_title()}
			class="w-full rounded-lg border border-gray-200 bg-white px-4 py-3 text-base text-gray-900 placeholder-gray-400 transition-colors focus:border-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-300"
			{disabled}
		/>
	</div>

	<!-- Category & Originality & Visibility -->
	<div class="grid grid-cols-3 gap-4">
		<div>
			<span id="category-label" class="mb-2 block text-sm font-medium text-gray-700">
				{m.category()} *
			</span>
			<SearchSelect
				aria-labelledby="category-label"
				bind:value={selectedCategory}
				options={categoryOptions}
				placeholder={m.search()}
				{disabled}
				noResultsText={m.no_results()}
			/>
		</div>
		<div>
			<label for="originality" class="mb-2 block text-sm font-medium text-gray-700">
				{m.all_types()} *
			</label>
			<select
				id="originality"
				bind:value={formData.originality}
				{disabled}
				class="w-full rounded-lg border border-gray-200 bg-white px-4 py-3 text-base text-gray-900 transition-colors focus:border-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-300"
			>
				<option value="0">{m.original()}</option>
				<option value="1">{m.semi_original()}</option>
				<option value="2">{m.reprint()}</option>
			</select>
		</div>
		<div>
			<label for="visibility" class="mb-2 block text-sm font-medium text-gray-700">
				{m.visibility()}
			</label>
			<select
				id="visibility"
				bind:value={formData.visibility}
				{disabled}
				class="w-full rounded-lg border border-gray-200 bg-white px-4 py-3 text-base text-gray-900 transition-colors focus:border-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-300"
			>
				<option value="0">{m.public()}</option>
				<option value="1">{m.non_public()}</option>
				<option value="2">{m.encrypted()}</option>
			</select>
		</div>
	</div>

	<!-- Author (only show for non-original content) -->
	{#if formData.originality !== '0'}
		<div>
			<label for="author" class="mb-2 block text-sm font-medium text-gray-700">
				{m.author()}
			</label>
			<input
				id="author"
				bind:value={formData.author}
				type="text"
				placeholder={m.name_or_penname()}
				class="w-full rounded-lg border border-gray-200 bg-white px-4 py-3 text-base text-gray-900 placeholder-gray-400 transition-colors focus:border-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-300"
				{disabled}
			/>
			<p class="mt-1 text-xs text-gray-500">{m.author_help()}</p>
		</div>
	{/if}

	<!-- Cover Image -->
	<div>
		{#if mode === 'edit' && keepExistingCover && existingCoverUrl && !formData.coverImageFile}
			<span class="mb-2 block text-sm font-medium text-gray-700">
				{m.cover()}
			</span>
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
						onclick={() => {
							keepExistingCover = false;
						}}
						class="absolute -right-2 -top-2 rounded-full bg-red-500 p-1 text-white hover:bg-red-600"
						title={m.remove()}
						{disabled}
					>
						<CloseIcon size={16} />
					</button>
				</div>
			</div>
		{/if}

		{#key resetKey}
			<ImageProcessor
				label={mode === 'edit'
					? formData.coverImageFile
						? m.new_cover()
						: keepExistingCover
							? m.replace()
							: m.upload()
					: m.cover()}
				aspectRatio={16 / 9}
				maxOutputWidth={1200}
				maxOutputHeight={675}
				{disabled}
				onImageProcessed={handleCoverImageProcessed}
				onImageRemoved={handleCoverImageRemoved}
			/>
		{/key}
	</div>

	<!-- Content -->
	<div>
		<label for="content" class="mb-2 block text-sm font-medium text-gray-700">
			{m.content()} ({m.markdown_supported()}) *
		</label>
		<textarea
			id="content"
			bind:this={contentTextarea}
			bind:value={formData.content}
			placeholder={m.write_here()}
			rows="12"
			class="w-full rounded-lg border border-gray-200 bg-white px-4 py-3 font-mono text-sm text-gray-900 placeholder-gray-400 transition-colors focus:border-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-300"
			{disabled}
		></textarea>
	</div>

	<!-- Content Images -->
	<ContentImageManager
		bind:images={formData.contentImages}
		onImagesChange={handleContentImagesChange}
		onInsertMarkdown={insertMarkdownAtCursor}
		{disabled}
	/>

	<!-- Summary -->
	<div>
		<label for="summary" class="mb-2 block text-sm font-medium text-gray-700">
			{m.summary()}
		</label>
		<textarea
			id="summary"
			bind:value={formData.summary}
			placeholder={m.brief_summary()}
			rows="2"
			class="w-full rounded-lg border border-gray-200 bg-white px-4 py-3 text-base text-gray-900 placeholder-gray-400 transition-colors focus:border-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-300"
			{disabled}
		></textarea>
	</div>

	<!-- NFT Settings (only for publish mode) -->
	{#if showNftSettings && mode === 'publish'}
		<div class="grid grid-cols-2 gap-4">
			<div>
				<label for="collectPrice" class="mb-2 block text-sm font-medium text-gray-700">
					{m.price()} (USD)
				</label>
				<div class="flex items-center gap-2">
					<span class="text-sm font-medium text-gray-600">$</span>
					<input
						id="collectPrice"
						bind:value={formData.collectPriceUsd}
						type="number"
						min="0"
						step="0.01"
						class="flex-1 rounded-lg border border-gray-200 bg-white px-4 py-3 text-base text-gray-900 placeholder-gray-400 transition-colors focus:border-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-300"
						{disabled}
					/>
				</div>
				<!-- Show approximate native token amount -->
				<div class="mt-1 text-xs text-gray-500">
					{#if priceLoading}
						{m.price_loading()}
					{:else if nativeTokenPrice && formData.collectPriceUsd}
						≈ {getApproxNativeAmount(formData.collectPriceUsd)} {nativeSymbol}
					{/if}
				</div>
			</div>
			<div>
				<label for="maxCollectSupply" class="mb-2 block text-sm font-medium text-gray-700">
					Max Collect Supply (0 = disable)
				</label>
				<input
					id="maxCollectSupply"
					bind:value={formData.maxCollectSupply}
					type="number"
					min="0"
					step="1"
					class="w-full rounded-lg border border-gray-200 bg-white px-4 py-3 text-base text-gray-900 placeholder-gray-400 transition-colors focus:border-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-300"
					{disabled}
				/>
			</div>
		</div>
	{/if}

	<!-- Edit mode info box -->
	{#if mode === 'edit'}
		<div class="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
			<p class="font-medium">{m.note_title()}</p>
			<ul class="mt-2 list-inside list-disc space-y-1">
				<li>{m.note_content()}</li>
				<li>{m.note_nft()}</li>
			</ul>
		</div>
	{/if}
</div>
