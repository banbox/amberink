/**
 * 集中管理前端固定常量
 * 用于硬编码值的统一维护，方便管理和更新
 */

// ============================================
// Irys 相关常量
// ============================================

/** Irys Devnet GraphQL 端点 */
export const IRYS_DEVNET_GRAPHQL = 'https://devnet.irys.xyz/graphql';

/** Irys Mainnet GraphQL 端点 */
export const IRYS_MAINNET_GRAPHQL = 'https://uploader.irys.xyz/graphql';

/** Irys Gateway 基础 URL */
export const IRYS_GATEWAY_URL = 'https://gateway.irys.xyz';

/** Irys Devnet 基础 URL */
export const IRYS_DEVNET_URL = 'https://devnet.irys.xyz';

/** Viewblock Arweave 基础 URL */
export const VIEWBLOCK_ARWEAVE_URL = 'https://viewblock.io/arweave';

// ============================================
// Session Key 相关常量
// ============================================

/** Session Key 默认消费限额 (10 ETH in wei) */
export const SESSION_KEY_DEFAULT_SPENDING_LIMIT = BigInt('10000000000000000000');

/** Session Key 有效期 (7天，单位：秒) */
export const SESSION_KEY_DURATION_SECONDS = 7 * 24 * 60 * 60;

/** 典型交易的 Gas 估算值（用于计算最低余额） */
export const ESTIMATED_GAS_UNITS = 200000n;

/** 标准 ETH 转账 Gas 限制 */
export const STANDARD_TRANSFER_GAS_LIMIT = 21000n;

// ============================================
// 价格服务相关常量
// ============================================

/** 价格过期阈值（秒）- 超过此时间的价格视为过期 */
export const PRICE_STALE_THRESHOLD_SECONDS = 3600;

/** 价格合理性验证上限（USD）- 用于检测异常价格 */
export const MAX_REASONABLE_PRICE_USD = 1000000;

// ============================================
// 零地址常量
// ============================================

/** 以太坊零地址 */
export const ZERO_ADDRESS: `0x${string}` = '0x0000000000000000000000000000000000000000';
