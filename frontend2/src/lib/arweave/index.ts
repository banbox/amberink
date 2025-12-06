/**
 * Irys + Arweave 集成库
 *
 * 使用示例:
 *
 * ```typescript
 * import { uploadArticle, getArticleWithCache, getIrysBalance } from '$lib/arweave'
 *
 * // 上传文章
 * const arweaveId = await uploadArticle({
 *   title: 'My Article',
 *   summary: 'A brief summary',
 *   content: '# Hello World',
 *   tags: ['web3', 'blog']
 * })
 *
 * // 获取文章（带缓存）
 * const article = await getArticleWithCache(arweaveId)
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
	IrysConfig
} from './types';

// Irys 客户端
export {
	createIrysUploader,
	getIrysUploader,
	getIrysUploaderDevnet,
	getIrysBalance,
	fundIrys,
	getUploadPrice,
	type IrysUploader
} from './irys';

// 上传功能
export {
	uploadArticle,
	uploadArticleWithUploader,
	uploadImage,
	uploadImageWithUploader,
	uploadData
} from './upload';

// 获取内容
export {
	fetchArticleContent,
	fetchRawContent,
	fetchTextContent,
	getImageUrl,
	getArweaveUrl,
	checkContentExists
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
