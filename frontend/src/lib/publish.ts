/**
 * Article publishing orchestration
 * Coordinates upload to Arweave and publishing to blockchain
 */

import {
	uploadArticleFolder,
	uploadArticleFolderWithSessionKey
} from '$lib/arweave';
import type { ArticleFolderUploadParams } from '$lib/arweave';
import { publishToContract, publishToContractWithSessionKey } from '$lib/contracts';
import { getStoredSessionKey, ensureSessionKeyBalance, type StoredSessionKey } from '$lib/sessionKey';

export interface PublishArticleParams {
	title: string;
	summary: string;
	content: string;
	tags: string[];
	coverImage: File | null;
	categoryId: bigint;
	royaltyBps: bigint;
	originalAuthor?: string;
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
		originalAuthor = ''
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
		// Check if we have a valid session key for gasless publishing
		const sessionKey = getStoredSessionKey();
		const useSessionKey = sessionKey && Date.now() / 1000 < sessionKey.validUntil;

		if (useSessionKey && sessionKey) {
			console.log('Using Session Key for gasless publishing...');
			return await publishArticleWithSessionKeyInternal(params, sessionKey);
		}

		// Fallback to traditional publishing with MetaMask
		console.log('Using MetaMask for publishing...');

		// Step 1: Upload article folder (content + cover image)
		console.log('Step 1: Uploading article folder to Arweave...');
		const folderParams: ArticleFolderUploadParams = {
			title: title.trim(),
			summary: summary.trim(),
			content: content.trim(),
			coverImage: coverImage || undefined,
			tags
		};

		const folderResult = await uploadArticleFolder(folderParams, 'devnet');
		console.log(`Article folder uploaded: ${folderResult.manifestId}`);

		// 使用 manifest ID 作为 arweaveId（文章的唯一标识）
		// 封面图片通过 arweaveId/coverImage 路径访问（在 Irys 可变文件夹内）
		const arweaveId = folderResult.manifestId;

		// Step 2: Publish to blockchain
		// 注意：智能合约不再存储 coverImage 字段，封面图片通过 arweaveId/coverImage 路径访问
		console.log('Step 2: Publishing to blockchain...');
		const txHash = await publishToContract(
			arweaveId,
			categoryId,
			royaltyBps,
			originalAuthor,
			title.trim()
		);
		console.log(`Article published to blockchain: ${txHash}`);

		return {
			arweaveId,
			txHash
		};
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
		originalAuthor = ''
	} = params;

	// Step 0: Ensure session key has sufficient balance for gas fees
	console.log('Step 0: Checking session key balance...');
	const hasBalance = await ensureSessionKeyBalance(sessionKey.address);
	if (!hasBalance) {
		throw new Error('Failed to fund session key. Please try again or use MetaMask.');
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
	const txHash = await publishToContractWithSessionKey(
		sessionKey,
		arweaveId,
		categoryId,
		royaltyBps,
		originalAuthor,
		title.trim()
	);
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
	const sessionKey = getStoredSessionKey();
	
	if (!sessionKey) {
		throw new Error('No session key found. Please create a session key first.');
	}

	if (Date.now() / 1000 > sessionKey.validUntil) {
		throw new Error('Session key has expired. Please create a new session key.');
	}

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
