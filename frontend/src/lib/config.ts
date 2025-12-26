/**
 * Application configuration
 *
 * This module provides configuration values that can be:
 * 1. Set at build time via environment variables (PUBLIC_* vars)
 * 2. Overridden by users at runtime via localStorage (Settings page)
 *
 * All getter functions return the merged config (user overrides > env defaults)
 * appName and appVersion are NOT user-overridable
 */
import {
	getConfig,
	defaults,
	envDefaults,
	getUserConfig,
	setConfigValue,
	updateConfig,
	resetConfigValue,
	resetAllConfig,
	isConfigOverridden,
	getEnvDefault,
	configFields,
	MIN_DEFAULT_GAS_FEE_MULTIPLIER,
	getPythContractAddress,
	getPythPriceFeedId,
	PYTH_CONTRACT_ADDRESSES,
	PYTH_PRICE_FEED_IDS,
	CHAIN_NATIVE_TOKEN,
	type UserConfig,
	type UserConfigKey,
	type ConfigFieldMeta
} from '$lib/stores/config.svelte';

// Re-export store functions for settings page
export {
	getConfig,
	getUserConfig,
	setConfigValue,
	updateConfig,
	resetConfigValue,
	resetAllConfig,
	isConfigOverridden,
	getEnvDefault,
	configFields,
	MIN_DEFAULT_GAS_FEE_MULTIPLIER,
	getPythContractAddress,
	getPythPriceFeedId,
	PYTH_CONTRACT_ADDRESSES,
	PYTH_PRICE_FEED_IDS,
	CHAIN_NATIVE_TOKEN,
	type UserConfig,
	type UserConfigKey,
	type ConfigFieldMeta
};

// Helper functions - now read from reactive store
export function getBlogHubContractAddress(): `0x${string}` {
	return getConfig().blogHubContractAddress;
}

export function getSessionKeyManagerAddress(): `0x${string}` {
	return getConfig().sessionKeyManagerAddress;
}

export function getRpcUrl(): string {
	return getConfig().rpcUrl;
}

export function getChainId(): number {
	return getConfig().chainId;
}

export function getIrysNetwork(): 'mainnet' | 'devnet' {
	return getConfig().irysNetwork;
}

export function getArweaveGateways(): string[] {
	return getConfig().arweaveGateways;
}

export function getSubsquidEndpoint(): string {
	return getConfig().subsquidEndpoint;
}

export function getMinGasFeeMultiplier(): number {
	return getConfig().minGasFeeMultiplier;
}

export function getDefaultGasFeeMultiplier(): number {
	return getConfig().defaultGasFeeMultiplier;
}

export function getIrysFreeUploadLimit(): number {
	return getConfig().irysFreeUploadLimit;
}

export function getMinActionValue(): bigint {
	return getConfig().minActionValue;
}

// USD pricing getters
export function getDefaultTipAmountUsd(): string {
	return getConfig().defaultTipAmountUsd;
}

export function getDefaultDislikeAmountUsd(): string {
	return getConfig().defaultDislikeAmountUsd;
}

export function getDefaultCollectPriceUsd(): string {
	return getConfig().defaultCollectPriceUsd;
}

export function getMinActionValueUsd(): string {
	return getConfig().minActionValueUsd;
}

export function getPriceCacheDuration(): number {
	return getConfig().priceCacheDuration;
}

export function getFallbackEthPriceUsd(): number {
	return getConfig().fallbackEthPriceUsd;
}

// Legacy exports for backward compatibility
export { defaults as defaultConfig };
export { envDefaults };
