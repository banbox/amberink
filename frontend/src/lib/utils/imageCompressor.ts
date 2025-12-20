/**
 * Image Compressor Utility
 * 
 * Compresses images using canvas to meet size requirements.
 * Uses iterative compression with quality reduction and dimension scaling.
 */

export interface CompressOptions {
	/** Maximum file size in bytes */
	maxSize: number;
	/** Initial quality (0-1), default 0.9 */
	initialQuality?: number;
	/** Minimum quality before scaling, default 0.3 */
	minQuality?: number;
	/** Quality reduction step, default 0.1 */
	qualityStep?: number;
	/** Scale reduction factor per iteration, default 0.8 */
	scaleFactor?: number;
	/** Maximum iterations to prevent infinite loop, default 20 */
	maxIterations?: number;
}

export interface CompressResult {
	file: File;
	blob: Blob;
	width: number;
	height: number;
	originalSize: number;
	compressedSize: number;
	iterations: number;
}

/**
 * Compress an image file to meet size requirements
 * 
 * Algorithm:
 * 1. Start with initial quality (0.9)
 * 2. If still too large, reduce quality by step (0.1)
 * 3. When quality reaches minimum (0.3), scale down dimensions
 * 4. Repeat until size requirement is met
 */
export async function compressImage(
	file: File,
	options: CompressOptions
): Promise<CompressResult> {
	const {
		maxSize,
		initialQuality = 0.9,
		minQuality = 0.3,
		qualityStep = 0.1,
		scaleFactor = 0.8,
		maxIterations = 20
	} = options;

	// If already small enough, return as-is
	if (file.size <= maxSize) {
		return {
			file,
			blob: file,
			width: 0,
			height: 0,
			originalSize: file.size,
			compressedSize: file.size,
			iterations: 0
		};
	}

	// Load image
	const img = await loadImage(file);
	let width = img.width;
	let height = img.height;
	let quality = initialQuality;
	let iterations = 0;
	let blob: Blob | null = null;

	// Create hidden canvas for compression
	const canvas = document.createElement('canvas');
	const ctx = canvas.getContext('2d');
	if (!ctx) throw new Error('Canvas context not available');

	while (iterations < maxIterations) {
		iterations++;

		// Set canvas size
		canvas.width = Math.round(width);
		canvas.height = Math.round(height);

		// Draw image
		ctx.clearRect(0, 0, canvas.width, canvas.height);
		ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

		// Compress to JPEG
		blob = await canvasToBlob(canvas, 'image/jpeg', quality);

		// Check if size requirement is met
		if (blob.size <= maxSize) {
			break;
		}

		// Reduce quality first
		if (quality > minQuality) {
			quality = Math.max(minQuality, quality - qualityStep);
		} else {
			// Quality at minimum, scale down dimensions
			width *= scaleFactor;
			height *= scaleFactor;
			quality = initialQuality; // Reset quality for new size
		}

		// Safety check: don't go too small
		if (width < 100 || height < 100) {
			break;
		}
	}

	if (!blob) {
		throw new Error('Failed to compress image');
	}

	// Create file from blob
	const compressedFile = new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), {
		type: 'image/jpeg'
	});

	return {
		file: compressedFile,
		blob,
		width: Math.round(width),
		height: Math.round(height),
		originalSize: file.size,
		compressedSize: blob.size,
		iterations
	};
}

/**
 * Load an image file into an HTMLImageElement
 */
function loadImage(file: File): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const img = new Image();
		img.onload = () => {
			URL.revokeObjectURL(img.src);
			resolve(img);
		};
		img.onerror = () => {
			URL.revokeObjectURL(img.src);
			reject(new Error('Failed to load image'));
		};
		img.src = URL.createObjectURL(file);
	});
}

/**
 * Convert canvas to blob with specified format and quality
 */
function canvasToBlob(
	canvas: HTMLCanvasElement,
	type: string,
	quality: number
): Promise<Blob> {
	return new Promise((resolve, reject) => {
		canvas.toBlob(
			(blob) => {
				if (blob) {
					resolve(blob);
				} else {
					reject(new Error('Failed to create blob'));
				}
			},
			type,
			quality
		);
	});
}
