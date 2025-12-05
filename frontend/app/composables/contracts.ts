/**
 * Smart contract interaction utilities
 * Handles publishing articles to BlogHub contract
 */

import { createWalletClient, custom } from 'viem'
import { optimismSepolia } from 'viem/chains'

// BlogHub contract ABI (minimal for publish function)
const BLOGHUB_ABI = [
	{
		name: 'publish',
		type: 'function',
		inputs: [
			{ name: '_arweaveId', type: 'string' },
			{ name: '_categoryId', type: 'uint64' },
			{ name: '_royaltyBps', type: 'uint96' },
			{ name: '_originalAuthor', type: 'string' },
			{ name: '_title', type: 'string' },
			{ name: '_coverImage', type: 'string' }
		],
		outputs: [{ type: 'uint256' }],
		stateMutability: 'nonpayable'
	}
] as const

// BlogHub contract address (Optimism Sepolia testnet)
// TODO: Replace with your actual contract address
const BLOGHUB_CONTRACT_ADDRESS = '0x' as `0x${string}`

/**
 * Get wallet client for contract interaction
 */
async function getWalletClient() {
	if (typeof window === 'undefined' || !window.ethereum) {
		throw new Error('Ethereum provider not found. Please install MetaMask or another wallet.')
	}

	return createWalletClient({
		chain: optimismSepolia,
		transport: custom(window.ethereum)
	})
}

/**
 * Publish article to BlogHub contract
 * @param arweaveId - Arweave hash of article content
 * @param categoryId - Category ID (0-based)
 * @param royaltyBps - Royalty basis points (0-10000, where 100 = 1%)
 * @param originalAuthor - Original author name (optional, for repost scenarios)
 * @param title - Article title (max 128 bytes)
 * @param coverImage - Cover image Arweave hash (optional, max 64 bytes)
 * @returns Transaction hash
 */
export async function publishToContract(
	arweaveId: string,
	categoryId: bigint,
	royaltyBps: bigint,
	originalAuthor: string = '',
	title: string = '',
	coverImage: string = ''
): Promise<string> {
	if (!arweaveId) {
		throw new Error('Arweave ID is required')
	}

	if (categoryId < 0n) {
		throw new Error('Category ID must be non-negative')
	}

	if (royaltyBps > 10000n) {
		throw new Error('Royalty percentage cannot exceed 100% (10000 basis points)')
	}

	if (originalAuthor && originalAuthor.length > 64) {
		throw new Error('Original author name is too long (max 64 characters)')
	}

	if (title && new TextEncoder().encode(title).length > 128) {
		throw new Error('Title is too long (max 128 bytes)')
	}

	if (coverImage && coverImage.length > 64) {
		throw new Error('Cover image hash is too long (max 64 characters)')
	}

	try {
		const walletClient = await getWalletClient()

		// Call publish function
		const txHash = await walletClient.writeContract({
			address: BLOGHUB_CONTRACT_ADDRESS,
			abi: BLOGHUB_ABI,
			functionName: 'publish',
			args: [arweaveId, categoryId, royaltyBps, originalAuthor, title, coverImage]
		})

		console.log(`Article published to contract. Tx: ${txHash}`)
		return txHash
	} catch (error) {
		console.error('Error publishing to contract:', error)
		throw new Error(
			`Failed to publish to contract: ${error instanceof Error ? error.message : 'Unknown error'}`
		)
	}
}