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
