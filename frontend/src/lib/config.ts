/**
 * Application configuration
 * In SvelteKit, we use environment variables via $env/static/public
 * For client-side access, variables must be prefixed with PUBLIC_
 */

// Default configuration values
const defaults = {
	blogHubContractAddress: '0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9' as `0x${string}`,
	sessionKeyManagerAddress: '0x0000000000000000000000000000000000000000' as `0x${string}`,
	rpcUrl: 'https://sepolia.optimism.io',
	irysNetwork: 'devnet' as 'mainnet' | 'devnet',
	appName: 'DBlog',
	appVersion: '1.0.0',
	arweaveGateways: ['https://gateway.irys.xyz', 'https://arweave.net', 'https://arweave.dev']
};

/**
 * Get configuration from environment variables or defaults
 * This function works in browser context
 */
export function getConfig() {
	// In browser, we can't access import.meta.env directly in a reactive way
	// So we use a function that reads from window or defaults
	if (typeof window !== 'undefined' && (window as unknown as { __APP_CONFIG__?: typeof defaults }).__APP_CONFIG__) {
		return (window as unknown as { __APP_CONFIG__: typeof defaults }).__APP_CONFIG__;
	}
	return defaults;
}

/**
 * Get BlogHub contract address
 */
export function getBlogHubContractAddress(): `0x${string}` {
	return getConfig().blogHubContractAddress;
}

/**
 * Get Session Key Manager contract address
 */
export function getSessionKeyManagerAddress(): `0x${string}` {
	return getConfig().sessionKeyManagerAddress;
}

/**
 * Get RPC URL
 */
export function getRpcUrl(): string {
	return getConfig().rpcUrl;
}

/**
 * Get Irys network
 */
export function getIrysNetwork(): 'mainnet' | 'devnet' {
	return getConfig().irysNetwork;
}

/**
 * Get app name
 */
export function getAppName(): string {
	return getConfig().appName;
}

/**
 * Get app version
 */
export function getAppVersion(): string {
	return getConfig().appVersion;
}

/**
 * Get Arweave gateways
 */
export function getArweaveGateways(): string[] {
	return getConfig().arweaveGateways;
}

export { defaults as defaultConfig };
