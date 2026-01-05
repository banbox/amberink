/**
 * Article publishing orchestration
 * Coordinates upload to Arweave and publishing to blockchain
 */

import { uploadArticleFolderWithSessionKey } from '$lib/arweave';
import type { ArticleFolderUploadParams, ContentImageInfo, Visibility } from '$lib/arweave';
import { getSessionKeyOwner } from '$lib/arweave/irys';
import { publishToContractWithSessionKey, FUNCTION_SELECTORS } from '$lib/contracts';
import {
	ensureSessionKeyReady,
	getStoredSessionKey,
	type StoredSessionKey
} from '$lib/sessionKey';
import { getWalletClient, getEthereumAccount } from '$lib/wallet';
import { getSignMessageForArticle } from '$lib/arweave/crypto';
import { cacheEncryptionSignature } from '$lib/arweave/encryptionKeyCache';
import { getIrysNetwork } from '$lib/config';

export interface PublishArticleParams {
	title: string;
	summary: string;
	content: string;
	tags: string[];
	coverImage: File | null;
	contentImages?: ContentImageInfo[];
	categoryId: bigint;
	royaltyBps: bigint;
	originalAuthor?: string;
	trueAuthor?: `0x${string}`;
	collectPrice?: bigint;
	maxCollectSupply?: bigint;
	originality?: number;
	visibility?: number; // 0:Public, 1:Private, 2:Encrypted
}

export interface PublishArticleResult {
	arweaveId: string;
	txHash: string;
	articleId?: string;
}

/** 验证发布参数 */
function validatePublishParams(params: PublishArticleParams) {
	if (!params.title.trim()) throw new Error('Title is required');
	if (!params.content.trim()) throw new Error('Content is required');
	if (params.categoryId < 0n) throw new Error('Valid category is required');
	if (params.royaltyBps < 0n || params.royaltyBps > 10000n) throw new Error('Royalty must be between 0 and 100% (0-10000 basis points)');
}

/** Publish article: upload to Arweave, then to blockchain */
export async function publishArticle(params: PublishArticleParams): Promise<PublishArticleResult> {
	validatePublishParams(params);
	try {
		// Use unified ensureSessionKeyReady - handles creation, validation, and funding
		// Only triggers MetaMask popups when necessary:
		// - One popup for session key registration (if no valid key exists)
		// - One popup for funding (if balance is insufficient)
		const sessionKey = await ensureSessionKeyReady({ requiredSelector: FUNCTION_SELECTORS.publish });
		if (!sessionKey) {
			throw new Error('Failed to prepare session key. Please try again.');
		}
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
		contentImages,
		categoryId,
		royaltyBps,
		originalAuthor = '',
		trueAuthor = '0x0000000000000000000000000000000000000000',
		collectPrice = 0n,
		maxCollectSupply = 0n,
		originality = 0,
		visibility = 0
	} = params;

	// Note: Session key balance is already ensured by ensureSessionKeyReady
	// Step 1: Upload article folder with session key (content + cover image + content images)
	console.log('Step 1: Uploading article folder to Arweave with Session Key...');

	// For encrypted articles (visibility=2), provide a signatureProvider callback
	// that will be called by upload.ts after getting the initial manifestId
	let signatureProvider: ((arweaveId: string) => Promise<string>) | undefined;
	if (visibility === 2) {
		console.log('Preparing signatureProvider for encrypted article...');
		signatureProvider = async (arweaveId: string) => {
			const walletClient = await getWalletClient();
			const account = await getEthereumAccount();
			if (!walletClient || !account) {
				throw new Error('Wallet not connected. Please connect your wallet.');
			}

			const message = getSignMessageForArticle(arweaveId);
			console.log('Requesting wallet signature for encryption key derivation...');
			const signature = await walletClient.signMessage({
				account,
				message
			});
			console.log('Wallet signature obtained');

			// 缓存签名到 localStorage，以便后续查看时无需重复签名
			cacheEncryptionSignature(arweaveId, signature);

			return signature;
		};
	}

	const folderParams: ArticleFolderUploadParams = {
		title: title.trim(),
		summary: summary.trim(),
		content: content.trim(),
		coverImage: coverImage || undefined,
		contentImages: contentImages,
		tags,
		visibility: visibility as Visibility,
		authorAddress: getSessionKeyOwner(sessionKey),
		originality,
		signatureProvider
	};

	const folderResult = await uploadArticleFolderWithSessionKey(sessionKey, folderParams, getIrysNetwork());
	const arweaveId = folderResult.manifestId;
	console.log(`Article folder uploaded: ${arweaveId}`);


	// 使用 manifest ID 作为 arweaveId（文章的唯一标识）
	// 封面图片通过 arweaveId/coverImage 路径访问（在 Irys 可变文件夹内）

	// Step 2: Publish to blockchain with session key
	console.log('Step 2: Publishing to blockchain with Session Key...');
	const txHash = await publishToContractWithSessionKey(
		sessionKey,
		arweaveId,
		categoryId,
		royaltyBps,
		originalAuthor,
		title.trim(),
		summary.trim(),
		trueAuthor,
		collectPrice,
		maxCollectSupply,
		originality,
		visibility
	);
	console.log(`Article published to blockchain: ${txHash}`);

	return {
		arweaveId,
		txHash
	};
}

/** Check if gasless publishing is available */
export async function isGaslessPublishingAvailable(): Promise<boolean> {
	try {
		const account = await getEthereumAccount();
		const sessionKey = getStoredSessionKey(account);
		return sessionKey !== null && Date.now() / 1000 < sessionKey.validUntil;
	} catch {
		return false;
	}
}
