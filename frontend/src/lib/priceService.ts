/**
 * Price Service - Fetches native token prices from Pyth Network
 * Uses viem to interact with Pyth oracle contracts
 * Supports multiple chains (OP, Polygon, Arbitrum, Base, etc.)
 */

import { createPublicClient, http, parseUnits, formatUnits } from 'viem';
import { getChainConfig } from '$lib/chain';
import { getRpcUrl, getChainId } from '$lib/config';
import { getConfig, getPythContractAddress, getPythPriceFeedId, CHAIN_NATIVE_TOKEN, envName } from '$lib/stores/config.svelte';
import { PRICE_STALE_THRESHOLD_SECONDS, MAX_REASONABLE_PRICE_USD } from './constants';

// Pyth Network ABI (minimal - only getPriceUnsafe)
const PYTH_ABI = [
	{
		name: 'getPriceUnsafe',
		type: 'function',
		inputs: [{ name: 'id', type: 'bytes32' }],
		outputs: [
			{
				name: '',
				type: 'tuple',
				components: [
					{ name: 'price', type: 'int64' },
					{ name: 'conf', type: 'uint64' },
					{ name: 'expo', type: 'int32' },
					{ name: 'publishTime', type: 'uint256' }
				]
			}
		],
		stateMutability: 'view'
	}
] as const;

// Price cache to avoid excessive RPC calls
interface PriceCache {
	price: number;
	timestamp: number;
	chainId: number;
}

let priceCache: PriceCache | null = null;

/**
 * Get the current native token price in USD from Pyth Network
 * Returns the price with caching to avoid excessive RPC calls
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

	try {
		const chain = getChainConfig();
		const publicClient = createPublicClient({
			chain,
			transport: http(getRpcUrl())
		});

		// Get price from Pyth
		const priceData = await publicClient.readContract({
			address: pythContractAddress,
			abi: PYTH_ABI,
			functionName: 'getPriceUnsafe',
			args: [priceFeedId]
		});
		console.log('pyth price', pythContractAddress, priceData);

		const { price: rawPrice, expo, publishTime } = priceData;

		// Check if price is stale
		const now = Math.floor(Date.now() / 1000);
		const priceAge = now - Number(publishTime);
		
		// In test environment, allow much older prices (30 days)
		const isTestEnv = envName() != "prod"; // Sepolia or Anvil
		const staleThreshold = isTestEnv ? 90 * 24 * 3600 : PRICE_STALE_THRESHOLD_SECONDS; // 30 days for test, 1 hour for prod
		
		if (priceAge > staleThreshold) {
			// Stale price is expected on low-activity chains, use fallback silently
			console.warn(`Pyth price is stale (${priceAge}s old, threshold: ${staleThreshold}s), using fallback`);
			priceCache = {
				price: fallbackPrice,
				timestamp: Date.now(),
				chainId
			};
			return fallbackPrice;
		}

		// Convert price: Price = price * 10^expo
		const price = Number(rawPrice) * Math.pow(10, Number(expo));

		// Sanity check - only warn if we got data but it's invalid
		if (price <= 0 || price > MAX_REASONABLE_PRICE_USD) {
			console.warn('Invalid price from Pyth, using fallback:', price);
			priceCache = {
				price: fallbackPrice,
				timestamp: Date.now(),
				chainId
			};
			return fallbackPrice;
		}

		// Update cache
		priceCache = {
			price,
			timestamp: Date.now(),
			chainId
		};

		console.log(`Pyth price for chain ${chainId}: $${price.toFixed(2)}`);
		return price;
	} catch (error) {
		console.error('Failed to fetch Pyth price:', error);
		// Use fallback on error
		priceCache = {
			price: fallbackPrice,
			timestamp: Date.now(),
			chainId
		};
		return fallbackPrice;
	}
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
