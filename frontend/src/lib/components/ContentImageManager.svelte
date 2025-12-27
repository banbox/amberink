<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	import { getIrysFreeUploadLimit } from '$lib/config';
	import { compressImage } from '$lib/utils/imageCompressor';
	import { SpinnerIcon, PlusIcon, ClipboardIcon, ResizeIcon, CloseIcon } from '$lib/components/icons';

	/**
	 * Content Image Manager Component
	 * 
	 * Manages images for article content with:
	 * - Auto-naming (01.jpg, 02.png, etc.)
	 * - Markdown placeholder insertion
	 * - Image preview on hover
	 * - Delete functionality
	 * - Size settings support
	 */

	interface ContentImage {
		id: string;           // Unique identifier (01, 02, etc.)
		file: File;           // The image file
		previewUrl: string;   // Object URL for preview
		extension: string;    // File extension (jpg, png, etc.)
		width?: number;       // Optional width setting
		height?: number;      // Optional height setting
	}

	interface Props {
		/** Current images list */
		images?: ContentImage[];
		/** Callback when images change */
		onImagesChange?: (images: ContentImage[]) => void;
		/** Callback when user wants to insert image markdown at cursor */
		onInsertMarkdown?: (markdown: string) => void;
		/** Maximum number of images allowed */
		maxImages?: number;
		/** Maximum file size per image in bytes */
		maxFileSize?: number;
		/** Disabled state */
		disabled?: boolean;
	}

	let {
		images = $bindable([]),
		onImagesChange = () => {},
		onInsertMarkdown = () => {},
		maxImages = 20,
		maxFileSize = undefined,
		disabled = false
	}: Props = $props();

	// Use config value if maxFileSize not provided
	let effectiveMaxFileSize = $derived(maxFileSize ?? getIrysFreeUploadLimit());

	// Compression state
	let isCompressing = $state(false);
	let compressionStatus = $state('');

	// State
	let fileInput = $state<HTMLInputElement | null>(null);
	let error = $state('');
	let hoveredImageId = $state<string | null>(null);
	let showSizeModal = $state(false);
	let editingImage = $state<ContentImage | null>(null);
	let tempWidth = $state<string>('');
	let tempHeight = $state<string>('');

	// Generate next image ID (01, 02, etc.)
	function getNextImageId(): string {
		if (images.length === 0) return '01';
		const maxId = Math.max(...images.map(img => parseInt(img.id, 10)));
		return String(maxId + 1).padStart(2, '0');
	}

	// Get file extension
	function getExtension(file: File): string {
		const type = file.type.split('/')[1];
		if (type === 'jpeg') return 'jpg';
		return type || 'jpg';
	}

	// Handle file selection
	async function handleFileSelect(e: Event) {
		const target = e.target as HTMLInputElement;
		const files = target.files;
		if (!files || files.length === 0) return;

		error = '';
		compressionStatus = '';

		if (images.length >= maxImages) {
			error = m.max_images_reached({ max: maxImages });
			return;
		}

		let file = files[0];

		// Validate file type
		if (!file.type.startsWith('image/')) {
			error = m.invalid_image();
			return;
		}

		// Auto-compress if file exceeds size limit
		if (file.size > effectiveMaxFileSize) {
			try {
				isCompressing = true;
				compressionStatus = m.compressing_image();

				const result = await compressImage(file, {
					maxSize: effectiveMaxFileSize
				});

				file = result.file;
				compressionStatus = m.compression_complete({ original: formatFileSize(result.originalSize), compressed: formatFileSize(result.compressedSize) });

				// Clear status after 3 seconds
				setTimeout(() => { compressionStatus = ''; }, 3000);
			} catch (err) {
				error = m.compression_failed();
				isCompressing = false;
				return;
			} finally {
				isCompressing = false;
			}
		}

		// Create new image entry
		const id = getNextImageId();
		const extension = getExtension(file);
		const previewUrl = URL.createObjectURL(file);

		const newImage: ContentImage = {
			id,
			file,
			previewUrl,
			extension
		};

		images = [...images, newImage];
		onImagesChange(images);

		// Reset file input
		if (fileInput) fileInput.value = '';
	}

	// Remove image
	function removeImage(imageId: string) {
		const image = images.find(img => img.id === imageId);
		if (image) {
			URL.revokeObjectURL(image.previewUrl);
		}
		images = images.filter(img => img.id !== imageId);
		onImagesChange(images);
	}

	// Get markdown for image
	function getImageMarkdown(image: ContentImage): string {
		const filename = `${image.id}.${image.extension}`;
		if (image.width || image.height) {
			// Use HTML img tag for size control
			const widthAttr = image.width ? ` width="${image.width}"` : '';
			const heightAttr = image.height ? ` height="${image.height}"` : '';
			return `<img src="${filename}"${widthAttr}${heightAttr} alt="${filename}" />`;
		}
		return `![${filename}](${filename})`;
	}

	// Insert markdown at cursor
	function insertImageMarkdown(image: ContentImage) {
		const markdown = getImageMarkdown(image);
		onInsertMarkdown(markdown);
	}

	// Open size settings modal
	function openSizeSettings(image: ContentImage) {
		editingImage = image;
		tempWidth = image.width?.toString() || '';
		tempHeight = image.height?.toString() || '';
		showSizeModal = true;
	}

	// Save size settings
	function saveSizeSettings() {
		if (!editingImage) return;

		const width = tempWidth ? parseInt(tempWidth, 10) : undefined;
		const height = tempHeight ? parseInt(tempHeight, 10) : undefined;

		images = images.map(img => {
			if (img.id === editingImage!.id) {
				return { ...img, width, height };
			}
			return img;
		});

		onImagesChange(images);
		showSizeModal = false;
		editingImage = null;
	}

	// Format file size
	function formatFileSize(bytes: number): string {
		if (bytes < 1024) return `${bytes} B`;
		return `${(bytes / 1024).toFixed(1)} KB`;
	}

	// Cleanup on unmount
	$effect(() => {
		return () => {
			images.forEach(img => {
				URL.revokeObjectURL(img.previewUrl);
			});
		};
	});
</script>

<div class="content-image-manager">
	<div class="mb-2 flex items-center justify-between">
		<label class="block text-sm font-medium text-gray-700">
			{m.content_images()}
		</label>
		<span class="text-xs text-gray-500">
			{images.length}/{maxImages}
		</span>
	</div>

	<!-- Upload button -->
	{#if images.length < maxImages}
		<label
			class="mb-3 flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-200 px-4 py-3 text-sm transition-colors hover:border-gray-300 {disabled ||
			isCompressing
				? 'cursor-not-allowed opacity-50'
				: ''}"
		>
			{#if isCompressing}
				<SpinnerIcon size={20} class="text-blue-500" />
				<span class="text-blue-600">{compressionStatus}</span>
			{:else}
				<PlusIcon size={20} class="text-gray-400" />
				<span class="text-gray-600">{m.add_image()}</span>
			{/if}
			<input
				bind:this={fileInput}
				type="file"
				accept="image/*"
				class="hidden"
				disabled={disabled || isCompressing}
				onchange={handleFileSelect}
			/>
		</label>
	{/if}

	<!-- Compression success status -->
	{#if compressionStatus && !isCompressing}
		<p class="mb-3 text-sm text-green-600">{compressionStatus}</p>
	{/if}

	{#if error}
		<p class="mb-3 text-sm text-red-600">{error}</p>
	{/if}

	<!-- Images list -->
	{#if images.length > 0}
		<div class="space-y-2">
			{#each images as image (image.id)}
				<div
					class="group relative flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-3 py-2"
					onmouseenter={() => (hoveredImageId = image.id)}
					onmouseleave={() => (hoveredImageId = null)}
				>
					<!-- Image info -->
					<div class="flex items-center gap-3">
						<span class="font-mono text-sm font-medium text-gray-700">
							{image.id}.{image.extension}
						</span>
						<span class="text-xs text-gray-400">
							{formatFileSize(image.file.size)}
						</span>
						{#if image.width || image.height}
							<span class="rounded bg-blue-100 px-1.5 py-0.5 text-xs text-blue-700">
								{image.width || 'auto'}×{image.height || 'auto'}
							</span>
						{/if}
					</div>

					<!-- Actions -->
					<div class="flex items-center gap-1">
						<!-- Insert markdown button -->
						<button
							type="button"
							class="rounded p-1.5 text-gray-400 hover:bg-gray-200 hover:text-gray-600"
							title={m.insert_markdown()}
							{disabled}
							onclick={() => insertImageMarkdown(image)}
						>
							<!-- Clipboard/paste icon - represents inserting content -->
							<ClipboardIcon size={16} />
						</button>

						<!-- Size settings button -->
						<button
							type="button"
							class="rounded p-1.5 text-gray-400 hover:bg-gray-200 hover:text-gray-600"
							title={m.image_size()}
							{disabled}
							onclick={() => openSizeSettings(image)}
						>
							<ResizeIcon size={16} />
						</button>

						<!-- Delete button -->
						<button
							type="button"
							class="rounded p-1.5 text-gray-400 hover:bg-red-100 hover:text-red-600"
							title={m.remove()}
							{disabled}
							onclick={() => removeImage(image.id)}
						>
							<CloseIcon size={16} />
						</button>
					</div>

					<!-- Preview tooltip -->
					{#if hoveredImageId === image.id}
						<div
							class="absolute bottom-full left-0 z-50 mb-2 rounded-lg border border-gray-200 bg-white p-1 shadow-lg"
						>
							<img
								src={image.previewUrl}
								alt={`${image.id}.${image.extension}`}
								class="max-h-48 max-w-64 rounded object-contain"
							/>
						</div>
					{/if}
				</div>
			{/each}
		</div>
	{/if}

	<!-- Help text -->
	<p class="mt-2 text-xs text-gray-500">
		{m.content_images_help()}
	</p>
</div>

<!-- Size Settings Modal -->
{#if showSizeModal && editingImage}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
		role="dialog"
		aria-modal="true"
	>
		<div class="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
			<h3 class="mb-4 text-lg font-medium text-gray-900">
				{m.image_size_settings()}
			</h3>
			<p class="mb-4 text-sm text-gray-500">
				{editingImage.id}.{editingImage.extension}
			</p>

			<div class="mb-4 grid grid-cols-2 gap-4">
				<div>
					<label for="img-width" class="mb-1 block text-sm font-medium text-gray-700">
						{m.width()}
					</label>
					<input
						id="img-width"
						type="number"
						bind:value={tempWidth}
						placeholder="auto"
						min="1"
						class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-300"
					/>
				</div>
				<div>
					<label for="img-height" class="mb-1 block text-sm font-medium text-gray-700">
						{m.height()}
					</label>
					<input
						id="img-height"
						type="number"
						bind:value={tempHeight}
						placeholder="auto"
						min="1"
						class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-300"
					/>
				</div>
			</div>

			<p class="mb-4 text-xs text-gray-500">
				{m.image_size_help()}
			</p>

			<div class="flex justify-end gap-3">
				<button
					type="button"
					class="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
					onclick={() => {
						showSizeModal = false;
						editingImage = null;
					}}
				>
					{m.cancel()}
				</button>
				<button
					type="button"
					class="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:opacity-90"
					onclick={saveSizeSettings}
				>
					{m.save()}
				</button>
			</div>
		</div>
	</div>
{/if}
