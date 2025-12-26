<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	import { getIrysFreeUploadLimit } from '$lib/config';
	import { PlusIcon, CloseIcon } from '$lib/components/icons';

	interface Props {
		/** Aspect ratio (width/height). e.g., 16/9, 1, 4/3. If undefined, free crop */
		aspectRatio?: number;
		/** Maximum file size in bytes. Default 100KB */
		maxFileSize?: number;
		/** Minimum width in pixels */
		minWidth?: number;
		/** Minimum height in pixels */
		minHeight?: number;
		/** Maximum width for output. Will scale down if larger */
		maxOutputWidth?: number;
		/** Maximum height for output. Will scale down if larger */
		maxOutputHeight?: number;
		/** Accept file types */
		accept?: string;
		/** Callback when image is processed */
		onImageProcessed?: (file: File, previewUrl: string) => void;
		/** Callback when image is removed */
		onImageRemoved?: () => void;
		/** Initial preview URL (for edit mode) */
		initialPreviewUrl?: string;
		/** Disabled state */
		disabled?: boolean;
		/** Label text */
		label?: string;
		/** Help text */
		helpText?: string;
		/** Show as circular preview (for avatars) */
		circular?: boolean;
		/** Preview height class */
		previewHeightClass?: string;
	}

	// Use config value if maxFileSize not provided
	let configMaxFileSize = $derived(getIrysFreeUploadLimit());

	let {
		aspectRatio = undefined,
		maxFileSize = undefined,
		minWidth = 0,
		minHeight = 0,
		maxOutputWidth = 1920,
		maxOutputHeight = 1080,
		accept = 'image/*',
		onImageProcessed = () => {},
		onImageRemoved = () => {},
		initialPreviewUrl = undefined,
		disabled = false,
		label = '',
		helpText = '',
		circular = false,
		previewHeightClass = 'h-64'
	}: Props = $props();

	// Effective max file size (prop or config)
	let effectiveMaxFileSize = $derived(maxFileSize ?? configMaxFileSize);

	// State
	let fileInput = $state<HTMLInputElement | null>(null);
	let previewUrl = $state<string | null>(initialPreviewUrl ?? null);
	let originalImage = $state<HTMLImageElement | null>(null);
	let showCropModal = $state(false);
	let processing = $state(false);
	let error = $state('');

	// Crop state
	let cropX = $state(0);
	let cropY = $state(0);
	let cropWidth = $state(100);
	let cropHeight = $state(100);
	let isDragging = $state(false);
	let isResizing = $state(false);
	let resizeHandle = $state('');
	let dragStartX = $state(0);
	let dragStartY = $state(0);
	let cropStartX = $state(0);
	let cropStartY = $state(0);
	let cropStartWidth = $state(0);
	let cropStartHeight = $state(0);

	// Canvas refs
	let cropCanvas = $state<HTMLCanvasElement | null>(null);
	let containerRef = $state<HTMLDivElement | null>(null);

	// Image dimensions in crop view
	let displayWidth = $state(0);
	let displayHeight = $state(0);
	let scale = $state(1);

	// Compression quality state
	let quality = $state(0.9);

	// Output info
	let outputInfo = $state<{ width: number; height: number; size: number } | null>(null);

	function handleFileSelect(e: Event) {
		const target = e.target as HTMLInputElement;
		const file = target.files?.[0];
		if (!file) return;

		error = '';

		if (!file.type.startsWith('image/')) {
			error = m.invalid_image();
			return;
		}

		const img = new Image();
		img.onload = () => {
			originalImage = img;

			// Check minimum dimensions
			if (img.width < minWidth || img.height < minHeight) {
				error = m.image_too_small({ width: minWidth, height: minHeight });
				return;
			}

			// Calculate display size for crop modal
			calculateDisplaySize(img);

			// Initialize crop area
			initializeCropArea(img);

			showCropModal = true;
		};
		img.onerror = () => {
			error = m.invalid_image();
		};
		img.src = URL.createObjectURL(file);
	}

	function calculateDisplaySize(img: HTMLImageElement) {
		const maxDisplayWidth = Math.min(800, window.innerWidth - 48);
		const maxDisplayHeight = Math.min(600, window.innerHeight - 200);

		const widthRatio = maxDisplayWidth / img.width;
		const heightRatio = maxDisplayHeight / img.height;
		scale = Math.min(widthRatio, heightRatio, 1);

		displayWidth = img.width * scale;
		displayHeight = img.height * scale;
	}

	function initializeCropArea(img: HTMLImageElement) {
		if (aspectRatio) {
			// Calculate the largest crop area with the required aspect ratio
			const imgRatio = img.width / img.height;

			if (imgRatio > aspectRatio) {
				// Image is wider, constrain by height
				cropHeight = displayHeight;
				cropWidth = cropHeight * aspectRatio;
			} else {
				// Image is taller, constrain by width
				cropWidth = displayWidth;
				cropHeight = cropWidth / aspectRatio;
			}

			// Center the crop area
			cropX = (displayWidth - cropWidth) / 2;
			cropY = (displayHeight - cropHeight) / 2;
		} else {
			// Free crop - start with full image
			cropX = 0;
			cropY = 0;
			cropWidth = displayWidth;
			cropHeight = displayHeight;
		}
	}

	function handleMouseDown(e: MouseEvent, type: string) {
		if (disabled) return;
		e.preventDefault();

		dragStartX = e.clientX;
		dragStartY = e.clientY;
		cropStartX = cropX;
		cropStartY = cropY;
		cropStartWidth = cropWidth;
		cropStartHeight = cropHeight;

		if (type === 'move') {
			isDragging = true;
		} else {
			isResizing = true;
			resizeHandle = type;
		}

		window.addEventListener('mousemove', handleMouseMove);
		window.addEventListener('mouseup', handleMouseUp);
	}

	function handleMouseMove(e: MouseEvent) {
		const deltaX = e.clientX - dragStartX;
		const deltaY = e.clientY - dragStartY;

		if (isDragging) {
			let newX = cropStartX + deltaX;
			let newY = cropStartY + deltaY;

			// Constrain to image bounds
			newX = Math.max(0, Math.min(newX, displayWidth - cropWidth));
			newY = Math.max(0, Math.min(newY, displayHeight - cropHeight));

			cropX = newX;
			cropY = newY;
		} else if (isResizing) {
			handleResize(deltaX, deltaY);
		}
	}

	function handleResize(deltaX: number, deltaY: number) {
		let newX = cropStartX;
		let newY = cropStartY;
		let newWidth = cropStartWidth;
		let newHeight = cropStartHeight;

		const minSize = 50;

		switch (resizeHandle) {
			case 'nw':
				newX = cropStartX + deltaX;
				newY = cropStartY + deltaY;
				newWidth = cropStartWidth - deltaX;
				newHeight = cropStartHeight - deltaY;
				break;
			case 'ne':
				newY = cropStartY + deltaY;
				newWidth = cropStartWidth + deltaX;
				newHeight = cropStartHeight - deltaY;
				break;
			case 'sw':
				newX = cropStartX + deltaX;
				newWidth = cropStartWidth - deltaX;
				newHeight = cropStartHeight + deltaY;
				break;
			case 'se':
				newWidth = cropStartWidth + deltaX;
				newHeight = cropStartHeight + deltaY;
				break;
			case 'n':
				newY = cropStartY + deltaY;
				newHeight = cropStartHeight - deltaY;
				break;
			case 's':
				newHeight = cropStartHeight + deltaY;
				break;
			case 'w':
				newX = cropStartX + deltaX;
				newWidth = cropStartWidth - deltaX;
				break;
			case 'e':
				newWidth = cropStartWidth + deltaX;
				break;
		}

		// Apply aspect ratio constraint
		if (aspectRatio) {
			if (['n', 's'].includes(resizeHandle)) {
				newWidth = newHeight * aspectRatio;
			} else if (['w', 'e'].includes(resizeHandle)) {
				newHeight = newWidth / aspectRatio;
			} else {
				// Corner resize - maintain aspect ratio
				const currentRatio = newWidth / newHeight;
				if (currentRatio > aspectRatio) {
					newWidth = newHeight * aspectRatio;
				} else {
					newHeight = newWidth / aspectRatio;
				}
			}
		}

		// Minimum size constraint
		if (newWidth < minSize) {
			newWidth = minSize;
			if (aspectRatio) newHeight = newWidth / aspectRatio;
		}
		if (newHeight < minSize) {
			newHeight = minSize;
			if (aspectRatio) newWidth = newHeight * aspectRatio;
		}

		// Boundary constraints
		if (newX < 0) {
			newWidth += newX;
			newX = 0;
		}
		if (newY < 0) {
			newHeight += newY;
			newY = 0;
		}
		if (newX + newWidth > displayWidth) {
			newWidth = displayWidth - newX;
			if (aspectRatio) newHeight = newWidth / aspectRatio;
		}
		if (newY + newHeight > displayHeight) {
			newHeight = displayHeight - newY;
			if (aspectRatio) newWidth = newHeight * aspectRatio;
		}

		cropX = newX;
		cropY = newY;
		cropWidth = newWidth;
		cropHeight = newHeight;
	}

	function handleMouseUp() {
		isDragging = false;
		isResizing = false;
		resizeHandle = '';
		window.removeEventListener('mousemove', handleMouseMove);
		window.removeEventListener('mouseup', handleMouseUp);
	}

	async function processCrop() {
		if (!originalImage) return;

		processing = true;
		error = '';

		try {
			// Calculate actual crop coordinates on original image
			const actualX = cropX / scale;
			const actualY = cropY / scale;
			const actualWidth = cropWidth / scale;
			const actualHeight = cropHeight / scale;

			// Calculate output dimensions
			let outputWidth = actualWidth;
			let outputHeight = actualHeight;

			if (outputWidth > maxOutputWidth) {
				const ratio = maxOutputWidth / outputWidth;
				outputWidth = maxOutputWidth;
				outputHeight *= ratio;
			}
			if (outputHeight > maxOutputHeight) {
				const ratio = maxOutputHeight / outputHeight;
				outputHeight = maxOutputHeight;
				outputWidth *= ratio;
			}

			outputWidth = Math.round(outputWidth);
			outputHeight = Math.round(outputHeight);

			// Create canvas and draw cropped image
			const canvas = document.createElement('canvas');
			canvas.width = outputWidth;
			canvas.height = outputHeight;
			const ctx = canvas.getContext('2d');
			if (!ctx) throw new Error('Canvas context not available');

			ctx.drawImage(
				originalImage,
				actualX,
				actualY,
				actualWidth,
				actualHeight,
				0,
				0,
				outputWidth,
				outputHeight
			);

			// Compress to meet size requirements
			let currentQuality = quality;
			let blob: Blob | null = null;
			let attempts = 0;
			const maxAttempts = 10;

			while (attempts < maxAttempts) {
				blob = await new Promise<Blob | null>((resolve) => {
					canvas.toBlob(resolve, 'image/jpeg', currentQuality);
				});

				if (!blob) throw new Error('Failed to create blob');

				if (blob.size <= effectiveMaxFileSize || currentQuality <= 0.1) {
					break;
				}

				// Reduce quality
				currentQuality -= 0.1;
				attempts++;
			}

			if (!blob) throw new Error('Failed to compress image');

			// If still too large after quality reduction, resize
			if (blob.size > effectiveMaxFileSize) {
				const reductionFactor = Math.sqrt(effectiveMaxFileSize / blob.size);
				const newWidth = Math.round(outputWidth * reductionFactor);
				const newHeight = Math.round(outputHeight * reductionFactor);

				canvas.width = newWidth;
				canvas.height = newHeight;
				ctx.drawImage(
					originalImage,
					actualX,
					actualY,
					actualWidth,
					actualHeight,
					0,
					0,
					newWidth,
					newHeight
				);

				blob = await new Promise<Blob | null>((resolve) => {
					canvas.toBlob(resolve, 'image/jpeg', 0.8);
				});

				if (!blob) throw new Error('Failed to resize image');
				outputWidth = newWidth;
				outputHeight = newHeight;
			}

			// Create file and preview
			const file = new File([blob], 'processed-image.jpg', { type: 'image/jpeg' });

			// Revoke old preview URL
			if (previewUrl && previewUrl !== initialPreviewUrl) {
				URL.revokeObjectURL(previewUrl);
			}

			previewUrl = URL.createObjectURL(blob);
			outputInfo = { width: outputWidth, height: outputHeight, size: blob.size };

			showCropModal = false;
			onImageProcessed(file, previewUrl);
		} catch (e) {
			error = e instanceof Error ? e.message : m.image_process_error();
		} finally {
			processing = false;
		}
	}

	function cancelCrop() {
		showCropModal = false;
		if (fileInput) fileInput.value = '';
	}

	function removeImage() {
		if (previewUrl && previewUrl !== initialPreviewUrl) {
			URL.revokeObjectURL(previewUrl);
		}
		previewUrl = null;
		originalImage = null;
		outputInfo = null;
		if (fileInput) fileInput.value = '';
		onImageRemoved();
	}

	function formatFileSize(bytes: number): string {
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	}

	// Cleanup on unmount
	$effect(() => {
		return () => {
			if (previewUrl && previewUrl !== initialPreviewUrl) {
				URL.revokeObjectURL(previewUrl);
			}
		};
	});
</script>

<div class="image-processor">
	{#if label}
		<label class="mb-2 block text-sm font-medium text-gray-700">
			{label}
		</label>
	{/if}

	{#if previewUrl}
		<!-- Preview mode -->
		<div class="space-y-3">
			<div
				class="relative overflow-hidden rounded-lg bg-gray-100 {circular
					? 'mx-auto aspect-square w-32'
					: previewHeightClass}"
			>
				<img
					src={previewUrl}
					alt="Preview"
					class="h-full w-full {circular ? 'rounded-full' : ''} object-cover"
				/>
			</div>
			{#if outputInfo}
				<p class="text-center text-xs text-gray-500">
					{outputInfo.width}×{outputInfo.height} · {formatFileSize(outputInfo.size)}
				</p>
			{/if}
			<div class="flex justify-center gap-2">
				<button
					type="button"
					class="text-sm text-blue-600 hover:text-blue-700"
					{disabled}
					onclick={() => fileInput?.click()}
				>
					{m.change_image()}
				</button>
				<button
					type="button"
					class="text-sm text-gray-600 underline hover:text-gray-900"
					{disabled}
					onclick={removeImage}
				>
					{m.remove()}
				</button>
			</div>
		</div>
	{:else}
		<!-- Upload mode -->
		<label
			class="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-200 px-6 py-10 transition-colors hover:border-gray-300 {disabled
				? 'cursor-not-allowed opacity-50'
				: ''}"
		>
			<PlusIcon size={32} class="mb-2 text-gray-400" />
			<p class="text-sm font-medium text-gray-700">{m.upload()}</p>
			{#if helpText}
				<p class="text-xs text-gray-500">{helpText}</p>
			{:else}
				<p class="text-xs text-gray-500">
					{m.image_format_help()} · {m.max_size({ size: formatFileSize(effectiveMaxFileSize) })}
				</p>
			{/if}
			<input
				bind:this={fileInput}
				type="file"
				{accept}
				class="hidden"
				{disabled}
				onchange={handleFileSelect}
			/>
		</label>
	{/if}

	{#if error}
		<p class="mt-2 text-sm text-red-600">{error}</p>
	{/if}

	<!-- Crop Modal -->
	{#if showCropModal && originalImage}
		<div
			class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
			role="dialog"
			aria-modal="true"
		>
			<div class="w-full max-w-4xl rounded-lg bg-white shadow-xl">
				<!-- Header -->
				<div class="flex items-center justify-between border-b border-gray-200 px-6 py-4">
					<h3 class="text-lg font-medium text-gray-900">{m.crop_image()}</h3>
					<button type="button" class="text-gray-400 hover:text-gray-600" onclick={cancelCrop}>
						<CloseIcon size={24} />
					</button>
				</div>

				<!-- Crop Area -->
				<div class="flex justify-center bg-gray-900 p-4">
					<div
						bind:this={containerRef}
						class="relative select-none"
						style="width: {displayWidth}px; height: {displayHeight}px;"
					>
						<!-- Original Image -->
						<img
							src={originalImage.src}
							alt="Crop source"
							class="h-full w-full"
							draggable="false"
						/>

						<!-- Overlay -->
						<div class="pointer-events-none absolute inset-0 bg-black/50"></div>

						<!-- Crop Area (visible part) -->
						<div
							class="absolute cursor-move overflow-hidden border-2 border-white"
							style="left: {cropX}px; top: {cropY}px; width: {cropWidth}px; height: {cropHeight}px;"
							role="button"
							tabindex="0"
							onmousedown={(e) => handleMouseDown(e, 'move')}
						>
							<img
								src={originalImage.src}
								alt="Crop preview"
								class="max-w-none"
								style="width: {displayWidth}px; height: {displayHeight}px; margin-left: -{cropX}px; margin-top: -{cropY}px;"
								draggable="false"
							/>

							<!-- Grid lines -->
							<div class="pointer-events-none absolute inset-0">
								<div class="absolute left-1/3 top-0 h-full w-px bg-white/30"></div>
								<div class="absolute left-2/3 top-0 h-full w-px bg-white/30"></div>
								<div class="absolute left-0 top-1/3 h-px w-full bg-white/30"></div>
								<div class="absolute left-0 top-2/3 h-px w-full bg-white/30"></div>
							</div>

							<!-- Resize Handles -->
							<!-- Corners -->
							<div
								class="absolute -left-1.5 -top-1.5 h-3 w-3 cursor-nw-resize bg-white shadow"
								role="button"
								tabindex="0"
								onmousedown={(e) => {
									e.stopPropagation();
									handleMouseDown(e, 'nw');
								}}
							></div>
							<div
								class="absolute -right-1.5 -top-1.5 h-3 w-3 cursor-ne-resize bg-white shadow"
								role="button"
								tabindex="0"
								onmousedown={(e) => {
									e.stopPropagation();
									handleMouseDown(e, 'ne');
								}}
							></div>
							<div
								class="absolute -bottom-1.5 -left-1.5 h-3 w-3 cursor-sw-resize bg-white shadow"
								role="button"
								tabindex="0"
								onmousedown={(e) => {
									e.stopPropagation();
									handleMouseDown(e, 'sw');
								}}
							></div>
							<div
								class="absolute -bottom-1.5 -right-1.5 h-3 w-3 cursor-se-resize bg-white shadow"
								role="button"
								tabindex="0"
								onmousedown={(e) => {
									e.stopPropagation();
									handleMouseDown(e, 'se');
								}}
							></div>

							<!-- Edges -->
							<div
								class="absolute -top-1 left-1/2 h-2 w-6 -translate-x-1/2 cursor-n-resize bg-white shadow"
								role="button"
								tabindex="0"
								onmousedown={(e) => {
									e.stopPropagation();
									handleMouseDown(e, 'n');
								}}
							></div>
							<div
								class="absolute -bottom-1 left-1/2 h-2 w-6 -translate-x-1/2 cursor-s-resize bg-white shadow"
								role="button"
								tabindex="0"
								onmousedown={(e) => {
									e.stopPropagation();
									handleMouseDown(e, 's');
								}}
							></div>
							<div
								class="absolute -left-1 top-1/2 h-6 w-2 -translate-y-1/2 cursor-w-resize bg-white shadow"
								role="button"
								tabindex="0"
								onmousedown={(e) => {
									e.stopPropagation();
									handleMouseDown(e, 'w');
								}}
							></div>
							<div
								class="absolute -right-1 top-1/2 h-6 w-2 -translate-y-1/2 cursor-e-resize bg-white shadow"
								role="button"
								tabindex="0"
								onmousedown={(e) => {
									e.stopPropagation();
									handleMouseDown(e, 'e');
								}}
							></div>
						</div>
					</div>
				</div>

				<!-- Info & Actions -->
				<div class="flex items-center justify-between border-t border-gray-200 px-6 py-4">
					<div class="text-sm text-gray-500">
						{#if aspectRatio}
							<span>{m.aspect_ratio()}: {aspectRatio.toFixed(2)}</span>
							<span class="mx-2">·</span>
						{/if}
						<span>{m.max_size({ size: formatFileSize(effectiveMaxFileSize) })}</span>
					</div>
					<div class="flex gap-3">
						<button
							type="button"
							class="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
							onclick={cancelCrop}
						>
							{m.cancel()}
						</button>
						<button
							type="button"
							class="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
							disabled={processing}
							onclick={processCrop}
						>
							{processing ? m.processing() : m.confirm_crop()}
						</button>
					</div>
				</div>
			</div>
		</div>
	{/if}
</div>
