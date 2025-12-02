/**
 * Arweave 上传功能
 */
import { getIrysUploader, getIrysUploaderDevnet, type IrysUploader } from './irys'
import type { ArticleMetadata, IrysTag, IrysNetwork } from './types'

// 应用标识
const APP_NAME = 'DBlog'
const APP_VERSION = '1.0.0'

/**
 * 上传文章到 Arweave
 * @param metadata - 文章元数据
 * @param network - 网络类型（默认 devnet）
 */
export async function uploadArticle(
	metadata: Omit<ArticleMetadata, 'createdAt' | 'version'>,
	network: IrysNetwork = 'devnet'
): Promise<string> {
	const uploader = network === 'mainnet' ? await getIrysUploader() : await getIrysUploaderDevnet()

	return uploadArticleWithUploader(uploader, metadata)
}

/**
 * 使用指定 uploader 上传文章
 * @param uploader - Irys uploader 实例
 * @param metadata - 文章元数据
 */
export async function uploadArticleWithUploader(
	uploader: IrysUploader,
	metadata: Omit<ArticleMetadata, 'createdAt' | 'version'>
): Promise<string> {
	// 准备完整数据
	const fullMetadata: ArticleMetadata = {
		...metadata,
		version: APP_VERSION,
		createdAt: Date.now()
	}

	const data = JSON.stringify(fullMetadata)

	// 构建标签（用于 Arweave GraphQL 查询）
	const tags: IrysTag[] = [
		{ name: 'Content-Type', value: 'application/json' },
		{ name: 'App-Name', value: APP_NAME },
		{ name: 'App-Version', value: APP_VERSION },
		{ name: 'Type', value: 'article' },
		{ name: 'Title', value: metadata.title },
		...metadata.tags.map((tag) => ({ name: 'Tag', value: tag }))
	]

	try {
		const receipt = await uploader.upload(data, { tags })
		console.log(`Article uploaded ==> https://gateway.irys.xyz/${receipt.id}`)
		return receipt.id
	} catch (e) {
		console.error('Error when uploading article:', e)
		throw e
	}
}

/**
 * 上传图片文件到 Arweave
 * @param file - 图片文件
 * @param network - 网络类型（默认 devnet）
 */
export async function uploadImage(file: File, network: IrysNetwork = 'devnet'): Promise<string> {
	const uploader = network === 'mainnet' ? await getIrysUploader() : await getIrysUploaderDevnet()

	return uploadImageWithUploader(uploader, file)
}

/**
 * 使用指定 uploader 上传图片
 * @param uploader - Irys uploader 实例
 * @param file - 图片文件
 */
export async function uploadImageWithUploader(uploader: IrysUploader, file: File): Promise<string> {
	const tags: IrysTag[] = [
		{ name: 'Content-Type', value: file.type },
		{ name: 'App-Name', value: APP_NAME },
		{ name: 'Type', value: 'image' }
	]

	try {
		const receipt = await uploader.uploadFile(file, { tags })
		console.log(`Image uploaded ==> https://gateway.irys.xyz/${receipt.id}`)
		return receipt.id
	} catch (e) {
		console.error('Error when uploading image:', e)
		throw e
	}
}

/**
 * 上传任意数据到 Arweave
 * @param data - 数据（字符串或 Buffer）
 * @param contentType - 内容类型
 * @param customTags - 自定义标签
 * @param network - 网络类型（默认 devnet）
 */
export async function uploadData(
	data: string | Buffer,
	contentType: string,
	customTags: IrysTag[] = [],
	network: IrysNetwork = 'devnet'
): Promise<string> {
	const uploader = network === 'mainnet' ? await getIrysUploader() : await getIrysUploaderDevnet()

	const tags: IrysTag[] = [
		{ name: 'Content-Type', value: contentType },
		{ name: 'App-Name', value: APP_NAME },
		...customTags
	]

	try {
		const receipt = await uploader.upload(data, { tags })
		console.log(`Data uploaded ==> https://gateway.irys.xyz/${receipt.id}`)
		return receipt.id
	} catch (e) {
		console.error('Error when uploading data:', e)
		throw e
	}
}
