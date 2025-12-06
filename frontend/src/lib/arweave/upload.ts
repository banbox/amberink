/**
 * Arweave 上传功能
 */
import { getIrysUploader, getIrysUploaderDevnet, ensureIrysBalance, type IrysUploader } from './irys';
import {
	getSessionKeyIrysUploader,
	getSessionKeyIrysUploaderDevnet,
	isSessionKeyValid
} from './irys-session';
import type { ArticleMetadata, IrysTag, IrysNetwork } from './types';
import { getAppName, getAppVersion } from '$lib/config';
import type { StoredSessionKey } from '$lib/sessionKey';

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
//                  Session Key 上传功能
// ============================================================

/**
 * 使用 Session Key 上传文章到 Arweave（无需 MetaMask 签名）
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

	return uploadArticleWithUploader(uploader, metadata);
}

/**
 * 使用 Session Key 上传图片到 Arweave（无需 MetaMask 签名）
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

	return uploadImageWithUploader(uploader, file);
}

/**
 * 使用 Session Key 上传任意数据到 Arweave（无需 MetaMask 签名）
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
	const tags: IrysTag[] = [
		{ name: 'Content-Type', value: contentType },
		{ name: 'App-Name', value: appName },
		...customTags
	];

	try {
		const receipt = await uploader.upload(data, { tags });
		console.log(`Data uploaded with session key ==> https://gateway.irys.xyz/${receipt.id}`);
		return receipt.id;
	} catch (e) {
		console.error('Error when uploading data with session key:', e);
		throw e;
	}
}
