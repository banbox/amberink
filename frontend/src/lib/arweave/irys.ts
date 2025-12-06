/**
 * Irys 客户端初始化
 * 支持 Mainnet（永久存储）和 Devnet（测试用，约60天后删除）
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
import { createWalletClient, createPublicClient, custom } from 'viem';
import type { IrysConfig, IrysNetwork } from './types';
import { getRpcUrl, getIrysNetwork, getMinGasFeeMultiplier, getDefaultGasFeeMultiplier } from '$lib/config';
import { getChainConfig } from '$lib/chain';

// Irys Uploader 类型
export type IrysUploader = Awaited<ReturnType<typeof createIrysUploader>>;

/**
 * 获取以太坊账户
 */
async function getEthereumAccount(): Promise<`0x${string}`> {
	if (typeof window === 'undefined' || !window.ethereum) {
		throw new Error('Ethereum provider not found. Please install MetaMask or another wallet.');
	}
	const accounts = (await window.ethereum.request({ method: 'eth_requestAccounts' })) as `0x${string}`[];
	return accounts[0];
}

/**
 * 创建 Viem 客户端
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
 * Ensure Irys has sufficient balance, fund if necessary
 * @param uploader - Irys uploader instance
 * @param dataSize - Size of data to upload in bytes
 * @returns true if balance is now sufficient
 */
export async function ensureIrysBalance(
	uploader: IrysUploader,
	dataSize: number
): Promise<boolean> {
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
