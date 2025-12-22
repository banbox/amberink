/**
 * Common utility functions
 * Shared across components and modules to avoid duplication
 */

// ============================================================
//                  NFT Token ID Utilities
// ============================================================

/**
 * - Collector TokenID: articleId + COLLECTOR_TOKEN_OFFSET (high bit + low article ID)
 */
export const COLLECTOR_TOKEN_OFFSET = 1n << 250n;

export function getArticleIdFromTokenId(tokenId: bigint): bigint {
	if (tokenId >= COLLECTOR_TOKEN_OFFSET) {
		return tokenId - COLLECTOR_TOKEN_OFFSET;
	}
	return tokenId;
}

// ============================================================
//                  Address Utilities
// ============================================================

/**
 * Format address to short form (0x1234...5678)
 */
export function shortAddress(address: string): string {
	if (!address) return '';
	return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/**
 * Format date to localized string
 */
export function formatDate(dateStr: string): string {
	const date = new Date(dateStr);
	return date.toLocaleDateString(undefined, {
		year: 'numeric',
		month: 'short',
		day: 'numeric'
	});
}

/**
 * Format wei to ETH display string
 */
export function formatTips(tips: string): string {
	const wei = BigInt(tips);
	const eth = Number(wei) / 1e18;
	if (eth === 0) return '0';
	if (eth < 0.0001) return '<0.0001';
	return eth.toFixed(4);
}

/**
 * Format wei to ETH with 3 decimal places
 */
export function formatEth(wei: string): string {
	const ethValue = Number(wei) / 1e18;
	if (ethValue === 0) return '0';
	if (ethValue < 0.001) return '<0.001';
	return ethValue.toFixed(3);
}

/**
 * Zero address constant
 */
export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as const;

/**
 * Check if address is zero address
 */
export function isZeroAddress(address: string): boolean {
	return !address || address.toLowerCase() === ZERO_ADDRESS.toLowerCase();
}
