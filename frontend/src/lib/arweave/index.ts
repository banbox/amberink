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
	IrysNetwork,
	IrysConfig,
	ArticleFolderManifest,
	ArticleFolderUploadParams,
	ArticleFolderUploadResult,
	ContentImageInfo
} from './types';

// Irys 客户端（包含 MetaMask 模式和 Session Key 模式）
export {
	// MetaMask 模式
	createIrysUploader,
	getIrysUploader,
	getIrysUploaderDevnet,
	// Session Key 模式（无需 MetaMask 签名）
	createSessionKeyIrysUploader,
	getSessionKeyIrysUploader,
	getSessionKeyIrysUploaderDevnet,
	isSessionKeyValid,
	getSessionKeyOwner,
	// 通用功能
	getIrysBalance,
	fundIrys,
	getUploadPrice,
	hasIrysSufficientBalance,
	ensureIrysBalance,
	type IrysUploader,
	type SessionKeyIrysUploader
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
	uploadArticleFolderWithSessionKey,
	// 文章更新功能（Irys Mutable Folders）
	updateArticleFolder,
	updateArticleFolderWithUploader,
	updateArticleFolderWithSessionKey,
	type ArticleFolderUpdateParams,
	type ArticleFolderUpdateResult
} from './upload';

// 获取内容
export {
	fetchArticleContent,
	fetchRawContent,
	fetchTextContent,
	getImageUrl,
	getArweaveUrl,
	getAvatarUrl,
	checkContentExists,
	// 文章文件夹获取功能
	fetchFromFolder,
	fetchArticleMarkdown,
	getFolderCoverImageUrl,
	getFolderFileUrl,
	fetchArticleMetadata
} from './fetch';

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
