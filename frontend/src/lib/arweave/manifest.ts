/**
 * Article Manifest Schema for Arweave/Irys Storage
 * 
 * 树形结构完全存储在 Arweave manifest 中
 * 链上只存储 arweaveHash 指针
 */

export interface ArticleManifest {
	// 基础信息
	id: string;                      // Arweave/Irys manifest ID
	version: number;                 // manifest 版本号 (用于升级)
	
	// 文章内容 (实际内容存储在 index.md，此处为引用)
	indexTxId: string;              // index.md 的 Transaction ID
	coverImageTxId?: string;         // 封面图片 Transaction ID
	
	// 树形结构 (核心：存储父子关系)
	tree: {
		parentId: string | null;     // 父文章 manifest ID，null 表示根文章
		children: string[];          // 子文章 manifest ID 列表
		workspaceName?: string;      // 工作区/知识库名称 (根文章有效)
		sortOrder: number;           // 同级排序权重 (用于拖拽排序)
	};
	
	// 元数据
	metadata: {
		title: string;
		summary?: string;
		categoryId: number;
		author: string;              // 作者地址
		originalAuthor?: string;     // 原文作者
		originality: number;         // 0=原创, 1=半原创, 2=转载
		visibility: number;          // 0=公开, 1=不公开, 2=加密
		tags?: string[];
		createdAt: string;           // ISO timestamp
		updatedAt: string;           // ISO timestamp
	};
	
	// 可选：加密内容 (visibility=2 时使用)
	encryption?: {
		algorithm: 'AES-GCM';
		iv: string;                  // Base64 encoded IV
		encryptedKey: string;        // Base64 encoded content key, encrypted with author's public key
	};
}

// 简化的 manifest 用于更新树结构
export interface TreeUpdate {
	action: 'setParent' | 'addChild' | 'removeChild' | 'reorder' | 'setWorkspace';
	targetId: string;               // 当前文章的 manifest ID
	parentId?: string;              // 新的父文章 ID (setParent)
	childId?: string;               // 子文章 ID (addChild/removeChild)
	newIndex?: number;              // 新排序位置 (reorder)
	workspaceName?: string;         // 工作区名称 (setWorkspace)
	authorAddress: string;          // 作者地址
	timestamp: number;              // 时间戳
	signature: string;              // 作者签名
}

/**
 * 从 manifest 构建树形结构
 */
export function buildTreeFromManifests(
	manifests: ArticleManifest[],
	workspaceFilter?: string
): Array<{ manifest: ArticleManifest; children: Array<{ manifest: ArticleManifest; children: any[] }> }> {
	// 创建映射
	const manifestMap = new Map<string, ArticleManifest>();
	manifests.forEach(m => manifestMap.set(m.id, m));
	
	// 找出所有根文章
	const roots: Array<{ manifest: ArticleManifest; children: Array<{ manifest: ArticleManifest; children: any[] }> }> = [];
	const processed = new Set<string>();
	
	manifests.forEach(manifest => {
		if (processed.has(manifest.id)) return;
		
		// 如果有父文章，先处理父文章
		if (manifest.tree.parentId && manifestMap.has(manifest.tree.parentId)) {
			return; // 会在处理父文章时被添加
		}
		
		// 这是一个根文章或孤立文章
		processed.add(manifest.id);
		const tree = buildSubtree(manifest.id, manifestMap, processed);
		
		if (!workspaceFilter || manifest.tree.workspaceName === workspaceFilter) {
			roots.push(tree);
		}
	});
	
	return roots;
}

function buildSubtree(
	rootId: string,
	manifestMap: Map<string, ArticleManifest>,
	processed: Set<string>
): { manifest: ArticleManifest; children: Array<{ manifest: ArticleManifest; children: any[] }> } {
	const root = manifestMap.get(rootId);
	if (!root) {
		return { manifest: { id: rootId } as any, children: [] };
	}
	
	processed.add(rootId);
	
	const children = root.tree.children
		.filter(childId => manifestMap.has(childId) && !processed.has(childId))
		.map(childId => buildSubtree(childId, manifestMap, processed));
	
	return { manifest: root, children };
}

/**
 * 生成树更新签名数据
 */
export function generateTreeUpdateSignatureData(
	action: TreeUpdate['action'],
	targetId: string,
	params: Partial<TreeUpdate>,
	timestamp: number
): object {
	return {
		action,
		targetId,
		...params,
		timestamp
	};
}

/**
 * 验证树更新签名
 */
export function verifyTreeUpdateSignature(
	update: TreeUpdate,
	signerAddress: string,
	verifyFn: (message: string, signature: string, address: string) => boolean
): boolean {
	const message = JSON.stringify(generateTreeUpdateSignatureData(
		update.action,
		update.targetId,
		update,
		update.timestamp
	));
	
	return verifyFn(message, update.signature, signerAddress);
}

/**
 * 创建移动文章的更新请求
 */
export function createMoveArticleUpdate(
	currentArticleId: string,
	newParentId: string | null,
	authorAddress: string,
	signFn: (message: string) => string
): TreeUpdate {
	const timestamp = Date.now();
	
	const update: TreeUpdate = {
		action: newParentId ? 'setParent' : 'setRoot',
		targetId: currentArticleId,
		parentId: newParentId,
		authorAddress,
		timestamp,
		signature: ''
	};
	
	update.signature = signFn(JSON.stringify(generateTreeUpdateSignatureData(
		update.action,
		update.targetId,
		update,
		update.timestamp
	)));
	
	return update;
}

/**
 * 创建添加子文章的更新请求
 */
export function createAddChildUpdate(
	parentArticleId: string,
	childArticleId: string,
	authorAddress: string,
	signFn: (message: string) => string
): TreeUpdate {
	const timestamp = Date.now();
	
	const update: TreeUpdate = {
		action: 'addChild',
		targetId: parentArticleId,
		childId: childArticleId,
		authorAddress,
		timestamp,
		signature: ''
	};
	
	update.signature = signFn(JSON.stringify(generateTreeUpdateSignatureData(
		'addChild',
		parentArticleId,
		update,
		timestamp
	)));
	
	return update;
}
