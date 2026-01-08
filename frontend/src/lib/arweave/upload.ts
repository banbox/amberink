/**
 * Arweave 上传功能
 */
import {
	createIrysUploader,
	createSessionKeyIrysUploader,
	ensureIrysBalance,
	type IrysUploader
} from './irys';
import { getIrysFreeUploadLimit } from '$lib/config';
import type { ArticleMetadata, IrysTag, IrysNetwork, ArticleFolderUploadParams, ArticleFolderUploadResult, ContentImageInfo } from './types';
import { getConfig, envName } from '$lib/config';
import type { StoredSessionKey } from '$lib/sessionKey';
import {
	generateArticleFolderManifest,
	uploadManifest,
	uploadManifestWithPayer,
	uploadUpdatedManifest,
	ARTICLE_INDEX_FILE,
	ARTICLE_COVER_IMAGE_FILE
} from './folder';
import { encryptContent, deriveEncryptionKey } from './crypto';

/**
 * 上传文章到 Arweave
 * @param metadata - 文章元数据
 * @param network - 网络类型（默认 devnet）
 */
export async function uploadArticle(
	metadata: Omit<ArticleMetadata, 'createdAt' | 'version'>,
	network: IrysNetwork = 'devnet'
): Promise<string> {
	const uploader = await createIrysUploader({ network });

	return uploadArticleWithUploader(uploader, metadata);
}

/**
 * 使用指定 uploader 上传文章
 * @param uploader - Irys uploader 实例
 * @param metadata - 文章元数据
 */
export async function uploadArticleWithUploader(
	uploader: IrysUploader,
	metadata: Omit<ArticleMetadata, 'createdAt' | 'version'>
): Promise<string> {
	// 准备完整数据
	const appCfg = getConfig();
	const appName = appCfg.appName;
	const appVersion = appCfg.appVersion;
	const fullMetadata: ArticleMetadata = {
		...metadata,
		version: appVersion,
		createdAt: Date.now()
	};

	const data = JSON.stringify(fullMetadata);
	const dataSize = new TextEncoder().encode(data).length;

	// 确保 Irys 余额充足
	const hasBalance = await ensureIrysBalance(uploader, dataSize);
	if (!hasBalance) {
		throw new Error('Failed to fund Irys. Please try again.');
	}

	// 构建标签（用于 Arweave GraphQL 查询）
	const tags: IrysTag[] = [
		{ name: 'Content-Type', value: 'application/json' },
		{ name: 'App-Name', value: appName },
		{ name: 'App-Version', value: appVersion },
		{ name: 'Type', value: 'article' },
		{ name: 'Title', value: metadata.title },
		...metadata.tags.map((tag) => ({ name: 'Tag', value: tag }))
	];

	try {
		const receipt = await uploader.upload(data, { tags });
		console.log(`Article uploaded ==> https://gateway.irys.xyz/${receipt.id}`);
		return receipt.id;
	} catch (e) {
		console.error('Error when uploading article:', e);
		throw e;
	}
}

/**
 * 上传图片文件到 Arweave
 * @param file - 图片文件
 * @param network - 网络类型（默认 devnet）
 */
export async function uploadImage(file: File, network: IrysNetwork = 'devnet'): Promise<string> {
	const uploader = await createIrysUploader({ network });

	return uploadImageWithUploader(uploader, file);
}

/**
 * 使用指定 uploader 上传图片
 * @param uploader - Irys uploader 实例
 * @param file - 图片文件
 */
export async function uploadImageWithUploader(uploader: IrysUploader, file: File): Promise<string> {
	const appName = getConfig().appName;

	// 确保 Irys 余额充足
	const hasBalance = await ensureIrysBalance(uploader, file.size);
	if (!hasBalance) {
		throw new Error('Failed to fund Irys. Please try again.');
	}

	const tags: IrysTag[] = [
		{ name: 'Content-Type', value: file.type },
		{ name: 'App-Name', value: appName },
		{ name: 'Type', value: 'image' }
	];

	try {
		const receipt = await uploader.uploadFile(file, { tags });
		console.log(`Image uploaded ==> https://gateway.irys.xyz/${receipt.id}`);
		return receipt.id;
	} catch (e) {
		console.error('Error when uploading image:', e);
		throw e;
	}
}

/**
 * 上传任意数据到 Arweave
 * @param data - 数据（字符串或 Buffer）
 * @param contentType - 内容类型
 * @param customTags - 自定义标签
 * @param network - 网络类型（默认 devnet）
 */
export async function uploadData(
	data: string | Buffer,
	contentType: string,
	customTags: IrysTag[] = [],
	network: IrysNetwork = 'devnet'
): Promise<string> {
	const uploader = await createIrysUploader({ network });
	const appName = getConfig().appName;

	// 计算数据大小并确保余额充足
	const dataSize = typeof data === 'string' ? new TextEncoder().encode(data).length : data.length;
	const hasBalance = await ensureIrysBalance(uploader, dataSize);
	if (!hasBalance) {
		throw new Error('Failed to fund Irys. Please try again.');
	}

	const tags: IrysTag[] = [
		{ name: 'Content-Type', value: contentType },
		{ name: 'App-Name', value: appName },
		...customTags
	];

	try {
		const receipt = await uploader.upload(data, { tags });
		console.log(`Data uploaded ==> https://gateway.irys.xyz/${receipt.id}`);
		return receipt.id;
	} catch (e) {
		console.error('Error when uploading data:', e);
		throw e;
	}
}

// ============================================================
//                  带 paidBy 参数的上传功能（用于 Balance Approvals）
// ============================================================

/**
 * 使用指定 uploader 和 payer 上传文章（Balance Approvals 机制）
 * @param uploader - Irys uploader 实例
 * @param metadata - 文章元数据
 * @param paidBy - 付费账户地址（主账户）
 */
export async function uploadArticleWithUploaderAndPayer(
	uploader: IrysUploader,
	metadata: Omit<ArticleMetadata, 'createdAt' | 'version'>,
	paidBy: string
): Promise<string> {
	// 准备完整数据
	const appCfg = getConfig();
	const appName = appCfg.appName;
	const appVersion = appCfg.appVersion;
	const fullMetadata: ArticleMetadata = {
		...metadata,
		version: appVersion,
		createdAt: Date.now()
	};

	const data = JSON.stringify(fullMetadata);
	const dataSize = new TextEncoder().encode(data).length;

	// Check if within Irys free limit (100KB) - if so, don't use paidBy
	// Irys devnet free uploads don't work with paidBy parameter
	const isFreeUpload = dataSize <= getIrysFreeUploadLimit();
	const effectivePaidBy = isFreeUpload ? undefined : paidBy;

	// 构建标签（用于 Arweave GraphQL 查询）
	const tags: IrysTag[] = [
		{ name: 'Content-Type', value: 'application/json' },
		{ name: 'App-Name', value: appName },
		{ name: 'App-Version', value: appVersion },
		{ name: 'Type', value: 'article' },
		{ name: 'Title', value: metadata.title },
		...metadata.tags.map((tag) => ({ name: 'Tag', value: tag }))
	];

	try {
		const uploadOptions = effectivePaidBy
			? { tags, upload: { paidBy: effectivePaidBy } }
			: { tags };
		const receipt = await uploader.upload(data, uploadOptions);
		console.log(`Article uploaded ==> https://gateway.irys.xyz/${receipt.id}`);
		return receipt.id;
	} catch (e) {
		console.error('Error when uploading article:', e);
		throw e;
	}
}

/**
 * 使用指定 uploader 和 payer 上传图片（Balance Approvals 机制）
 * @param uploader - Irys uploader 实例
 * @param file - 图片文件
 * @param paidBy - 付费账户地址（主账户）
 */
export async function uploadImageWithUploaderAndPayer(
	uploader: IrysUploader,
	file: File,
	paidBy: string
): Promise<string> {
	const appName = getConfig().appName;

	// Check if within Irys free limit (100KB) - if so, don't use paidBy
	// Irys devnet free uploads don't work with paidBy parameter
	const isFreeUpload = file.size <= getIrysFreeUploadLimit();
	const effectivePaidBy = isFreeUpload ? undefined : paidBy;

	const tags: IrysTag[] = [
		{ name: 'Content-Type', value: file.type },
		{ name: 'App-Name', value: appName },
		{ name: 'Type', value: 'image' }
	];

	try {
		const uploadOptions = effectivePaidBy
			? { tags, upload: { paidBy: effectivePaidBy } }
			: { tags };
		const receipt = await uploader.uploadFile(file, uploadOptions);
		console.log(`Image uploaded ==> https://gateway.irys.xyz/${receipt.id}`);
		return receipt.id;
	} catch (e) {
		console.error('Error when uploading image:', e);
		throw e;
	}
}

// ============================================================
//                  Session Key 上传功能
// ============================================================

/** 获取 Session Key Uploader 和 owner 地址 */
async function getSessionKeyUploaderAndOwner(sessionKey: StoredSessionKey, network: IrysNetwork) {
	if (!sessionKey || Date.now() / 1000 >= sessionKey.validUntil) {
		throw new Error('Session key is invalid or expired');
	}
	const uploader = await createSessionKeyIrysUploader(sessionKey, { network });
	return { uploader, ownerAddress: sessionKey.owner };
}

export async function uploadArticleWithSessionKey(
	sessionKey: StoredSessionKey,
	metadata: Omit<ArticleMetadata, 'createdAt' | 'version'>,
	network: IrysNetwork = 'devnet'
): Promise<string> {
	const { uploader, ownerAddress } = await getSessionKeyUploaderAndOwner(sessionKey, network);
	return uploadArticleWithUploaderAndPayer(uploader, metadata, ownerAddress);
}

export async function uploadImageWithSessionKey(
	sessionKey: StoredSessionKey,
	file: File,
	network: IrysNetwork = 'devnet'
): Promise<string> {
	const { uploader, ownerAddress } = await getSessionKeyUploaderAndOwner(sessionKey, network);
	return uploadImageWithUploaderAndPayer(uploader, file, ownerAddress);
}

export async function uploadDataWithSessionKey(
	sessionKey: StoredSessionKey,
	data: string | Buffer,
	contentType: string,
	customTags: IrysTag[] = [],
	network: IrysNetwork = 'devnet'
): Promise<string> {
	const { uploader, ownerAddress } = await getSessionKeyUploaderAndOwner(sessionKey, network);
	const appName = getConfig().appName;
	const dataSize = typeof data === 'string' ? new TextEncoder().encode(data).length : data.length;
	const effectivePaidBy = dataSize <= getIrysFreeUploadLimit() ? undefined : ownerAddress;

	const tags: IrysTag[] = [
		{ name: 'Content-Type', value: contentType },
		{ name: 'App-Name', value: appName },
		...customTags
	];

	try {
		const uploadOptions = effectivePaidBy ? { tags, upload: { paidBy: effectivePaidBy } } : { tags };
		const receipt = await uploader.upload(data, uploadOptions);
		console.log(`Data uploaded with session key ==> https://gateway.irys.xyz/${receipt.id}`);
		return receipt.id;
	} catch (e) {
		console.error('Error when uploading data with session key:', e);
		throw e;
	}
}

// ============================================================
//                  文章文件夹上传功能
// ============================================================

/**
 * 上传 Markdown 内容到 Arweave（作为 index.md）
 * @param uploader - Irys uploader 实例
 * @param content - Markdown 内容
 * @param title - 文章标题（用于标签）
 * @param articleTags - 文章标签
 * @param authorAddress - 作者钱包地址
 * @param visibility - 文章可见性 (0: Public, 1: Private, 2: Encrypted)
 * @param originality - 原创性 (0: Original, 1: SemiOriginal, 2: Reprint)
 * @param paidBy - 可选，付费账户地址（Balance Approvals 机制）
 * @param encryptionKey - 可选，加密密钥（用于加密文章内容）
 */
async function uploadMarkdownContent(
	uploader: IrysUploader,
	content: string,
	title: string,
	articleTags: string[],
	authorAddress: string,
	visibility: number,
	originality: number,
	paidBy?: string,
	encryptionKey?: CryptoKey
): Promise<string> {
	// 如果提供了加密密钥，加密内容
	let contentToUpload = content;
	let contentType = 'text/markdown';
	if (encryptionKey) {
		console.log('Encrypting article content...');
		contentToUpload = await encryptContent(content, encryptionKey);
		contentType = 'application/octet-stream'; // 加密内容使用二进制类型
		console.log('Content encrypted successfully');
	}
	const appCfg = getConfig();
	const appName = appCfg.appName;
	const appVersion = appCfg.appVersion;
	const dataSize = new TextEncoder().encode(content).length;

	// Check if within Irys free limit (100KB) - if so, don't use paidBy
	// Irys devnet free uploads don't work with paidBy parameter
	const isFreeUpload = dataSize <= getIrysFreeUploadLimit();
	const effectivePaidBy = isFreeUpload ? undefined : paidBy;

	// 如果没有 paidBy 或者是免费上传，需要确保 Irys 余额充足
	if (!effectivePaidBy) {
		const hasBalance = await ensureIrysBalance(uploader, dataSize);
		if (!hasBalance) {
			throw new Error('Failed to fund Irys for markdown content. Please try again.');
		}
	}

	const tags: IrysTag[] = [
		{ name: 'Content-Type', value: contentType },
		{ name: 'App-Name', value: appName },
		{ name: 'App-Version', value: appVersion },
		{ name: 'Type', value: 'article-content' },
		{ name: 'Title', value: title },
		{ name: 'Author', value: authorAddress },
		{ name: 'Visibility', value: visibility.toString() },
		{ name: 'Originality', value: originality.toString() },
		{ name: 'Encrypted', value: encryptionKey ? 'true' : 'false' },
		...articleTags.map((tag) => ({ name: 'Tag', value: tag }))
	];

	try {
		const uploadOptions = effectivePaidBy
			? { tags, upload: { paidBy: effectivePaidBy } }
			: { tags };
		const receipt = await uploader.upload(contentToUpload, uploadOptions);
		console.log(`Markdown content uploaded ==> https://gateway.irys.xyz/${receipt.id}`);
		return receipt.id;
	} catch (e) {
		console.error('Error when uploading markdown content:', e);
		throw e;
	}
}

/**
 * 上传封面图片到 Arweave（作为 coverImage）
 * @param uploader - Irys uploader 实例
 * @param file - 图片文件
 * @param paidBy - 可选，付费账户地址（Balance Approvals 机制）
 */
async function uploadCoverImageFile(
	uploader: IrysUploader,
	file: File,
	paidBy?: string
): Promise<string> {
	const appName = getConfig().appName;

	// Check if within Irys free limit (100KB) - if so, don't use paidBy
	// Irys devnet free uploads don't work with paidBy parameter
	const isFreeUpload = file.size <= getIrysFreeUploadLimit();
	const effectivePaidBy = isFreeUpload ? undefined : paidBy;

	// 如果没有 paidBy 或者是免费上传，需要确保 Irys 余额充足
	if (!effectivePaidBy) {
		const hasBalance = await ensureIrysBalance(uploader, file.size);
		if (!hasBalance) {
			throw new Error('Failed to fund Irys for cover image. Please try again.');
		}
	}

	const tags: IrysTag[] = [
		{ name: 'Content-Type', value: file.type },
		{ name: 'App-Name', value: appName },
		{ name: 'Type', value: 'article-cover' }
	];

	try {
		const uploadOptions = effectivePaidBy
			? { tags, upload: { paidBy: effectivePaidBy } }
			: { tags };
		const receipt = await uploader.uploadFile(file, uploadOptions);
		console.log(`Cover image uploaded ==> https://gateway.irys.xyz/${receipt.id}`);
		return receipt.id;
	} catch (e) {
		console.error('Error when uploading cover image:', e);
		throw e;
	}
}

/**
 * 上传内容图片到 Arweave
 * @param uploader - Irys uploader 实例
 * @param imageInfo - 图片信息
 * @param paidBy - 可选，付费账户地址（Balance Approvals 机制）
 * @returns 文件名和交易 ID
 */
async function uploadContentImageFile(
	uploader: IrysUploader,
	imageInfo: ContentImageInfo,
	paidBy?: string
): Promise<{ filename: string; txId: string }> {
	const appName = getConfig().appName;
	const filename = `${imageInfo.id}.${imageInfo.extension}`;

	// Check if within Irys free limit (100KB) - if so, don't use paidBy
	const isFreeUpload = imageInfo.file.size <= getIrysFreeUploadLimit();
	const effectivePaidBy = isFreeUpload ? undefined : paidBy;

	// 如果没有 paidBy 或者是免费上传，需要确保 Irys 余额充足
	if (!effectivePaidBy) {
		const hasBalance = await ensureIrysBalance(uploader, imageInfo.file.size);
		if (!hasBalance) {
			throw new Error(`Failed to fund Irys for content image ${filename}. Please try again.`);
		}
	}

	const tags: IrysTag[] = [
		{ name: 'Content-Type', value: imageInfo.file.type },
		{ name: 'App-Name', value: appName },
		{ name: 'Type', value: 'article-content-image' },
		{ name: 'Image-Id', value: imageInfo.id }
	];

	try {
		const uploadOptions = effectivePaidBy
			? { tags, upload: { paidBy: effectivePaidBy } }
			: { tags };
		const receipt = await uploader.uploadFile(imageInfo.file, uploadOptions);
		console.log(`Content image ${filename} uploaded ==> https://gateway.irys.xyz/${receipt.id}`);
		return { filename, txId: receipt.id };
	} catch (e) {
		console.error(`Error when uploading content image ${filename}:`, e);
		throw e;
	}
}

// ============================================================
//                  Placeholder 缓存功能（加密文章两阶段上传）
// ============================================================

/** Placeholder 缓存存储键前缀 */
const PLACEHOLDER_CACHE_KEY_PREFIX = 'amberink_placeholder_txid';

function getPlaceholderCacheKey(): string {
	return `${PLACEHOLDER_CACHE_KEY_PREFIX}_${envName()}`;
}

function getCachedPlaceholderTxId(): string | null {
	if (typeof window === 'undefined') return null;
	try {
		return localStorage.getItem(getPlaceholderCacheKey());
	} catch {
		return null;
	}
}

function cachePlaceholderTxId(txId: string): void {
	if (typeof window === 'undefined') return;
	try {
		localStorage.setItem(getPlaceholderCacheKey(), txId);
		console.log(`Placeholder txId cached for env '${envName()}': ${txId}`);
	} catch (e) {
		console.warn('Failed to cache placeholder txId:', e);
	}
}

/**
 * 获取或创建 placeholder txId
 * 如果缓存中存在，则直接返回；否则创建新的并缓存
 * 
 * @param uploader - Irys uploader 实例
 * @param title - 文章标题（用于标签）
 * @param articleTags - 文章标签
 * @param authorAddress - 作者钱包地址
 * @param visibility - 文章可见性
 * @param originality - 原创性
 * @param paidBy - 可选，付费账户地址
 */
async function getOrCreatePlaceholderTxId(
	uploader: IrysUploader,
	title: string,
	articleTags: string[],
	authorAddress: string,
	visibility: number,
	originality: number,
	paidBy?: string
): Promise<string> {
	// 尝试从缓存获取
	const cachedTxId = getCachedPlaceholderTxId();
	if (cachedTxId) {
		console.log(`Using cached placeholder txId for env '${envName()}': ${cachedTxId}`);
		return cachedTxId;
	}

	// 缓存不存在，创建新的 placeholder
	console.log(`No cached placeholder for env '${envName()}', creating new one...`);
	const placeholderContent = 'empty text';
	const placeholderTxId = await uploadMarkdownContent(uploader, placeholderContent, title, articleTags, authorAddress, visibility, originality, paidBy);

	// 缓存新创建的 txId
	cachePlaceholderTxId(placeholderTxId);

	return placeholderTxId;
}

/**
 * 使用指定 uploader 上传文章文件夹
 * 将文章内容和封面图片打包为一个链上文件夹
 * 
 * 对于加密文章，使用两阶段上传：
 * 1. 先上传非内容文件，创建初始 manifest 获取 manifestId
 * 2. 用 manifestId 派生加密密钥，加密内容后上传
 * 3. 创建更新后的 manifest，设置 Root-TX 指向原始 manifestId
 * 
 * @param uploader - Irys uploader 实例
 * @param params - 文章文件夹上传参数
 * @param paidBy - 可选，付费账户地址（Balance Approvals 机制）
 */
export async function uploadArticleFolderWithUploader(
	uploader: IrysUploader,
	params: ArticleFolderUploadParams,
	paidBy?: string
): Promise<ArticleFolderUploadResult> {
	const { title, summary, content, coverImage, contentImages, tags: articleTags, signatureProvider, authorAddress, visibility = 0, originality = 0 } = params;
	const isEncrypted = !!signatureProvider;

	// Step 1: 上传封面图片（如果有）- 先上传封面
	let coverImageTxId: string | undefined;
	if (coverImage) {
		console.log('Step 1: Uploading cover image...');
		coverImageTxId = await uploadCoverImageFile(uploader, coverImage, paidBy);
	}

	// Step 2: 逐个上传内容图片
	const contentImageTxIds: Record<string, string> = {};
	if (contentImages && contentImages.length > 0) {
		console.log(`Step 2: Uploading ${contentImages.length} content image(s)...`);
		for (const imageInfo of contentImages) {
			const { filename, txId } = await uploadContentImageFile(uploader, imageInfo, paidBy);
			contentImageTxIds[filename] = txId;
			console.log(`  - ${filename} uploaded`);
		}
	}

	// 构建 manifest 元数据标签
	const manifestTags: IrysTag[] = [
		{ name: 'Article-Title', value: title },
		{ name: 'Article-Summary', value: summary.substring(0, 200) }, // 限制长度
		...articleTags.map((tag) => ({ name: 'Article-Tag', value: tag }))
	];

	// === 加密文章：两阶段上传 ===
	if (isEncrypted) {
		console.log('Step 3: Creating initial manifest for encrypted article...');

		// 检查是否有任何文件内容（封面图或正文图片）
		const hasAnyFileContent = !!coverImageTxId || Object.keys(contentImageTxIds).length > 0;

		// Step 3a: 获取 index.md 的初始 txId
		let initialIndexTxId: string;

		if (hasAnyFileContent) {
			// 有文件内容时，使用第一个可用的文件 txId 作为 index 占位
			// 这样可以复用已上传的内容，避免重复上传 placeholder
			initialIndexTxId = coverImageTxId || Object.values(contentImageTxIds)[0];
			console.log(`  Using existing file as initial index placeholder: ${initialIndexTxId}`);
		} else {
			// 没有任何文件内容时，需要使用 placeholder
			initialIndexTxId = await getOrCreatePlaceholderTxId(uploader, title, articleTags, authorAddress, visibility, originality, paidBy);
			console.log(`  Using placeholder as initial index: ${initialIndexTxId}`);
		}

		// Step 3b: 创建初始 manifest（包含占位内容和其他文件）
		const initialFiles = new Map<string, string>();
		initialFiles.set(ARTICLE_INDEX_FILE, initialIndexTxId);
		if (coverImageTxId) {
			initialFiles.set(ARTICLE_COVER_IMAGE_FILE, coverImageTxId);
		}
		for (const [filename, txId] of Object.entries(contentImageTxIds)) {
			initialFiles.set(filename, txId);
		}

		const initialManifest = await generateArticleFolderManifest(uploader, initialFiles, ARTICLE_INDEX_FILE);

		// 如果没有 paidBy，需要确保余额
		if (!paidBy) {
			const manifestData = JSON.stringify(initialManifest);
			const manifestSize = new TextEncoder().encode(manifestData).length;
			const hasBalance = await ensureIrysBalance(uploader, manifestSize);
			if (!hasBalance) {
				throw new Error('Failed to fund Irys for manifest. Please try again.');
			}
		}

		const originalManifestId = await uploadManifestWithPayer(uploader, initialManifest, manifestTags, paidBy);
		console.log(`Initial manifest created: ${originalManifestId}`);

		// Step 4: 用 manifestId 派生加密密钥
		console.log('Step 4: Deriving encryption key from wallet signature...');
		const signature = await signatureProvider(originalManifestId);
		const encryptionKey = await deriveEncryptionKey(signature);
		console.log('Encryption key derived successfully');

		// Step 5: 加密内容并上传
		console.log('Step 5: Uploading encrypted article content...');
		const encryptedIndexTxId = await uploadMarkdownContent(uploader, content, title, articleTags, authorAddress, visibility, originality, paidBy, encryptionKey);

		// Step 6: 创建更新后的 manifest，设置 Root-TX
		console.log('Step 6: Creating updated manifest with Root-TX...');
		const updatedFiles = new Map<string, string>();
		updatedFiles.set(ARTICLE_INDEX_FILE, encryptedIndexTxId);
		if (coverImageTxId) {
			updatedFiles.set(ARTICLE_COVER_IMAGE_FILE, coverImageTxId);
		}
		for (const [filename, txId] of Object.entries(contentImageTxIds)) {
			updatedFiles.set(filename, txId);
		}

		const updatedManifest = await generateArticleFolderManifest(uploader, updatedFiles, ARTICLE_INDEX_FILE);

		// 上传更新后的 manifest，带 Root-TX 标签
		await uploadUpdatedManifest(uploader, updatedManifest, originalManifestId, manifestTags);

		console.log(`Encrypted article folder created:`);
		console.log(`  - Original Manifest: ${originalManifestId}`);
		console.log(`  - Mutable URL: https://gateway.irys.xyz/mutable/${originalManifestId}`);
		console.log(`  - Content:  https://gateway.irys.xyz/mutable/${originalManifestId}/${ARTICLE_INDEX_FILE}`);
		if (coverImageTxId) {
			console.log(`  - Cover:    https://gateway.irys.xyz/mutable/${originalManifestId}/${ARTICLE_COVER_IMAGE_FILE}`);
		}

		// 返回原始 manifestId（稳定的 mutable URL 入口）
		return {
			manifestId: originalManifestId,
			indexTxId: encryptedIndexTxId,
			coverImageTxId,
			contentImageTxIds: Object.keys(contentImageTxIds).length > 0 ? contentImageTxIds : undefined
		};
	}

	// === 普通文章：一阶段上传 ===
	console.log('Step 3: Uploading article content (index.md)...');
	const indexTxId = await uploadMarkdownContent(uploader, content, title, articleTags, authorAddress, visibility, originality, paidBy);

	// Step 4: 使用 Irys SDK 生成文件夹 manifest
	console.log('Step 4: Creating article folder manifest using Irys SDK...');
	const files = new Map<string, string>();
	files.set(ARTICLE_INDEX_FILE, indexTxId);
	if (coverImageTxId) {
		files.set(ARTICLE_COVER_IMAGE_FILE, coverImageTxId);
	}
	// 添加内容图片到 manifest
	for (const [filename, txId] of Object.entries(contentImageTxIds)) {
		files.set(filename, txId);
	}

	// 使用 SDK 的 generateFolder 方法生成正确格式的 manifest
	const manifest = await generateArticleFolderManifest(uploader, files, ARTICLE_INDEX_FILE);

	// 如果没有 paidBy，需要确保余额
	if (!paidBy) {
		const manifestData = JSON.stringify(manifest);
		const manifestSize = new TextEncoder().encode(manifestData).length;
		const hasBalance = await ensureIrysBalance(uploader, manifestSize);
		if (!hasBalance) {
			throw new Error('Failed to fund Irys for manifest. Please try again.');
		}
	}

	const manifestId = await uploadManifestWithPayer(uploader, manifest, manifestTags, paidBy);

	console.log(`Article folder created:`);
	console.log(`  - Manifest: https://gateway.irys.xyz/${manifestId}`);
	console.log(`  - Content:  https://gateway.irys.xyz/${manifestId}/${ARTICLE_INDEX_FILE}`);
	if (coverImageTxId) {
		console.log(`  - Cover:    https://gateway.irys.xyz/${manifestId}/${ARTICLE_COVER_IMAGE_FILE}`);
	}
	if (Object.keys(contentImageTxIds).length > 0) {
		console.log(`  - Content Images: ${Object.keys(contentImageTxIds).length} file(s)`);
	}

	return {
		manifestId,
		indexTxId,
		coverImageTxId,
		contentImageTxIds: Object.keys(contentImageTxIds).length > 0 ? contentImageTxIds : undefined
	};
}


/**
 * 上传文章文件夹到 Arweave
 * @param params - 文章文件夹上传参数
 * @param network - 网络类型（默认 devnet）
 */
export async function uploadArticleFolder(
	params: ArticleFolderUploadParams,
	network: IrysNetwork = 'devnet'
): Promise<ArticleFolderUploadResult> {
	const uploader = await createIrysUploader({ network });
	return uploadArticleFolderWithUploader(uploader, params);
}

/**
 * 使用 Session Key 上传文章文件夹到 Arweave（无需 MetaMask 签名）
 * 使用 Irys Balance Approvals 机制，由主账户付费
 * @param sessionKey - 存储的 Session Key 数据
 * @param params - 文章文件夹上传参数
 * @param network - 网络类型（默认 devnet）
 */
export async function uploadArticleFolderWithSessionKey(
	sessionKey: StoredSessionKey,
	params: ArticleFolderUploadParams,
	network: IrysNetwork = 'devnet'
): Promise<ArticleFolderUploadResult> {
	if (!sessionKey || Date.now() / 1000 >= sessionKey.validUntil) {
		throw new Error('Session key is invalid or expired');
	}

	const uploader = await createSessionKeyIrysUploader(sessionKey, { network });

	// 使用 paidBy 参数指定主账户付费（Balance Approvals 机制）
	return uploadArticleFolderWithUploader(uploader as unknown as IrysUploader, params, sessionKey.owner);
}

// ============================================================
//                  文章更新功能（Irys Mutable Folders）
// ============================================================

/** 文章更新参数 */
export interface ArticleFolderUpdateParams {
	title: string;
	summary: string;
	content: string;         // Markdown 内容
	coverImage?: File;       // 新封面图片（可选，不提供则保留原有）
	contentImages?: ContentImageInfo[]; // 新增的内容图片列表
	tags: string[];
	keepExistingCover?: boolean; // 是否保留现有封面（默认 true）
	authorAddress: string;   // 作者钱包地址
	visibility?: number;     // 文章可见性 (0: Public, 1: Private, 2: Encrypted)
	originality?: number;    // 原创性 (0: Original, 1: SemiOriginal, 2: Reprint)
}

/** 文章更新结果 */
export interface ArticleFolderUpdateResult {
	newManifestTxId: string;  // 新的 manifest 交易 ID（用于 Root-TX 链）
	indexTxId: string;        // 新的 index.md 交易 ID
	coverImageTxId?: string;  // 新的 coverImage 交易 ID（如果更新了封面）
}

/**
 * 使用指定 uploader 更新文章文件夹（Irys Mutable Folders）
 * 通过 Root-TX 标签实现可变引用更新
 * 
 * @param uploader - Irys uploader 实例
 * @param originalManifestId - 原始文章的 manifest ID（用作 Root-TX）
 * @param params - 文章更新参数
 * @param paidBy - 可选，付费账户地址（Balance Approvals 机制）
 */
export async function updateArticleFolderWithUploader(
	uploader: IrysUploader,
	originalManifestId: string,
	params: ArticleFolderUpdateParams,
	paidBy?: string
): Promise<ArticleFolderUpdateResult> {
	const { title, summary, content, coverImage, contentImages, tags: articleTags, keepExistingCover = true, authorAddress, visibility = 0, originality = 0 } = params;

	// Debug: log cover image params
	console.log('Update article params:', {
		hasCoverImage: !!coverImage,
		coverImageSize: coverImage?.size,
		keepExistingCover,
		originalManifestId
	});

	// Step 1: 上传新的文章内容（index.md）
	console.log('Uploading updated article content (index.md)...');
	const indexTxId = await uploadMarkdownContent(uploader, content, title, articleTags, authorAddress, visibility, originality, paidBy);

	// Step 2: 处理封面图片和保留现有内容图片
	let coverImageTxId: string | undefined;
	const existingContentImages: Record<string, string> = {};

	// 始终获取原始 manifest 以保留内容图片
	try {
		const { downloadManifest, ARTICLE_COVER_IMAGE_FILE } = await import('./folder');
		console.log('Fetching original manifest to preserve existing files...');
		const originalManifest = await downloadManifest(originalManifestId);
		console.log('Original manifest paths:', Object.keys(originalManifest.paths));

		// 处理封面图片
		if (coverImage) {
			console.log('Uploading new cover image...');
			coverImageTxId = await uploadCoverImageFile(uploader, coverImage, paidBy);
		} else if (keepExistingCover) {
			coverImageTxId = originalManifest.paths[ARTICLE_COVER_IMAGE_FILE]?.id;
			console.log('Existing cover TX ID:', coverImageTxId || '(none found)');
		} else {
			console.log('keepExistingCover is false and no new cover provided, cover will be removed');
		}

		// 保留现有内容图片（index.md 和 coverImage 以外的所有文件）
		for (const [fileName, { id }] of Object.entries(originalManifest.paths)) {
			if (fileName !== ARTICLE_INDEX_FILE && fileName !== ARTICLE_COVER_IMAGE_FILE) {
				existingContentImages[fileName] = id;
			}
		}
		if (Object.keys(existingContentImages).length > 0) {
			console.log('Preserving existing content images:', Object.keys(existingContentImages));
		}
	} catch (e) {
		console.warn('Failed to fetch original manifest:', e);
		// 如果获取原始 manifest 失败，仍然尝试上传新封面
		if (coverImage) {
			console.log('Uploading new cover image...');
			coverImageTxId = await uploadCoverImageFile(uploader, coverImage, paidBy);
		}
	}

	// Step 2b: 上传新增的内容图片
	const newContentImageTxIds: Record<string, string> = {};
	if (contentImages && contentImages.length > 0) {
		console.log(`Uploading ${contentImages.length} new content image(s)...`);
		for (const imageInfo of contentImages) {
			const { filename, txId } = await uploadContentImageFile(uploader, imageInfo, paidBy);
			newContentImageTxIds[filename] = txId;
			console.log(`  - ${filename} uploaded`);
		}
	}

	// Step 3: 生成新的 manifest
	console.log('Creating updated article folder manifest...');
	const files = new Map<string, string>();
	files.set(ARTICLE_INDEX_FILE, indexTxId);
	if (coverImageTxId) {
		files.set(ARTICLE_COVER_IMAGE_FILE, coverImageTxId);
	}
	// 添加保留的内容图片
	for (const [fileName, txId] of Object.entries(existingContentImages)) {
		files.set(fileName, txId);
	}
	// 添加新上传的内容图片
	for (const [fileName, txId] of Object.entries(newContentImageTxIds)) {
		files.set(fileName, txId);
	}

	// Debug: 显示 manifest 将包含的文件
	console.log('Manifest files:', Object.fromEntries(files));

	// 使用 SDK 的 generateFolder 生成 manifest
	const manifest = await generateArticleFolderManifest(uploader, files, ARTICLE_INDEX_FILE);

	// Debug: 显示生成的 manifest 内容
	console.log('Generated manifest:', JSON.stringify(manifest, null, 2));

	// Step 4: 上传更新的 manifest（带 Root-TX 标签指向原始 manifest）
	const manifestTags: IrysTag[] = [
		{ name: 'Article-Title', value: title },
		{ name: 'Article-Summary', value: summary.substring(0, 200) },
		...articleTags.map((tag) => ({ name: 'Article-Tag', value: tag }))
	];

	// 如果没有 paidBy，需要确保余额
	if (!paidBy) {
		const manifestData = JSON.stringify(manifest);
		const manifestSize = new TextEncoder().encode(manifestData).length;
		const hasBalance = await ensureIrysBalance(uploader, manifestSize);
		if (!hasBalance) {
			throw new Error('Failed to fund Irys for manifest. Please try again.');
		}
	}

	const newManifestTxId = await uploadUpdatedManifestWithPayer(
		uploader,
		manifest,
		originalManifestId,
		manifestTags,
		paidBy
	);

	console.log(`Article folder updated:`);
	console.log(`  - Original Manifest: ${originalManifestId}`);
	console.log(`  - New Manifest TX: ${newManifestTxId}`);
	console.log(`  - New Index TX: ${indexTxId}`);
	console.log(`  - Mutable URL: https://gateway.irys.xyz/mutable/${originalManifestId}`);

	return {
		newManifestTxId,
		indexTxId,
		coverImageTxId
	};
}

/**
 * 上传更新的 manifest（带 paidBy 参数）
 */
async function uploadUpdatedManifestWithPayer(
	uploader: IrysUploader,
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	manifest: any,
	originalManifestId: string,
	customTags: IrysTag[] = [],
	paidBy?: string
): Promise<string> {
	const appName = getConfig().appName;
	const appVersion = getConfig().appVersion;
	const manifestData = JSON.stringify(manifest);
	const dataSize = new TextEncoder().encode(manifestData).length;

	// Check if within Irys free limit
	const isFreeUpload = dataSize <= getIrysFreeUploadLimit();
	const effectivePaidBy = isFreeUpload ? undefined : paidBy;

	const tags: IrysTag[] = [
		{ name: 'Type', value: 'manifest' },
		{ name: 'Content-Type', value: 'application/x.irys-manifest+json' },
		{ name: 'Root-TX', value: originalManifestId }, // 关键：指向原始 manifest
		{ name: 'App-Name', value: appName },
		{ name: 'App-Version', value: appVersion },
		...customTags
	];

	// Debug: 显示上传的标签
	console.log('Manifest upload tags:', tags.map(t => `${t.name}=${t.value}`).join(', '));
	console.log('Manifest data being uploaded:', manifestData);

	const uploadOptions = effectivePaidBy
		? { tags, upload: { paidBy: effectivePaidBy } }
		: { tags };

	const receipt = await uploader.upload(manifestData, uploadOptions);
	console.log(`Updated manifest uploaded:`);
	console.log(`  - New Manifest TX: ${receipt.id}`);
	console.log(`  - Root-TX (original): ${originalManifestId}`);
	console.log(`  - Mutable URL: https://gateway.irys.xyz/mutable/${originalManifestId}`);
	console.log(`  - Direct URL: https://gateway.irys.xyz/${receipt.id}`);
	return receipt.id;
}

/**
 * 更新文章文件夹到 Arweave（普通钱包模式）
 * @param originalManifestId - 原始文章的 manifest ID
 * @param params - 文章更新参数
 * @param network - 网络类型（默认 devnet）
 */
export async function updateArticleFolder(
	originalManifestId: string,
	params: ArticleFolderUpdateParams,
	network: IrysNetwork = 'devnet'
): Promise<ArticleFolderUpdateResult> {
	const uploader = await createIrysUploader({ network });
	return updateArticleFolderWithUploader(uploader, originalManifestId, params);
}

/**
 * 使用 Session Key 更新文章文件夹到 Arweave（无需 MetaMask 签名）
 * @param sessionKey - 存储的 Session Key 数据
 * @param originalManifestId - 原始文章的 manifest ID
 * @param params - 文章更新参数
 * @param network - 网络类型（默认 devnet）
 */
export async function updateArticleFolderWithSessionKey(
	sessionKey: StoredSessionKey,
	originalManifestId: string,
	params: ArticleFolderUpdateParams,
	network: IrysNetwork = 'devnet'
): Promise<ArticleFolderUpdateResult> {
	if (!sessionKey || Date.now() / 1000 >= sessionKey.validUntil) {
		throw new Error('Session key is invalid or expired');
	}

	const uploader = await createSessionKeyIrysUploader(sessionKey, { network });

	return updateArticleFolderWithUploader(uploader as unknown as IrysUploader, originalManifestId, params, sessionKey.owner);
}
