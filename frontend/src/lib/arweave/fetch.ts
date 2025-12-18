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
