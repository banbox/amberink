/**
 * Article publishing orchestration
 * Coordinates upload to Arweave and publishing to blockchain
 */

import { uploadArticleFolderWithSessionKey } from '$lib/arweave';
import type { ArticleFolderUploadParams } from '$lib/arweave';
import { publishToContractWithSessionKey } from '$lib/contracts';
import {
	getStoredSessionKey,
	createSessionKey,
	hasSessionKeySufficientBalance,
	isSessionKeyValidForCurrentWallet,
	isSessionKeyValidForPublish,
	type StoredSessionKey
} from '$lib/sessionKey';

/**
 * Get a valid session key, creating one if necessary
 * This triggers ONE MetaMask signature if no valid session key exists
 * @returns Valid session key
 */
async function getOrCreateValidSessionKey(): Promise<StoredSessionKey> {
	// Check if we have a stored session key
	let sessionKey = getStoredSessionKey();

	// Validate: exists, not expired, and belongs to current wallet
	if (sessionKey) {
		const isOwnerValid = await isSessionKeyValidForCurrentWallet();
		if (isOwnerValid) {
			const isAuthorized = await isSessionKeyValidForPublish(sessionKey);
			if (isAuthorized) {
				console.log('Using existing valid Session Key');
				return sessionKey;
			}
			console.log('Stored Session Key is not authorized for publish, recreating...');
		} else {
			console.log('Stored Session Key is invalid or belongs to different wallet');
		}
	}

	// No valid session key - create a new one (requires ONE MetaMask signature)
	console.log('Creating new Session Key (requires MetaMask signature)...');
	sessionKey = await createSessionKey();
	console.log(`New Session Key created: ${sessionKey.address}`);

	return sessionKey;
}

export interface PublishArticleParams {
	title: string;
	summary: string;
	content: string;
	tags: string[];
	coverImage: File | null;
	categoryId: bigint;
	royaltyBps: bigint;
	originalAuthor?: string;
	trueAuthor?: `0x${string}`;
	collectPrice?: bigint;
	maxCollectSupply?: bigint;
	originality?: number;
}

export interface PublishArticleResult {
	arweaveId: string;
	txHash: string;
	articleId?: string;
}

/**
 * Publish article: upload to Arweave, then to blockchain
 * @param params - Article publishing parameters
 * @returns Arweave ID and transaction hash
 */
export async function publishArticle(params: PublishArticleParams): Promise<PublishArticleResult> {
	const {
		title,
		summary,
		content,
		tags,
		coverImage,
		categoryId,
		royaltyBps,
		originalAuthor = '',
		trueAuthor = '0x0000000000000000000000000000000000000000',
		collectPrice = 0n,
		maxCollectSupply = 0n,
		originality = 0
	} = params;

	// Validation
	if (!title.trim()) {
		throw new Error('Title is required');
	}

	if (!content.trim()) {
		throw new Error('Content is required');
	}

	if (categoryId < 0n) {
		throw new Error('Valid category is required');
	}

	if (royaltyBps < 0n || royaltyBps > 10000n) {
		throw new Error('Royalty must be between 0 and 100% (0-10000 basis points)');
	}

	try {
		// Get or create a valid session key
		// This ensures we only need ONE MetaMask signature (for session key creation)
		// instead of multiple signatures for each upload operation
		let sessionKey = await getOrCreateValidSessionKey();

		console.log('Using Session Key for gasless publishing...');
		return await publishArticleWithSessionKeyInternal(params, sessionKey);
	} catch (error) {
		console.error('Error during article publishing:', error);
		throw error;
	}
}

/**
 * Internal function to publish article using Session Key (gasless)
 * @param params - Article publishing parameters
 * @param sessionKey - Valid session key
 * @returns Arweave ID and transaction hash
 */
async function publishArticleWithSessionKeyInternal(
	params: PublishArticleParams,
	sessionKey: StoredSessionKey
): Promise<PublishArticleResult> {
	const {
		title,
		summary,
		content,
		tags,
		coverImage,
		categoryId,
		royaltyBps,
		originalAuthor = '',
		trueAuthor = '0x0000000000000000000000000000000000000000',
		collectPrice = 0n,
		maxCollectSupply = 0n,
		originality = 0
	} = params;

	// Step 0: Check session key has sufficient balance for gas fees
	// Note: Session key is funded when created, we only check here (no MetaMask signature needed)
	console.log('Step 0: Checking session key balance...');
	const hasBalance = await hasSessionKeySufficientBalance(sessionKey.address);
	if (!hasBalance) {
		throw new Error('Session key balance is insufficient. Please create a new session key to refund.');
	}

	// Step 1: Upload article folder with session key (content + cover image)
	console.log('Step 1: Uploading article folder to Arweave with Session Key...');
	const folderParams: ArticleFolderUploadParams = {
		title: title.trim(),
		summary: summary.trim(),
		content: content.trim(),
		coverImage: coverImage || undefined,
		tags
	};

	const folderResult = await uploadArticleFolderWithSessionKey(sessionKey, folderParams, 'devnet');
	console.log(`Article folder uploaded: ${folderResult.manifestId}`);

	// 使用 manifest ID 作为 arweaveId（文章的唯一标识）
	// 封面图片通过 arweaveId/coverImage 路径访问（在 Irys 可变文件夹内）
	const arweaveId = folderResult.manifestId;

	// Step 2: Publish to blockchain with session key
	// 注意：智能合约不再存储 coverImage 字段，封面图片通过 arweaveId/coverImage 路径访问
	console.log('Step 2: Publishing to blockchain with Session Key...');
	let txHash: string;
	try {
		txHash = await publishToContractWithSessionKey(
			sessionKey,
			arweaveId,
			categoryId,
			royaltyBps,
			originalAuthor,
			title.trim(),
			trueAuthor,
			collectPrice,
			maxCollectSupply,
			originality
		);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		if (message.toLowerCase().includes('session key')) {
			console.warn('Session key failed during publish, recreating and retrying once...');
			const newSessionKey = await createSessionKey();
			txHash = await publishToContractWithSessionKey(
				newSessionKey,
				arweaveId,
				categoryId,
				royaltyBps,
				originalAuthor,
				title.trim(),
				trueAuthor,
				collectPrice,
				maxCollectSupply,
				originality
			);
		} else {
			throw error;
		}
	}
	console.log(`Article published to blockchain: ${txHash}`);

	return {
		arweaveId,
		txHash
	};
}

/**
 * Force publish article using Session Key (explicit gasless mode)
 * @param params - Article publishing parameters
 * @returns Arweave ID and transaction hash
 * @throws Error if no valid session key is available
 */
export async function publishArticleGasless(params: PublishArticleParams): Promise<PublishArticleResult> {
	// Validation
	if (!params.title.trim()) {
		throw new Error('Title is required');
	}

	if (!params.content.trim()) {
		throw new Error('Content is required');
	}

	if (params.categoryId < 0n) {
		throw new Error('Valid category is required');
	}

	if (params.royaltyBps < 0n || params.royaltyBps > 10000n) {
		throw new Error('Royalty must be between 0 and 100% (0-10000 basis points)');
	}

	try {
		// Get or create a valid session key
		const sessionKey = await getOrCreateValidSessionKey();
		return await publishArticleWithSessionKeyInternal(params, sessionKey);
	} catch (error) {
		console.error('Error during gasless article publishing:', error);
		throw error;
	}
}

/**
 * Check if gasless publishing is available
 * @returns true if a valid session key exists
 */
export function isGaslessPublishingAvailable(): boolean {
	const sessionKey = getStoredSessionKey();
	return sessionKey !== null && Date.now() / 1000 < sessionKey.validUntil;
}
