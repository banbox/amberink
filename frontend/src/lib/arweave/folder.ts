/**
 * Irys 链上可更新文件夹功能
 * 
 * 使用 Irys 的 Mutable Onchain Folders 实现文章存储：
 * - 每篇文章作为一个文件夹
 * - index.md 存储文章内容
 * - coverImage 存储封面图片
 * 
 * 参考: https://docs.irys.xyz/build/features/onchain-folders
 */

import type { IrysUploader, SessionKeyIrysUploader } from './irys';
import { isWithinIrysFreeLimit } from './irys';
import type { IrysTag, ArticleFolderManifest } from './types';
import { getConfig, getArweaveGateways, getIrysNetwork } from '$lib/config';

// 文章文件夹中的固定文件名
export const ARTICLE_INDEX_FILE = 'index.md';
export const ARTICLE_COVER_IMAGE_FILE = 'coverImage';

/**
 * Manifest 结构（Irys 格式）
 */
interface IrysManifest {
	manifest: string;
	version: string;
	paths: Record<string, { id: string }>;
}

/**
 * 从 Irys 网关下载 manifest
 * 对于 mutable folders，默认使用 /mutable/ 路径获取最新版本
 * 使用 Accept 头请求 manifest 内容类型，避免网关返回 index 文件内容
 * @param manifestId - Manifest 交易 ID（对于 mutable folders，是 Root manifest ID）
 * @param useMutable - 是否使用 mutable URL 获取最新版本（默认 true）
 */
export async function downloadManifest(manifestId: string, useMutable = true): Promise<IrysManifest> {
	const gateways = getArweaveGateways();
	// 添加时间戳参数绕过网关缓存
	const cacheBuster = `?_t=${Date.now()}`;

	for (const gateway of gateways) {
		try {
			// 对于 mutable folders，使用 /mutable/ 路径获取最新版本的 manifest
			// 否则使用直接路径获取原始 manifest
			const url = useMutable
				? `${gateway}/mutable/${manifestId}${cacheBuster}`
				: `${gateway}/${manifestId}${cacheBuster}`;

			// 使用 Accept 头请求 manifest JSON
			// 当 manifest 设置了 indexFile 时，直接访问会返回 index 文件内容
			// 通过指定 Accept 头可以获取原始 manifest
			const response = await fetch(url, {
				headers: {
					'Accept': 'application/x.irys-manifest+json'
				},
				// 绕过浏览器缓存
				cache: 'no-store'
			});
			if (!response.ok) continue;

			const contentType = response.headers.get('content-type') || '';
			// 验证返回的是 manifest JSON 而不是其他内容
			if (!contentType.includes('json') && !contentType.includes('manifest')) {
				console.warn(`Gateway ${gateway} returned non-manifest content type: ${contentType}`);
				continue;
			}

			const manifest = await response.json();
			// 验证是有效的 manifest 结构
			if (!manifest.paths || typeof manifest.paths !== 'object') {
				console.warn(`Gateway ${gateway} returned invalid manifest structure`);
				continue;
			}
			return manifest as IrysManifest;
		} catch (error) {
			console.warn(`Gateway ${gateway} failed to fetch manifest:`, error);
		}
	}

	throw new Error('Failed to fetch manifest from all gateways');
}

/**
 * 使用 Irys SDK 生成文章文件夹 manifest
 * @param uploader - Irys uploader 实例
 * @param files - 文件映射 (文件名 -> 交易ID)
 * @param indexFile - 可选的索引文件路径
 * @returns SDK 生成的 manifest 对象（可直接 JSON.stringify 后上传）
 */
export async function generateArticleFolderManifest(
	uploader: IrysUploader | SessionKeyIrysUploader,
	files: Map<string, string>,
	indexFile?: string
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> {
	// 使用 Irys SDK 的 generateFolder 方法生成正确格式的 manifest
	const manifest = await uploader.uploader.generateFolder({
		items: files,
		indexFile
	});
	return manifest;
}

/**
 * 手动创建文章文件夹 manifest
 * @param files - 文件映射 (文件名 -> 交易ID)
 * @param indexFile - 可选的默认文件路径
 */
export function createArticleFolderManifest(files: Map<string, string>, indexFile?: string): IrysManifest & { index?: { path: string } } {
	const paths: Record<string, { id: string }> = {};

	files.forEach((txId, fileName) => {
		paths[fileName] = { id: txId };
	});

	const manifest: IrysManifest & { index?: { path: string } } = {
		manifest: 'irys:manifest',
		version: '0.1.0',
		paths
	};

	// 添加 index 属性指定默认文件
	if (indexFile) {
		manifest.index = { path: indexFile };
	}

	return manifest;
}

/**
 * 向现有 manifest 添加或更新文件
 * @param originalManifest - 原始 manifest
 * @param newFiles - 新文件映射 (文件名 -> 交易ID)
 */
export function appendToManifest(
	originalManifest: IrysManifest,
	newFiles: Map<string, string>
): IrysManifest {
	const updatedPaths = { ...originalManifest.paths };

	newFiles.forEach((txId, fileName) => {
		updatedPaths[fileName] = { id: txId };
	});

	return {
		...originalManifest,
		paths: updatedPaths
	};
}

/**
 * 上传 manifest 到 Irys（创建新文件夹）
 * @param uploader - Irys uploader 实例
 * @param manifest - Manifest 对象（可以是 SDK 生成的或手动创建的）
 * @param customTags - 额外的自定义标签
 */
export async function uploadManifest(
	uploader: IrysUploader | SessionKeyIrysUploader,
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	manifest: IrysManifest | any,
	customTags: IrysTag[] = []
): Promise<string> {
	const appCfg = getConfig();
	const appName = appCfg.appName;
	const appVersion = appCfg.appVersion;

	const tags: IrysTag[] = [
		{ name: 'Type', value: 'manifest' },
		{ name: 'Content-Type', value: 'application/x.irys-manifest+json' },
		{ name: 'App-Name', value: appName },
		{ name: 'App-Version', value: appVersion },
		...customTags
	];

	const receipt = await uploader.upload(JSON.stringify(manifest), { tags });
	console.log(`Manifest uploaded ==> https://gateway.irys.xyz/${receipt.id}`);
	return receipt.id;
}

/**
 * 上传 manifest 到 Irys，支持 paidBy 参数（Balance Approvals 机制）
 * @param uploader - Irys uploader 实例
 * @param manifest - Manifest 对象
 * @param customTags - 额外的自定义标签
 * @param paidBy - 可选，付费账户地址
 */
export async function uploadManifestWithPayer(
	uploader: IrysUploader | SessionKeyIrysUploader,
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	manifest: IrysManifest | any,
	customTags: IrysTag[] = [],
	paidBy?: string
): Promise<string> {
	const appCfg = getConfig();
	const appName = appCfg.appName;
	const appVersion = appCfg.appVersion;
	const manifestData = JSON.stringify(manifest);
	const dataSize = new TextEncoder().encode(manifestData).length;

	// Check if within Irys free limit (100KB) - if so, don't use paidBy
	// Irys devnet free uploads don't work with paidBy parameter
	const isFreeUpload = isWithinIrysFreeLimit(dataSize);
	const effectivePaidBy = isFreeUpload ? undefined : paidBy;

	const tags: IrysTag[] = [
		{ name: 'Type', value: 'manifest' },
		{ name: 'Content-Type', value: 'application/x.irys-manifest+json' },
		{ name: 'App-Name', value: appName },
		{ name: 'App-Version', value: appVersion },
		...customTags
	];

	const uploadOptions = effectivePaidBy
		? { tags, upload: { paidBy: effectivePaidBy } }
		: { tags };

	const receipt = await uploader.upload(manifestData, uploadOptions);
	console.log(`Manifest uploaded ==> https://gateway.irys.xyz/${receipt.id}`);
	return receipt.id;
}

/**
 * 上传更新的 manifest（可变文件夹）
 * @param uploader - Irys uploader 实例
 * @param manifest - 更新后的 Manifest 对象（可以是 SDK 生成的或手动创建的）
 * @param originalManifestId - 原始 manifest ID（用于 Root-TX 标签）
 * @param customTags - 额外的自定义标签
 */
export async function uploadUpdatedManifest(
	uploader: IrysUploader | SessionKeyIrysUploader,
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	manifest: IrysManifest | any,
	originalManifestId: string,
	customTags: IrysTag[] = []
): Promise<string> {
	const appCfg = getConfig();
	const appName = appCfg.appName;
	const appVersion = appCfg.appVersion;

	const tags: IrysTag[] = [
		{ name: 'Type', value: 'manifest' },
		{ name: 'Content-Type', value: 'application/x.irys-manifest+json' },
		{ name: 'Root-TX', value: originalManifestId },
		{ name: 'App-Name', value: appName },
		{ name: 'App-Version', value: appVersion },
		...customTags
	];

	const receipt = await uploader.upload(JSON.stringify(manifest), { tags });
	console.log(`Updated manifest uploaded ==> https://gateway.irys.xyz/mutable/${originalManifestId}`);
	return receipt.id;
}

/**
 * 获取文章文件夹的可变 URL
 * 根据 irysNetwork 配置使用正确的域名，避免 302 重定向问题：
 * - devnet: https://devnet.irys.xyz/{manifestId}
 * - mainnet: https://gateway.irys.xyz/mutable/{manifestId}
 * @param manifestId - 原始 manifest ID
 * @param fileName - 文件名（可选）
 */
export function getMutableFolderUrl(manifestId: string, fileName?: string): string {
	const network = getIrysNetwork();
	const gateways = getArweaveGateways();
	// devnet 需要直接使用 devnet.irys.xyz 域名，避免 gateway.irys.xyz 的 302 重定向
	let baseHost = gateways[0];
	let baseUrl = `${baseHost}/mutable/${manifestId}`;
	if (network === 'devnet') {
		baseHost = 'https://devnet.irys.xyz';
		baseUrl = `${baseHost}/${manifestId}`;
	}
	return fileName ? `${baseUrl}/${fileName}` : baseUrl;
}

/**
 * 获取文章文件夹的静态 URL（特定版本）
 * @param manifestId - Manifest ID
 * @param fileName - 文件名（可选）
 */
export function getStaticFolderUrl(manifestId: string, fileName?: string): string {
	const gateways = getArweaveGateways();
	const baseUrl = `${gateways[0]}/${manifestId}`;
	return fileName ? `${baseUrl}/${fileName}` : baseUrl;
}

/**
 * 获取文章内容 URL（index.md）
 * @param manifestId - 文章文件夹的 manifest ID
 * @param useMutable - 是否使用可变 URL（默认 true）
 */
export function getArticleContentUrl(manifestId: string, useMutable = true): string {
	return useMutable
		? getMutableFolderUrl(manifestId, ARTICLE_INDEX_FILE)
		: getStaticFolderUrl(manifestId, ARTICLE_INDEX_FILE);
}

/**
 * 获取封面图片 URL
 * @param manifestId - 文章文件夹的 manifest ID
 * @param useMutable - 是否使用可变 URL（默认 true）
 */
export function getCoverImageUrl(manifestId: string, useMutable = true): string {
	return useMutable
		? getMutableFolderUrl(manifestId, ARTICLE_COVER_IMAGE_FILE)
		: getStaticFolderUrl(manifestId, ARTICLE_COVER_IMAGE_FILE);
}

/**
 * 解析文章文件夹 manifest，提取文章信息
 * @param manifestId - Manifest ID
 */
export async function parseArticleFolderManifest(manifestId: string): Promise<ArticleFolderManifest> {
	const manifest = await downloadManifest(manifestId);

	const result: ArticleFolderManifest = {
		manifestId,
		indexTxId: manifest.paths[ARTICLE_INDEX_FILE]?.id,
		coverImageTxId: manifest.paths[ARTICLE_COVER_IMAGE_FILE]?.id,
		allFiles: {}
	};

	// 复制所有文件映射
	for (const [fileName, { id }] of Object.entries(manifest.paths)) {
		result.allFiles[fileName] = id;
	}

	return result;
}

/**
 * 从文章文件夹获取文章内容（Markdown）
 * @param manifestId - 文章文件夹的 manifest ID
 * @param useMutable - 是否使用可变 URL（默认 true）
 */
export async function fetchArticleFromFolder(manifestId: string, useMutable = true): Promise<string> {
	const url = getArticleContentUrl(manifestId, useMutable);

	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(`Failed to fetch article content: ${response.status}`);
	}

	return await response.text();
}

/**
 * 文章版本信息
 */
export interface ArticleVersion {
	txId: string;
	timestamp: number;
	title?: string;
	summary?: string;
	wordCount?: number;
	owner?: string;
}

/**
 * 使用 Irys GraphQL 查询文章的所有历史版本
 * 通过 Root-TX 标签查找所有更新
 * @param originalManifestId - 原始 manifest ID
 */
export async function queryArticleVersions(originalManifestId: string): Promise<ArticleVersion[]> {
	// 根据 Irys 网络选择正确的 GraphQL 端点
	// devnet 和 mainnet 使用不同的数据库
	const network = getIrysNetwork();
	const graphqlEndpoint = network === 'devnet'
		? 'https://devnet.irys.xyz/graphql'
		: 'https://uploader.irys.xyz/graphql';
	console.log('[queryArticleVersions] Using network:', network, 'endpoint:', graphqlEndpoint);
	console.log('[queryArticleVersions] Querying versions for manifest:', originalManifestId);

	// 查询所有带有 Root-TX = originalManifestId 标签的交易，以及原始交易本身
	const query = `
		query getArticleVersions($rootTx: String!) {
			transactions(
				tags: [
					{ name: "Root-TX", values: [$rootTx] }
				]
				order: DESC
			) {
				edges {
					node {
						id
						timestamp
						address
						tags {
							name
							value
						}
					}
				}
			}
		}
	`;

	const versions: ArticleVersion[] = [];

	try {
		// 查询所有更新版本
		const response = await fetch(graphqlEndpoint, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				query,
				variables: { rootTx: originalManifestId }
			})
		});

		console.log('[queryArticleVersions] Response status:', response.status);
		if (response.ok) {
			const result = await response.json();
			// console.log('[queryArticleVersions] GraphQL result:', JSON.stringify(result, null, 2));
			const edges = result?.data?.transactions?.edges || [];

			for (const edge of edges) {
				const node = edge.node;
				const tags = node.tags || [];
				console.log('[queryArticleVersions] Transaction', node.id, 'tags:', tags);
				// Debug: 检查第一个标签的结构
				if (tags.length > 0) {
					console.log('[queryArticleVersions] First tag structure:', JSON.stringify(tags[0]), 'keys:', Object.keys(tags[0]));
				}
				// 尝试找标题标签，检查不同可能的属性名
				const titleTag = tags.find((t: { name: string; value: string }) => t.name === 'Article-Title');
				// 备用：检查是否使用不同的属性名
				const titleTagAlt = tags.find((t: Record<string, string>) => t['name'] === 'Article-Title' || t['Name'] === 'Article-Title');
				console.log('[queryArticleVersions] Found title tag:', titleTag, 'alt:', titleTagAlt);
				// 提取摘要标签
				const summaryTag = tags.find((t: { name: string; value: string }) => t.name === 'Article-Summary');

				versions.push({
					txId: node.id,
					timestamp: node.timestamp,
					title: titleTag?.value,
					summary: summaryTag?.value,
					owner: node.address
				});
			}
		}

		// 添加原始版本（如果没有更新版本，或者作为第一个版本）
		// 查询原始 manifest 的信息
		// 注意：ids 参数需要数组格式
		const originalQuery = `
			query getOriginalManifest($ids: [String!]!) {
				transactions(
					ids: $ids
				) {
					edges {
						node {
							id
							timestamp
							address
							tags {
								name
								value
							}
						}
					}
				}
			}
		`;

		console.log('[queryArticleVersions] Querying original manifest by ID...');
		const originalResponse = await fetch(graphqlEndpoint, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				query: originalQuery,
				variables: { ids: [originalManifestId] }
			})
		});

		console.log('[queryArticleVersions] Original query response status:', originalResponse.status);
		if (originalResponse.ok) {
			const originalResult = await originalResponse.json();
			// console.log('[queryArticleVersions] Original query result:', JSON.stringify(originalResult, null, 2));
			const originalEdges = originalResult?.data?.transactions?.edges || [];

			if (originalEdges.length > 0) {
				const originalNode = originalEdges[0].node;
				const originalTags = originalNode.tags || [];
				const originalTitleTag = originalTags.find((t: { name: string; value: string }) => t.name === 'Article-Title');
				const originalSummaryTag = originalTags.find((t: { name: string; value: string }) => t.name === 'Article-Summary');

				// 检查原始版本是否已在列表中
				const existsInVersions = versions.some(v => v.txId === originalManifestId);
				if (!existsInVersions) {
					versions.push({
						txId: originalNode.id,
						timestamp: originalNode.timestamp,
						title: originalTitleTag?.value,
						summary: originalSummaryTag?.value,
						owner: originalNode.address
					});
				}
			}
		}

		// 按时间戳降序排列（最新的在前）
		versions.sort((a, b) => b.timestamp - a.timestamp);

		console.log('[queryArticleVersions] Found versions:', versions.length, versions);
		return versions;
	} catch (error) {
		console.error('Failed to query article versions:', error);
		return [];
	}
}

/**
 * 获取指定版本的文章内容
 * @param versionTxId - 版本的 manifest TX ID
 */
export async function fetchArticleVersionContent(versionTxId: string): Promise<string> {
	// 对于特定版本，不使用 mutable URL，直接使用 TX ID
	const url = getStaticFolderUrl(versionTxId, ARTICLE_INDEX_FILE);

	const response = await fetch(url, { cache: 'no-store' });
	if (!response.ok) {
		throw new Error(`Failed to fetch article version content: ${response.status}`);
	}

	return await response.text();
}
