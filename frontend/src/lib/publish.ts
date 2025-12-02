/**
 * Article publishing orchestration
 * Coordinates upload to Arweave and publishing to blockchain
 */

import { uploadArticle, uploadImage } from './arweave/upload'
import { publishToContract } from './contracts'
import type { ArticleMetadata } from './arweave/types'

export interface PublishArticleParams {
	title: string
	summary: string
	content: string
	tags: string[]
	coverImage: File | null
	categoryId: bigint
	royaltyBps: bigint
	originalAuthor?: string
}

export interface PublishArticleResult {
	arweaveId: string
	txHash: string
	articleId?: string
}

/**
 * Publish article: upload to Arweave, then to blockchain
 * @param params - Article publishing parameters
 * @returns Arweave ID and transaction hash
 */
export async function publishArticle(params: PublishArticleParams): Promise<PublishArticleResult> {
	const {
		title,
		summary,
		content,
		tags,
		coverImage,
		categoryId,
		royaltyBps,
		originalAuthor = ''
	} = params

	// Validation
	if (!title.trim()) {
		throw new Error('Title is required')
	}

	if (!content.trim()) {
		throw new Error('Content is required')
	}

	if (!summary.trim()) {
		throw new Error('Summary is required')
	}

	if (categoryId < 0n) {
		throw new Error('Valid category is required')
	}

	if (royaltyBps < 0n || royaltyBps > 10000n) {
		throw new Error('Royalty must be between 0 and 100% (0-10000 basis points)')
	}

	try {
		// Step 1: Upload cover image if provided
		let coverImageHash: string | undefined
		if (coverImage) {
			console.log('Step 1: Uploading cover image...')
			coverImageHash = await uploadImage(coverImage, 'devnet')
			console.log(`Cover image uploaded: ${coverImageHash}`)
		}

		// Step 2: Upload article to Arweave
		console.log('Step 2: Uploading article to Arweave...')
		const articleMetadata: Omit<ArticleMetadata, 'createdAt' | 'version'> = {
			title: title.trim(),
			summary: summary.trim(),
			content: content.trim(),
			coverImage: coverImageHash,
			tags
		}

		const arweaveId = await uploadArticle(articleMetadata, 'devnet')
		console.log(`Article uploaded to Arweave: ${arweaveId}`)

		// Step 3: Publish to blockchain
		console.log('Step 3: Publishing to blockchain...')
		const txHash = await publishToContract(arweaveId, categoryId, royaltyBps, originalAuthor)
		console.log(`Article published to blockchain: ${txHash}`)

		return {
			arweaveId,
			txHash
		}
	} catch (error) {
		console.error('Error during article publishing:', error)
		throw error
	}
}
