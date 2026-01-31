/**
 * Knowledge Base Tree Structure Types
 * 支持飞书式知识库树形结构
 */

export interface TreeArticle {
	id: string;
	title: string;
	children: TreeArticle[];
	expanded?: boolean;
	level?: number;
	isRoot?: boolean;
}

export interface Workspace {
	id: string;
	name: string;
	rootArticles: TreeArticle[];
	createdAt: string;
}

export interface TreeState {
	expandedNodes: Set<string>;
	selectedNode: string | null;
	draggedNode: string | null;
}

/**
 * 构建树形结构从扁平列表
 */
export function buildTreeFromFlat(
	articles: Array<{ id: string; parentId: string | null; title: string }>
): TreeArticle[] {
	// 创建映射
	const articleMap = new Map<string, TreeArticle>();
	
	// 初始化所有文章
	articles.forEach(article => {
		articleMap.set(article.id, {
			id: article.id,
			title: article.title,
			children: []
		});
	});
	
	// 构建树
	const rootArticles: TreeArticle[] = [];
	
	articles.forEach(article => {
		const node = articleMap.get(article.id)!;
		
		if (article.parentId && articleMap.has(article.parentId)) {
			const parent = articleMap.get(article.parentId)!;
			parent.children.push(node);
		} else {
			node.isRoot = true;
			rootArticles.push(node);
		}
	});
	
	return rootArticles;
}

/**
 * 计算节点在树中的层级
 */
export function calculateLevels(
	node: TreeArticle,
	level: number = 0,
	result: Map<string, number> = new Map()
): Map<string, number> {
	result.set(node.id, level);
	node.children.forEach(child => calculateLevels(child, level + 1, result));
	return result;
}

/**
 * 获取所有祖先节点ID
 */
export function getAncestorIds(
	node: TreeArticle,
	targetId: string,
	ancestors: string[] = []
): string[] | null {
	if (node.id === targetId) {
		return ancestors;
	}
	
	for (const child of node.children) {
		const result = getAncestorIds(child, targetId, [...ancestors, node.id]);
		if (result) {
			return result;
		}
	}
	
	return null;
}

/**
 * 展平树结构为列表
 */
export function flattenTree(
	node: TreeArticle,
	result: Array<{ id: string; title: string; level: number }> = []
): Array<{ id: string; title: string; level: number }> {
	result.push({ id: node.id, title: node.title, level: node.level || 0 });
	node.children.forEach(child => flattenTree(child, result));
	return result;
}
