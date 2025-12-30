/**
 * 从 Arweave 获取内容
 */
import type { ArticleMetadata } from './types';
import { getArweaveGateways } from '$lib/config';

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

/** 构建文件夹路径 */
function buildFolderPath(manifestId: string, fileName: string, useMutable: boolean): string {
	return `${useMutable ? 'mutable/' : ''}${manifestId}/${fileName}`;
}

/** 从文章文件夹获取内容（支持可变 URL） */
export async function fetchFromFolder(
	manifestId: string,
	fileName: string,
	useMutable = true,
	bypassCache = true
): Promise<Response> {
	const path = buildFolderPath(manifestId, fileName, useMutable);
	const cacheBuster = bypassCache ? `?_t=${Date.now()}` : '';
	return fetchWithGatewayFallback(
		`${path}${cacheBuster}`,
		{ cache: bypassCache ? 'no-store' : 'default' },
		async r => r
	);
}

/** 从文章文件夹获取 Markdown 内容 */
export async function fetchArticleMarkdown(manifestId: string, useMutable = true): Promise<string> {
	return (await fetchFromFolder(manifestId, 'index.md', useMutable)).text();
}

/** 获取文章文件夹中封面图片的 URL */
export function getFolderCoverImageUrl(manifestId: string, useMutable = true): string {
	return getPrimaryGatewayUrl(buildFolderPath(manifestId, 'coverImage', useMutable));
}

/** 获取文章文件夹中任意文件的 URL */
export function getFolderFileUrl(manifestId: string, fileName: string, useMutable = true): string {
	return getPrimaryGatewayUrl(buildFolderPath(manifestId, fileName, useMutable));
}

/**
 * 从 Irys GraphQL 获取 manifest 的标签
 * @param manifestId - Manifest ID
 * @returns 标签数组，每个标签包含 name 和 value
 */
async function fetchManifestTags(manifestId: string): Promise<Array<{ name: string; value: string }>> {
	// 根据环境选择 GraphQL 端点
	// 由于 config 中可能需要导入 getIrysNetwork，这里简单判断
	const graphqlEndpoints = [
		'https://devnet.irys.xyz/graphql',
		'https://uploader.irys.xyz/graphql'
	];

	const query = `
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
			const response = await fetch(endpoint, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					query,
					variables: { ids: [manifestId] }
				})
			});

			if (response.ok) {
				const result = await response.json();
				const edges = result?.data?.transactions?.edges || [];
				if (edges.length > 0) {
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
 * 解析文章内容，分离正文和附言
 * 附言以 `---` 分隔符与正文分开
 * @param fullContent - 完整的 Markdown 内容
 * @returns 分离后的正文和附言
 */
function parseContentAndPostscript(fullContent: string): { content: string; postscript: string } {
	// 查找 `\n\n---\n\n` 分隔符（发布时添加的格式）
	const separator = '\n\n---\n\n';
	const separatorIndex = fullContent.lastIndexOf(separator);

	if (separatorIndex !== -1) {
		return {
			content: fullContent.substring(0, separatorIndex),
			postscript: fullContent.substring(separatorIndex + separator.length)
		};
	}

	return {
		content: fullContent,
		postscript: ''
	};
}

/**
 * 获取文章元数据（直接请求，无缓存）
 * @param manifestId - 文章文件夹的 Manifest ID
 */
export async function fetchArticleMetadata(manifestId: string): Promise<ArticleMetadata & { postscript?: string }> {
	// 获取 markdown 内容（使用 mutable URL 以获取最新版本）
	console.log(`Fetching article content from mutable URL: ${manifestId}`);
	const fullContent = await fetchArticleMarkdown(manifestId, true);
	console.log(`Fetched content preview (first 100 chars):`, fullContent.substring(0, 100));

	// 解析正文和附言
	const { content, postscript } = parseContentAndPostscript(fullContent);

	// 从内容中提取标题（第一个 # 开头的行）
	let title = '';
	const lines = content.split('\n');
	for (const line of lines) {
		if (line.startsWith('# ')) {
			title = line.substring(2).trim();
			break;
		}
	}

	// 从 manifest 标签获取摘要
	let summary = '';
	try {
		const tags = await fetchManifestTags(manifestId);
		const summaryTag = tags.find(t => t.name === 'Article-Summary');
		if (summaryTag) {
			summary = summaryTag.value;
		}
		console.log(`Fetched summary from manifest tags: "${summary.substring(0, 50)}..."`);
	} catch (error) {
		console.warn('Failed to fetch manifest tags for summary:', error);
	}

	return {
		title: title || 'Untitled',
		summary,
		content,
		postscript,
		tags: [],
		createdAt: Date.now(),
		version: '2.0.0'
	};
}