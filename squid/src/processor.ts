import {assertNotNull} from '@subsquid/util-internal'
import {
    BlockHeader,
    DataHandlerContext,
    EvmBatchProcessor,
    EvmBatchProcessorFields,
    Log as _Log,
    Transaction as _Transaction,
} from '@subsquid/evm-processor'
import * as blogHub from './abi/BlogHub'

// BlogHub 合约地址
// Optimism Sepolia: 0x... (部署后填写)
// Local Anvil:
const BLOG_HUB_ADDRESS = '0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9'

export const processor = new EvmBatchProcessor()
    // Lookup archive by the network name in Subsquid registry
    // See https://docs.subsquid.io/evm-indexing/supported-networks/
    // Optimism Sepolia (uncomment for testnet):
    // .setGateway('https://v2.archive.subsquid.io/network/optimism-sepolia')
    // Local Anvil: 不使用 Gateway，直接从 RPC 获取数据
    
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
        rateLimit: 10
    })
    // Local Anvil: 使用较小的确认数（Anvil 区块少）
    // Optimism Sepolia: 使用 75
    .setFinalityConfirmation(1)
    .setFields({
        transaction: {
            from: true,
            value: true,
            hash: true,
        },
        log: {
            transactionHash: true,
        },
    })
    .setBlockRange({
        from: 0,
    })
    .addLog({
        address: [BLOG_HUB_ADDRESS],
        topic0: [
            blogHub.events.ArticlePublished.topic,
            blogHub.events.ArticleEvaluated.topic,
            blogHub.events.CommentAdded.topic,
            blogHub.events.FollowStatusChanged.topic,
            blogHub.events.ArticleCollected.topic,
        ],
    })

export type Fields = EvmBatchProcessorFields<typeof processor>
export type Block = BlockHeader<Fields>
export type Log = _Log<Fields>
export type Transaction = _Transaction<Fields>
export type ProcessorContext<Store> = DataHandlerContext<Store, Fields>
