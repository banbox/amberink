/**
 * Irys 客户端初始化
 * 支持 Mainnet（永久存储）和 Devnet（测试用，约60天后删除）
 * 
 * 两种模式：
 * 1. MetaMask 模式：使用 window.ethereum 连接钱包，每次上传需要签名
 * 2. Session Key 模式：使用临时私钥本地签名，无需 MetaMask 弹窗
 */

// 扩展 Window 类型以支持 ethereum
declare global {
	interface Window {
		ethereum?: {
			request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
			on?: (event: string, callback: (...args: unknown[]) => void) => void;
			removeListener?: (event: string, callback: (...args: unknown[]) => void) => void;
		};
	}
}

import { WebUploader } from '@irys/web-upload';
import { WebEthereum } from '@irys/web-upload-ethereum';
import { ViemV2Adapter } from '@irys/web-upload-ethereum-viem-v2';
import { createWalletClient, createPublicClient, custom, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import type { IrysConfig } from './types';
import { getRpcUrl, getIrysNetwork, getMinGasFeeMultiplier, getDefaultGasFeeMultiplier, getIrysFreeUploadLimit } from '$lib/config';
import { getChainConfig } from '$lib/chain';
import { getEthereumAccount } from '$lib/wallet';
import type { StoredSessionKey } from '$lib/sessionKey';

// Irys Uploader 类型
export type IrysUploader = Awaited<ReturnType<typeof createIrysUploader>>;
export type SessionKeyIrysUploader = IrysUploader;

/**
 * 创建 Viem 客户端 for Irys
 */
async function createViemClients() {
	const account = await getEthereumAccount();
	const chain = getChainConfig();

	const walletClient = createWalletClient({
		account,
		chain,
		transport: custom(window.ethereum!)
	});

	const publicClient = createPublicClient({
		chain,
		transport: custom(window.ethereum!)
	});

	return { walletClient, publicClient };
}

/**
 * 创建 Irys Uploader
 * @param config - Irys 配置
 */
export async function createIrysUploader(config?: Partial<IrysConfig>) {
	const { walletClient, publicClient } = await createViemClients();

	// 使用类型断言解决 viem 版本与 @irys/web-upload-ethereum-viem-v2 的类型不兼容问题
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const viemAdapter = ViemV2Adapter(walletClient as any, { publicClient: publicClient as any });
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let builder = WebUploader(WebEthereum).withAdapter(viemAdapter);

	const network = config?.network || getIrysNetwork();
	const rpcUrl = config?.rpcUrl || getRpcUrl();

	if (network === 'devnet') {
		builder = builder.withRpc(rpcUrl).devnet();
	}

	return await builder;
}

/**
 * 获取 Irys Mainnet Uploader（永久存储）
 */
export async function getIrysUploader(): Promise<IrysUploader> {
	return createIrysUploader({ network: 'mainnet' });
}

/**
 * 获取 Irys Devnet Uploader（测试用，约60天后删除）
 */
export async function getIrysUploaderDevnet(): Promise<IrysUploader> {
	return createIrysUploader({ network: 'devnet' });
}

// ============================================================
//                  Session Key Irys 客户端
// ============================================================

/**
 * 创建一个自定义 EIP-1193 Provider，使用本地私钥签名
 * 对于签名请求，使用本地账户签名；对于其他请求，转发到 RPC
 * @param account - viem 账户（包含私钥）
 * @param rpcUrl - RPC URL
 */
function createLocalSignerProvider(
	account: ReturnType<typeof privateKeyToAccount>,
	rpcUrl: string
) {
	return {
		request: async ({ method, params }: { method: string; params?: unknown[] }) => {
			// 处理签名请求 - 使用本地私钥
			if (method === 'eth_signTypedData_v4' || method === 'eth_signTypedData') {
				const [, typedDataJson] = params as [string, string];
				const typedData = JSON.parse(typedDataJson);
				
				// 使用 viem 的 signTypedData
				const signature = await account.signTypedData({
					domain: typedData.domain,
					types: typedData.types,
					primaryType: typedData.primaryType,
					message: typedData.message
				});
				return signature;
			}
			
			if (method === 'personal_sign') {
				const [message] = params as [string, string];
				const signature = await account.signMessage({ 
					message: { raw: message as `0x${string}` }
				});
				return signature;
			}
			
			if (method === 'eth_sign') {
				const [, message] = params as [string, string];
				const signature = await account.signMessage({
					message: { raw: message as `0x${string}` }
				});
				return signature;
			}
			
			if (method === 'eth_accounts' || method === 'eth_requestAccounts') {
				return [account.address];
			}
			
			if (method === 'eth_chainId') {
				const chain = getChainConfig();
				return `0x${chain.id.toString(16)}`;
			}
			
			// 其他请求转发到 RPC
			const response = await fetch(rpcUrl, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					jsonrpc: '2.0',
					id: Date.now(),
					method,
					params
				})
			});
			const json = await response.json();
			if (json.error) {
				throw new Error(json.error.message);
			}
			return json.result;
		}
	};
}

/**
 * 使用 Session Key 私钥创建 Viem 客户端
 * 关键：使用自定义 provider，签名操作使用本地私钥，不发送到 RPC
 * @param sessionKey - 存储的 Session Key 数据
 */
function createSessionKeyViemClients(sessionKey: StoredSessionKey) {
	// 使用 Session Key 私钥创建账户
	const account = privateKeyToAccount(sessionKey.privateKey as `0x${string}`);
	const chain = getChainConfig();
	const rpcUrl = getRpcUrl();

	// 创建自定义 provider，签名使用本地私钥
	const localProvider = createLocalSignerProvider(account, rpcUrl);

	// 使用 custom transport 包装自定义 provider
	const walletClient = createWalletClient({
		account,
		chain,
		transport: custom(localProvider)
	});

	const publicClient = createPublicClient({
		chain,
		transport: http(rpcUrl)
	});

	return { walletClient, publicClient, account };
}

/**
 * 使用 Session Key 创建 Irys Uploader
 * 使用本地私钥签名，无需 MetaMask
 * @param sessionKey - 存储的 Session Key 数据
 * @param config - Irys 配置（可选）
 */
export async function createSessionKeyIrysUploader(
	sessionKey: StoredSessionKey,
	config?: Partial<IrysConfig>
): Promise<IrysUploader> {
	const { walletClient, publicClient } = createSessionKeyViemClients(sessionKey);

	// 使用 ViemV2Adapter，但底层使用的是 http transport + privateKeyToAccount
	// 这样签名操作使用本地私钥，不会触发 MetaMask
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const viemAdapter = ViemV2Adapter(walletClient as any, { publicClient: publicClient as any });
	let builder = WebUploader(WebEthereum).withAdapter(viemAdapter);

	const network = config?.network || getIrysNetwork();
	const rpcUrl = config?.rpcUrl || getRpcUrl();

	if (network === 'devnet') {
		builder = builder.withRpc(rpcUrl).devnet();
	}

	return await builder;
}

/**
 * 获取 Session Key 的 Irys Mainnet Uploader
 * @param sessionKey - 存储的 Session Key 数据
 */
export async function getSessionKeyIrysUploader(
	sessionKey: StoredSessionKey
): Promise<IrysUploader> {
	return createSessionKeyIrysUploader(sessionKey, { network: 'mainnet' });
}

/**
 * 获取 Session Key 的 Irys Devnet Uploader
 * @param sessionKey - 存储的 Session Key 数据
 */
export async function getSessionKeyIrysUploaderDevnet(
	sessionKey: StoredSessionKey
): Promise<IrysUploader> {
	return createSessionKeyIrysUploader(sessionKey, { network: 'devnet' });
}

/**
 * 检查 Session Key 是否有效
 * @param sessionKey - 存储的 Session Key 数据
 */
export function isSessionKeyValid(sessionKey: StoredSessionKey | null): boolean {
	if (!sessionKey) return false;
	// 检查是否过期
	return Date.now() / 1000 < sessionKey.validUntil;
}

/**
 * 获取 Session Key 的 owner 地址（用于 paidBy 参数）
 * @param sessionKey - 存储的 Session Key 数据
 */
export function getSessionKeyOwner(sessionKey: StoredSessionKey): string {
	return sessionKey.owner;
}

/**
 * 检查 Irys 余额
 * @param uploader - Irys uploader 实例
 */
export async function getIrysBalance(uploader: IrysUploader): Promise<string> {
	const balance = await uploader.getLoadedBalance();
	return uploader.utils.fromAtomic(balance).toString();
}

/**
 * 充值到 Irys（Mainnet 需要）
 * @param uploader - Irys uploader 实例
 * @param amount - 充值金额（ETH）
 */
export async function fundIrys(uploader: IrysUploader, amount: string): Promise<string> {
	const fundTx = await uploader.fund(uploader.utils.toAtomic(amount));
	console.log(`Successfully funded ${uploader.utils.fromAtomic(fundTx.quantity)} ${uploader.token}`);
	return fundTx.id;
}

/**
 * 获取上传价格估算
 * @param uploader - Irys uploader 实例
 * @param bytes - 数据大小（字节）
 */
export async function getUploadPrice(uploader: IrysUploader, bytes: number): Promise<string> {
	const price = await uploader.getPrice(bytes);
	return uploader.utils.fromAtomic(price).toString();
}

/**
 * Calculate minimum required Irys balance based on upload price and gas multiplier
 * @param uploader - Irys uploader instance
 * @param dataSize - Size of data to upload in bytes
 * @returns Minimum balance required (price * minMultiplier)
 */
async function calculateMinIrysBalance(uploader: IrysUploader, dataSize: number) {
	const price = await uploader.getPrice(dataSize);
	const minMultiplier = getMinGasFeeMultiplier();
	// Multiply price by minMultiplier to ensure enough buffer
	return price.multipliedBy(minMultiplier);
}

/**
 * Calculate default Irys fund amount based on upload price and gas multiplier
 * @param uploader - Irys uploader instance
 * @param dataSize - Size of data to upload in bytes
 * @returns Fund amount (price * defaultMultiplier)
 */
async function calculateIrysFundAmount(uploader: IrysUploader, dataSize: number) {
	const price = await uploader.getPrice(dataSize);
	const defaultMultiplier = getDefaultGasFeeMultiplier();
	// Multiply price by defaultMultiplier for comfortable buffer
	return price.multipliedBy(defaultMultiplier);
}

/**
 * Check if Irys has sufficient balance for upload
 * @param uploader - Irys uploader instance
 * @param dataSize - Size of data to upload in bytes
 * @returns true if balance is sufficient
 */
export async function hasIrysSufficientBalance(
	uploader: IrysUploader,
	dataSize: number
): Promise<boolean> {
	const balance = await uploader.getLoadedBalance();
	const minBalance = await calculateMinIrysBalance(uploader, dataSize);
	return balance.gte(minBalance);
}

/**
 * Check if data size is within Irys free upload limit
 * @param dataSize - Size of data to upload in bytes
 * @returns true if data is free to upload (under 100KB)
 */
export function isWithinIrysFreeLimit(dataSize: number): boolean {
	return dataSize <= getIrysFreeUploadLimit();
}

/**
 * Ensure Irys has sufficient balance, fund if necessary
 * For files under 100KB, Irys uploads are free, so balance check is skipped.
 * @param uploader - Irys uploader instance
 * @param dataSize - Size of data to upload in bytes
 * @returns true if balance is now sufficient
 */
export async function ensureIrysBalance(
	uploader: IrysUploader,
	dataSize: number
): Promise<boolean> {
	// Skip balance check for small files (under 100KB) - Irys uploads are free
	const freeLimit = getIrysFreeUploadLimit();
	if (dataSize <= freeLimit) {
		console.log(`Data size (${dataSize} bytes) is within Irys free limit (${freeLimit} bytes), skipping balance check`);
		return true;
	}

	const balance = await uploader.getLoadedBalance();
	const price = await uploader.getPrice(dataSize);
	const minBalance = await calculateMinIrysBalance(uploader, dataSize);
	const fundAmount = await calculateIrysFundAmount(uploader, dataSize);
	
	const balanceReadable = uploader.utils.fromAtomic(balance).toString();
	const priceReadable = uploader.utils.fromAtomic(price).toString();
	const minBalanceReadable = uploader.utils.fromAtomic(minBalance).toString();
	const fundAmountReadable = uploader.utils.fromAtomic(fundAmount).toString();
	
	console.log(`Irys balance: ${balanceReadable} ${uploader.token}, price: ${priceReadable}, min required: ${minBalanceReadable}`);
	
	if (balance.gte(minBalance)) {
		console.log('Irys balance sufficient');
		return true;
	}
	
	// Ensure fund amount meets minimum requirement
	const actualFundAmount = fundAmount.gte(minBalance) ? fundAmount : minBalance;
	const actualFundReadable = uploader.utils.fromAtomic(actualFundAmount).toString();
	
	console.log(`Irys balance insufficient, funding ${actualFundReadable} ${uploader.token} (${getDefaultGasFeeMultiplier()}x price)...`);
	
	try {
		await fundIrys(uploader, actualFundReadable);
		return true;
	} catch (error) {
		console.error('Failed to fund Irys:', error);
		return false;
	}
}
