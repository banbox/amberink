<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	import { publishArticle } from '$lib/publish';
	import { ContractError } from '$lib/contracts';
	import { CATEGORY_KEYS } from '$lib/data';
	import SearchSelect, { type SelectOption } from '$lib/components/SearchSelect.svelte';

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

	// Selected category value (null means no selection)
	let selectedCategory = $state<bigint | null>(null);

	// Form state
	let title = $state('');
	let summary = $state('');
	let categoryId = $derived(selectedCategory ?? 0n);
	let author = $state('');
	let content = $state('');
	let postscript = $state('');
	let coverImageFile = $state<File | null>(null);
	let coverImagePreview = $state<string | null>(null);
	let royaltyBps = $state<bigint>(500n);

	// Submit state
	type SubmitStatus =
		| 'idle'
		| 'validating'
		| 'uploadingCover'
		| 'uploadingArticle'
		| 'publishingContract'
		| 'success'
		| 'error';
	let isSubmitting = $state(false);
	let submitStatus = $state<SubmitStatus>('idle');
	let statusMessage = $state('');

	// Handle cover image selection
	function handleCoverImageChange(e: Event) {
		const target = e.target as HTMLInputElement;
		const file = target.files?.[0];
		if (!file) return;

		// Validate file type
		if (!file.type.startsWith('image/')) {
			statusMessage = m.invalid_image();
			submitStatus = 'error';
			return;
		}

		// Validate file size (10MB max)
		if (file.size > 10 * 1024 * 1024) {
			statusMessage = m.image_too_large();
			submitStatus = 'error';
			return;
		}

		coverImageFile = file;
		coverImagePreview = URL.createObjectURL(file);
		submitStatus = 'idle';
	}

	// Remove cover image
	function removeCoverImage() {
		if (coverImagePreview) {
			URL.revokeObjectURL(coverImagePreview);
		}
		coverImageFile = null;
		coverImagePreview = null;
	}

	// Reset form
	function resetForm() {
		title = '';
		summary = '';
		selectedCategory = null;
		author = '';
		content = '';
		postscript = '';
		removeCoverImage();
		isSubmitting = false;
		submitStatus = 'idle';
		statusMessage = '';
	}

	// Handle form submission
	async function handleSubmit() {
		if (isSubmitting) return;

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
			if (categoryId < 0n) {
				throw new Error(m.invalid_category());
			}
			// Use selected category as tag
			const selectedKey = CATEGORY_KEYS[Number(categoryId)];
			const tags = selectedKey ? [getCategoryLabel(selectedKey)] : [];

			// Combine content with postscript if provided
			const fullContent = postscript.trim()
				? `${content.trim()}\n\n---\n\n${postscript.trim()}`
				: content.trim();

			// Update status for cover upload
			if (coverImageFile) {
				submitStatus = 'uploadingCover';
				statusMessage = m.uploading_cover();
			}

			// Update status for article upload
			submitStatus = 'uploadingArticle';
			statusMessage = m.uploading_to_arweave();

			// Call publishArticle from lib
			const result = await publishArticle({
				title: title.trim(),
				summary: summary.trim(),
				content: fullContent,
				tags,
				coverImage: coverImageFile,
				categoryId: categoryId,
				royaltyBps: royaltyBps,
				originalAuthor: author.trim() || undefined
			});

			// Success
			submitStatus = 'success';
			statusMessage = m.publish_success({ arweaveId: result.arweaveId, txHash: result.txHash });
		} catch (error) {
			submitStatus = 'error';
			// Handle ContractError with i18n
			if (error instanceof ContractError) {
				const errorKey = `error_${error.code}` as keyof typeof m;
				const errorFn = m[errorKey];
				statusMessage = typeof errorFn === 'function' ? (errorFn as () => string)() : String(error.message);
			} else {
				const errorMessage = error instanceof Error ? error.message : String(error);
				statusMessage = m.publish_failed({ error: errorMessage });
			}
		} finally {
			isSubmitting = false;
		}
	}

	// Button text based on submit status
	let submitButtonText = $derived.by(() => {
		if (!isSubmitting) return m.publish_article();
		switch (submitStatus) {
			case 'uploadingCover':
				return m.uploading_cover();
			case 'uploadingArticle':
				return m.uploading_to_arweave();
			case 'publishingContract':
				return m.publishing_to_blockchain();
			default:
				return m.publish_article();
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

<div class="min-h-screen bg-white">
	<div class="mx-auto max-w-3xl px-6 py-12">
		<header class="mb-12">
			<h1 class="mb-2 text-4xl font-light tracking-tight">{m.publish()} {m.article()}</h1>
			<p class="text-gray-500">{m.share_thoughts()}</p>
		</header>

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
				<label for="cover-image" class="mb-3 block text-sm font-medium text-gray-700">
					{m.cover()}
				</label>
				{#if coverImagePreview}
					<div class="space-y-3">
						<div class="relative overflow-hidden rounded-lg bg-gray-100">
							<img src={coverImagePreview} alt="Cover preview" class="h-64 w-full object-cover" />
						</div>
						<button
							type="button"
							class="text-sm text-gray-600 underline hover:text-gray-900"
							disabled={isSubmitting}
							onclick={removeCoverImage}
						>
							{m.remove()}
						</button>
					</div>
				{:else}
					<label
						for="cover-image"
						class="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-200 px-6 py-10 transition-colors hover:border-gray-300"
					>
						<svg
							class="mb-2 h-8 w-8 text-gray-400"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M12 4v16m8-8H4"
							/>
						</svg>
						<p class="text-sm font-medium text-gray-700">{m.upload()}</p>
						<p class="text-xs text-gray-500">{m.image_format_help()}</p>
						<input
							id="cover-image"
							type="file"
							accept="image/*"
							class="hidden"
							disabled={isSubmitting}
							onchange={handleCoverImageChange}
						/>
					</label>
				{/if}
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
					rows="12"
					class="w-full rounded-lg border border-gray-200 bg-white px-4 py-3 font-mono text-sm text-gray-900 placeholder-gray-400 transition-colors focus:border-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-300"
					disabled={isSubmitting}
				></textarea>
			</div>

			<!-- Postscript -->
			<div>
				<label for="postscript" class="mb-2 block text-sm font-medium text-gray-700">
					{m.postscript()}
				</label>
				<textarea
					id="postscript"
					bind:value={postscript}
					placeholder={m.optional_postscript()}
					rows="4"
					class="w-full rounded-lg border border-gray-200 bg-white px-4 py-3 text-base text-gray-900 placeholder-gray-400 transition-colors focus:border-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-300"
					disabled={isSubmitting}
				></textarea>
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