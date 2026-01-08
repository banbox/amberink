/**
 * Smart contract interaction utilities
 * Handles publishing articles to BlogHub contract
 */

import { createWalletClient, http, encodeFunctionData } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { getBlogHubContractAddress, getSessionKeyManagerAddress, getRpcUrl, getChainId } from '$lib/config';
import { getChainConfig } from '$lib/chain';
import { getWalletClient, getPublicClient, switchToTargetChain } from '$lib/wallet';
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
	| 'unknown_error'
	// Specific contract business logic errors
	| 'cannot_self_evaluate'
	| 'cannot_self_follow'
	| 'cannot_self_collect'
	| 'cannot_like_own_comment'
	| 'article_not_found'
	| 'session_key_expired'
	| 'session_key_unauthorized';

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
	if (error instanceof ContractError) {
		return error;
	}
	const errorMessage = error instanceof Error ? error.message : String(error);
	const lowerMessage = errorMessage.toLowerCase();

	// Session key specific errors
	if (lowerMessage.includes('not authorized for this operation')) {
		return new ContractError('contract_reverted', errorMessage, error instanceof Error ? error : undefined);
	}
	if (
		lowerMessage.includes('sessionkeynotactive') ||
		lowerMessage.includes('0x62db3e42') ||
		lowerMessage.includes('session key is not') ||
		lowerMessage.includes('session key has expired') ||
		lowerMessage.includes('session key spending limit exceeded') ||
		lowerMessage.includes('spendinglimitexceeded')
	) {
		return new ContractError(
			'session_key_expired',
			'Session key is not active, expired, or limit exceeded. Please create a new session key.',
			error instanceof Error ? error : undefined
		);
	}
	if (lowerMessage.includes('invalidsignature') || lowerMessage.includes('0x8baa579f')) {
		return new ContractError(
			'session_key_unauthorized',
			'Invalid signature. Session verification failed.',
			error instanceof Error ? error : undefined
		);
	}
	if (lowerMessage.includes('signatureexpired') || lowerMessage.includes('0x0819bdcd')) {
		return new ContractError('session_key_expired', 'Signature has expired. Please try again.', error instanceof Error ? error : undefined);
	}
	if (lowerMessage.includes('sessionkeyvalidationfailed')) {
		return new ContractError(
			'session_key_unauthorized',
			'Session key validation failed.',
			error instanceof Error ? error : undefined
		);
	}

	// Security/Logic errors
	if (lowerMessage.includes('cannotselfevaluate')) return new ContractError('cannot_self_evaluate', 'You cannot like or dislike your own article.', error instanceof Error ? error : undefined);
	if (lowerMessage.includes('cannotselffollow')) return new ContractError('cannot_self_follow', 'You cannot follow yourself.', error instanceof Error ? error : undefined);
	if (lowerMessage.includes('cannotselfcollect')) return new ContractError('cannot_self_collect', 'You cannot collect your own article.', error instanceof Error ? error : undefined);
	if (lowerMessage.includes('cannotlikeowncomment')) return new ContractError('cannot_like_own_comment', 'You cannot like your own comment.', error instanceof Error ? error : undefined);
	if (lowerMessage.includes('articlenotfound')) return new ContractError('article_not_found', 'Article not found', error instanceof Error ? error : undefined);
	if (lowerMessage.includes('spamprotection')) return new ContractError('contract_reverted', 'Transaction value too low (anti-spam protection)', error instanceof Error ? error : undefined);
	if (lowerMessage.includes('invalidnonce')) return new ContractError('contract_reverted', 'Invalid nonce (possible race condition)', error instanceof Error ? error : undefined);

	// User/Network errors
	if (
		lowerMessage.includes('user rejected') ||
		lowerMessage.includes('user denied') ||
		lowerMessage.includes('rejected the request') ||
		lowerMessage.includes('user cancelled') ||
		lowerMessage.includes('user canceled')
	) {
		return new ContractError('user_rejected', 'User rejected the transaction.', error instanceof Error ? error : undefined);
	}

	if (
		lowerMessage.includes('insufficient funds') ||
		lowerMessage.includes('insufficient balance') ||
		lowerMessage.includes('not enough balance')
	) {
		return new ContractError('insufficient_funds', 'Insufficient funds to complete the transaction.', error instanceof Error ? error : undefined);
	}

	if (
		lowerMessage.includes('gas required exceeds') ||
		lowerMessage.includes('gas estimation') ||
		lowerMessage.includes('out of gas') ||
		lowerMessage.includes('intrinsic gas too low')
	) {
		return new ContractError('gas_estimation_failed', 'Failed to estimate gas for the transaction.', error instanceof Error ? error : undefined);
	}

	if (
		lowerMessage.includes('revert') ||
		lowerMessage.includes('execution reverted') ||
		lowerMessage.includes('transaction failed')
	) {
		// Try to extract reason
		const match = errorMessage.match(/reason="?([^"]+)"?/i) || errorMessage.match(/error=([^,]+)/i);
		const reason = match ? match[1] : 'The contract reverted the transaction.';
		return new ContractError('contract_reverted', reason, error instanceof Error ? error : undefined);
	}

	if (lowerMessage.includes('nonce too low') || lowerMessage.includes('nonce has already been used')) {
		return new ContractError('nonce_too_low', 'Nonce is too low or has already been used.', error instanceof Error ? error : undefined);
	}

	if (
		lowerMessage.includes('replacement transaction underpriced') ||
		lowerMessage.includes('transaction underpriced')
	) {
		return new ContractError('replacement_underpriced', 'Replacement transaction is underpriced.', error instanceof Error ? error : undefined);
	}

	if (
		lowerMessage.includes('network') ||
		lowerMessage.includes('disconnected') ||
		lowerMessage.includes('connection') ||
		lowerMessage.includes('timeout') ||
		lowerMessage.includes('econnrefused')
	) {
		return new ContractError('network_error', 'Network error occurred.', error instanceof Error ? error : undefined);
	}

	if (
		lowerMessage.includes('no accounts') ||
		lowerMessage.includes('wallet not connected') ||
		lowerMessage.includes('not connected')
	) {
		return new ContractError('wallet_not_connected', 'Wallet is not connected.', error instanceof Error ? error : undefined);
	}

	if (
		lowerMessage.includes('wrong network') ||
		lowerMessage.includes('chain mismatch') ||
		(lowerMessage.includes('switch') && lowerMessage.includes('chain'))
	) {
		return new ContractError('wrong_network', 'Wrong network selected.', error instanceof Error ? error : undefined);
	}

	return new ContractError('unknown_error', 'An unknown error occurred.', error instanceof Error ? error : undefined);
}

// ============================================================
//                  Validation Helper Functions
// ============================================================

/** Assert that a bigint value is non-negative */
function assertNonNegative(value: bigint, fieldName: string): void {
	if (value < 0n) {
		throw new Error(`${fieldName} must be non-negative`);
	}
}

/** Assert that a string does not exceed max byte length (when not empty) */
function assertBytesLimit(value: string, maxBytes: number, fieldName: string): void {
	if (value && new TextEncoder().encode(value).length > maxBytes) {
		throw new Error(`${fieldName} is too long (max ${maxBytes} bytes)`);
	}
}

/** Assert that an address is valid (non-empty and not zero address unless allowed) */
function assertValidAddress(
	address: string | undefined,
	fieldName: string,
	allowZero: boolean = false
): void {
	if (!address) {
		throw new Error(`${fieldName} is required`);
	}
	if (!allowZero && address === ZERO_ADDRESS) {
		throw new Error(`Invalid ${fieldName}`);
	}
}

/** Validate publish parameters common to both wallet and session key modes */
function validatePublishParams(
	arweaveId: string,
	categoryId: bigint,
	royaltyBps: bigint,
	originalAuthor: string,
	title: string,
	summary: string
): void {
	if (!arweaveId) {
		throw new Error('Arweave ID is required');
	}
	assertNonNegative(categoryId, 'Category ID');
	if (royaltyBps > 10000n) {
		throw new Error('Royalty percentage cannot exceed 100% (10000 basis points)');
	}
	assertBytesLimit(originalAuthor, 64, 'Original author name');
	assertBytesLimit(title, 128, 'Title');
	assertBytesLimit(summary, 512, 'Summary');
}

// ============================================================
//                  Gas Estimation Utility
// ============================================================

/**
 * Estimate gas for a contract call with a safety buffer.
 * If estimation fails, parses the error for user-friendly messages.
 * 
 * @param request - Contract call parameters
 * @returns Estimated gas with 15% buffer
 * @throws ContractError if estimation fails (with specific error reason)
 */
async function estimateGasWithBuffer(request: {
	address: `0x${string}`;
	abi: readonly unknown[];
	functionName: string;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	args: readonly any[];
	value?: bigint;
	account: `0x${string}`;
}): Promise<bigint> {
	const publicClient = getPublicClient();

	try {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const estimatedGas = await publicClient.estimateContractGas({
			address: request.address,
			abi: request.abi as any,
			functionName: request.functionName as any,
			args: request.args as any,
			value: request.value,
			account: request.account,
		});

		// Add 15% buffer to prevent state drift failures
		return (estimatedGas * 115n) / 100n;
	} catch (error) {
		console.error('Gas estimation failed:', error);
		throw parseContractError(error);
	}
}

// BlogHub contract ABI (includes SessionKeyManager errors for proper decoding)
const BLOGHUB_ABI = [
	// BlogHub business logic errors
	{
		type: 'error',
		name: 'InvalidLength',
		inputs: []
	},
	{
		type: 'error',
		name: 'InvalidScore',
		inputs: []
	},
	{
		type: 'error',
		name: 'ContentRequiredForScore',
		inputs: []
	},
	{
		type: 'error',
		name: 'ArticleNotFound',
		inputs: []
	},
	{
		type: 'error',
		name: 'RoyaltyTooHigh',
		inputs: []
	},
	{
		type: 'error',
		name: 'FeeTooHigh',
		inputs: []
	},
	{
		type: 'error',
		name: 'InvalidAddress',
		inputs: []
	},
	{
		type: 'error',
		name: 'TransferFailed',
		inputs: []
	},
	{
		type: 'error',
		name: 'SpamProtection',
		inputs: []
	},
	{
		type: 'error',
		name: 'InvalidCommenter',
		inputs: []
	},
	{
		type: 'error',
		name: 'OriginalAuthorTooLong',
		inputs: []
	},
	{
		type: 'error',
		name: 'TitleTooLong',
		inputs: []
	},
	{
		type: 'error',
		name: 'SummaryTooLong',
		inputs: []
	},
	{
		type: 'error',
		name: 'InsufficientPayment',
		inputs: []
	},
	{
		type: 'error',
		name: 'MaxSupplyReached',
		inputs: []
	},
	{
		type: 'error',
		name: 'CollectNotEnabled',
		inputs: []
	},
	{
		type: 'error',
		name: 'NotArticleAuthor',
		inputs: []
	},
	{
		type: 'error',
		name: 'CannotSelfEvaluate',
		inputs: []
	},
	{
		type: 'error',
		name: 'CannotSelfFollow',
		inputs: []
	},
	{
		type: 'error',
		name: 'CannotSelfCollect',
		inputs: []
	},
	{
		type: 'error',
		name: 'CannotLikeOwnComment',
		inputs: []
	},
	// BlogHub SessionKey errors
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
					{ name: 'maxCollectSupply', type: 'uint16' },
					{ name: 'originality', type: 'uint8' },
					{ name: 'visibility', type: 'uint8' }
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
					{ name: 'maxCollectSupply', type: 'uint16' },
					{ name: 'originality', type: 'uint8' },
					{ name: 'visibility', type: 'uint8' }
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
 * Get wallet client with chain validation
 */
async function getWalletClientWithChainCheck() {
	await switchToTargetChain();
	return getWalletClient();
}

/**
 * Execute a contract action with standard error handling and logging
 */
async function executeContractAction(
	context: {
		actionName: string;
		abi: typeof BLOGHUB_ABI;
		functionName: string;
		args: readonly unknown[];
		value?: bigint;
		successMessage?: string;
	}
) {
	try {
		const walletClient = await getWalletClientWithChainCheck();
		const txHash = await walletClient.writeContract({
			address: getBlogHubContractAddress(),
			abi: context.abi,
			functionName: context.functionName as any,
			args: context.args as any,
			value: context.value
		});
		console.log(`${context.successMessage || context.functionName + ' executed'}. Tx: ${txHash}`);
		return txHash;
	} catch (error) {
		console.error(`Error in ${context.functionName}:`, error);
		throw parseContractError(error);
	}
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
	trueAuthor: `0x${string}` = ZERO_ADDRESS,
	collectPrice: bigint = 0n,
	maxCollectSupply: bigint = 0n,
	originality: number = 0,
	visibility: number = 0  // 0:Public, 1:Private, 2:Encrypted
): Promise<string> {
	validatePublishParams(arweaveId, categoryId, royaltyBps, originalAuthor, title, summary);

	return executeContractAction({
		actionName: 'publish',
		abi: BLOGHUB_ABI,
		functionName: 'publish',
		args: [{
			arweaveId,
			categoryId: Number(categoryId),
			royaltyBps: BigInt(royaltyBps),
			originalAuthor,
			title,
			summary,
			trueAuthor,
			collectPrice: BigInt(collectPrice),
			maxCollectSupply: Number(maxCollectSupply),
			originality: Number(originality),
			visibility: Number(visibility)
		}],
		successMessage: 'Article published to contract'
	});
}

export async function collectArticle(
	articleId: bigint,
	referrer: `0x${string}` = ZERO_ADDRESS,
	amount: bigint
): Promise<string> {
	assertNonNegative(articleId, 'Article ID');

	return executeContractAction({
		actionName: 'collect',
		abi: BLOGHUB_ABI,
		functionName: 'collect',
		args: [articleId, referrer],
		value: amount,
		successMessage: 'Article collected'
	});
}

export async function likeComment(
	articleId: bigint,
	commentId: bigint,
	commenter: `0x${string}`,
	referrer: `0x${string}` = ZERO_ADDRESS,
	amount: bigint
): Promise<string> {
	assertNonNegative(articleId, 'Article ID');
	assertNonNegative(commentId, 'Comment ID');
	assertValidAddress(commenter, 'commenter address');
	if (amount <= 0n) {
		throw new Error('Like amount must be greater than 0');
	}

	return executeContractAction({
		actionName: 'likeComment',
		abi: BLOGHUB_ABI,
		functionName: 'likeComment',
		args: [articleId, commentId, commenter, referrer],
		value: amount,
		successMessage: 'Comment liked'
	});
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
	referrer: `0x${string}` = ZERO_ADDRESS,
	parentCommentId: bigint = 0n,
	tipAmount: bigint = 0n
): Promise<string> {
	assertNonNegative(articleId, 'Article ID');

	if (score < 0 || score > 2) {
		throw new Error('Score must be 0 (neutral), 1 (like), or 2 (dislike)');
	}

	return executeContractAction({
		actionName: 'evaluate',
		abi: BLOGHUB_ABI,
		functionName: 'evaluate',
		args: [articleId, score, comment, referrer, parentCommentId],
		value: tipAmount,
		successMessage: 'Article evaluated'
	});
}

/**
 * Follow or unfollow a user
 * @param targetAddress - Address to follow/unfollow
 * @param isFollow - true to follow, false to unfollow
 * @returns Transaction hash
 */
export async function followUser(targetAddress: `0x${string}`, isFollow: boolean): Promise<string> {
	if (!targetAddress || targetAddress === ZERO_ADDRESS) {
		throw new Error('Invalid target address');
	}

	return executeContractAction({
		actionName: 'follow',
		abi: BLOGHUB_ABI,
		functionName: 'follow',
		args: [targetAddress, isFollow],
		successMessage: 'Follow status updated'
	});
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

	if ((data.sessionKey as string).toLowerCase() === ZERO_ADDRESS) {
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
	publish: '0x2801f5df' as `0x${string}`,      // publish((string,uint16,uint96,string,string,string,address,uint96,uint16,uint8,uint8)) - PublishParams struct
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
 * Execute made contract action using Session Key authentication
 */
async function executeSessionKeyAction<TArgs extends ReadonlyArray<unknown>>(
	sessionKey: StoredSessionKey,
	context: {
		actionName: string;      // e.g. 'publish'
		contractFunctionName: string; // e.g. 'publishWithSessionKey'
		selector: `0x${string}`;
		abi: typeof BLOGHUB_ABI;
		args: TArgs;             // The inner function arguments
		value?: bigint;
	}
) {
	// Check session key expiry (client side check)
	if (Date.now() / 1000 > sessionKey.validUntil) {
		throw new Error('Session key has expired');
	}

	try {
		const walletClient = createSessionKeyWalletClient(sessionKey);
		const { deadline, nonce } = await getSessionKeySignParams(sessionKey);

		// Validate session key is active and authorized
		await assertSessionKeyActive(
			sessionKey.owner as `0x${string}`,
			sessionKey.address as `0x${string}`,
			context.selector,
			context.value || 0n
		);

		// Encode inner function call data
		const callData = encodeFunctionData({
			abi: context.abi,
			functionName: context.actionName as any,
			args: context.args as any
		});

		// Create EIP-712 signature
		const signature = await createSessionKeySignature(
			sessionKey,
			context.selector,
			callData,
			context.value || 0n,
			deadline,
			nonce
		);

		// Construct tx args: [owner, key, ...innerArgs, deadline, signature]
		const txArgs = [
			sessionKey.owner,
			sessionKey.address,
			...context.args,
			deadline,
			signature
		] as const;

		// Estimate gas
		const gas = await estimateGasWithBuffer({
			address: getBlogHubContractAddress(),
			abi: context.abi,
			functionName: context.contractFunctionName as any,
			args: txArgs as any,
			value: context.value,
			account: sessionKey.address as `0x${string}`,
		});

		// Execute transaction
		const txHash = await walletClient.writeContract({
			address: getBlogHubContractAddress(),
			abi: context.abi,
			functionName: context.contractFunctionName as any,
			args: txArgs as any,
			gas,
			value: context.value
		});

		console.log(`${context.actionName} with session key. Tx: ${txHash}`);
		return txHash;

	} catch (error) {
		console.error(`Error ${context.actionName} with session key:`, error);
		throw parseContractError(error);
	}
}

/**
 * Publish article to contract using Session Key (no MetaMask interaction needed)
 */
export async function publishToContractWithSessionKey(
	sessionKey: StoredSessionKey,
	arweaveId: string,
	categoryId: bigint,
	royaltyBps: bigint,
	originalAuthor: string = '',
	title: string = '',
	summary: string = '',
	trueAuthor: `0x${string}` = ZERO_ADDRESS,
	collectPrice: bigint = 0n,
	maxCollectSupply: bigint = 0n,
	originality: number = 0,
	visibility: number = 0  // 0:Public, 1:Private, 2:Encrypted
): Promise<string> {
	validatePublishParams(arweaveId, categoryId, royaltyBps, originalAuthor, title, summary);

	return executeSessionKeyAction(sessionKey, {
		actionName: 'publish',
		contractFunctionName: 'publishWithSessionKey',
		selector: FUNCTION_SELECTORS.publish,
		abi: BLOGHUB_ABI,
		args: [{
			arweaveId,
			categoryId: Number(categoryId),
			royaltyBps: BigInt(royaltyBps),
			originalAuthor,
			title,
			summary,
			trueAuthor,
			collectPrice: BigInt(collectPrice),
			maxCollectSupply: Number(maxCollectSupply),
			originality: Number(originality),
			visibility: Number(visibility)
		}]
	});
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
		transport: http(getRpcUrl(), {
			methods: { exclude: ['eth_fillTransaction'] }
		})
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
	referrer: `0x${string}` = ZERO_ADDRESS,
	parentCommentId: bigint = 0n,
	tipAmount: bigint = 0n
): Promise<string> {
	if (articleId < 0n) throw new Error('Article ID must be non-negative');
	if (score < 0 || score > 2) throw new Error('Score must be 0 (neutral), 1 (like), or 2 (dislike)');

	return executeSessionKeyAction(sessionKey, {
		actionName: 'evaluate',
		contractFunctionName: 'evaluateWithSessionKey',
		selector: FUNCTION_SELECTORS.evaluate,
		abi: BLOGHUB_ABI,
		args: [articleId, score, comment, referrer, parentCommentId],
		value: tipAmount
	});
}

export async function followUserWithSessionKey(
	sessionKey: StoredSessionKey,
	targetAddress: `0x${string}`,
	isFollow: boolean
): Promise<string> {
	if (!targetAddress || targetAddress === ZERO_ADDRESS) {
		throw new Error('Invalid target address');
	}

	return executeSessionKeyAction(sessionKey, {
		actionName: 'follow',
		contractFunctionName: 'followWithSessionKey',
		selector: FUNCTION_SELECTORS.follow,
		abi: BLOGHUB_ABI,
		args: [targetAddress, isFollow]
	});
}

export async function collectArticleWithSessionKey(
	sessionKey: StoredSessionKey,
	articleId: bigint,
	referrer: `0x${string}` = ZERO_ADDRESS,
	amount: bigint
): Promise<string> {
	if (articleId < 0n) throw new Error('Article ID must be non-negative');

	return executeSessionKeyAction(sessionKey, {
		actionName: 'collect',
		contractFunctionName: 'collectWithSessionKey',
		selector: FUNCTION_SELECTORS.collect,
		abi: BLOGHUB_ABI,
		args: [articleId, referrer],
		value: amount
	});
}

export async function likeCommentWithSessionKey(
	sessionKey: StoredSessionKey,
	articleId: bigint,
	commentId: bigint,
	commenter: `0x${string}`,
	referrer: `0x${string}` = ZERO_ADDRESS,
	amount: bigint
): Promise<string> {
	if (articleId < 0n) throw new Error('Article ID must be non-negative');
	if (commentId < 0n) throw new Error('Comment ID must be non-negative');
	if (!commenter || commenter === ZERO_ADDRESS) throw new Error('Invalid commenter address');
	if (amount <= 0n) throw new Error('Like amount must be greater than 0');

	return executeSessionKeyAction(sessionKey, {
		actionName: 'likeComment',
		contractFunctionName: 'likeCommentWithSessionKey',
		selector: FUNCTION_SELECTORS.likeComment,
		abi: BLOGHUB_ABI,
		args: [articleId, commentId, commenter, referrer],
		value: amount
	});
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
	assertBytesLimit(nickname, 64, 'Nickname');
	assertBytesLimit(avatar, 128, 'Avatar URL');
	assertBytesLimit(bio, 256, 'Bio');

	return executeContractAction({
		actionName: 'updateProfile',
		abi: BLOGHUB_ABI,
		functionName: 'updateProfile',
		args: [nickname, avatar, bio],
		successMessage: 'Profile updated'
	});
}

/** 验证文章编辑参数 */
function validateEditArticleParams(articleId: bigint, originalAuthor: string, title: string, summary: string) {
	if (articleId <= 0n) throw new Error('Article ID must be positive');
	assertBytesLimit(originalAuthor, 64, 'Original author name');
	assertBytesLimit(title, 128, 'Title');
	assertBytesLimit(summary, 512, 'Summary');
}

export async function editArticle(
	articleId: bigint,
	originalAuthor: string,
	title: string,
	summary: string,
	categoryId: bigint
): Promise<string> {
	validateEditArticleParams(articleId, originalAuthor, title, summary);

	return executeContractAction({
		actionName: 'editArticle',
		abi: BLOGHUB_ABI,
		functionName: 'editArticle',
		args: [{
			articleId,
			originalAuthor,
			title,
			summary,
			categoryId: Number(categoryId)
		}],
		successMessage: 'Article edited'
	});
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

	return executeSessionKeyAction(sessionKey, {
		actionName: 'editArticle',
		contractFunctionName: 'editArticleWithSessionKey',
		selector: FUNCTION_SELECTORS.editArticle,
		abi: BLOGHUB_ABI,
		args: [{
			articleId,
			originalAuthor,
			title,
			summary,
			categoryId: Number(categoryId)
		}]
	});
}
