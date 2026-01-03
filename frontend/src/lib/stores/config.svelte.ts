/**
 * Reactive configuration store with localStorage persistence
 * Allows users to override default config values after deployment
 */
import { browser } from '$app/environment';

// Import env defaults (build-time values)
import {
	PUBLIC_RPC_URL,
	PUBLIC_CHAIN_ID,
	PUBLIC_ARWEAVE_GATEWAYS,
	PUBLIC_SUBSQUID_ENDPOINT
} from '$env/static/public';

import * as publicEnv from '$env/static/public';
const PUBLIC_MIN_GAS_FEE_MULTIPLIER = (publicEnv as Record<string, string>)['PUBLIC_MIN_GAS_FEE_MULTIPLIER'] || '';
const PUBLIC_DEFAULT_GAS_FEE_MULTIPLIER = (publicEnv as Record<string, string>)['PUBLIC_DEFAULT_GAS_FEE_MULTIPLIER'] || '';
const PUBLIC_ENV_NAME = (publicEnv as Record<string, string>)['PUBLIC_ENV_NAME'] || 'dev';

// Dynamic localStorage key based on environment to avoid conflicts when switching environments
const CONFIG_STORAGE_KEY_PREFIX = 'amberink_user_config';
function getConfigStorageKey(): string {
	const currentEnvName = getEnvName();
	return `${CONFIG_STORAGE_KEY_PREFIX}_${currentEnvName}`;
}

/**
 * Get current environment name (supports user override)
 */
function getEnvName(): 'dev' | 'test' | 'prod' {
	if (!browser) return PUBLIC_ENV_NAME as 'dev' | 'test' | 'prod';
	try {
		// Try to read from localStorage with a fixed key (not environment-dependent)
		const stored = localStorage.getItem('amberink_env_override');
		if (stored) {
			const parsed = JSON.parse(stored);
			if (parsed.envName && ['dev', 'test', 'prod'].includes(parsed.envName)) {
				return parsed.envName as 'dev' | 'test' | 'prod';
			}
		}
	} catch (e) {
		// Ignore errors
	}
	return PUBLIC_ENV_NAME as 'dev' | 'test' | 'prod';
}

/**
 * Get and export current environment name (supports user override)
 * This is a function that should be called to get the current envName
 */
export { getEnvName as envName };

// Import chain configuration from centralized file (for local use and re-export)
import {
	PYTH_CONTRACT_ADDRESSES,
	PYTH_PRICE_FEED_IDS,
	CHAIN_NATIVE_TOKEN,
	ALLOWED_CHAINS_BY_ENV,
	SUPPORTED_CHAINS
} from '../chains';

// Re-export for external consumers
export { PYTH_CONTRACT_ADDRESSES, PYTH_PRICE_FEED_IDS, CHAIN_NATIVE_TOKEN, ALLOWED_CHAINS_BY_ENV, SUPPORTED_CHAINS };



// Default values (used when env vars are not set)
export const defaults = {
	blogHubContractAddress: '0x000000',
	sessionKeyManagerAddress: '0x000000',
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
	defaultTipAmountUsd: '0.50',
	defaultDislikeAmountUsd: '0.50',
	defaultCollectPriceUsd: '5.00',
	minActionValueUsd: '0.05',
	// Price cache duration in seconds (5 minutes)
	priceCacheDuration: 300,
	// Fallback ETH price in USD (used when price feed unavailable)
	fallbackEthPriceUsd: 3000
};

// Environment-based defaults (build-time values from .env)
export const envDefaults = {
	rpcUrl: PUBLIC_RPC_URL || defaults.rpcUrl,
	chainId: PUBLIC_CHAIN_ID ? parseInt(PUBLIC_CHAIN_ID, 10) : defaults.chainId,
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
	fallbackEthPriceUsd: defaults.fallbackEthPriceUsd,
	envName: PUBLIC_ENV_NAME as 'dev' | 'test' | 'prod'
};

// User-overridable config keys
// NOT overridable: minGasFeeMultiplier, irysFreeUploadLimit, minActionValue, blogHubContractAddress, sessionKeyManagerAddress, irysNetwork
export type UserConfigKey =
	| 'rpcUrl'
	| 'chainId'
	| 'arweaveGateways'
	| 'subsquidEndpoint'
	| 'defaultGasFeeMultiplier'
	| 'defaultTipAmountUsd'
	| 'defaultDislikeAmountUsd'
	| 'defaultCollectPriceUsd'
	| 'minActionValueUsd'
	| 'envName';

export interface UserConfig {
	rpcUrl?: string;
	chainId?: number;
	arweaveGateways?: string[];
	subsquidEndpoint?: string;
	defaultGasFeeMultiplier?: number;
	defaultTipAmountUsd?: string;
	defaultDislikeAmountUsd?: string;
	defaultCollectPriceUsd?: string;
	minActionValueUsd?: string;
	envName?: 'dev' | 'test' | 'prod';
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

/**
 * Get allowed chain IDs for current environment
 */
export function getAllowedChainIds(): number[] {
	return ALLOWED_CHAINS_BY_ENV[getEnvName()] || [];
}

/**
 * Get chain options for dropdown (chainId + name)
 */
export function getChainOptions(): { value: string; label: string }[] {
	const allowedChains = getAllowedChainIds();
	return allowedChains.map(chainId => {
		const chainInfo = SUPPORTED_CHAINS[chainId];
		return {
			value: String(chainId),
			label: chainInfo ? `${chainId} - ${chainInfo.name}` : String(chainId)
		};
	});
}

export const configFields: ConfigFieldMeta[] = [
	{
		key: 'envName',
		labelKey: 'env_name',
		type: 'select',
		options: [
			{ value: 'dev', labelKey: 'env_dev' },
			{ value: 'test', labelKey: 'env_test' },
			{ value: 'prod', labelKey: 'env_prod' }
		],
		description: 'Select deployment environment'
	},
	{
		key: 'chainId',
		labelKey: 'chain_id',
		type: 'select',
		options: [], // Will be populated dynamically
		description: 'Select the blockchain network to use'
	},
	{
		key: 'rpcUrl',
		labelKey: 'rpc_url',
		type: 'text',
		placeholder: 'https://...'
	},
	{
		key: 'subsquidEndpoint',
		labelKey: 'subsquid_endpoint',
		type: 'text',
		placeholder: 'https://...'
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
		placeholder: '0.50'
	},
	{
		key: 'defaultDislikeAmountUsd',
		labelKey: 'default_dislike_usd',
		type: 'text',
		placeholder: '0.50'
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
		const storageKey = getConfigStorageKey();
		const stored = localStorage.getItem(storageKey);
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
		const storageKey = getConfigStorageKey();
		localStorage.setItem(storageKey, JSON.stringify(config));
	} catch (e) {
		console.warn('Failed to save user config to localStorage:', e);
	}
}

// Reactive state using Svelte 5 runes
// Version counter to notify when envName changes (for reactive chain options)
let envNameVersion = $state(0);

/**
 * Get the current envName version (for reactive dependencies)
 * This is incremented when envName changes
 */
export function getEnvNameVersion(): number {
	return envNameVersion;
}

let userConfig = $state<UserConfig>(loadUserConfig());

// Merged config (user overrides + env defaults)
export function getConfig() {
	const chainId = userConfig.chainId ?? envDefaults.chainId;

	// Get contract addresses from chain configuration
	const chainContracts = SUPPORTED_CHAINS[chainId];
	const blogHubContractAddress = chainContracts?.blogHubAddress || defaults.blogHubContractAddress as `0x${string}`;
	const sessionKeyManagerAddress = chainContracts?.sessionKeyManagerAddress || defaults.sessionKeyManagerAddress as `0x${string}`;

	// Auto-determine Irys network: prod -> mainnet, otherwise -> devnet
	const irysNetwork: 'mainnet' | 'devnet' = getEnvName() === 'prod' ? 'mainnet' : 'devnet';

	return {
		appName: defaults.appName,
		appVersion: defaults.appVersion,
		// Derived from chainId (not user-overridable)
		blogHubContractAddress,
		sessionKeyManagerAddress,
		// Auto-determined from environment (not user-overridable)
		irysNetwork,
		// Overridable
		rpcUrl: userConfig.rpcUrl || envDefaults.rpcUrl,
		chainId,
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
	const config = { ...userConfig };
	// Include envName from separate storage
	const currentEnvName = getEnvName();
	if (currentEnvName !== PUBLIC_ENV_NAME) {
		config.envName = currentEnvName as 'dev' | 'test' | 'prod';
	}
	return config;
}

// Update a single config value
export function setConfigValue<K extends UserConfigKey>(key: K, value: UserConfig[K]): void {
	// Special handling for envName - save to separate storage key and reload config
	if (key === 'envName') {
		if (browser) {
			try {
				localStorage.setItem('amberink_env_override', JSON.stringify({ envName: value }));
				// Reload userConfig from the new environment's storage key
				// This ensures all dependent configs update to reflect the new environment
				userConfig = loadUserConfig();
				// Notify listeners that envName has changed
				envNameVersion++;
			} catch (e) {
				console.warn('Failed to save envName override:', e);
			}
		}
		return;
	}
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
	// Special handling for envName - remove from separate storage
	if (key === 'envName') {
		if (browser) {
			try {
				localStorage.removeItem('amberink_env_override');
			} catch (e) {
				console.warn('Failed to remove envName override:', e);
			}
		}
		return;
	}
	const { [key]: _, ...rest } = userConfig;
	userConfig = rest;
	saveUserConfig(userConfig);
}

// Reset all user config to env defaults
export function resetAllConfig(): void {
	userConfig = {};
	saveUserConfig(userConfig);
	// Also reset envName override
	if (browser) {
		try {
			localStorage.removeItem('amberink_env_override');
		} catch (e) {
			console.warn('Failed to remove envName override:', e);
		}
	}
}

// Check if a config value is overridden by user
export function isConfigOverridden(key: UserConfigKey): boolean {
	// Special handling for envName
	if (key === 'envName') {
		if (!browser) return false;
		try {
			const stored = localStorage.getItem('amberink_env_override');
			return !!stored;
		} catch (e) {
			return false;
		}
	}
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
