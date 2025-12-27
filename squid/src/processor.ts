import {
    BlockHeader,
    DataHandlerContext,
    EvmBatchProcessor,
    EvmBatchProcessorFields,
    Log as _Log,
    Transaction as _Transaction,
} from '@subsquid/evm-processor'
import * as blogHub from './abi/BlogHub'
import * as sessionKeyManager from './abi/SessionKeyManager'

// BlogHub 合约地址
// Optimism Sepolia: 0x... (部署后填写)
// Local Anvil:
const BLOG_HUB_ADDRESS = (process.env.BLOG_HUB_ADDRESS || '0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9').toLowerCase()

// SessionKeyManager 合约地址
const SESSION_KEY_MANAGER_ADDRESS = (process.env.SESSION_KEY_MANAGER_ADDRESS || '0x5FbDB2315678afecb367f032d93F642f64180aa3').toLowerCase()

const envRateLimit = process.env.RPC_RATE_LIMIT
const envFinalityConfirmation = process.env.FINALITY_CONFIRMATION
const envBlockRangeFrom = process.env.BLOCK_RANGE_FROM
const envGatewayUrl = process.env.GATEWAY_URL

// 启动时输出重要环境变量配置
console.log('========================================')
console.log('🚀 Squid Processor Starting...')
console.log('========================================')
console.log('📋 Environment Configuration:')
console.log(`   RPC_ETH_HTTP:               ${process.env.RPC_ETH_HTTP || 'http://localhost:8545 (default)'}`)
console.log(`   BLOG_HUB_ADDRESS:           ${BLOG_HUB_ADDRESS}`)
console.log(`   SESSION_KEY_MANAGER_ADDRESS: ${SESSION_KEY_MANAGER_ADDRESS}`)
console.log(`   RPC_RATE_LIMIT:             ${envRateLimit || '10 (default)'}`)
console.log(`   FINALITY_CONFIRMATION:      ${envFinalityConfirmation || '75 (default)'}`)
console.log(`   BLOCK_RANGE_FROM:           ${envBlockRangeFrom || '0 (default)'}`)
console.log(`   GATEWAY_URL:                ${envGatewayUrl || 'Not configured'}`)
console.log('========================================')

// 创建 processor 实例
const processorBuilder = new EvmBatchProcessor()

// 如果配置了 Gateway URL，则使用 Gateway 加速数据同步
// OP Mainnet: https://v2.archive.subsquid.io/network/optimism-mainnet
// OP Sepolia: https://v2.archive.subsquid.io/network/optimism-sepolia
if (envGatewayUrl) {
    processorBuilder.setGateway(envGatewayUrl)
}

export const processor = processorBuilder

    // Chain RPC endpoint is required for
    //  - indexing unfinalized blocks https://docs.subsquid.io/basics/unfinalized-blocks/
    //  - querying the contract state https://docs.subsquid.io/evm-indexing/query-state/
    .setRpcEndpoint({
        // Set the URL via .env for local runs or via secrets when deploying to Subsquid Cloud
        // https://docs.subsquid.io/deploy-squid/env-variables/
        // Optimism Sepolia: 'https://sepolia.optimism.io'
        // Local Anvil:
        url: process.env.RPC_ETH_HTTP || 'http://localhost:8545',
        // More RPC connection options at https://docs.subsquid.io/evm-indexing/configuration/initialization/#set-data-source
        rateLimit: envRateLimit ? parseInt(envRateLimit) : 10
    })
    // Finality confirmation: Local Anvil 可设为 1，OP Mainnet/Sepolia 推荐 75+
    .setFinalityConfirmation(envFinalityConfirmation ? parseInt(envFinalityConfirmation) : 75)
    .setFields({
        transaction: {
            from: true,
            value: true,
            hash: true,
            gasUsed: true,
            gasPrice: true,
            l1Fee: true,
        },
        log: {
            transactionHash: true,
            transaction: true,
        },
    })
    .setBlockRange({
        from: envBlockRangeFrom ? parseInt(envBlockRangeFrom) : 0,
    })
    .addLog({
        address: [BLOG_HUB_ADDRESS],
        topic0: [
            blogHub.events.ArticlePublished.topic,
            blogHub.events.ArticleEvaluated.topic,
            blogHub.events.CommentAdded.topic,
            blogHub.events.CommentLiked.topic,
            blogHub.events.FollowStatusChanged.topic,
            blogHub.events.ArticleCollected.topic,
            blogHub.events.UserProfileUpdated.topic,
            blogHub.events.ArticleEdited.topic,
        ],
        transaction: true
    })
    .addLog({
        address: [SESSION_KEY_MANAGER_ADDRESS],
        topic0: [
            sessionKeyManager.events.SessionKeyRegistered.topic,
            sessionKeyManager.events.SessionKeyRevoked.topic,
            sessionKeyManager.events.SessionKeyUsed.topic,
        ],
        transaction: true
    })

export type Fields = EvmBatchProcessorFields<typeof processor>
export type Block = BlockHeader<Fields>
export type Log = _Log<Fields>
export type Transaction = _Transaction<Fields>
export type ProcessorContext<Store> = DataHandlerContext<Store, Fields>
