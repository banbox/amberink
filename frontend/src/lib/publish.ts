/**
 * Article publishing orchestration
 * Coordinates upload to Arweave and publishing to blockchain
 */

import {
	uploadArticle,
	uploadImage,
	uploadArticleWithSessionKey,
	uploadImageWithSessionKey
} from '$lib/arweave';
import { publishToContract, publishToContractWithSessionKey } from '$lib/contracts';
import type { ArticleMetadata } from '$lib/arweave';
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

		// Step 1: Upload cover image if provided
		let coverImageHash: string | undefined;
		if (coverImage) {
			console.log('Step 1: Uploading cover image...');
			coverImageHash = await uploadImage(coverImage, 'devnet');
			console.log(`Cover image uploaded: ${coverImageHash}`);
		}

		// Step 2: Upload article to Arweave
		console.log('Step 2: Uploading article to Arweave...');
		const articleMetadata: Omit<ArticleMetadata, 'createdAt' | 'version'> = {
			title: title.trim(),
			summary: summary.trim(),
			content: content.trim(),
			coverImage: coverImageHash,
			tags
		};

		const arweaveId = await uploadArticle(articleMetadata, 'devnet');
		console.log(`Article uploaded to Arweave: ${arweaveId}`);

		// Step 3: Publish to blockchain
		console.log('Step 3: Publishing to blockchain...');
		const txHash = await publishToContract(
			arweaveId,
			categoryId,
			royaltyBps,
			originalAuthor,
			title.trim(),
			coverImageHash || ''
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

	// Step 1: Upload cover image with session key if provided
	let coverImageHash: string | undefined;
	if (coverImage) {
		console.log('Step 1: Uploading cover image with Session Key...');
		coverImageHash = await uploadImageWithSessionKey(sessionKey, coverImage, 'devnet');
		console.log(`Cover image uploaded: ${coverImageHash}`);
	}

	// Step 2: Upload article to Arweave with session key
	console.log('Step 2: Uploading article to Arweave with Session Key...');
	const articleMetadata: Omit<ArticleMetadata, 'createdAt' | 'version'> = {
		title: title.trim(),
		summary: summary.trim(),
		content: content.trim(),
		coverImage: coverImageHash,
		tags
	};

	const arweaveId = await uploadArticleWithSessionKey(sessionKey, articleMetadata, 'devnet');
	console.log(`Article uploaded to Arweave: ${arweaveId}`);

	// Step 3: Publish to blockchain with session key
	console.log('Step 3: Publishing to blockchain with Session Key...');
	const txHash = await publishToContractWithSessionKey(
		sessionKey,
		arweaveId,
		categoryId,
		royaltyBps,
		originalAuthor,
		title.trim(),
		coverImageHash || ''
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
