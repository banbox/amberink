/**
 * Smart contract interaction utilities
 * Handles publishing articles to BlogHub contract
 */

import { createWalletClient, createPublicClient, http, encodeFunctionData } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { getBlogHubContractAddress, getSessionKeyManagerAddress, getRpcUrl, getChainId } from '$lib/config';
import { getChainConfig } from '$lib/chain';
import { getEthereumAccount, getWalletClient, getPublicClient } from '$lib/wallet';
import { ZERO_ADDRESS } from '$lib/utils';
import type { StoredSessionKey } from '$lib/sessionKey';

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
	| 'unknown_error';

/**
 * Custom error class for contract interactions
 */
export class ContractError extends Error {
	public readonly code: ContractErrorCode;
	public readonly originalError?: Error;

	constructor(code: ContractErrorCode, message: string, originalError?: Error) {
		super(message);
		this.name = 'ContractError';
		this.code = code;
		this.originalError = originalError;
	}
}

/**
 * Parse error and return a ContractError with appropriate code
 */
function parseContractError(error: unknown): ContractError {
	const errorMessage = error instanceof Error ? error.message : String(error);
	const lowerMessage = errorMessage.toLowerCase();

	// Session key not authorized for specific operation (selector missing)
	// Keep original message so caller can detect and auto-recreate session key
	if (lowerMessage.includes('not authorized for this operation')) {
		return new ContractError(
			'contract_reverted',
			errorMessage, // Preserve original message for caller to detect
			error instanceof Error ? error : undefined
		);
	}

	// Session key specific errors (general)
	if (
		lowerMessage.includes('sessionkeynotactive') ||
		lowerMessage.includes('0x62db3e42') ||
		lowerMessage.includes('session key is not') ||
		lowerMessage.includes('session key has expired') ||
		lowerMessage.includes('session key spending limit exceeded')
	) {
		return new ContractError(
			'contract_reverted',
			'Session key is not active or has expired. Please create a new session key.',
			error instanceof Error ? error : undefined
		);
	}

	// InvalidSignature error from SessionKeyManager
	if (lowerMessage.includes('invalidsignature') || lowerMessage.includes('0x8baa579f')) {
		return new ContractError(
			'contract_reverted',
			'Invalid signature. The session key signature verification failed. This may be due to callData mismatch.',
			error instanceof Error ? error : undefined
		);
	}

	// SignatureExpired error
	if (lowerMessage.includes('signatureexpired') || lowerMessage.includes('0x0819bdcd')) {
		return new ContractError(
			'contract_reverted',
			'Signature has expired. Please try again.',
			error instanceof Error ? error : undefined
		);
	}

	// SessionKeyValidationFailed error
	if (lowerMessage.includes('sessionkeyvalidationfailed')) {
		return new ContractError(
			'contract_reverted',
			'Session key validation failed. The session key may not be authorized for this operation.',
			error instanceof Error ? error : undefined
		);
	}

	// Security errors - self-actions
	if (lowerMessage.includes('cannotselfevaluate')) {
		return new ContractError(
			'contract_reverted',
			'You cannot like or dislike your own article.',
			error instanceof Error ? error : undefined
		);
	}

	if (lowerMessage.includes('cannotselffollow')) {
		return new ContractError(
			'contract_reverted',
			'You cannot follow yourself.',
			error instanceof Error ? error : undefined
		);
	}

	if (lowerMessage.includes('cannotselfcollect')) {
		return new ContractError(
			'contract_reverted',
			'You cannot collect your own article.',
			error instanceof Error ? error : undefined
		);
	}

	if (lowerMessage.includes('cannotlikeowncomment')) {
		return new ContractError(
			'contract_reverted',
			'You cannot like your own comment.',
			error instanceof Error ? error : undefined
		);
	}

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
		);
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
		);
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
		);
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
		);
	}

	// Nonce issues
	if (lowerMessage.includes('nonce too low') || lowerMessage.includes('nonce has already been used')) {
		return new ContractError(
			'nonce_too_low',
			'Nonce is too low or has already been used.',
			error instanceof Error ? error : undefined
		);
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
		);
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
		);
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
		);
	}

	// Wrong network
	if (
		lowerMessage.includes('wrong network') ||
		lowerMessage.includes('chain mismatch') ||
		(lowerMessage.includes('switch') && lowerMessage.includes('chain'))
	) {
		return new ContractError(
			'wrong_network',
			'Wrong network selected.',
			error instanceof Error ? error : undefined
		);
	}

	// Unknown error
	return new ContractError(
		'unknown_error',
		'An unknown error occurred.',
		error instanceof Error ? error : undefined
	);
}

// BlogHub contract ABI (includes SessionKeyManager errors for proper decoding)
const BLOGHUB_ABI = [
	// BlogHub errors
	{
		type: 'error',
		name: 'SessionKeyNotActive',
		inputs: []
	},
	{
		type: 'error',
		name: 'SessionKeyManagerNotSet',
		inputs: []
	},
	{
		type: 'error',
		name: 'SessionKeyValidationFailed',
		inputs: []
	},
	// SessionKeyManager errors
	{
		type: 'error',
		name: 'InvalidSessionKey',
		inputs: []
	},
	{
		type: 'error',
		name: 'SessionKeyExpired',
		inputs: []
	},
	{
		type: 'error',
		name: 'UnauthorizedContract',
		inputs: []
	},
	{
		type: 'error',
		name: 'UnauthorizedSelector',
		inputs: []
	},
	{
		type: 'error',
		name: 'SpendingLimitExceeded',
		inputs: []
	},
	{
		type: 'error',
		name: 'InvalidSignature',
		inputs: []
	},
	{
		type: 'error',
		name: 'SignatureExpired',
		inputs: []
	},
	{
		type: 'error',
		name: 'InvalidNonce',
		inputs: []
	},
	{
		name: 'publish',
		type: 'function',
		inputs: [
			{
				name: 'params',
				type: 'tuple',
				components: [
					{ name: 'arweaveId', type: 'string' },
					{ name: 'categoryId', type: 'uint16' },
					{ name: 'royaltyBps', type: 'uint96' },
					{ name: 'originalAuthor', type: 'string' },
					{ name: 'title', type: 'string' },
					{ name: 'summary', type: 'string' },
					{ name: 'trueAuthor', type: 'address' },
					{ name: 'collectPrice', type: 'uint96' },
					{ name: 'maxCollectSupply', type: 'uint32' },
					{ name: 'originality', type: 'uint8' }
				]
			}
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
		name: 'collect',
		type: 'function',
		inputs: [
			{ name: '_articleId', type: 'uint256' },
			{ name: '_referrer', type: 'address' }
		],
		outputs: [],
		stateMutability: 'payable'
	},
	{
		name: 'likeComment',
		type: 'function',
		inputs: [
			{ name: '_articleId', type: 'uint256' },
			{ name: '_commentId', type: 'uint256' },
			{ name: '_commenter', type: 'address' },
			{ name: '_referrer', type: 'address' }
		],
		outputs: [],
		stateMutability: 'payable'
	},
	{
		name: 'articles',
		type: 'function',
		inputs: [{ name: '_articleId', type: 'uint256' }],
		outputs: [
			{ name: 'arweaveHash', type: 'string' },
			{ name: 'author', type: 'address' },
			{ name: 'originalAuthor', type: 'string' },
			{ name: 'title', type: 'string' },
			{ name: 'categoryId', type: 'uint64' },
			{ name: 'timestamp', type: 'uint64' }
		],
		stateMutability: 'view'
	},
	{
		name: 'publishWithSessionKey',
		type: 'function',
		inputs: [
			{ name: 'owner', type: 'address' },
			{ name: 'sessionKey', type: 'address' },
			{
				name: 'params',
				type: 'tuple',
				components: [
					{ name: 'arweaveId', type: 'string' },
					{ name: 'categoryId', type: 'uint16' },
					{ name: 'royaltyBps', type: 'uint96' },
					{ name: 'originalAuthor', type: 'string' },
					{ name: 'title', type: 'string' },
					{ name: 'summary', type: 'string' },
					{ name: 'trueAuthor', type: 'address' },
					{ name: 'collectPrice', type: 'uint96' },
					{ name: 'maxCollectSupply', type: 'uint32' },
					{ name: 'originality', type: 'uint8' }
				]
			},
			{ name: 'deadline', type: 'uint256' },
			{ name: 'signature', type: 'bytes' }
		],
		outputs: [{ type: 'uint256' }],
		stateMutability: 'nonpayable'
	},
	{
		name: 'evaluateWithSessionKey',
		type: 'function',
		inputs: [
			{ name: 'owner', type: 'address' },
			{ name: 'sessionKey', type: 'address' },
			{ name: '_articleId', type: 'uint256' },
			{ name: '_score', type: 'uint8' },
			{ name: '_comment', type: 'string' },
			{ name: '_referrer', type: 'address' },
			{ name: '_parentCommentId', type: 'uint256' },
			{ name: 'deadline', type: 'uint256' },
			{ name: 'signature', type: 'bytes' }
		],
		outputs: [],
		stateMutability: 'payable'
	},
	{
		name: 'followWithSessionKey',
		type: 'function',
		inputs: [
			{ name: 'owner', type: 'address' },
			{ name: 'sessionKey', type: 'address' },
			{ name: '_target', type: 'address' },
			{ name: '_isFollow', type: 'bool' },
			{ name: 'deadline', type: 'uint256' },
			{ name: 'signature', type: 'bytes' }
		],
		outputs: [],
		stateMutability: 'nonpayable'
	},
	{
		name: 'collectWithSessionKey',
		type: 'function',
		inputs: [
			{ name: 'owner', type: 'address' },
			{ name: 'sessionKey', type: 'address' },
			{ name: '_articleId', type: 'uint256' },
			{ name: '_referrer', type: 'address' },
			{ name: 'deadline', type: 'uint256' },
			{ name: 'signature', type: 'bytes' }
		],
		outputs: [],
		stateMutability: 'payable'
	},
	{
		name: 'likeCommentWithSessionKey',
		type: 'function',
		inputs: [
			{ name: 'owner', type: 'address' },
			{ name: 'sessionKey', type: 'address' },
			{ name: '_articleId', type: 'uint256' },
			{ name: '_commentId', type: 'uint256' },
			{ name: '_commenter', type: 'address' },
			{ name: '_referrer', type: 'address' },
			{ name: 'deadline', type: 'uint256' },
			{ name: 'signature', type: 'bytes' }
		],
		outputs: [],
		stateMutability: 'payable'
	},
	{
		name: 'updateProfile',
		type: 'function',
		inputs: [
			{ name: '_nickname', type: 'string' },
			{ name: '_avatar', type: 'string' },
			{ name: '_bio', type: 'string' }
		],
		outputs: [],
		stateMutability: 'nonpayable'
	},
	{
		name: 'editArticle',
		type: 'function',
		inputs: [
			{
				name: 'params',
				type: 'tuple',
				components: [
					{ name: 'articleId', type: 'uint256' },
					{ name: 'originalAuthor', type: 'string' },
					{ name: 'title', type: 'string' },
					{ name: 'summary', type: 'string' },
					{ name: 'categoryId', type: 'uint16' }
				]
			}
		],
		outputs: [],
		stateMutability: 'nonpayable'
	},
	{
		name: 'editArticleWithSessionKey',
		type: 'function',
		inputs: [
			{ name: 'owner', type: 'address' },
			{ name: 'sessionKey', type: 'address' },
			{
				name: 'params',
				type: 'tuple',
				components: [
					{ name: 'articleId', type: 'uint256' },
					{ name: 'originalAuthor', type: 'string' },
					{ name: 'title', type: 'string' },
					{ name: 'summary', type: 'string' },
					{ name: 'categoryId', type: 'uint16' }
				]
			},
			{ name: 'deadline', type: 'uint256' },
			{ name: 'signature', type: 'bytes' }
		],
		outputs: [],
		stateMutability: 'nonpayable'
	}
] as const;


/**
 * Ensure wallet is connected to the correct chain, switch if necessary
 */
async function ensureCorrectChain(): Promise<void> {
	if (typeof window === 'undefined' || !window.ethereum) {
		throw new Error('Ethereum provider not found. Please install MetaMask or another wallet.');
	}

	const chain = getChainConfig();
	const targetChainId = chain.id;
	const targetChainIdHex = `0x${targetChainId.toString(16)}`;

	// Get current chain ID
	const currentChainIdHex = (await window.ethereum.request({ method: 'eth_chainId' })) as string;
	const currentChainId = parseInt(currentChainIdHex, 16);

	if (currentChainId === targetChainId) {
		return; // Already on correct chain
	}

	console.log(`Switching from chain ${currentChainId} to ${targetChainId} (${chain.name})`);

	// Try to switch to the target chain
	try {
		await window.ethereum.request({
			method: 'wallet_switchEthereumChain',
			params: [{ chainId: targetChainIdHex }]
		});
	} catch (switchError: unknown) {
		const errorCode = (switchError as { code?: number })?.code;

		// Chain not added to wallet (4902), try to add it
		if (errorCode === 4902) {
			try {
				await window.ethereum.request({
					method: 'wallet_addEthereumChain',
					params: [
						{
							chainId: targetChainIdHex,
							chainName: chain.name,
							nativeCurrency: chain.nativeCurrency,
							rpcUrls: [chain.rpcUrls.default.http[0]],
							blockExplorerUrls: chain.blockExplorers ? [chain.blockExplorers.default.url] : undefined
						}
					]
				});
			} catch (addError: unknown) {
				// If adding fails (e.g., RPC URL conflict), provide helpful message
				const addErrorCode = (addError as { code?: number })?.code;
				if (addErrorCode === -32603) {
					// Internal error - likely RPC URL conflict with existing network
					throw new Error(
						`Cannot add ${chain.name} (chainId: ${targetChainId}). ` +
						`Please manually add or switch to the network in MetaMask:\n` +
						`- Network Name: ${chain.name}\n` +
						`- RPC URL: ${chain.rpcUrls.default.http[0]}\n` +
						`- Chain ID: ${targetChainId}\n` +
						`- Currency: ${chain.nativeCurrency.symbol}`
					);
				}
				throw addError;
			}
		} else if (errorCode === 4001) {
			// User rejected the request
			throw new Error('User rejected the network switch request.');
		} else {
			throw switchError;
		}
	}
}

/**
 * Get wallet client with chain validation
 */
async function getWalletClientWithChainCheck() {
	await ensureCorrectChain();
	return getWalletClient();
}

/**
 * Publish article to BlogHub contract
 * @param arweaveId - Irys mutable folder manifest ID (content at index.md, cover at coverImage)
 * @param categoryId - Category ID (0-based)
 * @param royaltyBps - Royalty basis points (0-10000, where 100 = 1%)
 * @param originalAuthor - Original author name (optional, for repost scenarios)
 * @param title - Article title (max 128 bytes)
 * @param summary - Article summary (max 512 bytes)
 * @returns Transaction hash
 */
export async function publishToContract(
	arweaveId: string,
	categoryId: bigint,
	royaltyBps: bigint,
	originalAuthor: string = '',
	title: string = '',
	summary: string = '',
	trueAuthor: `0x${string}` = '0x0000000000000000000000000000000000000000',
	collectPrice: bigint = 0n,
	maxCollectSupply: bigint = 0n,
	originality: number = 0
): Promise<string> {
	if (!arweaveId) {
		throw new Error('Arweave ID is required');
	}

	if (categoryId < 0n) {
		throw new Error('Category ID must be non-negative');
	}

	if (royaltyBps > 10000n) {
		throw new Error('Royalty percentage cannot exceed 100% (10000 basis points)');
	}

	if (originalAuthor && new TextEncoder().encode(originalAuthor).length > 64) {
		throw new Error('Original author name is too long (max 64 bytes)');
	}

	if (title && new TextEncoder().encode(title).length > 128) {
		throw new Error('Title is too long (max 128 bytes)');
	}

	if (summary && new TextEncoder().encode(summary).length > 512) {
		throw new Error('Summary is too long (max 512 bytes)');
	}

	try {
		const walletClient = await getWalletClientWithChainCheck();

		// Call publish function with PublishParams struct
		const txHash = await walletClient.writeContract({
			address: getBlogHubContractAddress(),
			abi: BLOGHUB_ABI,
			functionName: 'publish',
			args: [
				{
					arweaveId,
					categoryId: Number(categoryId),
					royaltyBps: BigInt(royaltyBps),
					originalAuthor,
					title,
					summary,
					trueAuthor,
					collectPrice: BigInt(collectPrice),
					maxCollectSupply: Number(maxCollectSupply),
					originality: Number(originality)
				}
			]
		});

		console.log(`Article published to contract. Tx: ${txHash}`);
		return txHash;
	} catch (error) {
		console.error('Error publishing to contract:', error);
		throw parseContractError(error);
	}
}

export async function collectArticle(
	articleId: bigint,
	referrer: `0x${string}` = '0x0000000000000000000000000000000000000000',
	amount: bigint
): Promise<string> {
	if (articleId < 0n) {
		throw new Error('Article ID must be non-negative');
	}

	try {
		const walletClient = await getWalletClientWithChainCheck();
		const txHash = await walletClient.writeContract({
			address: getBlogHubContractAddress(),
			abi: BLOGHUB_ABI,
			functionName: 'collect',
			args: [articleId, referrer],
			value: amount
		});
		console.log(`Article collected. Tx: ${txHash}`);
		return txHash;
	} catch (error) {
		console.error('Error collecting article:', error);
		throw parseContractError(error);
	}
}

export async function likeComment(
	articleId: bigint,
	commentId: bigint,
	commenter: `0x${string}`,
	referrer: `0x${string}` = '0x0000000000000000000000000000000000000000',
	amount: bigint
): Promise<string> {
	if (articleId < 0n) {
		throw new Error('Article ID must be non-negative');
	}
	if (commentId < 0n) {
		throw new Error('Comment ID must be non-negative');
	}
	if (!commenter || commenter === '0x0000000000000000000000000000000000000000') {
		throw new Error('Invalid commenter address');
	}
	if (amount <= 0n) {
		throw new Error('Like amount must be greater than 0');
	}

	try {
		const walletClient = await getWalletClientWithChainCheck();
		const txHash = await walletClient.writeContract({
			address: getBlogHubContractAddress(),
			abi: BLOGHUB_ABI,
			functionName: 'likeComment',
			args: [articleId, commentId, commenter, referrer],
			value: amount
		});
		console.log(`Comment liked. Tx: ${txHash}`);
		return txHash;
	} catch (error) {
		console.error('Error liking comment:', error);
		throw parseContractError(error);
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
		throw new Error('Article ID must be non-negative');
	}

	if (score < 0 || score > 2) {
		throw new Error('Score must be 0 (neutral), 1 (like), or 2 (dislike)');
	}

	try {
		const walletClient = await getWalletClientWithChainCheck();

		const txHash = await walletClient.writeContract({
			address: getBlogHubContractAddress(),
			abi: BLOGHUB_ABI,
			functionName: 'evaluate',
			args: [articleId, score, comment, referrer, parentCommentId],
			value: tipAmount
		});

		console.log(`Article evaluated. Tx: ${txHash}`);
		return txHash;
	} catch (error) {
		console.error('Error evaluating article:', error);
		throw parseContractError(error);
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
		throw new Error('Invalid target address');
	}

	try {
		const walletClient = await getWalletClientWithChainCheck();

		const txHash = await walletClient.writeContract({
			address: getBlogHubContractAddress(),
			abi: BLOGHUB_ABI,
			functionName: 'follow',
			args: [targetAddress, isFollow]
		});

		console.log(`Follow status updated. Tx: ${txHash}`);
		return txHash;
	} catch (error) {
		console.error('Error updating follow status:', error);
		throw parseContractError(error);
	}
}

/**
 * Article data structure returned from contract
 * Note: Cover image is accessed via arweaveId/coverImage path in Irys mutable folder
 */
export interface ArticleData {
	arweaveHash: string;  // Irys mutable folder manifest ID
	author: `0x${string}`;
	originalAuthor: string;
	title: string;
	categoryId: bigint;
	timestamp: bigint;
}

/**
 * Read article information from contract
 * @param articleId - Article ID to query
 * @returns Article data
 */
export async function getArticle(articleId: bigint): Promise<ArticleData> {
	if (articleId < 0n) {
		throw new Error('Article ID must be non-negative');
	}

	try {
		const publicClient = getPublicClient();

		const result = await publicClient.readContract({
			address: getBlogHubContractAddress(),
			abi: BLOGHUB_ABI,
			functionName: 'articles',
			args: [articleId]
		});

		// Result is a tuple, map to named object
		const [
			arweaveHash,
			author,
			originalAuthor,
			title,
			categoryId,
			timestamp
		] = result as [string, `0x${string}`, string, string, bigint, bigint];

		return {
			arweaveHash,
			author,
			originalAuthor,
			title,
			categoryId,
			timestamp
		};
	} catch (error) {
		console.error('Error reading article:', error);
		throw parseContractError(error);
	}
}

// ============================================================
//                  Session Key 发布功能
// ============================================================

// SessionKeyManager ABI for reading nonce
const SESSION_KEY_MANAGER_ABI = [
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

async function assertSessionKeyActive(
	owner: `0x${string}`,
	sessionKeyAddress: `0x${string}`,
	selector: `0x${string}`,
	value: bigint
): Promise<void> {
	const publicClient = getPublicClient();
	const sessionKeyManager = getSessionKeyManagerAddress();
	const blogHub = getBlogHubContractAddress();

	const [data, latestBlock] = await Promise.all([
		publicClient.readContract({
			address: sessionKeyManager,
			abi: SESSION_KEY_MANAGER_ABI,
			functionName: 'getSessionKeyData',
			args: [owner, sessionKeyAddress]
		}),
		publicClient.getBlock({ blockTag: 'latest' })
	]);

	const now = Number(latestBlock.timestamp);

	if ((data.sessionKey as string).toLowerCase() === '0x0000000000000000000000000000000000000000') {
		throw new Error('Session key is not registered on-chain. Please create a new session key and wait for confirmation.');
	}

	if ((data.allowedContract as string).toLowerCase() !== blogHub.toLowerCase()) {
		throw new Error(`Session key is registered for a different contract. expected=${blogHub}, got=${data.allowedContract}`);
	}

	const selectors = (data.allowedSelectors as readonly string[]).map((s) => s.toLowerCase());
	if (!selectors.includes(selector.toLowerCase())) {
		throw new Error(`Session key is not authorized for this operation (selector=${selector}). Please re-create the session key.`);
	}

	if (now < Number(data.validAfter)) {
		throw new Error(`Session key is not active yet (validAfter=${data.validAfter}, now=${now}). Wait a few seconds and retry.`);
	}

	if (now > Number(data.validUntil)) {
		throw new Error('Session key has expired. Please create a new session key.');
	}

	const spendingLimit = BigInt(data.spendingLimit as unknown as string);
	const spentAmount = BigInt(data.spentAmount as unknown as string);
	if (spentAmount + value > spendingLimit) {
		throw new Error('Session key spending limit exceeded. Please create a new session key.');
	}
}

// EIP-712 Domain for SessionKeyManager
function getSessionKeyManagerDomain() {
	return {
		name: 'SessionKeyManager',
		version: '1',
		chainId: getChainId(),
		verifyingContract: getSessionKeyManagerAddress()
	};
}

// EIP-712 Types for SessionOperation
const SESSION_OPERATION_TYPES = {
	SessionOperation: [
		{ name: 'owner', type: 'address' },
		{ name: 'sessionKey', type: 'address' },
		{ name: 'target', type: 'address' },
		{ name: 'selector', type: 'bytes4' },
		{ name: 'callData', type: 'bytes' },
		{ name: 'value', type: 'uint256' },
		{ name: 'nonce', type: 'uint256' },
		{ name: 'deadline', type: 'uint256' }
	]
} as const;

/**
 * Get current nonce for session key from SessionKeyManager contract
 */
async function getSessionKeyNonce(
	owner: `0x${string}`,
	sessionKeyAddress: `0x${string}`
): Promise<bigint> {
	const publicClient = getPublicClient();
	const sessionKeyManager = getSessionKeyManagerAddress();

	const data = await publicClient.readContract({
		address: sessionKeyManager,
		abi: SESSION_KEY_MANAGER_ABI,
		functionName: 'getSessionKeyData',
		args: [owner, sessionKeyAddress]
	});

	return data.nonce;
}

// Function selectors for Session Key operations
// 可从 squid\src\abi\BlogHub.ts 查阅squid配置的最新函数签名
// 修改这里需要一并更新：frontend\src\lib\sessionKey.ts  ALLOWED_SELECTORS
export const FUNCTION_SELECTORS = {
	publish: '0x21a25d60' as `0x${string}`,      // publish((string,uint16,uint96,string,string,string,address,uint96,uint32,uint8)) - PublishParams struct
	evaluate: '0xff1f090a' as `0x${string}`,     // evaluate(uint256,uint8,string,address,uint256)
	follow: '0x63c3cc16' as `0x${string}`,       // follow(address,bool)
	likeComment: '0xdffd40f2' as `0x${string}`,  // likeComment(uint256,uint256,address,address)
	collect: '0x8d3c100a' as `0x${string}`,      // collect(uint256,address)
	editArticle: '0x461e2378' as `0x${string}`   // editArticle((uint256,string,string,string,uint16))
};

/**
 * Create EIP-712 signature for Session Key operation
 * @param sessionKey - Stored session key data
 * @param selector - Function selector
 * @param callData - Encoded function call data
 * @param value - ETH value to send (for tips)
 * @param deadline - Signature deadline timestamp
 * @param nonce - Current nonce from SessionKeyManager
 */
async function createSessionKeySignature(
	sessionKey: StoredSessionKey,
	selector: `0x${string}`,
	callData: `0x${string}`,
	value: bigint,
	deadline: bigint,
	nonce: bigint
): Promise<`0x${string}`> {
	const sessionKeyAccount = privateKeyToAccount(sessionKey.privateKey as `0x${string}`);
	const blogHub = getBlogHubContractAddress();

	// Create EIP-712 typed data message
	const message = {
		owner: sessionKey.owner as `0x${string}`,
		sessionKey: sessionKey.address as `0x${string}`,
		target: blogHub,
		selector: selector,
		callData: callData,
		value: value,
		nonce: nonce,
		deadline: deadline
	};

	// Sign with EIP-712
	const signature = await sessionKeyAccount.signTypedData({
		domain: getSessionKeyManagerDomain(),
		types: SESSION_OPERATION_TYPES,
		primaryType: 'SessionOperation',
		message
	});

	return signature;
}

/**
 * Publish article to contract using Session Key (no MetaMask interaction needed)
 * @param sessionKey - Stored session key data
 * @param arweaveId - Irys mutable folder manifest ID (content at index.md, cover at coverImage)
 * @param categoryId - Category ID (0-based)
 * @param royaltyBps - Royalty basis points (0-10000, where 100 = 1%)
 * @param originalAuthor - Original author name (optional)
 * @param title - Article title (max 128 bytes)
 * @param summary - Article summary (max 512 bytes)
 * @returns Transaction hash
 */
export async function publishToContractWithSessionKey(
	sessionKey: StoredSessionKey,
	arweaveId: string,
	categoryId: bigint,
	royaltyBps: bigint,
	originalAuthor: string = '',
	title: string = '',
	summary: string = '',
	trueAuthor: `0x${string}` = '0x0000000000000000000000000000000000000000',
	collectPrice: bigint = 0n,
	maxCollectSupply: bigint = 0n,
	originality: number = 0
): Promise<string> {
	if (!arweaveId) {
		throw new Error('Arweave ID is required');
	}

	if (categoryId < 0n) {
		throw new Error('Category ID must be non-negative');
	}

	if (royaltyBps > 10000n) {
		throw new Error('Royalty percentage cannot exceed 100% (10000 basis points)');
	}

	if (originalAuthor && new TextEncoder().encode(originalAuthor).length > 64) {
		throw new Error('Original author name is too long (max 64 bytes)');
	}

	if (title && new TextEncoder().encode(title).length > 128) {
		throw new Error('Title is too long (max 128 bytes)');
	}

	if (summary && new TextEncoder().encode(summary).length > 512) {
		throw new Error('Summary is too long (max 512 bytes)');
	}

	// Check session key validity
	if (Date.now() / 1000 > sessionKey.validUntil) {
		throw new Error('Session key has expired');
	}

	try {
		const chain = getChainConfig();
		const sessionKeyAccount = privateKeyToAccount(sessionKey.privateKey as `0x${string}`);
		
		// Create wallet client with session key
		const walletClient = createWalletClient({
			account: sessionKeyAccount,
			chain,
			transport: http(getRpcUrl())
		});

		// Set deadline to 5 minutes from now
		const deadline = BigInt(Math.floor(Date.now() / 1000) + 300);

		// Encode the publish function call data (this is what gets hashed in the signature)
		const callData = encodeFunctionData({
			abi: BLOGHUB_ABI,
			functionName: 'publish',
			args: [
				{
					arweaveId,
					categoryId: Number(categoryId),
					royaltyBps: BigInt(royaltyBps),
					originalAuthor,
					title,
					summary,
					trueAuthor,
					collectPrice: BigInt(collectPrice),
					maxCollectSupply: Number(maxCollectSupply),
					originality: Number(originality)
				}
			]
		});

		// Get current nonce from SessionKeyManager
		const nonce = await getSessionKeyNonce(
			sessionKey.owner as `0x${string}`,
			sessionKey.address as `0x${string}`
		);

		await assertSessionKeyActive(
			sessionKey.owner as `0x${string}`,
			sessionKey.address as `0x${string}`,
			FUNCTION_SELECTORS.publish,
			0n
		);

		// Debug: Log signature parameters
		console.log('=== publishWithSessionKey Debug ===');
		console.log('owner:', sessionKey.owner);
		console.log('sessionKey:', sessionKey.address);
		console.log('selector:', FUNCTION_SELECTORS.publish);
		console.log('callData:', callData);
		console.log('callData first 10 bytes:', callData.slice(0, 22));
		console.log('nonce:', nonce.toString());
		console.log('deadline:', deadline.toString());
		console.log('target (BlogHub):', getBlogHubContractAddress());
		console.log('SessionKeyManager:', getSessionKeyManagerAddress());
		console.log('chainId:', getChainId());

		// Create EIP-712 signature
		const signature = await createSessionKeySignature(
			sessionKey,
			FUNCTION_SELECTORS.publish,
			callData,
			0n,
			deadline,
			nonce
		);
		
		console.log('signature:', signature);

		// Call publishWithSessionKey
		// IMPORTANT: params must match exactly with what was encoded in callData
		const txHash = await walletClient.writeContract({
			address: getBlogHubContractAddress(),
			abi: BLOGHUB_ABI,
			functionName: 'publishWithSessionKey',
			args: [
				sessionKey.owner as `0x${string}`,
				sessionKey.address as `0x${string}`,
				{
					arweaveId,
					categoryId: Number(categoryId),
					royaltyBps: BigInt(royaltyBps),
					originalAuthor,
					title,
					summary,
					trueAuthor: trueAuthor,
					collectPrice: BigInt(collectPrice),
					maxCollectSupply: Number(maxCollectSupply),
					originality: Number(originality)
				},
				deadline,
				signature
			]
		});

		console.log(`Article published with session key. Tx: ${txHash}`);
		return txHash;
	} catch (error) {
		console.error('Error publishing with session key:', error);
		throw parseContractError(error);
	}
}

/** 创建 Session Key 钱包客户端 */
function createSessionKeyWalletClient(sessionKey: StoredSessionKey) {
	if (Date.now() / 1000 > sessionKey.validUntil) {
		throw new Error('Session key has expired');
	}
	const sessionKeyAccount = privateKeyToAccount(sessionKey.privateKey as `0x${string}`);
	return createWalletClient({
		account: sessionKeyAccount,
		chain: getChainConfig(),
		transport: http(getRpcUrl())
	});
}

/** 获取 Session Key 签名所需的通用参数 */
async function getSessionKeySignParams(sessionKey: StoredSessionKey) {
	const deadline = BigInt(Math.floor(Date.now() / 1000) + 300);
	const nonce = await getSessionKeyNonce(
		sessionKey.owner as `0x${string}`,
		sessionKey.address as `0x${string}`
	);
	return { deadline, nonce };
}

export async function evaluateArticleWithSessionKey(
	sessionKey: StoredSessionKey,
	articleId: bigint,
	score: EvaluationScore,
	comment: string,
	referrer: `0x${string}` = '0x0000000000000000000000000000000000000000',
	parentCommentId: bigint = 0n,
	tipAmount: bigint = 0n
): Promise<string> {
	if (articleId < 0n) throw new Error('Article ID must be non-negative');
	if (score < 0 || score > 2) throw new Error('Score must be 0 (neutral), 1 (like), or 2 (dislike)');

	try {
		const walletClient = createSessionKeyWalletClient(sessionKey);
		const { deadline, nonce } = await getSessionKeySignParams(sessionKey);
		const callData = encodeFunctionData({
			abi: BLOGHUB_ABI,
			functionName: 'evaluate',
			args: [articleId, score, comment, referrer, parentCommentId]
		});
		const signature = await createSessionKeySignature(sessionKey, FUNCTION_SELECTORS.evaluate, callData, tipAmount, deadline, nonce);

		const txHash = await walletClient.writeContract({
			address: getBlogHubContractAddress(),
			abi: BLOGHUB_ABI,
			functionName: 'evaluateWithSessionKey',
			args: [sessionKey.owner as `0x${string}`, sessionKey.address as `0x${string}`, articleId, score, comment, referrer, parentCommentId, deadline, signature],
			value: tipAmount
		});
		console.log(`Article evaluated with session key. Tx: ${txHash}`);
		return txHash;
	} catch (error) {
		console.error('Error evaluating with session key:', error);
		throw parseContractError(error);
	}
}

export async function followUserWithSessionKey(
	sessionKey: StoredSessionKey,
	targetAddress: `0x${string}`,
	isFollow: boolean
): Promise<string> {
	if (!targetAddress || targetAddress === '0x0000000000000000000000000000000000000000') {
		throw new Error('Invalid target address');
	}

	try {
		const walletClient = createSessionKeyWalletClient(sessionKey);
		const { deadline, nonce } = await getSessionKeySignParams(sessionKey);
		const callData = encodeFunctionData({ abi: BLOGHUB_ABI, functionName: 'follow', args: [targetAddress, isFollow] });
		const signature = await createSessionKeySignature(sessionKey, FUNCTION_SELECTORS.follow, callData, 0n, deadline, nonce);

		const txHash = await walletClient.writeContract({
			address: getBlogHubContractAddress(),
			abi: BLOGHUB_ABI,
			functionName: 'followWithSessionKey',
			args: [sessionKey.owner as `0x${string}`, sessionKey.address as `0x${string}`, targetAddress, isFollow, deadline, signature]
		});
		console.log(`Follow status updated with session key. Tx: ${txHash}`);
		return txHash;
	} catch (error) {
		console.error('Error following with session key:', error);
		throw parseContractError(error);
	}
}

export async function collectArticleWithSessionKey(
	sessionKey: StoredSessionKey,
	articleId: bigint,
	referrer: `0x${string}` = '0x0000000000000000000000000000000000000000',
	amount: bigint
): Promise<string> {
	if (articleId < 0n) throw new Error('Article ID must be non-negative');

	try {
		const walletClient = createSessionKeyWalletClient(sessionKey);
		const { deadline, nonce } = await getSessionKeySignParams(sessionKey);
		const callData = encodeFunctionData({ abi: BLOGHUB_ABI, functionName: 'collect', args: [articleId, referrer] });
		const signature = await createSessionKeySignature(sessionKey, FUNCTION_SELECTORS.collect, callData, amount, deadline, nonce);

		const txHash = await walletClient.writeContract({
			address: getBlogHubContractAddress(),
			abi: BLOGHUB_ABI,
			functionName: 'collectWithSessionKey',
			args: [sessionKey.owner as `0x${string}`, sessionKey.address as `0x${string}`, articleId, referrer, deadline, signature],
			value: amount
		});
		console.log(`Article collected with session key. Tx: ${txHash}`);
		return txHash;
	} catch (error) {
		console.error('Error collecting with session key:', error);
		throw parseContractError(error);
	}
}

export async function likeCommentWithSessionKey(
	sessionKey: StoredSessionKey,
	articleId: bigint,
	commentId: bigint,
	commenter: `0x${string}`,
	referrer: `0x${string}` = '0x0000000000000000000000000000000000000000',
	amount: bigint
): Promise<string> {
	if (articleId < 0n) throw new Error('Article ID must be non-negative');
	if (commentId < 0n) throw new Error('Comment ID must be non-negative');
	if (!commenter || commenter === '0x0000000000000000000000000000000000000000') throw new Error('Invalid commenter address');
	if (amount <= 0n) throw new Error('Like amount must be greater than 0');

	try {
		const walletClient = createSessionKeyWalletClient(sessionKey);
		const { deadline, nonce } = await getSessionKeySignParams(sessionKey);
		const callData = encodeFunctionData({ abi: BLOGHUB_ABI, functionName: 'likeComment', args: [articleId, commentId, commenter, referrer] });
		const signature = await createSessionKeySignature(sessionKey, FUNCTION_SELECTORS.likeComment, callData, amount, deadline, nonce);

		const txHash = await walletClient.writeContract({
			address: getBlogHubContractAddress(),
			abi: BLOGHUB_ABI,
			functionName: 'likeCommentWithSessionKey',
			args: [sessionKey.owner as `0x${string}`, sessionKey.address as `0x${string}`, articleId, commentId, commenter, referrer, deadline, signature],
			value: amount
		});
		console.log(`Comment liked with session key. Tx: ${txHash}`);
		return txHash;
	} catch (error) {
		console.error('Error liking comment with session key:', error);
		throw parseContractError(error);
	}
}

// ============================================================
//                  User Profile Functions
// ============================================================

/**
 * Update user profile (nickname, avatar, bio)
 * Profile data is stored via events and indexed by SubSquid
 * @param nickname - User nickname (max 64 bytes)
 * @param avatar - Avatar URL/IPFS/Arweave ID (max 128 bytes)
 * @param bio - User bio/description (max 256 bytes)
 * @returns Transaction hash
 */
export async function updateProfile(
	nickname: string,
	avatar: string,
	bio: string
): Promise<string> {
	// Validate lengths
	if (new TextEncoder().encode(nickname).length > 64) {
		throw new Error('Nickname is too long (max 64 bytes)');
	}
	if (new TextEncoder().encode(avatar).length > 128) {
		throw new Error('Avatar URL is too long (max 128 bytes)');
	}
	if (new TextEncoder().encode(bio).length > 256) {
		throw new Error('Bio is too long (max 256 bytes)');
	}

	try {
		const walletClient = await getWalletClientWithChainCheck();

		const txHash = await walletClient.writeContract({
			address: getBlogHubContractAddress(),
			abi: BLOGHUB_ABI,
			functionName: 'updateProfile',
			args: [nickname, avatar, bio]
		});

		console.log(`Profile updated. Tx: ${txHash}`);
		return txHash;
	} catch (error) {
		console.error('Error updating profile:', error);
		throw parseContractError(error);
	}
}

/** 验证文章编辑参数 */
function validateEditArticleParams(articleId: bigint, originalAuthor: string, title: string, summary: string) {
	if (articleId <= 0n) throw new Error('Article ID must be positive');
	if (originalAuthor && new TextEncoder().encode(originalAuthor).length > 64) throw new Error('Original author name is too long (max 64 bytes)');
	if (title && new TextEncoder().encode(title).length > 128) throw new Error('Title is too long (max 128 bytes)');
	if (summary && new TextEncoder().encode(summary).length > 500) throw new Error('Summary is too long (max 500 bytes)');
}

export async function editArticle(
	articleId: bigint,
	originalAuthor: string,
	title: string,
	summary: string,
	categoryId: bigint
): Promise<string> {
	validateEditArticleParams(articleId, originalAuthor, title, summary);

	try {
		const walletClient = await getWalletClientWithChainCheck();
		const txHash = await walletClient.writeContract({
			address: getBlogHubContractAddress(),
			abi: BLOGHUB_ABI,
			functionName: 'editArticle',
			args: [{
				articleId,
				originalAuthor,
				title,
				summary,
				categoryId: Number(categoryId)
			}]
		});
		console.log(`Article edited. Tx: ${txHash}`);
		return txHash;
	} catch (error) {
		console.error('Error editing article:', error);
		throw parseContractError(error);
	}
}

export async function editArticleWithSessionKey(
	sessionKey: StoredSessionKey,
	articleId: bigint,
	originalAuthor: string,
	title: string,
	summary: string,
	categoryId: bigint
): Promise<string> {
	validateEditArticleParams(articleId, originalAuthor, title, summary);

	try {
		const walletClient = createSessionKeyWalletClient(sessionKey);
		const { deadline, nonce } = await getSessionKeySignParams(sessionKey);
		const params = {
			articleId,
			originalAuthor,
			title,
			summary,
			categoryId: Number(categoryId)
		};
		const callData = encodeFunctionData({
			abi: BLOGHUB_ABI,
			functionName: 'editArticle',
			args: [params]
		});

		await assertSessionKeyActive(sessionKey.owner as `0x${string}`, sessionKey.address as `0x${string}`, FUNCTION_SELECTORS.editArticle, 0n);
		const signature = await createSessionKeySignature(sessionKey, FUNCTION_SELECTORS.editArticle, callData, 0n, deadline, nonce);

		const txHash = await walletClient.writeContract({
			address: getBlogHubContractAddress(),
			abi: BLOGHUB_ABI,
			functionName: 'editArticleWithSessionKey',
			args: [sessionKey.owner as `0x${string}`, sessionKey.address as `0x${string}`, params, deadline, signature]
		});
		console.log(`Article edited with session key. Tx: ${txHash}`);
		return txHash;
	} catch (error) {
		console.error('Error editing article with session key:', error);
		throw parseContractError(error);
	}
}
