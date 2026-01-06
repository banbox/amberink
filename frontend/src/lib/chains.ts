/**
 * Centralized chain configuration
 * 
 * All chain-related settings are maintained here for easy updates.
 * When adding or removing chains, only modify this file.
 */

import { defineChain, type Chain } from 'viem';
import {
    mainnet,
    sepolia,
    optimism,
    optimismSepolia,
    arbitrum,
    arbitrumNova,
    arbitrumSepolia,
    base,
    baseSepolia,
    zkSync,
    zkSyncSepoliaTestnet,
    polygonZkEvm,
    polygonZkEvmCardona,
    polygon,
    polygonAmoy,
    mantle,
    mantleSepoliaTestnet,
    scroll,
    scrollSepolia,
} from 'viem/chains';

/**
 * Chain information interface
 */
export interface ChainInfo {
    id: number;
    name: string;
    nativeToken: string;
    explorerUrl: string;
    pythContractAddress: `0x${string}`;
    blogHubAddress?: `0x${string}`;
    payMasterAddress?: `0x${string}`;
    sessionKeyManagerAddress?: `0x${string}`;
}


/**
 * Supported chains configuration
 * 
 * Each chain entry contains:
 * - id: Chain ID
 * - name: Human-readable chain name
 * - nativeToken: Symbol of the native token for price lookups
 * - explorerUrl: Block explorer base URL
 * - pythContractAddress: Pyth Network oracle contract address
 */
export const SUPPORTED_CHAINS: Record<number, ChainInfo> = {
    // Ethereum
    1: {
        id: 1,
        name: 'Ethereum',
        nativeToken: 'ETH',
        explorerUrl: 'https://etherscan.io',
        pythContractAddress: '0x4305FB66699C3B2702D4d05CF36551390A4c69C6',
    },
    11155111: {
        id: 11155111,
        name: 'Sepolia',
        nativeToken: 'ETH',
        explorerUrl: 'https://sepolia.etherscan.io',
        pythContractAddress: '0xDd24F84d36BF92C65F92307595335bdFab5Bbd21',
    },

    // Optimism
    10: {
        id: 10,
        name: 'Optimism',
        nativeToken: 'ETH',
        explorerUrl: 'https://optimistic.etherscan.io',
        pythContractAddress: '0xff1a0f4744e8582DF1aE09D5611b887B6a12925C',
        blogHubAddress: '0x6a6Ac4decd218aC4d0fe57Af418f230514C0843a',
        payMasterAddress: '0x2B73B8312eb4A874EF531579F72Aebbe08f706B6',
        sessionKeyManagerAddress: '0xcFAa8395E839d2FE5aaECB772681E5c10D82096e',
    },
    11155420: {
        id: 11155420,
        name: 'Optimism Sepolia',
        nativeToken: 'ETH',
        explorerUrl: 'https://sepolia-optimism.etherscan.io',
        pythContractAddress: '0x0708325268dF9F66270F1401206434524814508b',
        blogHubAddress: '0x1eda8263bb3fB598871163247B3ea8cD926AA36C',
        payMasterAddress: '0xfaD74cc410dFBf8ddC0f12023a2F045C9a14F108',
        sessionKeyManagerAddress: '0xcFAa8395E839d2FE5aaECB772681E5c10D82096e',
    },

    // Arbitrum
    42161: {
        id: 42161,
        name: 'Arbitrum One',
        nativeToken: 'ETH',
        explorerUrl: 'https://arbiscan.io',
        pythContractAddress: '0xff1a0f4744e8582DF1aE09D5611b887B6a12925C',
    },
    42170: {
        id: 42170,
        name: 'Arbitrum Nova',
        nativeToken: 'ETH',
        explorerUrl: 'https://nova.arbiscan.io',
        pythContractAddress: '0xff1a0f4744e8582DF1aE09D5611b887B6a12925C',
    },
    421614: {
        id: 421614,
        name: 'Arbitrum Sepolia',
        nativeToken: 'ETH',
        explorerUrl: 'https://sepolia.arbiscan.io',
        pythContractAddress: '0x4374e5a8b9C22271E9EB878A2AA31DE97DF15DAF',
    },

    // Base
    8453: {
        id: 8453,
        name: 'Base',
        nativeToken: 'ETH',
        explorerUrl: 'https://basescan.org',
        pythContractAddress: '0x8250f4aF4B972684F7b336503E2D6dFeDeB1487a',
    },
    84532: {
        id: 84532,
        name: 'Base Sepolia',
        nativeToken: 'ETH',
        explorerUrl: 'https://sepolia.basescan.org',
        pythContractAddress: '0xA2aa501b19aff244D90cc15a4Cf739D2725B5729',
    },

    // zkSync Era
    324: {
        id: 324,
        name: 'zkSync Era',
        nativeToken: 'ETH',
        explorerUrl: 'https://explorer.zksync.io',
        pythContractAddress: '0xf087c864AEccFb6A2Bf1Af6A0382B0d0f6c5D834',
    },
    300: {
        id: 300,
        name: 'zkSync Sepolia',
        nativeToken: 'ETH',
        explorerUrl: 'https://sepolia.explorer.zksync.io',
        pythContractAddress: '0x056f829183Ec806A78c26C98961678c24faB71af',
    },

    // Polygon zkEVM
    1101: {
        id: 1101,
        name: 'Polygon zkEVM',
        nativeToken: 'ETH',
        explorerUrl: 'https://zkevm.polygonscan.com',
        pythContractAddress: '0xC5E56d6b40F3e3B5fbfa266bCd35C37426537c65',
    },
    2442: {
        id: 2442,
        name: 'Polygon zkEVM Cardona',
        nativeToken: 'ETH',
        explorerUrl: 'https://cardona-zkevm.polygonscan.com',
        pythContractAddress: '0xFf255f800044225f54Af4510332Aa3D67CC77635',
    },

    // Polygon PoS
    137: {
        id: 137,
        name: 'Polygon',
        nativeToken: 'POL',
        explorerUrl: 'https://polygonscan.com',
        pythContractAddress: '0xff1a0f4744e8582DF1aE09D5611b887B6a12925C',
    },
    80002: {
        id: 80002,
        name: 'Polygon Amoy',
        nativeToken: 'POL',
        explorerUrl: 'https://amoy.polygonscan.com',
        pythContractAddress: '0x2880aB155794e7179c9eE2e38200202908C17B43',
    },

    // Mantle
    5000: {
        id: 5000,
        name: 'Mantle',
        nativeToken: 'MNT',
        explorerUrl: 'https://explorer.mantle.xyz',
        pythContractAddress: '0xA2aa501b19aff244D90cc15a4Cf739D2725B5729',
    },
    5003: {
        id: 5003,
        name: 'Mantle Sepolia',
        nativeToken: 'MNT',
        explorerUrl: 'https://sepolia.mantlescan.xyz',
        pythContractAddress: '0x98046Bd286715D3B0BC227Dd7a956b83D8978603',
    },

    // Scroll
    534352: {
        id: 534352,
        name: 'Scroll',
        nativeToken: 'ETH',
        explorerUrl: 'https://scrollscan.com',
        pythContractAddress: '0xA2aa501b19aff244D90cc15a4Cf739D2725B5729',
    },
    534351: {
        id: 534351,
        name: 'Scroll Sepolia',
        nativeToken: 'ETH',
        explorerUrl: 'https://sepolia.scrollscan.com',
        pythContractAddress: '0x41c9e39574F40Ad34c79f1C99B66A45eFB830d4c',
    },

    // Local Development
    31337: {
        id: 31337,
        name: 'Anvil',
        nativeToken: 'ANVIL',
        explorerUrl: '',
        pythContractAddress: '0x0000000000000000000000000000000000000000',
        blogHubAddress: '0xDDfff9173E7c197d2cd4AeCa22e1E1fBd7183584',
        sessionKeyManagerAddress: '0xcFAa8395E839d2FE5aaECB772681E5c10D82096e',
    },
};

/**
 * Pyth Price Feed IDs - same across all chains
 * See https://pyth.network/developers/price-feed-ids
 */
export const PYTH_PRICE_FEED_IDS: Record<string, `0x${string}`> = {
    // ETH/USD - used for ETH, OP, Arbitrum, Base, Polygon zkEvm
    ETH: '0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace',
    // POL/USD - Polygon Pos
    POL: '0xffd11c5a1cfd42f80afb2df4d9f264c15f956d68153335374ec10722edd70472',
    // MNT/USD - Mantle
    MNT: '0x4e3037c822d852d79af3ac80e35eb420ee3b870dca49f9344a38ef4773fb0585',
};

/**
 * Allowed chain IDs per environment
 * Restricts which chains users can select based on the deployment environment
 */
export const ALLOWED_CHAINS_BY_ENV: Record<'dev' | 'test' | 'prod', number[]> = {
    // Development: only local Anvil
    dev: [31337],
    // Test: multiple test networks
    test: [11155420],
    // Production: multiple mainnet networks
    prod: [10],
};

// ============================================
// Derived exports for backward compatibility
// ============================================

/**
 * Block explorer URLs derived from SUPPORTED_CHAINS
 */
export const BLOCK_EXPLORER_URLS: Record<number, string> = Object.fromEntries(
    Object.entries(SUPPORTED_CHAINS).map(([id, info]) => [Number(id), info.explorerUrl])
);

/**
 * Pyth contract addresses derived from SUPPORTED_CHAINS
 * See https://docs.pyth.network/price-feeds/contract-addresses/evm
 */
export const PYTH_CONTRACT_ADDRESSES: Record<number, `0x${string}`> = Object.fromEntries(
    Object.entries(SUPPORTED_CHAINS).map(([id, info]) => [Number(id), info.pythContractAddress])
) as Record<number, `0x${string}`>;

/**
 * Chain native token symbols derived from SUPPORTED_CHAINS
 */
export const CHAIN_NATIVE_TOKEN: Record<number, string> = Object.fromEntries(
    Object.entries(SUPPORTED_CHAINS).map(([id, info]) => [Number(id), info.nativeToken])
);

// ============================================
// Viem chain object mapping
// ============================================

/**
 * Mapping of chain IDs to viem chain objects
 * Used by getChainConfig to avoid hardcoding switch statements
 */
export const VIEM_CHAINS: Record<number, Chain> = {
    // Ethereum
    1: mainnet,
    11155111: sepolia,
    // Optimism
    10: optimism,
    11155420: optimismSepolia,
    // Arbitrum
    42161: arbitrum,
    42170: arbitrumNova,
    421614: arbitrumSepolia,
    // Base
    8453: base,
    84532: baseSepolia,
    // zkSync Era
    324: zkSync,
    300: zkSyncSepoliaTestnet,
    // Polygon zkEVM
    1101: polygonZkEvm,
    2442: polygonZkEvmCardona,
    // Polygon PoS
    137: polygon,
    80002: polygonAmoy,
    // Mantle
    5000: mantle,
    5003: mantleSepoliaTestnet,
    // Scroll
    534352: scroll,
    534351: scrollSepolia,
};

/**
 * Get viem chain object for a given chain ID
 * Falls back to a custom chain definition if not found in VIEM_CHAINS
 * 
 * @param chainId - The chain ID to look up
 * @param rpcUrl - RPC URL to use for custom chains
 * @returns viem Chain object
 */
export function getViemChain(chainId: number, rpcUrl: string): Chain {
    // Check if we have a predefined viem chain
    const viemChain = VIEM_CHAINS[chainId];
    if (viemChain) {
        return viemChain;
    }

    // Get chain info from our config, or use defaults
    const chainInfo = SUPPORTED_CHAINS[chainId];

    // Create custom chain definition
    return defineChain({
        id: chainId,
        name: chainInfo?.name || `Chain ${chainId}`,
        nativeCurrency: {
            name: chainInfo?.nativeToken === 'POL' ? 'POL' :
                chainInfo?.nativeToken === 'MNT' ? 'MNT' : 'Ether',
            symbol: chainInfo?.nativeToken || 'ETH',
            decimals: 18
        },
        rpcUrls: {
            default: { http: [rpcUrl] }
        },
        blockExplorers: chainInfo?.explorerUrl ? {
            default: {
                name: 'Explorer',
                url: chainInfo.explorerUrl
            }
        } : undefined,
    });
}

