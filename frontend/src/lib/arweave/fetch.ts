/**
 * 从 Arweave 获取内容
 */
import type { ArticleMetadata } from './types';
import { getArweaveGateways } from '$lib/config';
import { getMutableFolderUrl, getStaticFolderUrl, ARTICLE_INDEX_FILE } from './folder';
import { decryptContent, isEncryptedContent } from './crypto';

/**
 * 通用网关请求函数，遍历所有网关直到成功
 */
async function fetchWithGatewayFallback<T>(
	path: string,
	options: RequestInit = {},
	processResponse: (response: Response) => Promise<T>
): Promise<T> {
	const gateways = getArweaveGateways();
	for (const gateway of gateways) {
		try {
			const response = await fetch(`${gateway}/${path}`, options);
			if (response.ok) return await processResponse(response);
		} catch (error) {
			console.warn(`Gateway ${gateway} failed:`, error);
		}
	}
	throw new Error(`Failed to fetch ${path} from all gateways`);
}

/**
 * 从 Arweave 获取文章内容
 */
export async function fetchArticleContent(arweaveId: string): Promise<ArticleMetadata> {
	return fetchWithGatewayFallback(arweaveId, { headers: { Accept: 'application/json' } }, r => r.json());
}

/** 获取主网关 URL */
function getPrimaryGatewayUrl(path: string): string {
	return `${getArweaveGateways()[0]}/${path}`;
}

/** 获取图片 URL */
export function getImageUrl(arweaveId: string): string {
	return getPrimaryGatewayUrl(arweaveId);
}

/** 获取头像 URL，输入为空返回 null */
export function getAvatarUrl(avatar: string | null | undefined): string | null {
	return avatar ? getPrimaryGatewayUrl(avatar) : null;
}

/** 获取 Arweave 内容 URL */
export function getArweaveUrl(arweaveId: string, gateway?: string): string {
	return gateway ? `${gateway}/${arweaveId}` : getPrimaryGatewayUrl(arweaveId);
}

/** 从 Arweave 获取原始数据 */
export async function fetchRawContent(arweaveId: string): Promise<ArrayBuffer> {
	return fetchWithGatewayFallback(arweaveId, {}, r => r.arrayBuffer());
}

/** 从 Arweave 获取文本内容 */
export async function fetchTextContent(arweaveId: string): Promise<string> {
	return fetchWithGatewayFallback(arweaveId, {}, r => r.text());
}

/** 检查 Arweave 内容是否存在 */
export async function checkContentExists(arweaveId: string): Promise<boolean> {
	try {
		await fetchWithGatewayFallback(arweaveId, { method: 'HEAD' }, async () => true);
		return true;
	} catch {
		return false;
	}
}

/** 
 * 从文章文件夹获取内容（支持可变 URL）
 * 自动处理 devnet 和 mainnet 的不同 URL 格式：
 * - devnet: https://devnet.irys.xyz/{manifestId}/{fileName}
 * - mainnet: https://gateway.irys.xyz/mutable/{manifestId}/{fileName}
 */
export async function fetchFromFolder(
	manifestId: string,
	fileName: string,
	useMutable = true,
	bypassCache = true
): Promise<Response> {
	// 使用 folder.ts 中的函数获取正确的 URL
	const baseUrl = useMutable
		? getMutableFolderUrl(manifestId, fileName)
		: getStaticFolderUrl(manifestId, fileName);

	const cacheBuster = bypassCache ? `?_t=${Date.now()}` : '';
	const url = `${baseUrl}${cacheBuster}`;

	const response = await fetch(url, { cache: bypassCache ? 'no-store' : 'default' });
	if (!response.ok) {
		throw new Error(`Failed to fetch ${fileName} from folder: ${response.status}`);
	}
	return response;
}

/** 
 * 从文章文件夹获取 Markdown 内容
 * @param manifestId - 文章文件夹的 Manifest ID
 * @param useMutable - 是否使用可变 URL
 * @param decryptionKey - 可选，解密密钥（用于加密文章）
 * @returns 文章内容（如果是加密文章且提供了密钥，则返回解密后的内容）
 */
export async function fetchArticleMarkdown(
	manifestId: string,
	useMutable = true,
	decryptionKey?: CryptoKey
): Promise<string> {
	const content = await (await fetchFromFolder(manifestId, ARTICLE_INDEX_FILE, useMutable)).text();

	// 如果提供了解密密钥且内容是加密的，解密内容
	if (decryptionKey && isEncryptedContent(content)) {
		try {
			console.log('Decrypting article content...');
			const decrypted = await decryptContent(content, decryptionKey);
			console.log('Article content decrypted successfully');
			return decrypted;
		} catch (error) {
			console.error('Failed to decrypt article content:', error);
			throw new Error('Failed to decrypt article. Please ensure you have the correct encryption key.');
		}
	}

	return content;
}

/** 获取文章文件夹中封面图片的 URL */
export function getFolderCoverImageUrl(manifestId: string, useMutable = true): string {
	return useMutable
		? getMutableFolderUrl(manifestId, 'coverImage')
		: getStaticFolderUrl(manifestId, 'coverImage');
}

/** 获取文章文件夹中任意文件的 URL */
export function getFolderFileUrl(manifestId: string, fileName: string, useMutable = true): string {
	return useMutable
		? getMutableFolderUrl(manifestId, fileName)
		: getStaticFolderUrl(manifestId, fileName);
}

/**
 * 从 Irys GraphQL 获取 manifest 的标签
 * 对于 mutable folders，需要查询带有 Root-TX 标签的最新 manifest
 * @param manifestId - 原始 Manifest ID
 * @returns 标签数组，每个标签包含 name 和 value
 */
async function fetchManifestTags(manifestId: string): Promise<Array<{ name: string; value: string }>> {
	// 根据环境选择 GraphQL 端点
	const graphqlEndpoints = [
		'https://devnet.irys.xyz/graphql',
		'https://uploader.irys.xyz/graphql'
	];

	// 先查询带有 Root-TX = manifestId 的最新 manifest（更新版本）
	const latestVersionQuery = `
		query getLatestManifestTags($rootTx: String!) {
			transactions(
				tags: [
					{ name: "Root-TX", values: [$rootTx] }
				]
				order: DESC
				limit: 1
			) {
				edges {
					node {
						id
						tags {
							name
							value
						}
					}
				}
			}
		}
	`;

	// 查询原始 manifest 的标签（作为 fallback）
	const originalQuery = `
		query getManifestTags($ids: [String!]!) {
			transactions(ids: $ids) {
				edges {
					node {
						id
						tags {
							name
							value
						}
					}
				}
			}
		}
	`;

	for (const endpoint of graphqlEndpoints) {
		try {
			// 1. 先尝试获取最新版本的 manifest 标签
			const latestResponse = await fetch(endpoint, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					query: latestVersionQuery,
					variables: { rootTx: manifestId }
				})
			});

			if (latestResponse.ok) {
				const latestResult = await latestResponse.json();
				const latestEdges = latestResult?.data?.transactions?.edges || [];
				if (latestEdges.length > 0) {
					console.log(`Found latest manifest version: ${latestEdges[0].node.id}`);
					return latestEdges[0].node.tags || [];
				}
			}

			// 2. 如果没有更新版本，查询原始 manifest
			const response = await fetch(endpoint, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					query: originalQuery,
					variables: { ids: [manifestId] }
				})
			});

			if (response.ok) {
				const result = await response.json();
				const edges = result?.data?.transactions?.edges || [];
				if (edges.length > 0) {
					console.log(`Using original manifest tags: ${manifestId}`);
					return edges[0].node.tags || [];
				}
			}
		} catch (error) {
			console.warn(`GraphQL endpoint ${endpoint} failed:`, error);
		}
	}

	return [];
}

/**
 * 仅获取文章摘要（从 manifest 标签获取）
 * 适用于编辑页面，需要获取摘要用于编辑
 * @param manifestId - 文章文件夹的 Manifest ID
 * @returns 摘要字符串
 */
export async function fetchArticleSummaryFromTags(manifestId: string): Promise<string> {
	try {
		const tags = await fetchManifestTags(manifestId);
		const summaryTag = tags.find(t => t.name === 'Article-Summary');
		if (summaryTag) {
			console.log(`Fetched summary from manifest tags: "${summaryTag.value.substring(0, 50)}..."`);
			return summaryTag.value;
		}
	} catch (error) {
		console.warn('Failed to fetch manifest tags for summary:', error);
	}
	return '';
}
