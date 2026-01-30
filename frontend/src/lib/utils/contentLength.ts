/**
 * Content length utility
 * Handles character counting and compression hints for article content
 */

// Maximum free content length (approximately 36,000 Chinese characters)
// This is a soft limit - content will be compressed but still stored
export const MAX_FREE_CONTENT_LENGTH = 36000;

/**
 * Count characters in content
 * Chinese characters count as 1, English letters count as 0.5 for Chinese equivalent
 * This provides a more accurate representation of "meaningful content"
 */
export function countContentCharacters(content: string): number {
	if (!content) return 0;
	
	// Count Chinese characters (CJK Unified Ideographs) as 1
	const chineseRegex = /[\u4e00-\u9fff]/g;
	const chineseMatches = content.match(chineseRegex) || [];
	const chineseCount = chineseMatches.length;
	
	// Count other characters (letters, numbers, punctuation) as 0.5
	const otherCount = content.length - chineseCount;
	const equivalentCount = chineseCount + otherCount * 0.5;
	
	return Math.floor(equivalentCount);
}

/**
 * Get content length status
 */
export function getContentLengthStatus(content: string): {
	count: number;
	percentage: number;
	isOverLimit: boolean;
	limit: number;
} {
	const count = countContentCharacters(content);
	const percentage = Math.min((count / MAX_FREE_CONTENT_LENGTH) * 100, 100);
	const isOverLimit = count > MAX_FREE_CONTENT_LENGTH;
	
	return {
		count,
		percentage,
		isOverLimit,
		limit: MAX_FREE_CONTENT_LENGTH
	};
}

/**
 * Format content length for display
 */
export function formatContentLength(content: string): string {
	const status = getContentLengthStatus(content);
	const count = status.count;
	
	if (count < 1000) {
		return `${count} chars`;
	}
	return `${(count / 1000).toFixed(1)}K chars`;
}

/**
 * Check if content should be compressed
 * Returns true if content exceeds the free limit
 */
export function shouldCompressContent(content: string): boolean {
	return countContentCharacters(content) > MAX_FREE_CONTENT_LENGTH;
}

/**
 * Estimate storage fee for content (stub - actual fee depends on Irys pricing)
 * Note: Irys free upload limit is ~100KB, content compression reduces storage needs
 */
export function estimateContentStorageFee(content: string): {
	willUseFreeTier: boolean;
	estimatedSize: string;
} {
	const charCount = countContentCharacters(content);
	// Rough estimate: 1 Chinese char ≈ 2 bytes after UTF-8, plus markdown overhead
	const estimatedBytes = charCount * 2.5;
	const willUseFreeTier = estimatedBytes <= 100 * 1024; // 100KB Irys free limit
	
	return {
		willUseFreeTier,
		estimatedSize: `${Math.round(estimatedBytes / 1024)}KB`
	};
}
