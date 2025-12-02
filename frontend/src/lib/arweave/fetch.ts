/**
 * 从 Arweave 获取内容
 */
import type { ArticleMetadata } from './types'

// Arweave 网关列表（用于负载均衡和容错）
// Irys 官方网关优先
const ARWEAVE_GATEWAYS = ['https://gateway.irys.xyz', 'https://arweave.net', 'https://arweave.dev']

/**
 * 从 Arweave 获取文章内容
 * @param arweaveId - Arweave 交易 ID
 */
export async function fetchArticleContent(arweaveId: string): Promise<ArticleMetadata> {
	// 尝试多个网关
	for (const gateway of ARWEAVE_GATEWAYS) {
		try {
			const response = await fetch(`${gateway}/${arweaveId}`, {
				headers: { Accept: 'application/json' }
			})

			if (response.ok) {
				return await response.json()
			}
		} catch (error) {
			console.warn(`Gateway ${gateway} failed:`, error)
		}
	}

	throw new Error('Failed to fetch article from all gateways')
}

/**
 * 获取图片 URL（优先使用 Irys 网关）
 * @param arweaveId - Arweave 交易 ID
 */
export function getImageUrl(arweaveId: string): string {
	return `https://gateway.irys.xyz/${arweaveId}`
}

/**
 * 获取 Arweave 内容 URL
 * @param arweaveId - Arweave 交易 ID
 * @param gateway - 指定网关（可选）
 */
export function getArweaveUrl(arweaveId: string, gateway: string = ARWEAVE_GATEWAYS[0]): string {
	return `${gateway}/${arweaveId}`
}

/**
 * 从 Arweave 获取原始数据
 * @param arweaveId - Arweave 交易 ID
 */
export async function fetchRawContent(arweaveId: string): Promise<ArrayBuffer> {
	for (const gateway of ARWEAVE_GATEWAYS) {
		try {
			const response = await fetch(`${gateway}/${arweaveId}`)

			if (response.ok) {
				return await response.arrayBuffer()
			}
		} catch (error) {
			console.warn(`Gateway ${gateway} failed:`, error)
		}
	}

	throw new Error('Failed to fetch content from all gateways')
}

/**
 * 从 Arweave 获取文本内容
 * @param arweaveId - Arweave 交易 ID
 */
export async function fetchTextContent(arweaveId: string): Promise<string> {
	for (const gateway of ARWEAVE_GATEWAYS) {
		try {
			const response = await fetch(`${gateway}/${arweaveId}`)

			if (response.ok) {
				return await response.text()
			}
		} catch (error) {
			console.warn(`Gateway ${gateway} failed:`, error)
		}
	}

	throw new Error('Failed to fetch content from all gateways')
}

/**
 * 检查 Arweave 内容是否存在
 * @param arweaveId - Arweave 交易 ID
 */
export async function checkContentExists(arweaveId: string): Promise<boolean> {
	for (const gateway of ARWEAVE_GATEWAYS) {
		try {
			const response = await fetch(`${gateway}/${arweaveId}`, {
				method: 'HEAD'
			})

			if (response.ok) {
				return true
			}
		} catch {
			// 继续尝试下一个网关
		}
	}

	return false
}
