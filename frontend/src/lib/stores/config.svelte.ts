/**
 * Reactive configuration store with localStorage persistence
 * Allows users to override default config values after deployment
 */
import { browser } from '$app/environment';

// Import env defaults (build-time values)
import {
	PUBLIC_BLOG_HUB_CONTRACT_ADDRESS,
	PUBLIC_SESSION_KEY_MANAGER_ADDRESS,
	PUBLIC_RPC_URL,
	PUBLIC_CHAIN_ID,
	PUBLIC_IRYS_NETWORK,
	PUBLIC_ARWEAVE_GATEWAYS,
	PUBLIC_SUBSQUID_ENDPOINT
} from '$env/static/public';

import * as publicEnv from '$env/static/public';
const PUBLIC_MIN_GAS_FEE_MULTIPLIER = (publicEnv as Record<string, string>)['PUBLIC_MIN_GAS_FEE_MULTIPLIER'] || '';
const PUBLIC_DEFAULT_GAS_FEE_MULTIPLIER = (publicEnv as Record<string, string>)['PUBLIC_DEFAULT_GAS_FEE_MULTIPLIER'] || '';

const CONFIG_STORAGE_KEY = 'amberink_user_config';

// Import chain configuration from centralized file (for local use and re-export)
import {
	PYTH_CONTRACT_ADDRESSES,
	PYTH_PRICE_FEED_IDS,
	CHAIN_NATIVE_TOKEN
} from '../chains';

// Re-export for external consumers
export { PYTH_CONTRACT_ADDRESSES, PYTH_PRICE_FEED_IDS, CHAIN_NATIVE_TOKEN };



// Default values (used when env vars are not set)
export const defaults = {
	blogHubContractAddress: '0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9',
	sessionKeyManagerAddress: '0x5FbDB2315678afecb367f032d93F642f64180aa3',
	rpcUrl: 'http://localhost:8545',
	chainId: 31337,
	irysNetwork: 'devnet' as const,
	appName: 'AmberInk',
	appVersion: '1.0.0',
	arweaveGateways: ['https://gateway.irys.xyz', 'https://arweave.net', 'https://arweave.dev'],
	subsquidEndpoint: 'http://localhost:4350/graphql',
	minGasFeeMultiplier: 10,
	defaultGasFeeMultiplier: 30,
	irysFreeUploadLimit: 102400,
	minActionValue: '20000000000000', // Store as string for JSON serialization
	// USD pricing defaults
	defaultTipAmountUsd: '1.00',
	defaultDislikeAmountUsd: '1.00',
	defaultCollectPriceUsd: '5.00',
	minActionValueUsd: '0.05',
	// Price cache duration in seconds (5 minutes)
	priceCacheDuration: 300,
	// Fallback ETH price in USD (used when price feed unavailable)
	fallbackEthPriceUsd: 3000
};

// Environment-based defaults (build-time values from .env)
export const envDefaults = {
	blogHubContractAddress: PUBLIC_BLOG_HUB_CONTRACT_ADDRESS || defaults.blogHubContractAddress,
	sessionKeyManagerAddress: PUBLIC_SESSION_KEY_MANAGER_ADDRESS || defaults.sessionKeyManagerAddress,
	rpcUrl: PUBLIC_RPC_URL || defaults.rpcUrl,
	chainId: PUBLIC_CHAIN_ID ? parseInt(PUBLIC_CHAIN_ID, 10) : defaults.chainId,
	irysNetwork: (PUBLIC_IRYS_NETWORK || defaults.irysNetwork) as 'mainnet' | 'devnet',
	arweaveGateways: PUBLIC_ARWEAVE_GATEWAYS
		? PUBLIC_ARWEAVE_GATEWAYS.split(',').map((g: string) => g.trim())
		: defaults.arweaveGateways,
	subsquidEndpoint: PUBLIC_SUBSQUID_ENDPOINT || defaults.subsquidEndpoint,
	minGasFeeMultiplier: PUBLIC_MIN_GAS_FEE_MULTIPLIER
		? parseInt(PUBLIC_MIN_GAS_FEE_MULTIPLIER, 10)
		: defaults.minGasFeeMultiplier,
	defaultGasFeeMultiplier: PUBLIC_DEFAULT_GAS_FEE_MULTIPLIER
		? parseInt(PUBLIC_DEFAULT_GAS_FEE_MULTIPLIER, 10)
		: defaults.defaultGasFeeMultiplier,
	irysFreeUploadLimit: defaults.irysFreeUploadLimit,
	minActionValue: defaults.minActionValue,
	// USD pricing defaults
	defaultTipAmountUsd: defaults.defaultTipAmountUsd,
	defaultDislikeAmountUsd: defaults.defaultDislikeAmountUsd,
	defaultCollectPriceUsd: defaults.defaultCollectPriceUsd,
	minActionValueUsd: defaults.minActionValueUsd,
	priceCacheDuration: defaults.priceCacheDuration,
	fallbackEthPriceUsd: defaults.fallbackEthPriceUsd
};

// User-overridable config keys
// NOT overridable: minGasFeeMultiplier, irysFreeUploadLimit, minActionValue
export type UserConfigKey =
	| 'blogHubContractAddress'
	| 'sessionKeyManagerAddress'
	| 'rpcUrl'
	| 'chainId'
	| 'irysNetwork'
	| 'arweaveGateways'
	| 'subsquidEndpoint'
	| 'defaultGasFeeMultiplier'
	| 'defaultTipAmountUsd'
	| 'defaultDislikeAmountUsd'
	| 'defaultCollectPriceUsd'
	| 'minActionValueUsd';

export interface UserConfig {
	blogHubContractAddress?: string;
	sessionKeyManagerAddress?: string;
	rpcUrl?: string;
	chainId?: number;
	irysNetwork?: 'mainnet' | 'devnet';
	arweaveGateways?: string[];
	subsquidEndpoint?: string;
	defaultGasFeeMultiplier?: number;
	defaultTipAmountUsd?: string;
	defaultDislikeAmountUsd?: string;
	defaultCollectPriceUsd?: string;
	minActionValueUsd?: string;
}

// Config field metadata for settings UI
export interface ConfigFieldMeta {
	key: UserConfigKey;
	labelKey: string;
	type: 'text' | 'number' | 'select' | 'array';
	options?: { value: string; labelKey: string }[];
	placeholder?: string;
	description?: string;
}

// Minimum value for defaultGasFeeMultiplier
export const MIN_DEFAULT_GAS_FEE_MULTIPLIER = 10;

export const configFields: ConfigFieldMeta[] = [
	{
		key: 'rpcUrl',
		labelKey: 'rpc_url',
		type: 'text',
		placeholder: 'https://...'
	},
	{
		key: 'chainId',
		labelKey: 'chain_id',
		type: 'number',
		placeholder: '31337'
	},
	{
		key: 'blogHubContractAddress',
		labelKey: 'blog_hub_address',
		type: 'text',
		placeholder: '0x...'
	},
	{
		key: 'sessionKeyManagerAddress',
		labelKey: 'session_manager_address',
		type: 'text',
		placeholder: '0x...'
	},
	{
		key: 'subsquidEndpoint',
		labelKey: 'subsquid_endpoint',
		type: 'text',
		placeholder: 'https://...'
	},
	{
		key: 'irysNetwork',
		labelKey: 'irys_network',
		type: 'select',
		options: [
			{ value: 'mainnet', labelKey: 'mainnet' },
			{ value: 'devnet', labelKey: 'devnet' }
		]
	},
	{
		key: 'arweaveGateways',
		labelKey: 'arweave_gateways',
		type: 'array',
		placeholder: 'https://gateway.irys.xyz'
	},
	{
		key: 'defaultGasFeeMultiplier',
		labelKey: 'gas_multiplier',
		type: 'number',
		placeholder: '30'
	},
	{
		key: 'defaultTipAmountUsd',
		labelKey: 'default_tip_usd',
		type: 'text',
		placeholder: '1.00'
	},
	{
		key: 'defaultDislikeAmountUsd',
		labelKey: 'default_dislike_usd',
		type: 'text',
		placeholder: '1.00'
	},
	{
		key: 'defaultCollectPriceUsd',
		labelKey: 'default_collect_price_usd',
		type: 'text',
		placeholder: '5.00'
	},
	{
		key: 'minActionValueUsd',
		labelKey: 'min_action_value_usd',
		type: 'text',
		placeholder: '0.05'
	}
];

// Load user config from localStorage
function loadUserConfig(): UserConfig {
	if (!browser) return {};
	try {
		const stored = localStorage.getItem(CONFIG_STORAGE_KEY);
		if (stored) {
			return JSON.parse(stored);
		}
	} catch (e) {
		console.warn('Failed to load user config from localStorage:', e);
	}
	return {};
}

// Save user config to localStorage
function saveUserConfig(config: UserConfig): void {
	if (!browser) return;
	try {
		localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config));
	} catch (e) {
		console.warn('Failed to save user config to localStorage:', e);
	}
}

// Reactive state using Svelte 5 runes
let userConfig = $state<UserConfig>(loadUserConfig());

// Merged config (user overrides + env defaults)
export function getConfig() {
	return {
		appName: defaults.appName,
		appVersion: defaults.appVersion,
		// Overridable
		blogHubContractAddress: (userConfig.blogHubContractAddress || envDefaults.blogHubContractAddress) as `0x${string}`,
		sessionKeyManagerAddress: (userConfig.sessionKeyManagerAddress || envDefaults.sessionKeyManagerAddress) as `0x${string}`,
		rpcUrl: userConfig.rpcUrl || envDefaults.rpcUrl,
		chainId: userConfig.chainId ?? envDefaults.chainId,
		irysNetwork: userConfig.irysNetwork || envDefaults.irysNetwork,
		arweaveGateways: userConfig.arweaveGateways || envDefaults.arweaveGateways,
		subsquidEndpoint: userConfig.subsquidEndpoint || envDefaults.subsquidEndpoint,
		defaultGasFeeMultiplier: userConfig.defaultGasFeeMultiplier ?? envDefaults.defaultGasFeeMultiplier,
		// USD pricing (user-overridable)
		defaultTipAmountUsd: userConfig.defaultTipAmountUsd || envDefaults.defaultTipAmountUsd,
		defaultDislikeAmountUsd: userConfig.defaultDislikeAmountUsd || envDefaults.defaultDislikeAmountUsd,
		defaultCollectPriceUsd: userConfig.defaultCollectPriceUsd || envDefaults.defaultCollectPriceUsd,
		minActionValueUsd: userConfig.minActionValueUsd || envDefaults.minActionValueUsd,
		// Fixed values (not user-overridable)
		minGasFeeMultiplier: envDefaults.minGasFeeMultiplier,
		irysFreeUploadLimit: envDefaults.irysFreeUploadLimit,
		minActionValue: BigInt(envDefaults.minActionValue),
		priceCacheDuration: envDefaults.priceCacheDuration,
		fallbackEthPriceUsd: envDefaults.fallbackEthPriceUsd
	};
}

// Get Pyth contract address for current chain
export function getPythContractAddress(): `0x${string}` {
	const chainId = getConfig().chainId;
	return PYTH_CONTRACT_ADDRESSES[chainId] || '0x0000000000000000000000000000000000000000';
}

// Get Pyth Price Feed ID for current chain's native token
export function getPythPriceFeedId(): `0x${string}` {
	const chainId = getConfig().chainId;
	const tokenSymbol = CHAIN_NATIVE_TOKEN[chainId] || 'ETH';
	return PYTH_PRICE_FEED_IDS[tokenSymbol] || PYTH_PRICE_FEED_IDS['ETH'];
}

// Get current user overrides
export function getUserConfig(): UserConfig {
	return { ...userConfig };
}

// Update a single config value
export function setConfigValue<K extends UserConfigKey>(key: K, value: UserConfig[K]): void {
	userConfig = { ...userConfig, [key]: value };
	saveUserConfig(userConfig);
}

// Update multiple config values
export function updateConfig(updates: Partial<UserConfig>): void {
	userConfig = { ...userConfig, ...updates };
	saveUserConfig(userConfig);
}

// Reset a single config value to env default
export function resetConfigValue(key: UserConfigKey): void {
	const { [key]: _, ...rest } = userConfig;
	userConfig = rest;
	saveUserConfig(userConfig);
}

// Reset all user config to env defaults
export function resetAllConfig(): void {
	userConfig = {};
	saveUserConfig(userConfig);
}

// Check if a config value is overridden by user
export function isConfigOverridden(key: UserConfigKey): boolean {
	return key in userConfig && userConfig[key] !== undefined;
}

// Get env default value for a key
export function getEnvDefault<K extends UserConfigKey>(key: K): typeof envDefaults[K] {
	return envDefaults[key];
}

// Initialize store (call this on app load if needed)
export function initConfigStore(): void {
	if (browser) {
		userConfig = loadUserConfig();
	}
}
