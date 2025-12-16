/**
 * 从 Arweave 获取内容
 */
import type { ArticleMetadata } from './types';
import { getArweaveGateways } from '$lib/config';

/**
 * 从 Arweave 获取文章内容
 * @param arweaveId - Arweave 交易 ID
 */
export async function fetchArticleContent(arweaveId: string): Promise<ArticleMetadata> {
	// 尝试多个网关
	const gateways = getArweaveGateways();
	for (const gateway of gateways) {
		try {
			const response = await fetch(`${gateway}/${arweaveId}`, {
				headers: { Accept: 'application/json' }
			});

			if (response.ok) {
				return await response.json();
			}
		} catch (error) {
			console.warn(`Gateway ${gateway} failed:`, error);
		}
	}

	throw new Error('Failed to fetch article from all gateways');
}

/**
 * 获取图片 URL（优先使用 Irys 网关）
 * @param arweaveId - Arweave 交易 ID
 */
export function getImageUrl(arweaveId: string): string {
	const gateways = getArweaveGateways();
	return `${gateways[0]}/${arweaveId}`;
}

/**
 * 获取头像 URL（支持 Arweave ID 或完整 URL）
 * @param avatar - 头像字符串（可能是 Arweave ID 或完整 URL）
 * @returns 头像 URL，如果输入为空则返回 null
 */
export function getAvatarUrl(avatar: string | null | undefined): string | null {
	if (!avatar) return null;
	const gateways = getArweaveGateways();
	return `${gateways[0]}/${avatar}`;
}

/**
 * 获取 Arweave 内容 URL
 * @param arweaveId - Arweave 交易 ID
 * @param gateway - 指定网关（可选）
 */
export function getArweaveUrl(arweaveId: string, gateway?: string): string {
	const gateways = getArweaveGateways();
	const selectedGateway = gateway || gateways[0];
	return `${selectedGateway}/${arweaveId}`;
}

/**
 * 从 Arweave 获取原始数据
 * @param arweaveId - Arweave 交易 ID
 */
export async function fetchRawContent(arweaveId: string): Promise<ArrayBuffer> {
	const gateways = getArweaveGateways();
	for (const gateway of gateways) {
		try {
			const response = await fetch(`${gateway}/${arweaveId}`);

			if (response.ok) {
				return await response.arrayBuffer();
			}
		} catch (error) {
			console.warn(`Gateway ${gateway} failed:`, error);
		}
	}

	throw new Error('Failed to fetch content from all gateways');
}

/**
 * 从 Arweave 获取文本内容
 * @param arweaveId - Arweave 交易 ID
 */
export async function fetchTextContent(arweaveId: string): Promise<string> {
	const gateways = getArweaveGateways();
	for (const gateway of gateways) {
		try {
			const response = await fetch(`${gateway}/${arweaveId}`);

			if (response.ok) {
				return await response.text();
			}
		} catch (error) {
			console.warn(`Gateway ${gateway} failed:`, error);
		}
	}

	throw new Error('Failed to fetch content from all gateways');
}

/**
 * 检查 Arweave 内容是否存在
 * @param arweaveId - Arweave 交易 ID
 */
export async function checkContentExists(arweaveId: string): Promise<boolean> {
	const gateways = getArweaveGateways();
	for (const gateway of gateways) {
		try {
			const response = await fetch(`${gateway}/${arweaveId}`, {
				method: 'HEAD'
			});

			if (response.ok) {
				return true;
			}
		} catch {
			// 继续尝试下一个网关
		}
	}

	return false;
}

// ============================================================
//                  文章文件夹获取功能
// ============================================================

/**
 * 从文章文件夹获取内容（支持可变 URL）
 * @param manifestId - 文章文件夹的 manifest ID
 * @param fileName - 文件名
 * @param useMutable - 是否使用可变 URL（默认 true）
 */
export async function fetchFromFolder(
	manifestId: string,
	fileName: string,
	useMutable = true
): Promise<Response> {
	const gateways = getArweaveGateways();
	const pathPrefix = useMutable ? 'mutable/' : '';

	for (const gateway of gateways) {
		try {
			const url = `${gateway}/${pathPrefix}${manifestId}/${fileName}`;
			const response = await fetch(url);

			if (response.ok) {
				return response;
			}
		} catch (error) {
			console.warn(`Gateway ${gateway} failed to fetch from folder:`, error);
		}
	}

	throw new Error(`Failed to fetch ${fileName} from folder ${manifestId}`);
}

/**
 * 从文章文件夹获取 Markdown 内容
 * @param manifestId - 文章文件夹的 manifest ID
 * @param useMutable - 是否使用可变 URL（默认 true）
 */
export async function fetchArticleMarkdown(
	manifestId: string,
	useMutable = true
): Promise<string> {
	const response = await fetchFromFolder(manifestId, 'index.md', useMutable);
	return await response.text();
}

/**
 * 获取文章文件夹中封面图片的 URL
 * @param manifestId - 文章文件夹的 manifest ID
 * @param useMutable - 是否使用可变 URL（默认 true）
 */
export function getFolderCoverImageUrl(manifestId: string, useMutable = true): string {
	const gateways = getArweaveGateways();
	const pathPrefix = useMutable ? 'mutable/' : '';
	return `${gateways[0]}/${pathPrefix}${manifestId}/coverImage`;
}

/**
 * 获取文章文件夹中任意文件的 URL
 * @param manifestId - 文章文件夹的 manifest ID
 * @param fileName - 文件名
 * @param useMutable - 是否使用可变 URL（默认 true）
 */
export function getFolderFileUrl(
	manifestId: string,
	fileName: string,
	useMutable = true
): string {
	const gateways = getArweaveGateways();
	const pathPrefix = useMutable ? 'mutable/' : '';
	return `${gateways[0]}/${pathPrefix}${manifestId}/${fileName}`;
}
