/**
 * Irys + Arweave 集成库
 *
 * 使用示例:
 *
 * ```typescript
 * import { uploadArticleFolder, getArticleWithCache, getIrysBalance } from '$lib/arweave'
 *
 * // 上传文章（文件夹格式）
 * const result = await uploadArticleFolder({
 *   title: 'My Article',
 *   summary: 'A brief summary',
 *   content: '# Hello World',
 *   tags: ['web3', 'blog'],
 *   coverImage: file // 可选
 * })
 *
 * // 获取文章（带缓存）
 * const article = await getArticleWithCache(result.manifestId)
 * ```
 */

// 类型导出
export type {
	ArticleMetadata,
	ArticleBundle,
	IrysTag,
	UploadReceipt,
	CachedArticle,
	IrysNetwork,
	IrysConfig,
	ArticleFolderManifest,
	ArticleFolderUploadParams,
	ArticleFolderUploadResult
} from './types';

// Irys 客户端
export {
	createIrysUploader,
	getIrysUploader,
	getIrysUploaderDevnet,
	getIrysBalance,
	fundIrys,
	getUploadPrice,
	hasIrysSufficientBalance,
	ensureIrysBalance,
	type IrysUploader
} from './irys';

// 上传功能
export {
	uploadArticle,
	uploadArticleWithUploader,
	uploadImage,
	uploadImageWithUploader,
	uploadData,
	// Session Key 上传功能
	uploadArticleWithSessionKey,
	uploadImageWithSessionKey,
	uploadDataWithSessionKey,
	// 文章文件夹上传功能
	uploadArticleFolder,
	uploadArticleFolderWithUploader,
	uploadArticleFolderWithSessionKey
} from './upload';

// Session Key Irys 客户端
export {
	createSessionKeyIrysUploader,
	getSessionKeyIrysUploader,
	getSessionKeyIrysUploaderDevnet,
	isSessionKeyValid,
	getSessionKeyOwner,
	type SessionKeyIrysUploader
} from './irys-session';

// 获取内容
export {
	fetchArticleContent,
	fetchRawContent,
	fetchTextContent,
	getImageUrl,
	getArweaveUrl,
	checkContentExists,
	// 文章文件夹获取功能
	fetchFromFolder,
	fetchArticleMarkdown,
	getFolderCoverImageUrl,
	getFolderFileUrl
} from './fetch';

// 缓存功能
export {
	getCachedArticle,
	setCachedArticle,
	removeCachedArticle,
	clearAllCache,
	clearOldCache,
	getArticleWithCache,
	getArticlesWithCache
} from './cache';

// 文章文件夹功能
export {
	ARTICLE_INDEX_FILE,
	ARTICLE_COVER_IMAGE_FILE,
	downloadManifest,
	generateArticleFolderManifest,
	createArticleFolderManifest, // @deprecated - 使用 generateArticleFolderManifest
	appendToManifest,
	uploadManifest,
	uploadManifestWithPayer,
	uploadUpdatedManifest,
	getMutableFolderUrl,
	getStaticFolderUrl,
	getArticleContentUrl,
	getCoverImageUrl,
	parseArticleFolderManifest,
	fetchArticleFromFolder
} from './folder';
