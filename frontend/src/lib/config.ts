/**
 * Application configuration
 * SvelteKit best practice: use $env/static/public for PUBLIC_ prefixed env vars
 * These are replaced at build time for optimal performance
 */
import {
	PUBLIC_BLOG_HUB_CONTRACT_ADDRESS,
	PUBLIC_SESSION_KEY_MANAGER_ADDRESS,
	PUBLIC_RPC_URL,
	PUBLIC_CHAIN_ID,
	PUBLIC_IRYS_NETWORK,
	PUBLIC_APP_NAME,
	PUBLIC_APP_VERSION,
	PUBLIC_ARWEAVE_GATEWAYS,
	PUBLIC_SUBSQUID_ENDPOINT
} from '$env/static/public';

// Import optional env vars with fallback (these may not be defined in all environments)
import * as publicEnv from '$env/static/public';
const PUBLIC_MIN_GAS_FEE_MULTIPLIER = (publicEnv as Record<string, string>)['PUBLIC_MIN_GAS_FEE_MULTIPLIER'] || '';
const PUBLIC_DEFAULT_GAS_FEE_MULTIPLIER = (publicEnv as Record<string, string>)['PUBLIC_DEFAULT_GAS_FEE_MULTIPLIER'] || '';

// Default values (used when env vars are not set)
const defaults = {
	blogHubContractAddress: '0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9',
	sessionKeyManagerAddress: '0x5FbDB2315678afecb367f032d93F642f64180aa3',
	rpcUrl: 'http://localhost:8545',
	chainId: 31337, // Anvil default
	irysNetwork: 'devnet' as const,
	appName: 'DBlog',
	appVersion: '1.0.0',
	arweaveGateways: ['https://gateway.irys.xyz', 'https://arweave.net', 'https://arweave.dev'],
	subsquidEndpoint: 'http://localhost:4350/graphql',
	// Gas fee multipliers for funding
	minGasFeeMultiplier: 10,      // Minimum: 10x gas fee
	defaultGasFeeMultiplier: 30   // Default: 30x gas fee
};

/**
 * Parsed configuration from environment variables with fallbacks
 */
export const config = {
	blogHubContractAddress: (PUBLIC_BLOG_HUB_CONTRACT_ADDRESS || defaults.blogHubContractAddress) as `0x${string}`,
	sessionKeyManagerAddress: (PUBLIC_SESSION_KEY_MANAGER_ADDRESS || defaults.sessionKeyManagerAddress) as `0x${string}`,
	rpcUrl: PUBLIC_RPC_URL || defaults.rpcUrl,
	chainId: PUBLIC_CHAIN_ID ? parseInt(PUBLIC_CHAIN_ID, 10) : defaults.chainId,
	irysNetwork: (PUBLIC_IRYS_NETWORK || defaults.irysNetwork) as 'mainnet' | 'devnet',
	appName: PUBLIC_APP_NAME || defaults.appName,
	appVersion: PUBLIC_APP_VERSION || defaults.appVersion,
	arweaveGateways: PUBLIC_ARWEAVE_GATEWAYS
		? PUBLIC_ARWEAVE_GATEWAYS.split(',').map((g: string) => g.trim())
		: defaults.arweaveGateways,
	subsquidEndpoint: PUBLIC_SUBSQUID_ENDPOINT || defaults.subsquidEndpoint,
	minGasFeeMultiplier: PUBLIC_MIN_GAS_FEE_MULTIPLIER 
		? parseInt(PUBLIC_MIN_GAS_FEE_MULTIPLIER, 10) 
		: defaults.minGasFeeMultiplier,
	defaultGasFeeMultiplier: PUBLIC_DEFAULT_GAS_FEE_MULTIPLIER 
		? parseInt(PUBLIC_DEFAULT_GAS_FEE_MULTIPLIER, 10) 
		: defaults.defaultGasFeeMultiplier
} as const;

// Helper functions for backward compatibility
export function getBlogHubContractAddress(): `0x${string}` {
	return config.blogHubContractAddress;
}

export function getSessionKeyManagerAddress(): `0x${string}` {
	return config.sessionKeyManagerAddress;
}

export function getRpcUrl(): string {
	return config.rpcUrl;
}

export function getChainId(): number {
	return config.chainId;
}

export function getIrysNetwork(): 'mainnet' | 'devnet' {
	return config.irysNetwork;
}

export function getAppName(): string {
	return config.appName;
}

export function getAppVersion(): string {
	return config.appVersion;
}

export function getArweaveGateways(): string[] {
	return config.arweaveGateways;
}

export function getSubsquidEndpoint(): string {
	return config.subsquidEndpoint;
}

export function getMinGasFeeMultiplier(): number {
	return config.minGasFeeMultiplier;
}

export function getDefaultGasFeeMultiplier(): number {
	return config.defaultGasFeeMultiplier;
}

export { defaults as defaultConfig };
