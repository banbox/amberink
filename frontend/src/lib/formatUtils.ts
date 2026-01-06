/**
 * Formatting utilities
 * Centralized date and amount formatting functions
 */

/**
 * Format date to short localized string (e.g., "12/9/2025")
 * @param dateStr - ISO date string
 * @returns Formatted date string
 */
export function formatDateShort(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString();
}

/**
 * Format date to Medium style (e.g., "Dec 9, 2025")
 * @param dateStr - ISO date string
 * @returns Formatted date string
 */
export function formatDateMedium(dateStr: string): string {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
    });
}

/**
 * Format timestamp to date string with time (e.g., "Dec 9, 2025, 10:30 AM")
 * @param ts - Unix timestamp in milliseconds
 * @returns Formatted date and time string
 */
export function formatTimestamp(ts: number): string {
    const date = new Date(ts);
    return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

// ============================================================
//                  ETH Formatting Utilities
// ============================================================

/**
 * Format wei to ETH with configurable precision
 * @param wei - Amount in wei (bigint, string, or number)
 * @param decimals - Number of decimal places (default 4)
 * @param options - Additional formatting options
 * @returns Formatted ETH string
 */
export function formatWeiToEth(
    wei: bigint | string | number,
    decimals: number = 4,
    options?: {
        minDisplay?: number;      // Show "<minDisplay" if value is smaller but non-zero
        trimTrailingZeros?: boolean;  // Remove trailing zeros after decimal
    }
): string {
    const weiValue = typeof wei === 'bigint' ? wei : BigInt(wei);
    const ethValue = Number(weiValue) / 1e18;

    if (ethValue === 0) return '0';

    // Handle minimum display threshold
    if (options?.minDisplay && ethValue > 0 && ethValue < options.minDisplay) {
        return `<${options.minDisplay}`;
    }

    let result = ethValue.toFixed(decimals);

    // Trim trailing zeros if requested
    if (options?.trimTrailingZeros) {
        result = result.replace(/\.?0+$/, '') || '0';
    }

    return result;
}

/**
 * Calculate approximate native token amount from USD
 * @param usdAmount - USD amount as string or number
 * @param nativeTokenPrice - Current native token price in USD (null if loading)
 * @returns Formatted native token amount string, "..." if price unavailable
 */
export function getApproxNativeAmount(
    usdAmount: string | number,
    nativeTokenPrice: number | null
): string {
    if (!nativeTokenPrice || nativeTokenPrice <= 0) return '...';
    const usd = typeof usdAmount === 'string' ? parseFloat(usdAmount) : usdAmount;
    if (isNaN(usd) || usd <= 0) return '0';
    const nativeAmount = usd / nativeTokenPrice;
    return nativeAmount.toFixed(6);
}

/**
 * Calculate reading time (words per minute)
 * Handles both space-separated languages and character-based languages
 * @param content - The text content to analyze
 * @returns Estimated reading time in minutes (minimum 1)
 */
export function getReadingTime(content: string): number {
    const wordsPerMinute = 200; // Reading speed for space-separated languages
    const charsPerMinute = 400; // Reading speed for character-based languages

    // Strip markdown syntax for more accurate counting
    const plainText = content
        .replace(/```[\s\S]*?```/g, '') // Remove code blocks
        .replace(/`[^`]+`/g, '') // Remove inline code
        .replace(/!?\[[^\]]*\]\([^)]*\)/g, '') // Remove links and images
        .replace(/[#*_~`>]/g, '') // Remove markdown formatting chars
        .trim();

    // Character-based scripts parsing
    const characterBasedRegex = new RegExp([
        '[\u4e00-\u9fff]',           // CJK Unified Ideographs
        '[\u3400-\u4dbf]',           // CJK Unified Ideographs Extension A
        '[\u{20000}-\u{2a6df}]',     // CJK Unified Ideographs Extension B
        '[\u{2a700}-\u{2b73f}]',     // CJK Unified Ideographs Extension C
        '[\u{2b740}-\u{2b81f}]',     // CJK Unified Ideographs Extension D
        '[\uf900-\ufaff]',           // CJK Compatibility Ideographs
        '[\u3040-\u309f]',           // Hiragana
        '[\u30a0-\u30ff]',           // Katakana
        '[\uac00-\ud7af]',           // Hangul Syllables
        '[\u1100-\u11ff]',           // Hangul Jamo
        '[\u0e00-\u0e7f]',           // Thai
        '[\u0e80-\u0eff]',           // Lao
        '[\u1780-\u17ff]',           // Khmer
        '[\u1000-\u109f]',           // Myanmar
        '[\u0f00-\u0fff]',           // Tibetan
    ].join('|'), 'gu');

    const charBasedMatches = plainText.match(characterBasedRegex);
    const charBasedCount = charBasedMatches ? charBasedMatches.length : 0;

    // Remove character-based text and count remaining words
    const remainingText = plainText.replace(characterBasedRegex, ' ').trim();
    const words = remainingText.split(/\s+/).filter(w => w.length > 0);
    const wordCount = words.length;

    const charMinutes = charBasedCount / charsPerMinute;
    const wordMinutes = wordCount / wordsPerMinute;

    return Math.max(1, Math.ceil(charMinutes + wordMinutes));
}

/**
 * Format ETH amount for display to users with 8 decimal places (rounded)
 * For logs and calculations, use formatEther directly for full precision
 * @param wei - Amount in wei
 * @returns Formatted string with up to 8 decimal places (trailing zeros removed)
 */
export function formatEthDisplay(wei: bigint): string {
    return formatWeiToEth(wei, 8, { trimTrailingZeros: true });
}
