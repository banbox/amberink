/**
 * Arweave 文章内容加密/解密模块
 * 使用钱包签名派生 AES-256-GCM 密钥
 */

import { getConfig } from '$lib/config';

// 加密消息前缀
const ENCRYPTION_MESSAGE_PREFIX = 'AmberInk Article Encryption Key: ';

// 盐值（用于 HKDF）
const HKDF_SALT = new TextEncoder().encode('AmberInk-HKDF-Salt-v1');

// Info 用于 HKDF
const HKDF_INFO = new TextEncoder().encode('AmberInk-Article-Encryption');

/**
 * 生成用于加密的签名消息
 * @param arweaveId - 文章的 Arweave ID (manifest ID)
 */
export function getSignMessageForArticle(arweaveId: string): string {
    return `${ENCRYPTION_MESSAGE_PREFIX}${arweaveId}`;
}

/**
 * 从钱包签名派生 AES-256 加密密钥
 * 使用 HKDF (HMAC-based Key Derivation Function) 从签名派生密钥
 * 
 * @param signature - 钱包签名 (hex string with 0x prefix)
 * @returns CryptoKey 用于 AES-256-GCM 加密/解密
 */
export async function deriveEncryptionKey(signature: string): Promise<CryptoKey> {
    // 移除 0x 前缀并转换为 Uint8Array
    const sigHex = signature.startsWith('0x') ? signature.slice(2) : signature;
    const sigBytes = new Uint8Array(sigHex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));

    // Step 1: 导入签名作为原始密钥材料
    const keyMaterial = await crypto.subtle.importKey(
        'raw',
        sigBytes,
        'HKDF',
        false,
        ['deriveKey']
    );

    // Step 2: 使用 HKDF 派生 AES-256 密钥
    const aesKey = await crypto.subtle.deriveKey(
        {
            name: 'HKDF',
            salt: HKDF_SALT,
            info: HKDF_INFO,
            hash: 'SHA-256'
        },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        false, // 不可导出
        ['encrypt', 'decrypt']
    );

    return aesKey;
}

/**
 * 使用 AES-256-GCM 加密内容
 * 
 * @param content - 要加密的明文内容
 * @param key - AES-256 加密密钥
 * @returns Base64 编码的加密数据 (格式: iv:ciphertext)
 */
export async function encryptContent(content: string, key: CryptoKey): Promise<string> {
    // 生成随机 12 字节 IV (AES-GCM 推荐长度)
    const iv = crypto.getRandomValues(new Uint8Array(12));

    // 将内容转换为 Uint8Array
    const contentBytes = new TextEncoder().encode(content);

    // 加密
    const ciphertext = await crypto.subtle.encrypt(
        {
            name: 'AES-GCM',
            iv: iv
        },
        key,
        contentBytes
    );

    // 将 IV 和密文合并后 Base64 编码
    const combined = new Uint8Array(iv.length + ciphertext.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(ciphertext), iv.length);

    // 使用 Base64 编码
    return btoa(String.fromCharCode(...combined));
}

/**
 * 使用 AES-256-GCM 解密内容
 * 
 * @param encryptedContent - Base64 编码的加密数据
 * @param key - AES-256 解密密钥
 * @returns 解密后的明文内容
 */
export async function decryptContent(encryptedContent: string, key: CryptoKey): Promise<string> {
    // Base64 解码
    const combined = Uint8Array.from(atob(encryptedContent), c => c.charCodeAt(0));

    // 提取 IV (前 12 字节) 和密文 (剩余部分)
    const iv = combined.slice(0, 12);
    const ciphertext = combined.slice(12);

    // 解密
    const plaintext = await crypto.subtle.decrypt(
        {
            name: 'AES-GCM',
            iv: iv
        },
        key,
        ciphertext
    );

    // 将解密后的字节转换为字符串
    return new TextDecoder().decode(plaintext);
}

/**
 * 检测内容是否已加密
 * 加密内容是 Base64 编码的，通常长度较长且不包含常见的 Markdown 标记
 * 
 * @param content - 要检测的内容
 * @returns 是否为加密内容
 */
export function isEncryptedContent(content: string): boolean {
    // 加密内容特征：
    // 1. 是有效的 Base64 字符串
    // 2. 解码后长度至少 12 字节 (IV) + 16 字节 (最小加密块 + auth tag)
    try {
        const decoded = atob(content.trim());
        if (decoded.length < 28) return false;

        // 检查是否只包含 Base64 字符
        const base64Regex = /^[A-Za-z0-9+/]+=*$/;
        return base64Regex.test(content.trim());
    } catch {
        return false;
    }
}

/**
 * 请求钱包签名以获取加密密钥
 * 
 * @param arweaveId - 文章的 Arweave ID
 * @param walletClient - viem 钱包客户端
 * @param account - 用户账户地址
 * @returns 派生的加密密钥
 */
export async function requestEncryptionKeyFromWallet(
    arweaveId: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    walletClient: any,
    account: `0x${string}`
): Promise<CryptoKey> {
    const message = getSignMessageForArticle(arweaveId);

    // 请求钱包签名
    const signature = await walletClient.signMessage({
        account,
        message
    });

    // 从签名派生密钥
    return deriveEncryptionKey(signature);
}
