/**
 * Session Key management for seamless interactions
 * Allows users to perform frequent operations without signing each time
 */

import { createWalletClient, createPublicClient, custom, http, parseEther, formatEther } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { getBlogHubContractAddress, getSessionKeyManagerAddress, getRpcUrl, getMinGasFeeMultiplier, getDefaultGasFeeMultiplier } from '$lib/config';
import { getChainConfig } from '$lib/chain';
import { browser } from '$app/environment';
import { getIrysUploaderDevnet, getIrysUploader, type IrysUploader } from '$lib/arweave/irys';
import { getIrysNetwork } from '$lib/config';

const SESSION_KEY_STORAGE = 'dblog_session_key';

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

const PUBLISH_SELECTOR = '0xe7628e4d' as const;

// Allowed function selectors for session key
// Use: cast sig "functionName(params)" to get selector
const ALLOWED_SELECTORS: `0x${string}`[] = [
	'0xff1f090a', // evaluate(uint256,uint8,string,address,uint256)
	'0xdffd40f2', // likeComment(uint256,uint256,address,address)
	'0x63c3cc16', // follow(address,bool)
	'0xe7628e4d', // publish(string,uint64,uint96,string,string)
	'0x8d3c100a'
];

// Default spending limit (10 ETH)
const DEFAULT_SPENDING_LIMIT = BigInt('10000000000000000000');

// Session key validity duration (7 days in seconds)
const SESSION_KEY_DURATION = 7 * 24 * 60 * 60;

// Estimated gas for a typical transaction (used for calculating minimum balance)
const ESTIMATED_GAS_UNITS = 200000n;

/**
 * Get Ethereum account from wallet
 */
async function getEthereumAccount(): Promise<`0x${string}`> {
	if (typeof window === 'undefined' || !window.ethereum) {
		throw new Error('Ethereum provider not found');
	}
	const accounts = (await window.ethereum.request({ method: 'eth_requestAccounts' })) as `0x${string}`[];
	const account = accounts?.[0];
	if (!account) {
		throw new Error('No accounts found');
	}
	return account;
}

/**
 * Get wallet client for contract interaction
 */
async function getWalletClient() {
	if (typeof window === 'undefined' || !window.ethereum) {
		throw new Error('Ethereum provider not found');
	}

	const account = await getEthereumAccount();
	const chain = getChainConfig();

	return createWalletClient({
		account,
		chain,
		transport: custom(window.ethereum)
	});
}

/**
 * Get public client for read-only operations
 */
function getPublicClient() {
	const chain = getChainConfig();
	return createPublicClient({
		chain,
		transport: http(getRpcUrl())
	});
}

/**
 * Get current gas price from the network
 * @returns Gas price in wei
 */
async function getCurrentGasPrice(): Promise<bigint> {
	const publicClient = getPublicClient();
	return await publicClient.getGasPrice();
}

/**
 * Calculate minimum required balance based on gas price
 * @returns Minimum balance in wei (minMultiplier * gasPrice * estimatedGas)
 */
async function calculateMinBalance(): Promise<bigint> {
	const gasPrice = await getCurrentGasPrice();
	const minMultiplier = BigInt(getMinGasFeeMultiplier());
	return gasPrice * ESTIMATED_GAS_UNITS * minMultiplier;
}

/**
 * Calculate default fund amount based on gas price
 * @returns Fund amount in wei (defaultMultiplier * gasPrice * estimatedGas)
 */
async function calculateFundAmount(): Promise<bigint> {
	const gasPrice = await getCurrentGasPrice();
	const defaultMultiplier = BigInt(getDefaultGasFeeMultiplier());
	return gasPrice * ESTIMATED_GAS_UNITS * defaultMultiplier;
}

/**
 * Get session key balance
 * @param address - Session key address
 * @returns Balance in wei
 */
export async function getSessionKeyBalance(address: string): Promise<bigint> {
	const publicClient = getPublicClient();
	return await publicClient.getBalance({ address: address as `0x${string}` });
}

/**
 * Check if session key has sufficient balance
 * @param address - Session key address
 * @returns true if balance is sufficient
 */
export async function hasSessionKeySufficientBalance(address: string): Promise<boolean> {
	const balance = await getSessionKeyBalance(address);
	const minBalance = await calculateMinBalance();
	return balance >= minBalance;
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
	
	// Calculate fund amount if not provided
	const fundAmount = amount ?? await calculateFundAmount();
	
	// Ensure fund amount meets minimum requirement
	const minBalance = await calculateMinBalance();
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
 * @returns true if balance is now sufficient
 */
export async function ensureSessionKeyBalance(sessionKeyAddress: string): Promise<boolean> {
	const balance = await getSessionKeyBalance(sessionKeyAddress);
	const minBalance = await calculateMinBalance();
	
	if (balance >= minBalance) {
		console.log(`Session key balance sufficient: ${formatEther(balance)} ETH (min: ${formatEther(minBalance)} ETH)`);
		return true;
	}
	
	console.log(`Session key balance low (${formatEther(balance)} ETH), need at least ${formatEther(minBalance)} ETH, funding...`);
	
	try {
		await fundSessionKey(sessionKeyAddress);
		return true;
	} catch (error) {
		console.error('Failed to fund session key:', error);
		return false;
	}
}

/**
 * Check if there is a valid session key stored
 * @returns Stored session key data or null if not found/expired
 */
export function getStoredSessionKey(): StoredSessionKey | null {
	if (!browser) return null;

	const stored = localStorage.getItem(SESSION_KEY_STORAGE);
	if (!stored) return null;

	try {
		const data: StoredSessionKey = JSON.parse(stored);

		// Check if expired
		if (Date.now() / 1000 > data.validUntil) {
			localStorage.removeItem(SESSION_KEY_STORAGE);
			return null;
		}

		return data;
	} catch {
		localStorage.removeItem(SESSION_KEY_STORAGE);
		return null;
	}
}

/**
 * Check if stored session key belongs to current wallet
 * @returns true if session key is valid for current wallet
 */
export async function isSessionKeyValidForCurrentWallet(): Promise<boolean> {
	const sessionKey = getStoredSessionKey();
	if (!sessionKey) return false;

	try {
		const account = await getEthereumAccount();
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
	expiresInSeconds: number = SESSION_KEY_DURATION
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
 * Also creates Irys Balance Approval for gasless uploads
 * @returns Created session key data
 */
export async function createSessionKey(): Promise<StoredSessionKey> {
	const account = await getEthereumAccount();
	const sessionKeyManager = getSessionKeyManagerAddress();
	const blogHub = getBlogHubContractAddress();

	// 1. Generate temporary key pair using viem
	const privateKey = generatePrivateKey();
	const sessionKeyAccount = privateKeyToAccount(privateKey);

	// 2. Set validity period (use chain timestamp to avoid local/chain time drift)
	const publicClient = getPublicClient();
	const latestBlock = await publicClient.getBlock({ blockTag: 'latest' });
	const validAfter = Number(latestBlock.timestamp);
	const validUntil = validAfter + SESSION_KEY_DURATION;

	// 3. Get wallet client and register session key on blockchain
	const walletClient = await getWalletClient();

	const txHash = await walletClient.writeContract({
		address: sessionKeyManager,
		abi: SESSION_KEY_MANAGER_ABI,
		functionName: 'registerSessionKey',
		args: [
			sessionKeyAccount.address,
			validAfter,
			validUntil,
			blogHub,
			ALLOWED_SELECTORS,
			DEFAULT_SPENDING_LIMIT
		]
	});
	await publicClient.waitForTransactionReceipt({ hash: txHash });

	// 4. Create Irys Balance Approval for the Session Key
	// This allows the Session Key to upload using the main account's Irys balance
	try {
		const irysNetwork = getIrysNetwork();
		const uploader = irysNetwork === 'mainnet' 
			? await getIrysUploader() 
			: await getIrysUploaderDevnet();
		await createIrysBalanceApproval(uploader, sessionKeyAccount.address, SESSION_KEY_DURATION);
	} catch (error) {
		console.warn('Failed to create Irys Balance Approval, continuing anyway:', error);
	}

	// 5. Save to localStorage
	const sessionKeyData: StoredSessionKey = {
		address: sessionKeyAccount.address,
		privateKey: privateKey,
		owner: account,
		validUntil
	};

	localStorage.setItem(SESSION_KEY_STORAGE, JSON.stringify(sessionKeyData));

	// 6. Fund session key with initial balance for gas fees (for smart contract calls)
	await ensureSessionKeyBalance(sessionKeyAccount.address);

	return sessionKeyData;
}

/**
 * Revoke the current session key
 */
export async function revokeSessionKey(): Promise<void> {
	const sessionKey = getStoredSessionKey();
	if (!sessionKey) return;

	const sessionKeyManager = getSessionKeyManagerAddress();
	const walletClient = await getWalletClient();

	await walletClient.writeContract({
		address: sessionKeyManager,
		abi: SESSION_KEY_MANAGER_ABI,
		functionName: 'revokeSessionKey',
		args: [sessionKey.address as `0x${string}`]
	});

	localStorage.removeItem(SESSION_KEY_STORAGE);
}

/**
 * Clear session key from local storage without revoking on-chain
 * Use when switching wallets or cleaning up
 */
export function clearLocalSessionKey(): void {
	if (browser) {
		localStorage.removeItem(SESSION_KEY_STORAGE);
	}
}

export async function isSessionKeyValidForPublish(sessionKey: StoredSessionKey): Promise<boolean> {
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

		if ((data.sessionKey as string).toLowerCase() === '0x0000000000000000000000000000000000000000') return false;
		if ((data.allowedContract as string).toLowerCase() !== blogHub.toLowerCase()) return false;

		const selectors = (data.allowedSelectors as readonly string[]).map((s) => s.toLowerCase());
		if (!selectors.includes(PUBLISH_SELECTOR.toLowerCase())) return false;

		const now = Number(latestBlock.timestamp);
		if (now < Number(data.validAfter)) return false;
		if (now > Number(data.validUntil)) return false;

		return true;
	} catch {
		return false;
	}
}

/**
 * Get session key account for signing
 * @returns Account instance or null if no valid session key
 */
export function getSessionKeyAccount() {
	const sessionKey = getStoredSessionKey();
	if (!sessionKey) return null;

	return privateKeyToAccount(sessionKey.privateKey as `0x${string}`);
}
