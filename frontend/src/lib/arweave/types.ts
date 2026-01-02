/**
 * Arweave/Irys 相关类型定义
 */

/** 文章可见性枚举 */
export enum Visibility {
	Public = 0,    // 公开 - 所有人可见
	Private = 1,   // 不公开 - 仅作者可见
	Encrypted = 2  // 加密 - 内容加密存储
}

/** 文章元数据 */
export interface ArticleMetadata {
	title: string;
	summary: string;
	content: string; // Markdown 格式
	coverImage?: string; // 封面图 Arweave Hash
	tags: string[];
	createdAt: number; // Unix 时间戳
	version: string; // 数据格式版本
}

/** 文章包 */
export interface ArticleBundle {
	metadata: ArticleMetadata;
	contentType: 'application/json';
}

/** Irys 上传标签 */
export interface IrysTag {
	name: string;
	value: string;
}

/** 上传收据 */
export interface UploadReceipt {
	id: string;
	timestamp: number;
	signature: string;
}

/** Irys 网络类型 */
export type IrysNetwork = 'mainnet' | 'devnet';

/** Irys 配置 */
export interface IrysConfig {
	network: IrysNetwork;
	rpcUrl?: string;
}

/** 文章文件夹 Manifest 解析结果 */
export interface ArticleFolderManifest {
	manifestId: string;
	indexTxId?: string;      // index.md 的交易 ID
	coverImageTxId?: string; // coverImage 的交易 ID
	allFiles: Record<string, string>; // 所有文件映射 (文件名 -> 交易ID)
}

/** 内容图片信息 */
export interface ContentImageInfo {
	id: string;              // 图片 ID (01, 02, etc.)
	file: File;              // 图片文件
	extension: string;       // 文件扩展名 (jpg, png, etc.)
	width?: number;          // 可选宽度
	height?: number;         // 可选高度
}

/** 文章文件夹上传参数 */
export interface ArticleFolderUploadParams {
	title: string;
	summary: string;
	content: string;         // Markdown 内容
	coverImage?: File;       // 封面图片文件
	contentImages?: ContentImageInfo[]; // 内容图片列表
	tags: string[];
	visibility?: Visibility; // 文章可见性 (默认 Public)
	/**
	 * 签名提供回调（当 visibility 为 Encrypted 时需要）
	 * 在获取到初始 manifestId 后调用，用于派生加密密钥
	 * @param arweaveId - 初始 manifest ID
	 * @returns 钱包签名 (hex string)
	 */
	signatureProvider?: (arweaveId: string) => Promise<string>;
}


/** 文章文件夹上传结果 */
export interface ArticleFolderUploadResult {
	manifestId: string;      // 文件夹 manifest ID（用于访问文章）
	indexTxId: string;       // index.md 的交易 ID
	coverImageTxId?: string; // coverImage 的交易 ID（如果有）
	contentImageTxIds?: Record<string, string>; // 内容图片交易 ID 映射 (文件名 -> txId)
}
