/**
 * Arweave 上传功能
 */
import {
	getIrysUploader,
	getIrysUploaderDevnet,
	ensureIrysBalance,
	getSessionKeyIrysUploader,
	getSessionKeyIrysUploaderDevnet,
	isSessionKeyValid,
	getSessionKeyOwner,
	isWithinIrysFreeLimit,
	type IrysUploader
} from './irys';
import type { ArticleMetadata, IrysTag, IrysNetwork, ArticleFolderUploadParams, ArticleFolderUploadResult } from './types';
import { getAppName, getAppVersion } from '$lib/config';
import type { StoredSessionKey } from '$lib/sessionKey';
import {
	generateArticleFolderManifest,
	uploadManifest,
	uploadManifestWithPayer,
	ARTICLE_INDEX_FILE,
	ARTICLE_COVER_IMAGE_FILE
} from './folder';

/**
 * 上传文章到 Arweave
 * @param metadata - 文章元数据
 * @param network - 网络类型（默认 devnet）
 */
export async function uploadArticle(
	metadata: Omit<ArticleMetadata, 'createdAt' | 'version'>,
	network: IrysNetwork = 'devnet'
): Promise<string> {
	const uploader = network === 'mainnet' ? await getIrysUploader() : await getIrysUploaderDevnet();

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
	const appName = getAppName();
	const appVersion = getAppVersion();
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
	const uploader = network === 'mainnet' ? await getIrysUploader() : await getIrysUploaderDevnet();

	return uploadImageWithUploader(uploader, file);
}

/**
 * 使用指定 uploader 上传图片
 * @param uploader - Irys uploader 实例
 * @param file - 图片文件
 */
export async function uploadImageWithUploader(uploader: IrysUploader, file: File): Promise<string> {
	const appName = getAppName();
	
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
	const uploader = network === 'mainnet' ? await getIrysUploader() : await getIrysUploaderDevnet();
	const appName = getAppName();

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
	const appName = getAppName();
	const appVersion = getAppVersion();
	const fullMetadata: ArticleMetadata = {
		...metadata,
		version: appVersion,
		createdAt: Date.now()
	};

	const data = JSON.stringify(fullMetadata);
	const dataSize = new TextEncoder().encode(data).length;

	// Check if within Irys free limit (100KB) - if so, don't use paidBy
	// Irys devnet free uploads don't work with paidBy parameter
	const isFreeUpload = isWithinIrysFreeLimit(dataSize);
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
	const appName = getAppName();

	// Check if within Irys free limit (100KB) - if so, don't use paidBy
	// Irys devnet free uploads don't work with paidBy parameter
	const isFreeUpload = isWithinIrysFreeLimit(file.size);
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

/**
 * 使用 Session Key 上传文章到 Arweave（无需 MetaMask 签名）
 * 使用 Irys Balance Approvals 机制，由主账户付费
 * @param sessionKey - 存储的 Session Key 数据
 * @param metadata - 文章元数据
 * @param network - 网络类型（默认 devnet）
 */
export async function uploadArticleWithSessionKey(
	sessionKey: StoredSessionKey,
	metadata: Omit<ArticleMetadata, 'createdAt' | 'version'>,
	network: IrysNetwork = 'devnet'
): Promise<string> {
	if (!isSessionKeyValid(sessionKey)) {
		throw new Error('Session key is invalid or expired');
	}

	const uploader =
		network === 'mainnet'
			? await getSessionKeyIrysUploader(sessionKey)
			: await getSessionKeyIrysUploaderDevnet(sessionKey);

	// 使用 paidBy 参数指定主账户付费（Balance Approvals 机制）
	const ownerAddress = getSessionKeyOwner(sessionKey);
	return uploadArticleWithUploaderAndPayer(uploader, metadata, ownerAddress);
}

/**
 * 使用 Session Key 上传图片到 Arweave（无需 MetaMask 签名）
 * 使用 Irys Balance Approvals 机制，由主账户付费
 * @param sessionKey - 存储的 Session Key 数据
 * @param file - 图片文件
 * @param network - 网络类型（默认 devnet）
 */
export async function uploadImageWithSessionKey(
	sessionKey: StoredSessionKey,
	file: File,
	network: IrysNetwork = 'devnet'
): Promise<string> {
	if (!isSessionKeyValid(sessionKey)) {
		throw new Error('Session key is invalid or expired');
	}

	const uploader =
		network === 'mainnet'
			? await getSessionKeyIrysUploader(sessionKey)
			: await getSessionKeyIrysUploaderDevnet(sessionKey);

	// 使用 paidBy 参数指定主账户付费（Balance Approvals 机制）
	const ownerAddress = getSessionKeyOwner(sessionKey);
	return uploadImageWithUploaderAndPayer(uploader, file, ownerAddress);
}

/**
 * 使用 Session Key 上传任意数据到 Arweave（无需 MetaMask 签名）
 * 使用 Irys Balance Approvals 机制，由主账户付费
 * @param sessionKey - 存储的 Session Key 数据
 * @param data - 数据（字符串或 Buffer）
 * @param contentType - 内容类型
 * @param customTags - 自定义标签
 * @param network - 网络类型（默认 devnet）
 */
export async function uploadDataWithSessionKey(
	sessionKey: StoredSessionKey,
	data: string | Buffer,
	contentType: string,
	customTags: IrysTag[] = [],
	network: IrysNetwork = 'devnet'
): Promise<string> {
	if (!isSessionKeyValid(sessionKey)) {
		throw new Error('Session key is invalid or expired');
	}

	const uploader =
		network === 'mainnet'
			? await getSessionKeyIrysUploader(sessionKey)
			: await getSessionKeyIrysUploaderDevnet(sessionKey);

	const appName = getAppName();
	const ownerAddress = getSessionKeyOwner(sessionKey);
	const dataSize = typeof data === 'string' ? new TextEncoder().encode(data).length : data.length;

	// Check if within Irys free limit (100KB) - if so, don't use paidBy
	// Irys devnet free uploads don't work with paidBy parameter
	const isFreeUpload = isWithinIrysFreeLimit(dataSize);
	const effectivePaidBy = isFreeUpload ? undefined : ownerAddress;

	const tags: IrysTag[] = [
		{ name: 'Content-Type', value: contentType },
		{ name: 'App-Name', value: appName },
		...customTags
	];

	try {
		const uploadOptions = effectivePaidBy
			? { tags, upload: { paidBy: effectivePaidBy } }
			: { tags };
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
 * @param paidBy - 可选，付费账户地址（Balance Approvals 机制）
 */
async function uploadMarkdownContent(
	uploader: IrysUploader,
	content: string,
	title: string,
	articleTags: string[],
	paidBy?: string
): Promise<string> {
	const appName = getAppName();
	const appVersion = getAppVersion();
	const dataSize = new TextEncoder().encode(content).length;

	// Check if within Irys free limit (100KB) - if so, don't use paidBy
	// Irys devnet free uploads don't work with paidBy parameter
	const isFreeUpload = isWithinIrysFreeLimit(dataSize);
	const effectivePaidBy = isFreeUpload ? undefined : paidBy;

	// 如果没有 paidBy 或者是免费上传，需要确保 Irys 余额充足
	if (!effectivePaidBy) {
		const hasBalance = await ensureIrysBalance(uploader, dataSize);
		if (!hasBalance) {
			throw new Error('Failed to fund Irys for markdown content. Please try again.');
		}
	}

	const tags: IrysTag[] = [
		{ name: 'Content-Type', value: 'text/markdown' },
		{ name: 'App-Name', value: appName },
		{ name: 'App-Version', value: appVersion },
		{ name: 'Type', value: 'article-content' },
		{ name: 'Title', value: title },
		...articleTags.map((tag) => ({ name: 'Tag', value: tag }))
	];

	try {
		const uploadOptions = effectivePaidBy 
			? { tags, upload: { paidBy: effectivePaidBy } }
			: { tags };
		const receipt = await uploader.upload(content, uploadOptions);
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
	const appName = getAppName();

	// Check if within Irys free limit (100KB) - if so, don't use paidBy
	// Irys devnet free uploads don't work with paidBy parameter
	const isFreeUpload = isWithinIrysFreeLimit(file.size);
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
 * 使用指定 uploader 上传文章文件夹
 * 将文章内容和封面图片打包为一个链上文件夹
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
	const { title, summary, content, coverImage, tags: articleTags } = params;

	// Step 1: 上传文章内容（index.md）
	console.log('Uploading article content (index.md)...');
	const indexTxId = await uploadMarkdownContent(uploader, content, title, articleTags, paidBy);

	// Step 2: 上传封面图片（如果有）
	let coverImageTxId: string | undefined;
	if (coverImage) {
		console.log('Uploading cover image...');
		coverImageTxId = await uploadCoverImageFile(uploader, coverImage, paidBy);
	}

	// Step 3: 使用 Irys SDK 生成文件夹 manifest
	console.log('Creating article folder manifest using Irys SDK...');
	const files = new Map<string, string>();
	files.set(ARTICLE_INDEX_FILE, indexTxId);
	if (coverImageTxId) {
		files.set(ARTICLE_COVER_IMAGE_FILE, coverImageTxId);
	}

	// 使用 SDK 的 generateFolder 方法生成正确格式的 manifest
	const manifest = await generateArticleFolderManifest(uploader, files, ARTICLE_INDEX_FILE);

	// Step 4: 上传 manifest，添加文章元数据标签
	const manifestTags: IrysTag[] = [
		{ name: 'Article-Title', value: title },
		{ name: 'Article-Summary', value: summary.substring(0, 200) }, // 限制长度
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

	const manifestId = await uploadManifestWithPayer(uploader, manifest, manifestTags, paidBy);

	console.log(`Article folder created:`);
	console.log(`  - Manifest: https://gateway.irys.xyz/${manifestId}`);
	console.log(`  - Content:  https://gateway.irys.xyz/${manifestId}/${ARTICLE_INDEX_FILE}`);
	if (coverImageTxId) {
		console.log(`  - Cover:    https://gateway.irys.xyz/${manifestId}/${ARTICLE_COVER_IMAGE_FILE}`);
	}

	return {
		manifestId,
		indexTxId,
		coverImageTxId
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
	const uploader = network === 'mainnet' ? await getIrysUploader() : await getIrysUploaderDevnet();
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
	if (!isSessionKeyValid(sessionKey)) {
		throw new Error('Session key is invalid or expired');
	}

	const uploader =
		network === 'mainnet'
			? await getSessionKeyIrysUploader(sessionKey)
			: await getSessionKeyIrysUploaderDevnet(sessionKey);

	// 使用 paidBy 参数指定主账户付费（Balance Approvals 机制）
	const ownerAddress = getSessionKeyOwner(sessionKey);
	return uploadArticleFolderWithUploader(uploader as unknown as IrysUploader, params, ownerAddress);
}
