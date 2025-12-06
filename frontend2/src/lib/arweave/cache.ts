/**
 * 客户端缓存策略
 */
import { fetchArticleContent } from './fetch';
import type { ArticleMetadata, CachedArticle } from './types';
import { browser } from '$app/environment';

const CACHE_PREFIX = 'dblog_article_';
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 小时

/**
 * 从缓存获取文章
 * @param arweaveId - Arweave 交易 ID
 */
export function getCachedArticle(arweaveId: string): ArticleMetadata | null {
	if (!browser) return null;

	const cached = localStorage.getItem(CACHE_PREFIX + arweaveId);
	if (!cached) return null;

	try {
		const { data, timestamp }: CachedArticle = JSON.parse(cached);

		// 检查是否过期
		if (Date.now() - timestamp > CACHE_TTL) {
			localStorage.removeItem(CACHE_PREFIX + arweaveId);
			return null;
		}

		return data;
	} catch {
		// 解析失败，删除损坏的缓存
		localStorage.removeItem(CACHE_PREFIX + arweaveId);
		return null;
	}
}

/**
 * 将文章存入缓存
 * @param arweaveId - Arweave 交易 ID
 * @param data - 文章元数据
 */
export function setCachedArticle(arweaveId: string, data: ArticleMetadata): void {
	if (!browser) return;

	const cached: CachedArticle = {
		data,
		timestamp: Date.now()
	};

	try {
		localStorage.setItem(CACHE_PREFIX + arweaveId, JSON.stringify(cached));
	} catch (e) {
		// localStorage 可能已满，清理旧缓存
		console.warn('Failed to cache article, clearing old cache:', e);
		clearOldCache();
	}
}

/**
 * 删除文章缓存
 * @param arweaveId - Arweave 交易 ID
 */
export function removeCachedArticle(arweaveId: string): void {
	if (!browser) return;
	localStorage.removeItem(CACHE_PREFIX + arweaveId);
}

/**
 * 清理所有文章缓存
 */
export function clearAllCache(): void {
	if (!browser) return;

	const keysToRemove: string[] = [];
	for (let i = 0; i < localStorage.length; i++) {
		const key = localStorage.key(i);
		if (key?.startsWith(CACHE_PREFIX)) {
			keysToRemove.push(key);
		}
	}

	keysToRemove.forEach((key) => localStorage.removeItem(key));
}

/**
 * 清理过期缓存
 */
export function clearOldCache(): void {
	if (!browser) return;

	const now = Date.now();
	const keysToRemove: string[] = [];

	for (let i = 0; i < localStorage.length; i++) {
		const key = localStorage.key(i);
		if (key?.startsWith(CACHE_PREFIX)) {
			try {
				const cached = localStorage.getItem(key);
				if (cached) {
					const { timestamp }: CachedArticle = JSON.parse(cached);
					if (now - timestamp > CACHE_TTL) {
						keysToRemove.push(key);
					}
				}
			} catch {
				keysToRemove.push(key);
			}
		}
	}

	keysToRemove.forEach((key) => localStorage.removeItem(key));
}

/**
 * 带缓存的获取文章函数
 * @param arweaveId - Arweave 交易 ID
 * @param forceRefresh - 强制刷新（跳过缓存）
 */
export async function getArticleWithCache(
	arweaveId: string,
	forceRefresh: boolean = false
): Promise<ArticleMetadata> {
	// 先检查缓存（除非强制刷新）
	if (!forceRefresh) {
		const cached = getCachedArticle(arweaveId);
		if (cached) return cached;
	}

	// 从 Arweave 获取
	const data = await fetchArticleContent(arweaveId);

	// 存入缓存
	setCachedArticle(arweaveId, data);

	return data;
}

/**
 * 批量获取文章（带缓存）
 * @param arweaveIds - Arweave 交易 ID 数组
 */
export async function getArticlesWithCache(arweaveIds: string[]): Promise<Map<string, ArticleMetadata>> {
	const results = new Map<string, ArticleMetadata>();
	const toFetch: string[] = [];

	// 先从缓存获取
	for (const id of arweaveIds) {
		const cached = getCachedArticle(id);
		if (cached) {
			results.set(id, cached);
		} else {
			toFetch.push(id);
		}
	}

	// 并行获取未缓存的
	if (toFetch.length > 0) {
		const fetchPromises = toFetch.map(async (id) => {
			try {
				const data = await fetchArticleContent(id);
				setCachedArticle(id, data);
				results.set(id, data);
			} catch (e) {
				console.error(`Failed to fetch article ${id}:`, e);
			}
		});

		await Promise.all(fetchPromises);
	}

	return results;
}
