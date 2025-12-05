/**
 * Smart contract interaction utilities
 * Handles publishing articles to BlogHub contract
 */

import { createWalletClient, createPublicClient, custom, http } from 'viem'
import { optimismSepolia } from 'viem/chains'

/**
 * Contract error codes for i18n
 */
export type ContractErrorCode =
	| 'user_rejected'
	| 'insufficient_funds'
	| 'network_error'
	| 'contract_reverted'
	| 'gas_estimation_failed'
	| 'nonce_too_low'
	| 'replacement_underpriced'
	| 'wallet_not_connected'
	| 'wrong_network'
	| 'timeout'
	| 'unknown_error'

/**
 * Custom error class for contract interactions
 */
export class ContractError extends Error {
	public readonly code: ContractErrorCode
	public readonly originalError?: Error

	constructor(code: ContractErrorCode, message: string, originalError?: Error) {
		super(message)
		this.name = 'ContractError'
		this.code = code
		this.originalError = originalError
	}
}

/**
 * Parse error and return a ContractError with appropriate code
 */
function parseContractError(error: unknown): ContractError {
	const errorMessage = error instanceof Error ? error.message : String(error)
	const lowerMessage = errorMessage.toLowerCase()

	// User rejected transaction
	if (
		lowerMessage.includes('user rejected') ||
		lowerMessage.includes('user denied') ||
		lowerMessage.includes('rejected the request') ||
		lowerMessage.includes('user cancelled') ||
		lowerMessage.includes('user canceled')
	) {
		return new ContractError(
			'user_rejected',
			'User rejected the transaction.',
			error instanceof Error ? error : undefined
		)
	}

	// Insufficient funds
	if (
		lowerMessage.includes('insufficient funds') ||
		lowerMessage.includes('insufficient balance') ||
		lowerMessage.includes('not enough balance')
	) {
		return new ContractError(
			'insufficient_funds',
			'Insufficient funds to complete the transaction.',
			error instanceof Error ? error : undefined
		)
	}

	// Gas estimation failed
	if (
		lowerMessage.includes('gas required exceeds') ||
		lowerMessage.includes('gas estimation') ||
		lowerMessage.includes('out of gas') ||
		lowerMessage.includes('intrinsic gas too low')
	) {
		return new ContractError(
			'gas_estimation_failed',
			'Failed to estimate gas for the transaction.',
			error instanceof Error ? error : undefined
		)
	}

	// Contract reverted
	if (
		lowerMessage.includes('revert') ||
		lowerMessage.includes('execution reverted') ||
		lowerMessage.includes('transaction failed')
	) {
		return new ContractError(
			'contract_reverted',
			'The contract reverted the transaction.',
			error instanceof Error ? error : undefined
		)
	}

	// Nonce issues
	if (lowerMessage.includes('nonce too low') || lowerMessage.includes('nonce has already been used')) {
		return new ContractError(
			'nonce_too_low',
			'Nonce is too low or has already been used.',
			error instanceof Error ? error : undefined
		)
	}

	// Replacement transaction underpriced
	if (
		lowerMessage.includes('replacement transaction underpriced') ||
		lowerMessage.includes('transaction underpriced')
	) {
		return new ContractError(
			'replacement_underpriced',
			'Replacement transaction is underpriced.',
			error instanceof Error ? error : undefined
		)
	}

	// Network errors
	if (
		lowerMessage.includes('network') ||
		lowerMessage.includes('disconnected') ||
		lowerMessage.includes('connection') ||
		lowerMessage.includes('timeout') ||
		lowerMessage.includes('econnrefused')
	) {
		return new ContractError(
			'network_error',
			'Network error occurred.',
			error instanceof Error ? error : undefined
		)
	}

	// Wallet not connected
	if (
		lowerMessage.includes('no accounts') ||
		lowerMessage.includes('wallet not connected') ||
		lowerMessage.includes('not connected')
	) {
		return new ContractError(
			'wallet_not_connected',
			'Wallet is not connected.',
			error instanceof Error ? error : undefined
		)
	}

	// Wrong network
	if (
		lowerMessage.includes('wrong network') ||
		lowerMessage.includes('chain mismatch') ||
		lowerMessage.includes('switch') && lowerMessage.includes('chain')
	) {
		return new ContractError(
			'wrong_network',
			'Wrong network selected.',
			error instanceof Error ? error : undefined
		)
	}

	// Unknown error
	return new ContractError(
		'unknown_error',
		'An unknown error occurred.',
		error instanceof Error ? error : undefined
	)
}

// BlogHub contract ABI
const BLOGHUB_ABI = [
	{
		name: 'publish',
		type: 'function',
		inputs: [
			{ name: '_arweaveId', type: 'string' },
			{ name: '_categoryId', type: 'uint64' },
			{ name: '_royaltyBps', type: 'uint96' },
			{ name: '_originalAuthor', type: 'string' },
			{ name: '_title', type: 'string' },
			{ name: '_coverImage', type: 'string' }
		],
		outputs: [{ type: 'uint256' }],
		stateMutability: 'nonpayable'
	},
	{
		name: 'evaluate',
		type: 'function',
		inputs: [
			{ name: '_articleId', type: 'uint256' },
			{ name: '_score', type: 'uint8' },
			{ name: '_comment', type: 'string' },
			{ name: '_referrer', type: 'address' },
			{ name: '_parentCommentId', type: 'uint256' }
		],
		outputs: [],
		stateMutability: 'payable'
	},
	{
		name: 'follow',
		type: 'function',
		inputs: [
			{ name: '_target', type: 'address' },
			{ name: '_isFollow', type: 'bool' }
		],
		outputs: [],
		stateMutability: 'nonpayable'
	},
	{
		name: 'articles',
		type: 'function',
		inputs: [{ name: '_articleId', type: 'uint256' }],
		outputs: [
			{ name: 'arweaveId', type: 'string' },
			{ name: 'author', type: 'address' },
			{ name: 'categoryId', type: 'uint64' },
			{ name: 'royaltyBps', type: 'uint96' },
			{ name: 'originalAuthor', type: 'string' },
			{ name: 'title', type: 'string' },
			{ name: 'coverImage', type: 'string' },
			{ name: 'createdAt', type: 'uint256' },
			{ name: 'likes', type: 'uint256' },
			{ name: 'dislikes', type: 'uint256' },
			{ name: 'totalTips', type: 'uint256' }
		],
		stateMutability: 'view'
	}
] as const

// BlogHub contract address from runtime config
function getBlogHubContractAddress(): `0x${string}` {
	const config = useRuntimeConfig()
	return config.public.blogHubContractAddress as `0x${string}`
}

/**
 * Get public client for read-only contract calls
 */
function getPublicClient() {
	return createPublicClient({
		chain: optimismSepolia,
		transport: http()
	})
}

/**
 * Get Ethereum account from wallet
 */
async function getEthereumAccount(): Promise<`0x${string}`> {
	if (typeof window === 'undefined' || !window.ethereum) {
		throw new Error('Ethereum provider not found. Please install MetaMask or another wallet.')
	}
	const accounts = (await window.ethereum.request({ method: 'eth_requestAccounts' })) as `0x${string}`[]
	const account = accounts?.[0]
	if (!account) {
		throw new Error('No accounts found. Please connect your wallet.')
	}
	return account
}

/**
 * Ensure wallet is connected to the correct chain, switch if necessary
 */
async function ensureCorrectChain(): Promise<void> {
	if (typeof window === 'undefined' || !window.ethereum) {
		throw new Error('Ethereum provider not found. Please install MetaMask or another wallet.')
	}

	const targetChainId = optimismSepolia.id
	const targetChainIdHex = `0x${targetChainId.toString(16)}`

	try {
		// Get current chain ID
		const currentChainIdHex = (await window.ethereum.request({ method: 'eth_chainId' })) as string
		const currentChainId = parseInt(currentChainIdHex, 16)

		if (currentChainId === targetChainId) {
			return // Already on correct chain
		}

		console.log(`Switching from chain ${currentChainId} to ${targetChainId} (${optimismSepolia.name})`)

		// Try to switch to the target chain
		try {
			await window.ethereum.request({
				method: 'wallet_switchEthereumChain',
				params: [{ chainId: targetChainIdHex }]
			})
		} catch (switchError: unknown) {
			// Chain not added to wallet, try to add it
			if ((switchError as { code?: number })?.code === 4902) {
				await window.ethereum.request({
					method: 'wallet_addEthereumChain',
					params: [
						{
							chainId: targetChainIdHex,
							chainName: optimismSepolia.name,
							nativeCurrency: optimismSepolia.nativeCurrency,
							rpcUrls: [optimismSepolia.rpcUrls.default.http[0]],
							blockExplorerUrls: [optimismSepolia.blockExplorers?.default.url]
						}
					]
				})
			} else {
				throw switchError
			}
		}
	} catch (error) {
		throw new Error(
			`Failed to switch to ${optimismSepolia.name}: ${error instanceof Error ? error.message : 'User rejected or unknown error'}`
		)
	}
}

/**
 * Get wallet client for contract interaction
 */
async function getWalletClient() {
	if (typeof window === 'undefined' || !window.ethereum) {
		throw new Error('Ethereum provider not found. Please install MetaMask or another wallet.')
	}

	// Ensure we're on the correct chain before creating client
	await ensureCorrectChain()

	const account = await getEthereumAccount()

	return createWalletClient({
		account,
		chain: optimismSepolia,
		transport: custom(window.ethereum)
	})
}

/**
 * Publish article to BlogHub contract
 * @param arweaveId - Arweave hash of article content
 * @param categoryId - Category ID (0-based)
 * @param royaltyBps - Royalty basis points (0-10000, where 100 = 1%)
 * @param originalAuthor - Original author name (optional, for repost scenarios)
 * @param title - Article title (max 128 bytes)
 * @param coverImage - Cover image Arweave hash (optional, max 64 bytes)
 * @returns Transaction hash
 */
export async function publishToContract(
	arweaveId: string,
	categoryId: bigint,
	royaltyBps: bigint,
	originalAuthor: string = '',
	title: string = '',
	coverImage: string = ''
): Promise<string> {
	if (!arweaveId) {
		throw new Error('Arweave ID is required')
	}

	if (categoryId < 0n) {
		throw new Error('Category ID must be non-negative')
	}

	if (royaltyBps > 10000n) {
		throw new Error('Royalty percentage cannot exceed 100% (10000 basis points)')
	}

	if (originalAuthor && originalAuthor.length > 64) {
		throw new Error('Original author name is too long (max 64 characters)')
	}

	if (title && new TextEncoder().encode(title).length > 128) {
		throw new Error('Title is too long (max 128 bytes)')
	}

	if (coverImage && coverImage.length > 64) {
		throw new Error('Cover image hash is too long (max 64 characters)')
	}

	try {
		const walletClient = await getWalletClient()

		// Call publish function
		const txHash = await walletClient.writeContract({
			address: getBlogHubContractAddress(),
			abi: BLOGHUB_ABI,
			functionName: 'publish',
			args: [arweaveId, categoryId, royaltyBps, originalAuthor, title, coverImage]
		})

		console.log(`Article published to contract. Tx: ${txHash}`)
		return txHash
	} catch (error) {
		console.error('Error publishing to contract:', error)
		throw parseContractError(error)
	}
}

/**
 * Score enum for article evaluation
 */
export enum EvaluationScore {
	Neutral = 0,
	Like = 1,
	Dislike = 2
}

/**
 * Evaluate article (like/dislike/tip)
 * @param articleId - Article ID to evaluate
 * @param score - 0=neutral, 1=like, 2=dislike
 * @param comment - Comment text
 * @param referrer - Referrer address (optional)
 * @param parentCommentId - Parent comment ID for replies (optional)
 * @param tipAmount - Tip amount in wei (optional)
 * @returns Transaction hash
 */
export async function evaluateArticle(
	articleId: bigint,
	score: EvaluationScore,
	comment: string,
	referrer: `0x${string}` = '0x0000000000000000000000000000000000000000',
	parentCommentId: bigint = 0n,
	tipAmount: bigint = 0n
): Promise<string> {
	if (articleId < 0n) {
		throw new Error('Article ID must be non-negative')
	}

	if (score < 0 || score > 2) {
		throw new Error('Score must be 0 (neutral), 1 (like), or 2 (dislike)')
	}

	try {
		const walletClient = await getWalletClient()

		const txHash = await walletClient.writeContract({
			address: getBlogHubContractAddress(),
			abi: BLOGHUB_ABI,
			functionName: 'evaluate',
			args: [articleId, score, comment, referrer, parentCommentId],
			value: tipAmount
		})

		console.log(`Article evaluated. Tx: ${txHash}`)
		return txHash
	} catch (error) {
		console.error('Error evaluating article:', error)
		throw parseContractError(error)
	}
}

/**
 * Follow or unfollow a user
 * @param targetAddress - Address to follow/unfollow
 * @param isFollow - true to follow, false to unfollow
 * @returns Transaction hash
 */
export async function followUser(targetAddress: `0x${string}`, isFollow: boolean): Promise<string> {
	if (!targetAddress || targetAddress === '0x0000000000000000000000000000000000000000') {
		throw new Error('Invalid target address')
	}

	try {
		const walletClient = await getWalletClient()

		const txHash = await walletClient.writeContract({
			address: getBlogHubContractAddress(),
			abi: BLOGHUB_ABI,
			functionName: 'follow',
			args: [targetAddress, isFollow]
		})

		console.log(`Follow status updated. Tx: ${txHash}`)
		return txHash
	} catch (error) {
		console.error('Error updating follow status:', error)
		throw parseContractError(error)
	}
}

/**
 * Article data structure returned from contract
 */
export interface ArticleData {
	arweaveId: string
	author: `0x${string}`
	categoryId: bigint
	royaltyBps: bigint
	originalAuthor: string
	title: string
	coverImage: string
	createdAt: bigint
	likes: bigint
	dislikes: bigint
	totalTips: bigint
}

/**
 * Read article information from contract
 * @param articleId - Article ID to query
 * @returns Article data
 */
export async function getArticle(articleId: bigint): Promise<ArticleData> {
	if (articleId < 0n) {
		throw new Error('Article ID must be non-negative')
	}

	try {
		const publicClient = getPublicClient()

		const result = await publicClient.readContract({
			address: getBlogHubContractAddress(),
			abi: BLOGHUB_ABI,
			functionName: 'articles',
			args: [articleId]
		})

		// Result is a tuple, map to named object
		const [arweaveId, author, categoryId, royaltyBps, originalAuthor, title, coverImage, createdAt, likes, dislikes, totalTips] =
			result as [string, `0x${string}`, bigint, bigint, string, string, string, bigint, bigint, bigint, bigint]

		return {
			arweaveId,
			author,
			categoryId,
			royaltyBps,
			originalAuthor,
			title,
			coverImage,
			createdAt,
			likes,
			dislikes,
			totalTips
		}
	} catch (error) {
		console.error('Error reading article:', error)
		throw parseContractError(error)
	}
}