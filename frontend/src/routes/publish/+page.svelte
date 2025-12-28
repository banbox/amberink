<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	import { publishArticle } from '$lib/publish';
	import { goto } from '$app/navigation';
	import { ContractError } from '$lib/contracts';
	import { CATEGORY_KEYS } from '$lib/data';
	import ArticleEditor, { type ArticleFormData, type ContentImage } from '$lib/components/ArticleEditor.svelte';
	import { usdToWei } from '$lib/priceService';
	import { getDefaultCollectPriceUsd, getConfig } from '$lib/config';

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

	// Form state using ArticleEditor's data structure
	let formData = $state<ArticleFormData>({
		title: '',
		summary: '',
		categoryId: 0n,
		author: '',
		content: '',
		postscript: '',
		coverImageFile: null,
		contentImages: [],
		royaltyBps: 500n,
		collectPriceUsd: getDefaultCollectPriceUsd(),
		maxCollectSupply: '0',
		originality: '0'
	});

	// Submit state
	type SubmitStatus =
		| 'idle'
		| 'validating'
		| 'uploadingCover'
		| 'uploadingImages'
		| 'uploadingArticle'
		| 'publishingContract'
		| 'success'
		| 'error';
	let isSubmitting = $state(false);
	let submitStatus = $state<SubmitStatus>('idle');
	let statusMessage = $state('');

	// Reset form
	let resetImageKey = $state(0);
	function resetForm() {
		formData = {
			title: '',
			summary: '',
			categoryId: 0n,
			author: '',
			content: '',
			postscript: '',
			coverImageFile: null,
			contentImages: [],
			royaltyBps: 500n,
			collectPriceUsd: getDefaultCollectPriceUsd(),
			maxCollectSupply: '0',
			originality: '0'
		};
		resetImageKey++;
		isSubmitting = false;
		submitStatus = 'idle';
		statusMessage = '';
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
		if (isSubmitting) return;

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
			if (formData.categoryId < 0n) {
				throw new Error(m.invalid_category());
			}

			// Use selected category as tag
			const selectedKey = CATEGORY_KEYS[Number(formData.categoryId)];
			const tags = selectedKey ? [getCategoryLabel(selectedKey)] : [];

			// Combine content with postscript if provided
			const fullContent = formData.postscript.trim()
				? `${formData.content.trim()}\n\n---\n\n${formData.postscript.trim()}`
				: formData.content.trim();

			// Update status for cover upload
			if (formData.coverImageFile) {
				submitStatus = 'uploadingCover';
				statusMessage = m.uploading();
			}

			// Update status for content images upload
			if (formData.contentImages.length > 0) {
				submitStatus = 'uploadingImages';
				statusMessage = m.uploading();
			}

			// Update status for article upload
			submitStatus = 'uploadingArticle';
			statusMessage = m.uploading_to({ destination: m.arweave() });

			let collectPrice = 0n;
			try {
				const collectPriceUsdTrimmed = String(formData.collectPriceUsd ?? '0').trim();
				const usdValue = parseFloat(collectPriceUsdTrimmed || '0');
				if (usdValue > 0) {
					// Convert USD to wei using Pyth price
					collectPrice = await usdToWei(collectPriceUsdTrimmed);
				}
			} catch {
				throw new Error(
					m.invalid_collect_price({ value: String(formData.collectPriceUsd ?? '').trim() })
				);
			}

			const maxSupplyTrimmed = String(formData.maxCollectSupply ?? '0').trim();
			if (!/^(0|[1-9]\d*)$/.test(maxSupplyTrimmed)) {
				throw new Error(
					m.invalid_max_supply({ value: maxSupplyTrimmed })
				);
			}
			const maxSupply = BigInt(maxSupplyTrimmed);

			const originalityNum = Number.parseInt(formData.originality, 10);
			if (![0, 1, 2].includes(originalityNum)) {
				throw new Error(
					m.invalid_originality({ value: formData.originality })
				);
			}

			// Call publishArticle from lib
			const result = await publishArticle({
				title: formData.title.trim(),
				summary: formData.summary.trim(),
				content: fullContent,
				tags,
				coverImage: formData.coverImageFile,
				contentImages: convertContentImages(formData.contentImages),
				categoryId: formData.categoryId,
				royaltyBps: formData.royaltyBps,
				originalAuthor: formData.author.trim() || undefined,
				collectPrice,
				maxCollectSupply: maxSupply,
				originality: originalityNum
			});

			// Success
			submitStatus = 'success';
			statusMessage = m.publish_success({ arweaveId: result.arweaveId, txHash: result.txHash });

			// Redirect to article detail page after 2 seconds
			setTimeout(() => {
				goto(`/a?id=${result.arweaveId}`);
			}, 2000);
		} catch (error) {
			submitStatus = 'error';
			// Handle ContractError with i18n
			if (error instanceof ContractError) {
				const errorKey = `error_${error.code}` as keyof typeof m;
				const errorFn = m[errorKey];
				statusMessage = typeof errorFn === 'function' ? (errorFn as () => string)() : String(error.message);
			} else {
				const errorMessage = error instanceof Error ? error.message : String(error);
				statusMessage = m.failed({ error: errorMessage });
			}
		} finally {
			isSubmitting = false;
		}
	}

	// Button text based on submit status
	let submitButtonText = $derived.by(() => {
		if (!isSubmitting) return m.publish();
		switch (submitStatus) {
			case 'uploadingCover':
				return m.uploading();
			case 'uploadingImages':
				return m.uploading();
			case 'uploadingArticle':
				return m.uploading_to({ destination: m.arweave() });
			case 'publishingContract':
				return m.publishing_to({ destination: 'blockchain' });
			default:
				return m.publish();
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
	<title>{m.publish_article()} - {getConfig().appName}</title>
</svelte:head>

<div class="min-h-screen bg-white">
	<div class="mx-auto max-w-3xl px-6 py-12">
		<header class="mb-12">
			<h1 class="mb-2 text-4xl font-light tracking-tight">{m.publish_article()}</h1>
			<p class="text-gray-500">{m.pin_evm_content()}</p>
		</header>

		<form
			onsubmit={(e) => {
				e.preventDefault();
				handleSubmit();
			}}
			class="space-y-8"
		>
			{#key resetImageKey}
				<ArticleEditor
					bind:formData
					disabled={isSubmitting}
					mode="publish"
					showNftSettings={true}
					resetKey={resetImageKey}
				/>
			{/key}

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
				<button
					type="button"
					disabled={isSubmitting}
					class="rounded-lg border border-gray-200 px-6 py-3 font-medium text-gray-900 transition-colors hover:bg-gray-50 disabled:opacity-50"
					onclick={resetForm}
				>
					{m.clear()}
				</button>
			</div>

			<p class="text-xs text-gray-500">* {m.required()}</p>
		</form>
	</div>
</div>
