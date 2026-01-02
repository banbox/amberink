/**
 * 加密密钥缓存模块
 * 将文章的 arweaveId 与加密签名的对应关系缓存到 localStorage
 * 避免每次查看加密文章时都需要用户重新签名
 * 
 * 注意：密钥缓存是永久有效的，因为文章加密密钥不会过期
 */

import { deriveEncryptionKey } from './crypto';

// localStorage 键名前缀
const CACHE_KEY_PREFIX = 'amberink_encryption_sig_';

/** 缓存条目结构 */
interface CachedSignature {
    signature: string;      // 钱包签名（用于派生密钥）
}

/**
 * 获取缓存键名
 */
function getCacheKey(arweaveId: string): string {
    return `${CACHE_KEY_PREFIX}${arweaveId}`;
}

/**
 * 缓存加密签名
 * @param arweaveId - 文章的 Arweave ID (manifest ID)
 * @param signature - 钱包签名（hex string）
 */
export function cacheEncryptionSignature(
    arweaveId: string,
    signature: string
): void {
    if (typeof window === 'undefined') return;

    try {
        const entry: CachedSignature = {
            signature
        };
        localStorage.setItem(getCacheKey(arweaveId), JSON.stringify(entry));
        console.log(`Encryption signature cached for article: ${arweaveId}`);
    } catch (e) {
        console.warn('Failed to cache encryption signature:', e);
    }
}

/**
 * 获取缓存的加密签名
 * @param arweaveId - 文章的 Arweave ID
 * @returns 缓存的签名，如果不存在则返回 null
 */
function getCachedEncryptionSignature(arweaveId: string): string | null {
    if (typeof window === 'undefined') return null;

    try {
        const cacheKey = getCacheKey(arweaveId);
        const cachedData = localStorage.getItem(cacheKey);

        if (!cachedData) {
            return null;
        }

        const entry: CachedSignature = JSON.parse(cachedData);

        console.log(`Using cached encryption signature for article: ${arweaveId}`);
        return entry.signature;
    } catch (e) {
        console.warn('Failed to get cached encryption signature:', e);
        return null;
    }
}

/**
 * 尝试从缓存获取加密密钥
 * @param arweaveId - 文章的 Arweave ID
 * @returns 派生的加密密钥，如果缓存不存在则返回 null
 */
export async function getCachedEncryptionKey(arweaveId: string): Promise<CryptoKey | null> {
    const cachedSignature = getCachedEncryptionSignature(arweaveId);

    if (!cachedSignature) {
        return null;
    }

    try {
        // 从缓存的签名派生密钥
        const key = await deriveEncryptionKey(cachedSignature);
        return key;
    } catch (e) {
        console.warn('Failed to derive key from cached signature:', e);
        // 缓存的签名无效，清除它
        localStorage.removeItem(getCacheKey(arweaveId));
        return null;
    }
}
