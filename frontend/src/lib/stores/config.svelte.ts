/**
 * Reactive configuration store with localStorage persistence
 * Allows users to override default config values after deployment
 * 
 * Environment configuration is hardcoded - no .env files needed.
 * Users can switch environments at runtime via Settings page.
 */
import { browser } from '$app/environment';

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

// ============================================
// Environment-specific defaults (hardcoded)
// ============================================

/**
 * Default configuration (shared across all environments)
 */
export const defaults = {
	// App info
	appName: 'AmberInk',
	appVersion: '1.0.0',
	// Contract addresses (derived from chainId, not directly configurable)
	blogHubContractAddress: '0x000000',
	sessionKeyManagerAddress: '0x000000',
	// Network settings
	rpcUrl: 'http://localhost:8545',
	chainId: 31337,
	arweaveGateways: ['https://gateway.irys.xyz', 'https://arweave.net', 'https://arweave.dev'],
	subsquidEndpoint: 'http://localhost:4350/graphql',
	irysNetwork: 'devnet' as 'mainnet' | 'devnet',
	// Gas settings
	minGasFeeMultiplier: 10,
	defaultGasFeeMultiplier: 30,
	// Irys settings
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

/**
 * Type for defaults
 */
export type DefaultsConfig = typeof defaults;

/**
 * Environment-specific overrides (partial, only override what's different)
 */
export const ENVIRONMENT_DEFAULTS: Record<'dev' | 'test' | 'prod', Partial<DefaultsConfig>> = {
	dev: {
		// dev uses all defaults, no overrides needed
	},
	test: {
		rpcUrl: 'https://sepolia.optimism.io',
		chainId: 11155420,
		subsquidEndpoint: 'https://amberink.banbot.site/graphql'
	},
	prod: {
		rpcUrl: 'https://mainnet.optimism.io',
		chainId: 10,
		subsquidEndpoint: 'https://amberink.banbot.site/graphql',
		irysNetwork: 'mainnet'
	}
};

// Default environment when nothing is set
const DEFAULT_ENV: 'dev' | 'test' | 'prod' = 'dev';

// ============================================
// Environment name management
// ============================================

// Dynamic localStorage key based on environment to avoid conflicts when switching environments
const CONFIG_STORAGE_KEY_PREFIX = 'amberink_user_config';
function getConfigStorageKey(): string {
	const currentEnvName = getEnvName();
	return `${CONFIG_STORAGE_KEY_PREFIX}_${currentEnvName}`;
}

/**
 * Get current environment name (supports user override)
 * Defaults to 'dev' if nothing is set
 */
function getEnvName(): 'dev' | 'test' | 'prod' {
	if (!browser) return DEFAULT_ENV;
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
	return DEFAULT_ENV;
}

/**
 * Get and export current environment name (supports user override)
 * This is a function that should be called to get the current envName
 */
export { getEnvName as envName };

// ============================================
// Type definitions
// ============================================

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

// ============================================
// Helper functions
// ============================================

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

// ============================================
// Config fields metadata for Settings UI
// ============================================

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

// ============================================
// localStorage persistence
// ============================================

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

// ============================================
// Reactive state using Svelte 5 runes
// ============================================

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

// ============================================
// Config getters
// ============================================

/**
 * Get current environment defaults (merged: defaults + environment overrides)
 */
function getCurrentEnvDefaults(): DefaultsConfig {
	const envOverrides = ENVIRONMENT_DEFAULTS[getEnvName()];
	return { ...defaults, ...envOverrides };
}

/**
 * Merged config (user overrides + environment defaults)
 */
export function getConfig() {
	const envDefaults = getCurrentEnvDefaults();
	const chainId = userConfig.chainId ?? envDefaults.chainId;

	// Get contract addresses from chain configuration
	const chainContracts = SUPPORTED_CHAINS[chainId];
	const blogHubContractAddress = chainContracts?.blogHubAddress || envDefaults.blogHubContractAddress as `0x${string}`;
	const sessionKeyManagerAddress = chainContracts?.sessionKeyManagerAddress || envDefaults.sessionKeyManagerAddress as `0x${string}`;

	return {
		appName: envDefaults.appName,
		appVersion: envDefaults.appVersion,
		// Derived from chainId (not user-overridable)
		blogHubContractAddress,
		sessionKeyManagerAddress,
		// From environment config (not user-overridable)
		irysNetwork: envDefaults.irysNetwork,
		// Overridable (user config > environment defaults)
		rpcUrl: userConfig.rpcUrl || envDefaults.rpcUrl,
		chainId,
		arweaveGateways: userConfig.arweaveGateways || envDefaults.arweaveGateways,
		subsquidEndpoint: userConfig.subsquidEndpoint || envDefaults.subsquidEndpoint,
		defaultGasFeeMultiplier: userConfig.defaultGasFeeMultiplier ?? envDefaults.defaultGasFeeMultiplier,
		// USD pricing (user-overridable, uses fixed defaults)
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
	// Include envName if it's been overridden (not default)
	const currentEnvName = getEnvName();
	if (currentEnvName !== DEFAULT_ENV) {
		config.envName = currentEnvName;
	}
	return config;
}

// ============================================
// Config setters
// ============================================

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
				// Reload userConfig for the default environment
				userConfig = loadUserConfig();
				envNameVersion++;
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
			envNameVersion++;
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

/**
 * Get env default value for a key
 * Returns the default value from merged defaults for the current environment
 */
export function getEnvDefault<K extends UserConfigKey>(key: K) {
	const envDefaults = getCurrentEnvDefaults();
	
	// envName default
	if (key === 'envName') return DEFAULT_ENV;
	
	// All other keys come from merged defaults
	if (key in envDefaults) {
		return envDefaults[key as keyof DefaultsConfig];
	}
	
	// Fallback (should not reach here)
	throw new Error(`Unknown config key: ${key}`);
}

// Initialize store (call this on app load if needed)
export function initConfigStore(): void {
	if (browser) {
		userConfig = loadUserConfig();
	}
}
