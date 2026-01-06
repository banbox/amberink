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
// Re-export formatWeiToEth for backward compatibility convenience
import { formatWeiToEth } from './formatUtils';

// Re-export ZERO_ADDRESS from centralized constants for backward compatibility
import { ZERO_ADDRESS } from './constants';
export { ZERO_ADDRESS };

// ============================================================
//                  Svelte Actions
// ============================================================

export interface InfiniteScrollOptions {
	/** Callback to load more items */
	onLoadMore: () => void;
	/** Distance from bottom to trigger load (default: 200) */
	threshold?: number;
	/** Function that returns whether loading is allowed */
	canLoad?: () => boolean;
}

/**
 * Svelte action for infinite scroll functionality.
 * Automatically handles scroll event listeners and cleanup.
 * 
 * @example
 * <div use:infiniteScroll={{ onLoadMore: fetchMore, canLoad: () => !loading && hasMore }}>
 */
export function infiniteScroll(_node: HTMLElement, options: InfiniteScrollOptions) {
	const threshold = options.threshold ?? 200;

	function handleScroll() {
		if (options.canLoad && !options.canLoad()) return;

		const scrollTop = window.scrollY;
		const scrollHeight = document.documentElement.scrollHeight;
		const clientHeight = window.innerHeight;

		if (scrollHeight - scrollTop - clientHeight < threshold) {
			options.onLoadMore();
		}
	}

	window.addEventListener('scroll', handleScroll);

	return {
		update(newOptions: InfiniteScrollOptions) {
			options = newOptions;
		},
		destroy() {
			window.removeEventListener('scroll', handleScroll);
		}
	};
}

// ============================================================
//                  UI Helper Functions
// ============================================================

export interface FeedbackMessage {
	type: 'success' | 'error';
	text: string;
}

/**
 * Create a feedback manager for showing temporary messages
 * Returns functions to show and clear feedback messages
 */
export function createFeedbackManager(duration = 3000) {
	let timeoutId: ReturnType<typeof setTimeout> | null = null;

	return {
		showFeedback: (
			type: 'success' | 'error',
			text: string,
			setter: (msg: FeedbackMessage | null) => void
		) => {
			setter({ type, text });
			if (timeoutId) clearTimeout(timeoutId);
			timeoutId = setTimeout(() => {
				setter(null);
				timeoutId = null;
			}, duration);
		},
		clearFeedback: (setter: (msg: FeedbackMessage | null) => void) => {
			if (timeoutId) {
				clearTimeout(timeoutId);
				timeoutId = null;
			}
			setter(null);
		}
	};
}

/**
 * Check if wallet is connected and show error message if not
 */
export function requireWallet(
	walletAddress: string | null,
	errorMessage: string,
	showFeedback: (type: 'success' | 'error', text: string) => void
): boolean {
	if (!walletAddress) {
		showFeedback('error', errorMessage);
		return false;
	}
	return true;
}
