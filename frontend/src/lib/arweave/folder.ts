/**
 * Irys 链上可更新文件夹功能
 * 
 * 使用 Irys 的 Mutable Onchain Folders 实现文章存储：
 * - 每篇文章作为一个文件夹
 * - index.md 存储文章内容
 * - coverImage 存储封面图片
 * 
 * 参考: https://docs.irys.xyz/build/features/onchain-folders
 */

import type { IrysUploader, SessionKeyIrysUploader } from './irys';
import { isWithinIrysFreeLimit } from './irys';
import type { IrysTag, ArticleFolderManifest } from './types';
import { getAppName, getAppVersion, getArweaveGateways } from '$lib/config';

// 文章文件夹中的固定文件名
export const ARTICLE_INDEX_FILE = 'index.md';
export const ARTICLE_COVER_IMAGE_FILE = 'coverImage';

/**
 * Manifest 结构（Irys 格式）
 */
interface IrysManifest {
	manifest: string;
	version: string;
	paths: Record<string, { id: string }>;
}

/**
 * 从 Irys 网关下载原始 manifest
 * @param manifestId - Manifest 交易 ID
 */
export async function downloadManifest(manifestId: string): Promise<IrysManifest> {
	const gateways = getArweaveGateways();
	
	for (const gateway of gateways) {
		try {
			const response = await fetch(`${gateway}/${manifestId}`);
			if (!response.ok) continue;
			
			const manifest = await response.json();
			return manifest as IrysManifest;
		} catch (error) {
			console.warn(`Gateway ${gateway} failed to fetch manifest:`, error);
		}
	}
	
	throw new Error('Failed to fetch manifest from all gateways');
}

/**
 * 使用 Irys SDK 生成文章文件夹 manifest
 * @param uploader - Irys uploader 实例
 * @param files - 文件映射 (文件名 -> 交易ID)
 * @param indexFile - 可选的索引文件路径
 * @returns SDK 生成的 manifest 对象（可直接 JSON.stringify 后上传）
 */
export async function generateArticleFolderManifest(
	uploader: IrysUploader | SessionKeyIrysUploader,
	files: Map<string, string>,
	indexFile?: string
// eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> {
	// 使用 Irys SDK 的 generateFolder 方法生成正确格式的 manifest
	const manifest = await uploader.uploader.generateFolder({ 
		items: files,
		indexFile 
	});
	return manifest;
}

/**
 * 手动创建文章文件夹 manifest（仅用于向后兼容或特殊情况）
 * @deprecated 推荐使用 generateArticleFolderManifest
 * @param files - 文件映射 (文件名 -> 交易ID)
 */
export function createArticleFolderManifest(files: Map<string, string>): IrysManifest {
	const paths: Record<string, { id: string }> = {};
	
	files.forEach((txId, fileName) => {
		paths[fileName] = { id: txId };
	});
	
	return {
		manifest: 'irys:manifest',
		version: '0.1.0',
		paths
	};
}

/**
 * 向现有 manifest 添加或更新文件
 * @param originalManifest - 原始 manifest
 * @param newFiles - 新文件映射 (文件名 -> 交易ID)
 */
export function appendToManifest(
	originalManifest: IrysManifest,
	newFiles: Map<string, string>
): IrysManifest {
	const updatedPaths = { ...originalManifest.paths };
	
	newFiles.forEach((txId, fileName) => {
		updatedPaths[fileName] = { id: txId };
	});
	
	return {
		...originalManifest,
		paths: updatedPaths
	};
}

/**
 * 上传 manifest 到 Irys（创建新文件夹）
 * @param uploader - Irys uploader 实例
 * @param manifest - Manifest 对象（可以是 SDK 生成的或手动创建的）
 * @param customTags - 额外的自定义标签
 */
export async function uploadManifest(
	uploader: IrysUploader | SessionKeyIrysUploader,
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	manifest: IrysManifest | any,
	customTags: IrysTag[] = []
): Promise<string> {
	const appName = getAppName();
	const appVersion = getAppVersion();
	
	const tags: IrysTag[] = [
		{ name: 'Type', value: 'manifest' },
		{ name: 'Content-Type', value: 'application/x.irys-manifest+json' },
		{ name: 'App-Name', value: appName },
		{ name: 'App-Version', value: appVersion },
		...customTags
	];
	
	const receipt = await uploader.upload(JSON.stringify(manifest), { tags });
	console.log(`Manifest uploaded ==> https://gateway.irys.xyz/${receipt.id}`);
	return receipt.id;
}

/**
 * 上传 manifest 到 Irys，支持 paidBy 参数（Balance Approvals 机制）
 * @param uploader - Irys uploader 实例
 * @param manifest - Manifest 对象
 * @param customTags - 额外的自定义标签
 * @param paidBy - 可选，付费账户地址
 */
export async function uploadManifestWithPayer(
	uploader: IrysUploader | SessionKeyIrysUploader,
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	manifest: IrysManifest | any,
	customTags: IrysTag[] = [],
	paidBy?: string
): Promise<string> {
	const appName = getAppName();
	const appVersion = getAppVersion();
	const manifestData = JSON.stringify(manifest);
	const dataSize = new TextEncoder().encode(manifestData).length;
	
	// Check if within Irys free limit (100KB) - if so, don't use paidBy
	// Irys devnet free uploads don't work with paidBy parameter
	const isFreeUpload = isWithinIrysFreeLimit(dataSize);
	const effectivePaidBy = isFreeUpload ? undefined : paidBy;
	
	const tags: IrysTag[] = [
		{ name: 'Type', value: 'manifest' },
		{ name: 'Content-Type', value: 'application/x.irys-manifest+json' },
		{ name: 'App-Name', value: appName },
		{ name: 'App-Version', value: appVersion },
		...customTags
	];
	
	const uploadOptions = effectivePaidBy 
		? { tags, upload: { paidBy: effectivePaidBy } }
		: { tags };
	
	const receipt = await uploader.upload(manifestData, uploadOptions);
	console.log(`Manifest uploaded ==> https://gateway.irys.xyz/${receipt.id}`);
	return receipt.id;
}

/**
 * 上传更新的 manifest（可变文件夹）
 * @param uploader - Irys uploader 实例
 * @param manifest - 更新后的 Manifest 对象（可以是 SDK 生成的或手动创建的）
 * @param originalManifestId - 原始 manifest ID（用于 Root-TX 标签）
 * @param customTags - 额外的自定义标签
 */
export async function uploadUpdatedManifest(
	uploader: IrysUploader | SessionKeyIrysUploader,
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	manifest: IrysManifest | any,
	originalManifestId: string,
	customTags: IrysTag[] = []
): Promise<string> {
	const appName = getAppName();
	const appVersion = getAppVersion();
	
	const tags: IrysTag[] = [
		{ name: 'Type', value: 'manifest' },
		{ name: 'Content-Type', value: 'application/x.irys-manifest+json' },
		{ name: 'Root-TX', value: originalManifestId },
		{ name: 'App-Name', value: appName },
		{ name: 'App-Version', value: appVersion },
		...customTags
	];
	
	const receipt = await uploader.upload(JSON.stringify(manifest), { tags });
	console.log(`Updated manifest uploaded ==> https://gateway.irys.xyz/mutable/${originalManifestId}`);
	return receipt.id;
}

/**
 * 获取文章文件夹的可变 URL
 * @param manifestId - 原始 manifest ID
 * @param fileName - 文件名（可选）
 */
export function getMutableFolderUrl(manifestId: string, fileName?: string): string {
	const gateways = getArweaveGateways();
	const baseUrl = `${gateways[0]}/mutable/${manifestId}`;
	return fileName ? `${baseUrl}/${fileName}` : baseUrl;
}

/**
 * 获取文章文件夹的静态 URL（特定版本）
 * @param manifestId - Manifest ID
 * @param fileName - 文件名（可选）
 */
export function getStaticFolderUrl(manifestId: string, fileName?: string): string {
	const gateways = getArweaveGateways();
	const baseUrl = `${gateways[0]}/${manifestId}`;
	return fileName ? `${baseUrl}/${fileName}` : baseUrl;
}

/**
 * 获取文章内容 URL（index.md）
 * @param manifestId - 文章文件夹的 manifest ID
 * @param useMutable - 是否使用可变 URL（默认 true）
 */
export function getArticleContentUrl(manifestId: string, useMutable = true): string {
	return useMutable
		? getMutableFolderUrl(manifestId, ARTICLE_INDEX_FILE)
		: getStaticFolderUrl(manifestId, ARTICLE_INDEX_FILE);
}

/**
 * 获取封面图片 URL
 * @param manifestId - 文章文件夹的 manifest ID
 * @param useMutable - 是否使用可变 URL（默认 true）
 */
export function getCoverImageUrl(manifestId: string, useMutable = true): string {
	return useMutable
		? getMutableFolderUrl(manifestId, ARTICLE_COVER_IMAGE_FILE)
		: getStaticFolderUrl(manifestId, ARTICLE_COVER_IMAGE_FILE);
}

/**
 * 解析文章文件夹 manifest，提取文章信息
 * @param manifestId - Manifest ID
 */
export async function parseArticleFolderManifest(manifestId: string): Promise<ArticleFolderManifest> {
	const manifest = await downloadManifest(manifestId);
	
	const result: ArticleFolderManifest = {
		manifestId,
		indexTxId: manifest.paths[ARTICLE_INDEX_FILE]?.id,
		coverImageTxId: manifest.paths[ARTICLE_COVER_IMAGE_FILE]?.id,
		allFiles: {}
	};
	
	// 复制所有文件映射
	for (const [fileName, { id }] of Object.entries(manifest.paths)) {
		result.allFiles[fileName] = id;
	}
	
	return result;
}

/**
 * 从文章文件夹获取文章内容（Markdown）
 * @param manifestId - 文章文件夹的 manifest ID
 * @param useMutable - 是否使用可变 URL（默认 true）
 */
export async function fetchArticleFromFolder(manifestId: string, useMutable = true): Promise<string> {
	const url = getArticleContentUrl(manifestId, useMutable);
	
	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(`Failed to fetch article content: ${response.status}`);
	}
	
	return await response.text();
}
