/**
 * Price Service - Fetches native token prices from Chainlink Price Feeds
 * Uses viem to interact with Chainlink aggregator contracts
 * Supports multiple chains (OP, Polygon, Arbitrum, Base, etc.)
 */

import { createPublicClient, http, parseUnits, formatUnits } from 'viem';
import { getChainConfig } from '$lib/chain';
import { getRpcUrl, getChainId } from '$lib/config';
import { getConfig, getChainlinkPriceFeedAddress } from '$lib/stores/config.svelte';

// Chainlink Aggregator V3 Interface ABI (minimal)
const AGGREGATOR_V3_ABI = [
	{
		name: 'latestRoundData',
		type: 'function',
		inputs: [],
		outputs: [
			{ name: 'roundId', type: 'uint80' },
			{ name: 'answer', type: 'int256' },
			{ name: 'startedAt', type: 'uint256' },
			{ name: 'updatedAt', type: 'uint256' },
			{ name: 'answeredInRound', type: 'uint80' }
		],
		stateMutability: 'view'
	},
	{
		name: 'decimals',
		type: 'function',
		inputs: [],
		outputs: [{ name: '', type: 'uint8' }],
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
 * Get the current native token price in USD from Chainlink
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

	const priceFeedAddress = getChainlinkPriceFeedAddress();
	
	// If no price feed available (local dev), use fallback
	if (priceFeedAddress === '0x0000000000000000000000000000000000000000') {
		console.log('No Chainlink price feed available, using fallback price:', fallbackPrice);
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

		// Get decimals and latest price
		const [decimals, roundData] = await Promise.all([
			publicClient.readContract({
				address: priceFeedAddress,
				abi: AGGREGATOR_V3_ABI,
				functionName: 'decimals'
			}),
			publicClient.readContract({
				address: priceFeedAddress,
				abi: AGGREGATOR_V3_ABI,
				functionName: 'latestRoundData'
			})
		]);

		const [, answer, , updatedAt] = roundData;
		
		// Check if price is stale (more than 1 hour old)
		const now = Math.floor(Date.now() / 1000);
		const priceAge = now - Number(updatedAt);
		if (priceAge > 3600) {
			console.warn('Chainlink price is stale (>1 hour old), using fallback');
			priceCache = {
				price: fallbackPrice,
				timestamp: Date.now(),
				chainId
			};
			return fallbackPrice;
		}

		// Convert price to number (Chainlink prices are typically 8 decimals)
		const price = Number(answer) / Math.pow(10, Number(decimals));
		
		// Sanity check
		if (price <= 0 || price > 1000000) {
			console.warn('Invalid price from Chainlink, using fallback:', price);
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

		console.log(`Chainlink price for chain ${chainId}: $${price.toFixed(2)}`);
		return price;
	} catch (error) {
		console.error('Failed to fetch Chainlink price:', error);
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
 */
export function getNativeTokenSymbol(): string {
	const chainId = getChainId();
	switch (chainId) {
		case 137: // Polygon
			return 'MATIC';
		case 10: // Optimism
		case 11155420: // Optimism Sepolia
		case 8453: // Base
		case 42161: // Arbitrum
		case 1: // Ethereum
		case 11155111: // Sepolia
		case 31337: // Anvil
		default:
			return 'ETH';
	}
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
