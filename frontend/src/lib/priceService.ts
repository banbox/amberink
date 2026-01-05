/**
 * Price Service - Fetches native token prices from Pyth Network
 * Uses Hermes API for fresh off-chain prices with on-chain fallback
 * Supports multiple chains (OP, Polygon, Arbitrum, Base, etc.)
 */

import { parseUnits, formatUnits } from 'viem';
import { getChainId } from '$lib/config';
import { getConfig, getPythContractAddress, getPythPriceFeedId, CHAIN_NATIVE_TOKEN } from '$lib/stores/config.svelte';
import { MAX_REASONABLE_PRICE_USD } from './constants';

// Hermes API endpoint for fetching latest prices
const HERMES_API_URL = 'https://hermes.pyth.network';

// Maximum age for price data from Hermes (in seconds)
const HERMES_PRICE_MAX_AGE_SECONDS = 3600;

// Price cache to avoid excessive API/RPC calls
interface PriceCache {
	price: number;
	timestamp: number;
	chainId: number;
}

let priceCache: PriceCache | null = null;

/**
 * Hermes API response types
 */
interface HermesPriceData {
	price: string;
	conf: string;
	expo: number;
	publish_time: number;
}

interface HermesParsedPrice {
	id: string;
	price: HermesPriceData;
	ema_price: HermesPriceData;
}

interface HermesResponse {
	binary: {
		encoding: string;
		data: string[];
	};
	parsed: HermesParsedPrice[];
}

/**
 * Fetch price from Hermes API (off-chain, real-time)
 * This is the recommended approach for frontend applications
 * @param priceFeedId - The Pyth price feed ID (with 0x prefix)
 * @returns The price in USD, or null if failed
 */
async function fetchPriceFromHermes(priceFeedId: string): Promise<number | null> {
	try {
		// Remove 0x prefix if present for the API call
		const feedIdWithoutPrefix = priceFeedId.startsWith('0x')
			? priceFeedId.slice(2)
			: priceFeedId;

		const url = `${HERMES_API_URL}/v2/updates/price/latest?ids[]=${feedIdWithoutPrefix}`;
		const response = await fetch(url);

		if (!response.ok) {
			console.warn(`Hermes API returned status ${response.status}`);
			return null;
		}

		const data: HermesResponse = await response.json();

		if (!data.parsed || data.parsed.length === 0) {
			console.warn('No parsed price data in Hermes response');
			return null;
		}

		const priceData = data.parsed[0].price;
		const publishTime = priceData.publish_time;
		const now = Math.floor(Date.now() / 1000);
		const priceAge = now - publishTime;

		// Check if price is too stale
		if (priceAge > HERMES_PRICE_MAX_AGE_SECONDS) {
			console.warn(`Hermes price is stale (${priceAge}s old, max allowed: ${HERMES_PRICE_MAX_AGE_SECONDS}s)`);
			return null;
		}

		// Convert price: Price = price * 10^expo
		const rawPrice = BigInt(priceData.price);
		const expo = priceData.expo;
		const price = Number(rawPrice) * Math.pow(10, expo);

		console.log(`Hermes price: $${price.toFixed(2)} (age: ${priceAge}s)`);
		return price;
	} catch (error) {
		console.warn('Failed to fetch price from Hermes:', error);
		return null;
	}
}

/**
 * Get the current native token price in USD from Pyth Network
 * Strategy:
 * 1. First try Hermes API (off-chain, always fresh)
 * 2. Use fallback price if both fail
 * Returns the price with caching to avoid excessive calls
 */
export async function getNativeTokenPriceUsd(): Promise<number> {
	const config = getConfig();
	const chainId = config.chainId;
	const cacheDuration = config.priceCacheDuration * 1000; // Convert to ms
	const fallbackPrice = config.fallbackEthPriceUsd;

	// Check cache
	if (priceCache &&
		priceCache.chainId === chainId &&
		Date.now() - priceCache.timestamp < cacheDuration) {
		return priceCache.price;
	}

	const pythContractAddress = getPythContractAddress();
	const priceFeedId = getPythPriceFeedId();

	// If no Pyth contract available (local dev), use fallback
	if (pythContractAddress === '0x0000000000000000000000000000000000000000') {
		console.log('No Pyth contract available, using fallback price:', fallbackPrice, ', chainId:', config.chainId);
		priceCache = {
			price: fallbackPrice,
			timestamp: Date.now(),
			chainId
		};
		return fallbackPrice;
	}

	// Strategy 1: Try Hermes API first (fastest, always fresh)
	let price = await fetchPriceFromHermes(priceFeedId);

	// Sanity check final price
	if (!price || price <= 0 || price > MAX_REASONABLE_PRICE_USD) {
		console.warn('Final price invalid, using fallback:', price);
		price = fallbackPrice;
	}

	// Update cache
	priceCache = {
		price,
		timestamp: Date.now(),
		chainId
	};

	console.log(`Final price for chain ${chainId}: $${price.toFixed(2)}`);
	return price;
}

/**
 * Convert USD amount to native token amount (wei)
 * @param usdAmount - Amount in USD (e.g., "1.00" or 1.00)
 * @returns Amount in wei as bigint
 */
export async function usdToWei(usdAmount: string | number): Promise<bigint> {
	const usd = typeof usdAmount === 'string' ? parseFloat(usdAmount) : usdAmount;
	if (isNaN(usd) || usd < 0) {
		throw new Error('Invalid USD amount');
	}

	if (usd === 0) {
		return 0n;
	}

	const tokenPrice = await getNativeTokenPriceUsd();
	const tokenAmount = usd / tokenPrice;

	// Convert to wei (18 decimals) with precision
	// Use string manipulation to avoid floating point issues
	const tokenAmountStr = tokenAmount.toFixed(18);
	return parseUnits(tokenAmountStr, 18);
}

/**
 * Convert native token amount (wei) to USD
 * @param weiAmount - Amount in wei as bigint or string
 * @returns Amount in USD as number
 */
export async function weiToUsd(weiAmount: bigint | string): Promise<number> {
	const wei = typeof weiAmount === 'string' ? BigInt(weiAmount) : weiAmount;
	if (wei < 0n) {
		throw new Error('Invalid wei amount');
	}

	if (wei === 0n) {
		return 0;
	}

	const tokenPrice = await getNativeTokenPriceUsd();
	const tokenAmount = parseFloat(formatUnits(wei, 18));
	return tokenAmount * tokenPrice;
}

/**
 * Format USD amount for display
 * @param amount - USD amount as number or string
 * @param decimals - Number of decimal places (default 2)
 * @returns Formatted string like "$1.00"
 */
export function formatUsd(amount: number | string, decimals: number = 2): string {
	const num = typeof amount === 'string' ? parseFloat(amount) : amount;
	if (isNaN(num)) return '$0.00';
	return `$${num.toFixed(decimals)}`;
}

/**
 * Format native token amount for display
 * @param weiAmount - Amount in wei
 * @param decimals - Number of decimal places (default 6)
 * @returns Formatted string like "0.001234"
 */
export function formatNativeToken(weiAmount: bigint | string, decimals: number = 6): string {
	const wei = typeof weiAmount === 'string' ? BigInt(weiAmount) : weiAmount;
	const formatted = formatUnits(wei, 18);
	const num = parseFloat(formatted);
	return num.toFixed(decimals);
}

/**
 * Get the native token symbol for the current chain
 * Uses CHAIN_NATIVE_TOKEN mapping from config
 */
export function getNativeTokenSymbol(): string {
	const chainId = getChainId();
	return CHAIN_NATIVE_TOKEN[chainId] || 'ETH';
}

/**
 * Clear the price cache (useful for testing or when switching chains)
 */
export function clearPriceCache(): void {
	priceCache = null;
}

/**
 * Get cached price info (for debugging/display)
 */
export function getPriceCacheInfo(): { price: number; age: number; chainId: number } | null {
	if (!priceCache) return null;
	return {
		price: priceCache.price,
		age: Math.floor((Date.now() - priceCache.timestamp) / 1000),
		chainId: priceCache.chainId
	};
}
