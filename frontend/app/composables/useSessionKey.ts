/**
 * Session Key management for seamless interactions
 * Allows users to perform frequent operations without signing each time
 */

import { createWalletClient, custom } from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { optimismSepolia } from 'viem/chains'

const SESSION_KEY_STORAGE = 'dblog_session_key'

/**
 * Stored session key data structure
 */
export interface StoredSessionKey {
	address: string
	privateKey: string
	owner: string
	validUntil: number
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
	}
] as const

// Allowed function selectors for session key
const ALLOWED_SELECTORS: `0x${string}`[] = [
	'0xff1f090a', // evaluate
	'0xdffd40f2', // likeComment
	'0x63c3cc16' // follow
]

// Default spending limit (10 ETH)
const DEFAULT_SPENDING_LIMIT = BigInt('10000000000000000000')

// Session key validity duration (7 days in seconds)
const SESSION_KEY_DURATION = 7 * 24 * 60 * 60

/**
 * Get contract addresses from runtime config
 */
function getContractAddresses() {
	const config = useRuntimeConfig()
	return {
		sessionKeyManager: config.public.sessionKeyManagerAddress as `0x${string}`,
		blogHub: config.public.blogHubContractAddress as `0x${string}`
	}
}

/**
 * Get Ethereum account from wallet
 */
async function getEthereumAccount(): Promise<`0x${string}`> {
	if (typeof window === 'undefined' || !window.ethereum) {
		throw new Error('Ethereum provider not found')
	}
	const accounts = (await window.ethereum.request({ method: 'eth_requestAccounts' })) as `0x${string}`[]
	const account = accounts?.[0]
	if (!account) {
		throw new Error('No accounts found')
	}
	return account
}

/**
 * Get wallet client for contract interaction
 */
async function getWalletClient() {
	if (typeof window === 'undefined' || !window.ethereum) {
		throw new Error('Ethereum provider not found')
	}

	const account = await getEthereumAccount()

	return createWalletClient({
		account,
		chain: optimismSepolia,
		transport: custom(window.ethereum)
	})
}

/**
 * Check if there is a valid session key stored
 * @returns Stored session key data or null if not found/expired
 */
export function getStoredSessionKey(): StoredSessionKey | null {
	if (typeof window === 'undefined') return null

	const stored = localStorage.getItem(SESSION_KEY_STORAGE)
	if (!stored) return null

	try {
		const data: StoredSessionKey = JSON.parse(stored)

		// Check if expired
		if (Date.now() / 1000 > data.validUntil) {
			localStorage.removeItem(SESSION_KEY_STORAGE)
			return null
		}

		return data
	} catch {
		localStorage.removeItem(SESSION_KEY_STORAGE)
		return null
	}
}

/**
 * Check if stored session key belongs to current wallet
 * @returns true if session key is valid for current wallet
 */
export async function isSessionKeyValidForCurrentWallet(): Promise<boolean> {
	const sessionKey = getStoredSessionKey()
	if (!sessionKey) return false

	try {
		const account = await getEthereumAccount()
		return account.toLowerCase() === sessionKey.owner.toLowerCase()
	} catch {
		return false
	}
}

/**
 * Generate and register a new session key
 * @returns Created session key data
 */
export async function createSessionKey(): Promise<StoredSessionKey> {
	const account = await getEthereumAccount()
	const { sessionKeyManager, blogHub } = getContractAddresses()

	// 1. Generate temporary key pair using viem
	const privateKey = generatePrivateKey()
	const sessionKeyAccount = privateKeyToAccount(privateKey)

	// 2. Set validity period
	const validAfter = Math.floor(Date.now() / 1000)
	const validUntil = validAfter + SESSION_KEY_DURATION

	// 3. Get wallet client and register session key
	const walletClient = await getWalletClient()

	await walletClient.writeContract({
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
	})

	// 4. Save to localStorage
	const sessionKeyData: StoredSessionKey = {
		address: sessionKeyAccount.address,
		privateKey: privateKey,
		owner: account,
		validUntil
	}

	localStorage.setItem(SESSION_KEY_STORAGE, JSON.stringify(sessionKeyData))

	return sessionKeyData
}

/**
 * Revoke the current session key
 */
export async function revokeSessionKey(): Promise<void> {
	const sessionKey = getStoredSessionKey()
	if (!sessionKey) return

	const { sessionKeyManager } = getContractAddresses()
	const walletClient = await getWalletClient()

	await walletClient.writeContract({
		address: sessionKeyManager,
		abi: SESSION_KEY_MANAGER_ABI,
		functionName: 'revokeSessionKey',
		args: [sessionKey.address as `0x${string}`]
	})

	localStorage.removeItem(SESSION_KEY_STORAGE)
}

/**
 * Clear session key from local storage without revoking on-chain
 * Use when switching wallets or cleaning up
 */
export function clearLocalSessionKey(): void {
	if (typeof window !== 'undefined') {
		localStorage.removeItem(SESSION_KEY_STORAGE)
	}
}

/**
 * Get session key account for signing
 * @returns Account instance or null if no valid session key
 */
export function getSessionKeyAccount() {
	const sessionKey = getStoredSessionKey()
	if (!sessionKey) return null

	return privateKeyToAccount(sessionKey.privateKey as `0x${string}`)
}
