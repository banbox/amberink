/**
 * Session Key management for seamless interactions
 * Allows users to perform frequent operations without signing each time
 */

import { formatEther, parseEther, createWalletClient, http } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { getBlogHubContractAddress, getSessionKeyManagerAddress, getMinGasFeeMultiplier, getDefaultChargeAmtUsd, getRpcUrl, envName } from '$lib/config';
import { getEthereumAccount, getWalletClient, getPublicClient } from '$lib/wallet';
import { getChainConfig } from '$lib/chain';
import { browser } from '$app/environment';
import { createIrysUploader, type IrysUploader } from '$lib/arweave/irys';
import { getIrysNetwork } from '$lib/config';
import { usdToWei } from '$lib/priceService';
import { client, USER_BY_ID_QUERY, type UserData } from '$lib/graphql';
import {
	SESSION_KEY_DEFAULT_SPENDING_LIMIT,
	SESSION_KEY_DURATION_SECONDS,
	ESTIMATED_GAS_UNITS
} from './constants';
import { ContractError, FUNCTION_SELECTORS } from '$lib/contracts';

// Internal helpers
const getStorageKey = (account: string) => `amberink_session_key_${envName()}_${account.toLowerCase()}`;

function saveSessionKey(data: StoredSessionKey): void {
	if (browser) {
		localStorage.setItem(getStorageKey(data.owner), JSON.stringify(data));
	}
}

async function getValidityPeriod(publicClient: any) {
	const latestBlock = await publicClient.getBlock({ blockTag: 'latest' });
	const validAfter = Number(latestBlock.timestamp);
	return { validAfter, validUntil: validAfter + SESSION_KEY_DURATION_SECONDS };
}

function verifySessionKeyOwner(account: string, sessionKey: StoredSessionKey) {
	if (account.toLowerCase() !== sessionKey.owner.toLowerCase()) {
		throw new Error('Cannot operate on session key: owner mismatch');
	}
}

async function executeRegisterSessionKey(
	walletClient: any,
	sessionKeyAddress: string,
	validAfter: number,
	validUntil: number
) {
	const sessionKeyManager = getSessionKeyManagerAddress();
	const blogHub = getBlogHubContractAddress();

	return await walletClient.writeContract({
		address: sessionKeyManager,
		abi: SESSION_KEY_MANAGER_ABI,
		functionName: 'registerSessionKey',
		args: [
			sessionKeyAddress as `0x${string}`,
			validAfter,
			validUntil,
			blogHub,
			ALLOWED_SELECTORS,
			SESSION_KEY_DEFAULT_SPENDING_LIMIT
		]
	});
}

/**
 * Stored session key data structure
 */
export interface StoredSessionKey {
	address: string;
	privateKey: string;
	owner: string;
	validUntil: number;
}

// SessionKeyManager contract ABI (minimal)
const SESSION_KEY_MANAGER_ABI = [
	{
		name: 'registerSessionKey',
		type: 'function',
		inputs: [
			{ name: '_sessionKey', type: 'address' },
			{ name: '_validAfter', type: 'uint48' },
			{ name: '_validUntil', type: 'uint48' },
			{ name: '_target', type: 'address' },
			{ name: '_allowedSelectors', type: 'bytes4[]' },
			{ name: '_spendingLimit', type: 'uint256' }
		],
		outputs: [],
		stateMutability: 'nonpayable'
	},
	{
		name: 'revokeSessionKey',
		type: 'function',
		inputs: [{ name: '_sessionKey', type: 'address' }],
		outputs: [],
		stateMutability: 'nonpayable'
	},
	{
		name: 'getSessionKeyData',
		type: 'function',
		inputs: [
			{ name: 'owner', type: 'address' },
			{ name: 'sessionKey', type: 'address' }
		],
		outputs: [
			{
				name: '',
				type: 'tuple',
				components: [
					{ name: 'sessionKey', type: 'address' },
					{ name: 'validAfter', type: 'uint48' },
					{ name: 'validUntil', type: 'uint48' },
					{ name: 'allowedContract', type: 'address' },
					{ name: 'allowedSelectors', type: 'bytes4[]' },
					{ name: 'spendingLimit', type: 'uint256' },
					{ name: 'spentAmount', type: 'uint256' },
					{ name: 'nonce', type: 'uint256' }
				]
			}
		],
		stateMutability: 'view'
	}
] as const;


// Allowed function selectors for session key
// Derived from contracts.ts to ensure consistency
const ALLOWED_SELECTORS: `0x${string}`[] = Object.values(FUNCTION_SELECTORS);

/** Calculate gas-based amount: maxFeePerGas * estimatedGas * multiplier 
 * Uses EIP-1559 fee estimation for more accurate gas cost calculation
 */
async function calculateGasAmount(multiplier: number): Promise<bigint> {
	const publicClient = getPublicClient();

	// Try to get EIP-1559 fee data first
	try {
		const feeData = await publicClient.estimateFeesPerGas();
		// Use maxFeePerGas for worst-case estimation
		const maxFeePerGas = feeData.maxFeePerGas ?? await publicClient.getGasPrice();
		return maxFeePerGas * ESTIMATED_GAS_UNITS * BigInt(multiplier);
	} catch {
		// Fallback to legacy gas price
		const gasPrice = await publicClient.getGasPrice();
		return gasPrice * ESTIMATED_GAS_UNITS * BigInt(multiplier);
	}
}

/**
 * Get session key balance
 * @param address - Session key address
 * @returns Balance in wei
 */
export async function getSessionKeyBalance(address: string): Promise<bigint> {
	return await getPublicClient().getBalance({ address: address as `0x${string}` });
}

/**
 * Check if session key has sufficient balance for gas fees and optional value
 * @param address - Session key address
 * @param txValue - Optional transaction value in wei (default 0)
 * @returns true if balance is sufficient
 */
export async function hasSessionKeySufficientBalance(
	address: string,
	txValue: bigint = 0n
): Promise<boolean> {
	const [balance, gasAmount] = await Promise.all([
		getSessionKeyBalance(address),
		calculateGasAmount(getMinGasFeeMultiplier())
	]);
	const requiredBalance = gasAmount + txValue;
	return balance >= requiredBalance;
}

/**
 * Fund session key with ETH from main wallet
 * @param sessionKeyAddress - Session key address to fund
 * @param amount - Amount to send (optional, calculated based on gas price if not provided)
 * @returns Transaction hash
 */
export async function fundSessionKey(
	sessionKeyAddress: string,
	amount?: bigint
): Promise<string> {
	const walletClient = await getWalletClient();
	const minBalance = await calculateGasAmount(getMinGasFeeMultiplier());
	const fundAmount = amount ?? await usdToWei(getDefaultChargeAmtUsd());
	const actualAmount = fundAmount >= minBalance ? fundAmount : minBalance;

	console.log(`Funding session key with ${formatEther(actualAmount)} ETH (min: ${formatEther(minBalance)} ETH)`);

	const txHash = await walletClient.sendTransaction({
		to: sessionKeyAddress as `0x${string}`,
		value: actualAmount
	});

	// Wait for transaction confirmation
	const publicClient = getPublicClient();
	await publicClient.waitForTransactionReceipt({ hash: txHash });

	console.log(`Funded session key ${sessionKeyAddress} with ${formatEther(actualAmount)} ETH. Tx: ${txHash}`);
	return txHash;
}

/**
 * Ensure session key has sufficient balance, fund if necessary
 * @param sessionKeyAddress - Session key address
 * @param txValue - Optional transaction value in wei (e.g., tip amount) to include in balance check
 * @returns true if balance is now sufficient
 */
export async function ensureSessionKeyBalance(
	sessionKeyAddress: string,
	txValue: bigint = 0n
): Promise<boolean> {
	// Calculate required amounts
	const gasAmount = await calculateGasAmount(getMinGasFeeMultiplier());
	const minBalance = gasAmount + txValue;

	// Check current balance
	let balance = await getSessionKeyBalance(sessionKeyAddress);

	if (balance >= minBalance) {
		console.log(`Session key balance sufficient: ${formatEther(balance)} ETH (required: ${formatEther(minBalance)} ETH)`);
		return true;
	}

	console.log(`Session key balance low (${formatEther(balance)} ETH), need ${formatEther(minBalance)} ETH, funding...`);
	try {
		// Fund with enough for gas + txValue + buffer
		// Always include txValue in the fund amount to ensure we have enough for the transaction
		const gasBuffer = await usdToWei(getDefaultChargeAmtUsd());
		const actualFundAmount = gasBuffer + txValue;
		await fundSessionKey(sessionKeyAddress, actualFundAmount);

		// fundSessionKey already waits for transaction confirmation
		// Add a small delay to ensure RPC node has updated the balance
		await new Promise(resolve => setTimeout(resolve, 1500));
		balance = await getSessionKeyBalance(sessionKeyAddress);

		if (balance < minBalance) {
			console.warn(`Balance still insufficient after funding: ${formatEther(balance)} ETH (required: ${formatEther(minBalance)} ETH)`);
			// Try one more time with a longer delay
			await new Promise(resolve => setTimeout(resolve, 2000));
			balance = await getSessionKeyBalance(sessionKeyAddress);
		}

		console.log(`Session key balance after funding: ${formatEther(balance)} ETH`);
		return balance >= minBalance;
	} catch (error) {
		console.error('Failed to fund session key:', error);
		return false;
	}
}

/**
 * Check if there is a stored session key for a specific account (including expired ones)
 * NOTE: This returns expired keys as well. Use isSessionKeyExpired() to check validity.
 * This is important to avoid losing funds in expired Session Keys.
 * @param account - Account address to get session key for
 * @returns Stored session key data or null if not found
 */
export function getStoredSessionKey(account: string): StoredSessionKey | null {
	if (!browser || !account) return null;

	const keys = [
		getStorageKey(account),
		// Fallback to legacy key (without account) for migration
		`amberink_session_key_${envName()}`
	];

	for (const key of keys) {
		const stored = localStorage.getItem(key);
		if (stored) {
			try {
				const data: StoredSessionKey = JSON.parse(stored);
				// Verify ownership matches requested account (legacy keys might not match)
				if (data.owner.toLowerCase() === account.toLowerCase()) {
					// If we found a valid legacy key, migrate it to new format
					if (key !== keys[0]) {
						console.log('Migrating legacy session key to new format');
						saveSessionKey(data);
						localStorage.removeItem(key);
					}
					return data;
				}
			} catch {
				localStorage.removeItem(key);
			}
		}
	}

	return null;
}

/**
 * Check if stored session key is expired based on local timestamp
 * @param sessionKey - Session key to check
 * @returns true if expired
 */
export function isSessionKeyExpired(sessionKey: StoredSessionKey | null): boolean {
	if (!sessionKey) return true;
	return Date.now() / 1000 > sessionKey.validUntil;
}

/**
 * Check if stored session key belongs to current wallet
 * @returns true if session key is valid for current wallet
 */
export async function isSessionKeyValidForCurrentWallet(): Promise<boolean> {
	try {
		const account = await getEthereumAccount();
		const sessionKey = getStoredSessionKey(account);
		if (!sessionKey) return false;

		return account.toLowerCase() === sessionKey.owner.toLowerCase();
	} catch {
		return false;
	}
}

/**
 * Create Irys Balance Approval for Session Key
 * This allows the Session Key to upload to Irys using the main account's balance
 * @param uploader - Irys uploader instance (connected with main account)
 * @param sessionKeyAddress - Session Key address to approve
 * @param expiresInSeconds - Approval expiration time in seconds (default: 7 days)
 */
async function createIrysBalanceApproval(
	uploader: IrysUploader,
	sessionKeyAddress: string,
	expiresInSeconds: number = SESSION_KEY_DURATION_SECONDS
): Promise<void> {
	try {
		// Create a large approval amount (1 ETH worth in atomic units)
		// This should be enough for many uploads
		const approvalAmount = uploader.utils.toAtomic(1);

		console.log(`Creating Irys Balance Approval for ${sessionKeyAddress}...`);
		const receipt = await uploader.approval.createApproval({
			amount: approvalAmount,
			approvedAddress: sessionKeyAddress,
			expiresInSeconds
		});
		console.log(`Irys Balance Approval created:`, receipt);
	} catch (error) {
		console.error('Failed to create Irys Balance Approval:', error);
		// Don't throw - this is not critical for session key creation
		// The user can still fund the session key directly if needed
	}
}

/**
 * Generate and register a new session key
 * NOTE: This only registers the session key on-chain and saves to localStorage.
 * Irys approval and ETH funding are done lazily when needed to minimize MetaMask popups.
 * @param options - Optional configuration
 * @param options.skipFunding - If true, skip initial ETH funding (default: true for lazy funding)
 * @param options.skipIrysApproval - If true, skip Irys balance approval (default: true for lazy approval)
 * @returns Created session key data
 */
export async function createSessionKey(options?: {
	skipFunding?: boolean;
	skipIrysApproval?: boolean;
}): Promise<StoredSessionKey> {
	const { skipFunding = true, skipIrysApproval = true } = options ?? {};

	const account = await getEthereumAccount();

	// 1. Generate temporary key pair
	const privateKey = generatePrivateKey();
	const sessionKeyAccount = privateKeyToAccount(privateKey);

	// 2. Get validity period & Register on blockchain
	const publicClient = getPublicClient();
	const walletClient = await getWalletClient();

	const { validAfter, validUntil } = await getValidityPeriod(publicClient);

	const txHash = await executeRegisterSessionKey(
		walletClient,
		sessionKeyAccount.address,
		validAfter,
		validUntil
	);
	await publicClient.waitForTransactionReceipt({ hash: txHash });

	// 3. Save to localStorage
	const sessionKeyData: StoredSessionKey = {
		address: sessionKeyAccount.address,
		privateKey: privateKey,
		owner: account,
		validUntil
	};
	saveSessionKey(sessionKeyData);
	console.log(`Session key created and registered: ${sessionKeyAccount.address}`);

	// 4. Lazy setup
	if (!skipIrysApproval) await ensureIrysApproval(sessionKeyData);
	if (!skipFunding) await ensureSessionKeyBalance(sessionKeyAccount.address, 0n);

	return sessionKeyData;
}

/**
 * Reauthorize an existing session key with extended validity period.
 * This is useful when a Session Key has expired but still has funds in it.
 * Instead of creating a new key and losing access to funds, we re-register the same key.
 * 
 * NOTE: This only works for EXPIRED session keys. For active keys, use extendSessionKey().
 * 
 * @param existingSessionKey - Existing session key to reauthorize
 * @returns Updated session key data with new validity period
 */
export async function reauthorizeSessionKey(
	existingSessionKey: StoredSessionKey
): Promise<StoredSessionKey> {
	const account = await getEthereumAccount();
	verifySessionKeyOwner(account, existingSessionKey);

	const publicClient = getPublicClient();
	const walletClient = await getWalletClient();

	// Get new validity & Register
	const { validAfter, validUntil } = await getValidityPeriod(publicClient);

	const txHash = await executeRegisterSessionKey(
		walletClient,
		existingSessionKey.address,
		validAfter,
		validUntil
	);
	const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

	if (receipt.status === 'reverted') {
		throw new Error('Transaction reverted: session key may still be active. Use extend instead.');
	}

	// Update localStorage
	const updatedSessionKey: StoredSessionKey = { ...existingSessionKey, validUntil };
	saveSessionKey(updatedSessionKey);
	console.log(`Session key reauthorized: ${existingSessionKey.address}`);

	return updatedSessionKey;
}

/**
 * Extend an active session key's validity period.
 * This requires revoking the existing key first, then re-registering it.
 * The smart contract prevents re-registering an active key directly.
 * 
 * NOTE: This only works for ACTIVE (non-expired) session keys. For expired keys, use reauthorizeSessionKey().
 * 
 * @param existingSessionKey - Existing active session key to extend
 * @returns Updated session key data with new validity period
 */
export async function extendSessionKey(
	existingSessionKey: StoredSessionKey
): Promise<StoredSessionKey> {
	const account = await getEthereumAccount();
	verifySessionKeyOwner(account, existingSessionKey);

	const publicClient = getPublicClient();
	const walletClient = await getWalletClient();

	// Step 1: Revoke
	console.log(`Revoking existing session key: ${existingSessionKey.address}`);
	const sessionKeyManager = getSessionKeyManagerAddress();
	const revokeTxHash = await walletClient.writeContract({
		address: sessionKeyManager,
		abi: SESSION_KEY_MANAGER_ABI,
		functionName: 'revokeSessionKey',
		args: [existingSessionKey.address as `0x${string}`]
	});
	const revokeReceipt = await publicClient.waitForTransactionReceipt({ hash: revokeTxHash });

	if (revokeReceipt.status === 'reverted') {
		throw new Error('Failed to revoke existing session key');
	}
	console.log(`Session key revoked: ${existingSessionKey.address}`);

	// Step 2 & 3: Re-register with new validity
	const { validAfter, validUntil } = await getValidityPeriod(publicClient);

	console.log(`Re-registering session key: ${existingSessionKey.address}`);
	const registerTxHash = await executeRegisterSessionKey(
		walletClient,
		existingSessionKey.address,
		validAfter,
		validUntil
	);
	const registerReceipt = await publicClient.waitForTransactionReceipt({ hash: registerTxHash });

	if (registerReceipt.status === 'reverted') {
		throw new Error('Failed to re-register session key after revocation');
	}

	// Update localStorage
	const updatedSessionKey: StoredSessionKey = { ...existingSessionKey, validUntil };
	saveSessionKey(updatedSessionKey);
	console.log(`Session key extended: ${existingSessionKey.address}`);

	return updatedSessionKey;
}

/**
 * Revoke the current session key
 */
export async function revokeSessionKey(): Promise<void> {
	const account = await getEthereumAccount();
	const sessionKey = getStoredSessionKey(account);
	if (!sessionKey) return;

	const sessionKeyManager = getSessionKeyManagerAddress();
	const walletClient = await getWalletClient();

	await walletClient.writeContract({
		address: sessionKeyManager,
		abi: SESSION_KEY_MANAGER_ABI,
		functionName: 'revokeSessionKey',
		args: [sessionKey.address as `0x${string}`]
	});

	localStorage.removeItem(getStorageKey(account));
}

/**
 * Clear session key from local storage without revoking on-chain
 * Use when switching wallets or cleaning up
 * @param account - Account address to clear session key for
 */
export function clearLocalSessionKey(account: string): void {
	if (browser && account) {
		localStorage.removeItem(getStorageKey(account));
	}
}

/**
 * Get session key account for signing
 * @param account - Account address to get session key for
 * @returns Account instance or null if no valid session key
 */
export function getSessionKeyAccount(account: string) {
	const sessionKey = getStoredSessionKey(account);
	if (!sessionKey) return null;
	return privateKeyToAccount(sessionKey.privateKey as `0x${string}`);
}

/**
 * Check if session key is valid on-chain (registered, not expired, has required selectors)
 * @param sessionKey - Session key to validate
 * @param requiredSelector - Optional specific selector to check for (e.g., PUBLISH_SELECTOR '0x2801f5df')
 * @returns true if session key is valid on-chain
 */
export async function isSessionKeyValidOnChain(
	sessionKey: StoredSessionKey,
	requiredSelector?: `0x${string}`
): Promise<boolean> {
	try {
		const publicClient = getPublicClient();
		const sessionKeyManager = getSessionKeyManagerAddress();
		const blogHub = getBlogHubContractAddress();

		const [data, latestBlock] = await Promise.all([
			publicClient.readContract({
				address: sessionKeyManager,
				abi: SESSION_KEY_MANAGER_ABI,
				functionName: 'getSessionKeyData',
				args: [sessionKey.owner as `0x${string}`, sessionKey.address as `0x${string}`]
			}),
			publicClient.getBlock({ blockTag: 'latest' })
		]);

		// Check if registered
		if ((data.sessionKey as string).toLowerCase() === '0x0000000000000000000000000000000000000000') return false;
		// Check target contract
		if ((data.allowedContract as string).toLowerCase() !== blogHub.toLowerCase()) return false;

		// Check required selector if specified
		if (requiredSelector) {
			const selectors = (data.allowedSelectors as readonly string[]).map((s) => s.toLowerCase());
			if (!selectors.includes(requiredSelector.toLowerCase())) return false;
		}

		// Check time validity
		const now = Number(latestBlock.timestamp);
		if (now < Number(data.validAfter)) return false;
		if (now > Number(data.validUntil)) return false;

		return true;
	} catch {
		return false;
	}
}

/**
 * Get or create a valid session key for the current wallet.
 * This is the unified entry point for all session key operations.
 * Only triggers MetaMask popup if no valid session key exists.
 * 
 * IMPORTANT: When a Session Key is expired or invalid but has balance,
 * this function will automatically reauthorize it to prevent fund loss.
 * 
 * @param options - Optional configuration
 * @param options.requiredSelector - Specific function selector that must be authorized
 * @param options.autoCreate - If true, automatically create new session key if needed (default: true)
 * @returns Valid session key or null if autoCreate is false and no valid key exists
 */
export async function getOrCreateValidSessionKey(options?: {
	requiredSelector?: `0x${string}`;
	autoCreate?: boolean;
}): Promise<StoredSessionKey | null> {
	const { requiredSelector, autoCreate = true } = options ?? {};

	// 1. Get current account first
	const account = await getEthereumAccount();

	// 2. Check if we have a stored session key (including expired ones)
	let sessionKey = getStoredSessionKey(account);

	if (sessionKey) {
		// 3. Verify it belongs to current wallet
		const isOwnerValid = account.toLowerCase() === sessionKey.owner.toLowerCase();
		if (!isOwnerValid) {
			console.log('Stored session key belongs to different wallet, clearing...');
			clearLocalSessionKey(account);
			sessionKey = null;
		} else {
			// 3. Check if expired locally
			const isExpired = isSessionKeyExpired(sessionKey);

			if (isExpired) {
				console.log('Session key expired, checking balance...');

				// Check if session key has balance - if so, automatically reauthorize
				const balance = await getSessionKeyBalance(sessionKey.address);
				if (balance > 0n) {
					const balanceEth = formatEther(balance);
					console.log(`Session key expired but contains ${balanceEth} ETH, reauthorizing...`);

					// Automatically reauthorize (triggers MetaMask popup)
					try {
						sessionKey = await reauthorizeSessionKey(sessionKey);
						console.log('Session key reauthorized successfully');
						return sessionKey;
					} catch (error) {
						console.error('Failed to reauthorize session key:', error);
						throw new Error('Failed to reauthorize session key. Please try again.');
					}
				}

				// No balance, safe to clear and create new
				console.log('Session key expired and has no balance, clearing...');
				clearLocalSessionKey(account);
				sessionKey = null;
			} else {
				// 4. Verify it's valid on-chain
				const isOnChainValid = await isSessionKeyValidOnChain(sessionKey, requiredSelector);
				if (!isOnChainValid) {
					console.log('Session key invalid on-chain, checking balance...');

					// Check balance before discarding
					const balance = await getSessionKeyBalance(sessionKey.address);
					if (balance > 0n) {
						const balanceEth = formatEther(balance);
						console.log(`Session key invalid but contains ${balanceEth} ETH, reauthorizing...`);

						// Automatically reauthorize (triggers MetaMask popup)
						try {
							sessionKey = await extendSessionKey(sessionKey);
							console.log('Session key reauthorized successfully');
							return sessionKey;
						} catch (error) {
							console.error('Failed to reauthorize session key:', error);
							throw new Error('Failed to reauthorize session key. Please try again.');
						}
					}

					console.log('Session key invalid and has no balance, clearing...');
					clearLocalSessionKey(account);
					sessionKey = null;
				} else {
					console.log('Using existing valid session key:', sessionKey.address);
					return sessionKey;
				}
			}
		}
	}

	// 5. No valid session key - create new one if autoCreate is enabled
	if (!autoCreate) {
		return null;
	}

	console.log('Creating new session key (requires MetaMask signature)...');
	sessionKey = await createSessionKey();
	console.log(`New session key created: ${sessionKey.address}`);

	return sessionKey;
}

/**
 * Ensure session key is ready for use: valid and has sufficient balance.
 * This is the unified function to call before any session key operation.
 * Minimizes MetaMask popups by:
 * - Only creating session key if needed (one popup for registration)
 * - Only funding if balance is insufficient (one popup for transfer)
 * 
 * @param options - Optional configuration
 * @param options.requiredSelector - Specific function selector that must be authorized
 * @param options.txValue - Transaction value in wei (e.g., tip amount) to include in balance check
 * @returns Ready session key, or null if user rejected or operation failed
 */
export async function ensureSessionKeyReady(options?: {
	requiredSelector?: `0x${string}`;
	txValue?: bigint;
}): Promise<StoredSessionKey | null> {
	try {
		// 1. Get or create valid session key
		const sessionKey = await getOrCreateValidSessionKey(options);
		if (!sessionKey) {
			return null;
		}

		// 2. Ensure sufficient balance (may trigger MetaMask for funding)
		const txValue = options?.txValue ?? 0n;
		const hasBalance = await ensureSessionKeyBalance(sessionKey.address, txValue);
		if (!hasBalance) {
			console.log('User rejected session key funding');
			return null;
		}

		return sessionKey;
	} catch (error) {
		console.error('Failed to ensure session key ready:', error);
		return null;
	}
}

/**
 * Ensure Irys balance approval exists for session key.
 * Call this lazily before Arweave uploads.
 */
export async function ensureIrysApproval(sessionKey: StoredSessionKey): Promise<void> {
	try {
		const uploader = await createIrysUploader({ network: getIrysNetwork() });
		await createIrysBalanceApproval(uploader, sessionKey.address, SESSION_KEY_DURATION_SECONDS);
	} catch (error) {
		console.warn('Failed to create Irys Balance Approval:', error);
	}
}

/**
 * Withdraw all balance from Session Key to main wallet
 * @param sessionKeyAddress - Session Key address to withdraw from
 * @returns Transaction hash
 */
export async function withdrawAllFromSessionKey(sessionKeyAddress: string): Promise<string> {
	const account = await getEthereumAccount();
	const sessionKey = getStoredSessionKey(account);
	if (!sessionKey || sessionKey.address.toLowerCase() !== sessionKeyAddress.toLowerCase()) {
		throw new Error('Session Key not found or mismatch');
	}

	const balance = await getSessionKeyBalance(sessionKeyAddress);
	if (balance === 0n) {
		throw new Error('Session Key has no balance to withdraw');
	}

	const publicClient = getPublicClient();
	const sessionKeyAccount = privateKeyToAccount(sessionKey.privateKey as `0x${string}`);
	const mainWallet = await getEthereumAccount();

	// Estimate gas for the transfer dynamically
	const gasPrice = await publicClient.getGasPrice();
	// First estimate with a rough amount to get gas limit
	const roughGasCost = gasPrice * 21000n; // Standard ETH transfer base
	if (balance <= roughGasCost) {
		throw new Error('Balance too low to cover gas fees');
	}

	// Estimate actual gas with the amount we plan to send
	const estimatedGas = await publicClient.estimateGas({
		account: sessionKeyAccount.address,
		to: mainWallet,
		value: balance - roughGasCost,
	});
	// Add 20% buffer for safety (standard practice)
	const gasLimit = (estimatedGas * 120n) / 100n;
	const gasCost = gasPrice * gasLimit;

	if (balance <= gasCost) {
		throw new Error('Balance too low to cover gas fees');
	}

	// Calculate amount to send (balance - gas cost)
	// Leave a tiny "dust" amount (10000 wei) to cover L1 Data Fees on L2 chains (Optimism, Base, etc.)
	// This ensures cross-chain compatibility without requiring chain-specific fee oracle logic.
	const SAFETY_DUST = 10000n;
	const amountToSend = balance - gasCost - SAFETY_DUST;

	if (amountToSend <= 0n) {
		throw new Error('Balance too low to cover gas fees and L1 safety buffer');
	}

	console.log(`Withdrawing ${formatEther(amountToSend)} ETH from Session Key to main wallet...`);

	// Create wallet client with session key
	const walletClient = createWalletClient({
		account: sessionKeyAccount,
		chain: getChainConfig(),
		transport: http(getRpcUrl())
	});

	const txHash = await walletClient.sendTransaction({
		to: mainWallet,
		value: amountToSend,
		gas: gasLimit,
		gasPrice
	});

	// Wait for confirmation
	await publicClient.waitForTransactionReceipt({ hash: txHash });

	console.log(`Withdrawn ${formatEther(amountToSend)} ETH. Tx: ${txHash}`);
	return txHash;
}

/**
 * Create a new Session Key, checking if old key has balance and requiring confirmation.
 * This is for manual Session Key management in profile page.
 * @param forceCreate - If true, skip balance check and create anyway
 * @returns Created session key data
 */
export async function createNewSessionKey(forceCreate: boolean = false): Promise<StoredSessionKey> {
	const account = await getEthereumAccount();
	const existingKey = getStoredSessionKey(account);

	if (existingKey && !forceCreate) {
		// Check if existing key has balance
		const balance = await getSessionKeyBalance(existingKey.address);
		if (balance > 0n) {
			const balanceEth = formatEther(balance);
			const confirmMsg = `Your current Session Key contains ${balanceEth} ETH. Creating a new Session Key will replace the old one. You should withdraw the balance first.\n\nDo you want to continue anyway?`;

			if (typeof window !== 'undefined' && !confirm(confirmMsg)) {
				throw new Error('User cancelled Session Key creation');
			}
		}
	}

	// Create new session key (this will overwrite the old one in localStorage)
	return await createSessionKey();
}

/**
 * Transaction record for Session Key
 */
export interface SessionKeyTransaction {
	hash: string;
	from: string;
	to: string;
	value: bigint;
	timestamp: number;
	blockNumber: bigint;
	isIncoming: boolean;
	selector?: string;
	gasUsed?: bigint;
	gasPrice?: bigint;
}

/**
 * Execute contract call with session key, auto-creating if needed.
 * Minimizes MetaMask popups:
 * - Uses existing valid session key if available
 * - Creates new session key only if needed (one popup)
 * - Funds session key only if balance is low (one popup)
 * - Falls back to regular wallet call if user rejects
 * 
 * @param withSessionKey - Function to execute with session key
 * @param withoutSessionKey - Fallback function to execute without session key
 * @param options - Configuration options
 * @returns Result of the contract call
 */
export async function callWithSessionKey<T>(
	withSessionKey: (sk: StoredSessionKey) => Promise<T>,
	withoutSessionKey: () => Promise<T>,
	options: { autoCreate?: boolean; txValue?: bigint } = {}
): Promise<T> {
	const { autoCreate = true, txValue = 0n } = options;

	try {
		// Use unified ensureSessionKeyReady - handles validation, creation, and funding
		const sk = autoCreate
			? await ensureSessionKeyReady({ txValue })
			: null;

		if (sk) {
			return await withSessionKey(sk);
		}

		// User rejected or no session key available, fall back to regular wallet
		console.log('Session key not available, using regular wallet call');
		return await withoutSessionKey();
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message.toLowerCase() : '';
		const errorName = error instanceof ContractError ? error.code : '';

		// Only fallback to wallet for specific safe-to-retry scenarios:
		// 1. User rejected the operation (wallet popup dismissed)
		// 2. RPC connection errors (network issues)
		// Do NOT fallback for:
		// - Contract reverts (session key validation failed, nonce mismatch, etc.)
		// - Insufficient funds (might cause duplicate tx if session key tx is pending)
		// - Gas estimation failures (contract would revert)

		const isUserRejection = errorMessage.includes('user rejected') ||
			errorMessage.includes('user denied') ||
			errorMessage.includes('rejected by user');

		const isRpcError = errorMessage.includes('network') ||
			errorMessage.includes('connection') ||
			errorMessage.includes('timeout') ||
			errorMessage.includes('rpc');

		const isContractError = errorName === 'contract_reverted' ||
			errorName === 'gas_estimation_failed' ||
			errorMessage.includes('insufficient funds') ||
			errorMessage.includes('insufficient balance') ||
			errorMessage.includes('execution failed') ||
			errorMessage.includes('execution reverted');

		if (isContractError) {
			// Contract-level errors should NOT fallback - re-throw to prevent duplicate tx
			console.error('Session key contract error, not falling back:', error);
			throw error;
		}

		if (isUserRejection || isRpcError) {
			// Safe to fallback - no session key tx was sent
			console.log('Session key operation cancelled/failed, falling back to regular wallet:', error);
			return await withoutSessionKey();
		}

		// For unknown errors, re-throw to be safe (prevent duplicate transactions)
		console.error('Session key operation failed with unknown error:', error);
		throw error;
	}
}

/**
 * Update session key state after a successful operation
 * This is a helper to keep session key state in sync
 * 
 * @param currentSessionKey - Current session key state
 * @param newSessionKey - New session key from operation
 * @returns Updated session key and validation status
 */
export function updateSessionKeyState(
	currentSessionKey: StoredSessionKey | null,
	newSessionKey: StoredSessionKey | null
): { sessionKey: StoredSessionKey | null; hasValidSessionKey: boolean } {
	if (!newSessionKey) {
		return { sessionKey: currentSessionKey, hasValidSessionKey: !!currentSessionKey };
	}

	// Update local state if we got a new session key
	if (!currentSessionKey || currentSessionKey.address !== newSessionKey.address) {
		return { sessionKey: newSessionKey, hasValidSessionKey: true };
	}

	return { sessionKey: currentSessionKey, hasValidSessionKey: true };
}

/**
 * Fetch user data from GraphQL by wallet address
 * @param address - The wallet address to fetch data for
 * @returns User data or null if not found
 */
export async function fetchUserData(address: string): Promise<UserData | null> {
	if (!address) return null;
	try {
		const result = await client
			.query(USER_BY_ID_QUERY, { id: address.toLowerCase() }, { requestPolicy: 'cache-first' })
			.toPromise();
		return result.data?.userById ?? null;
	} catch (e) {
		console.error('Failed to fetch user data for', address, e);
		return null;
	}
}

/**
 * Check wallet connection and return wallet state
 * @returns Object containing wallet address, session key, and validation status
 */
export async function checkWalletConnection(): Promise<{
	walletAddress: string | null;
	sessionKey: StoredSessionKey | null;
	hasValidSessionKey: boolean;
	currentUserData: UserData | null;
}> {
	if (typeof window === 'undefined' || !window.ethereum) {
		return {
			walletAddress: null,
			sessionKey: null,
			hasValidSessionKey: false,
			currentUserData: null
		};
	}

	try {
		const accounts = (await window.ethereum.request({ method: 'eth_accounts' })) as string[];
		if (accounts.length > 0) {
			const walletAddress = accounts[0];
			const sessionKey = getStoredSessionKey(walletAddress);
			const hasValidSessionKey = await isSessionKeyValidForCurrentWallet();
			const currentUserData = await fetchUserData(walletAddress);

			return {
				walletAddress,
				sessionKey,
				hasValidSessionKey,
				currentUserData
			};
		}
	} catch (e) {
		console.error('Failed to check wallet:', e);
	}

	return {
		walletAddress: null,
		sessionKey: null,
		hasValidSessionKey: false,
		currentUserData: null
	};
}

/**
 * Setup wallet account change listener
 * @param onAccountChange - Callback function when account changes
 * @returns Cleanup function to remove the listener
 */
export function setupWalletAccountListener(
	onAccountChange: (state: {
		walletAddress: string | null;
		sessionKey: StoredSessionKey | null;
		hasValidSessionKey: boolean;
		currentUserData: UserData | null;
	}) => void
): () => void {
	if (typeof window === 'undefined' || !window.ethereum) {
		return () => { };
	}

	const handleAccountsChanged = async (accounts: unknown) => {
		const accts = accounts as string[];
		const walletAddress = accts.length > 0 ? accts[0] : null;

		if (walletAddress) {
			const sessionKey = getStoredSessionKey(walletAddress);
			const hasValidSessionKey = await isSessionKeyValidForCurrentWallet();
			const currentUserData = await fetchUserData(walletAddress);

			onAccountChange({
				walletAddress,
				sessionKey,
				hasValidSessionKey,
				currentUserData
			});
		} else {
			onAccountChange({
				walletAddress: null,
				sessionKey: null,
				hasValidSessionKey: false,
				currentUserData: null
			});
		}
	};

	window.ethereum.on?.('accountsChanged', handleAccountsChanged);

	// Return cleanup function
	return () => {
		window.ethereum?.removeListener?.('accountsChanged', handleAccountsChanged);
	};
}
