<script lang="ts">
	import { onMount } from 'svelte';
	import * as m from '$lib/paraglide/messages';
	import type { ArticleManifest, TreeUpdate } from '$lib/arweave/manifest';
	import { fetchManifest, updateManifestWithSignature } from '$lib/arweave';
	import { buildTreeFromManifests } from '$lib/arweave/manifest';
	import { ChevronRightIcon, ChevronDownIcon, FileIcon, FolderIcon, PlusIcon } from '$lib/components/icons';
	import { localizeHref } from '$lib/paraglide/runtime';
	import { getWalletAddress } from '$lib/stores/wallet.svelte';

	interface Props {
		/** 根文章 manifest ID 列表 */
		rootIds?: string[];
		/** 工作区名称过滤 */
		workspaceFilter?: string;
		/** 当前选中的文章ID */
		selectedId?: string | null;
		/** 点击节点时的回调 */
		onSelect?: (id: string) => void;
		/** 创建子文章时的回调 */
		onCreateChild?: (parentId: string) => void;
		/** 是否显示操作按钮 */
		showActions?: boolean;
	}

	let {
		rootIds = [],
		workspaceFilter = '',
		selectedId = null,
		onSelect = () => {},
		onCreateChild = () => {},
		showActions = true
	}: Props = $props();

	// 树数据
	let treeData = $state<Array<{ manifest: ArticleManifest; children: Array<{ manifest: ArticleManifest; children: any[] }> }>>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);
	
	// 可展开的节点
	let expandedIds = $state<Set<string>>(new Set());
	
	// 签名函数 (从外部传入或从 wallet store 获取)
	let signFn = $state<((message: string) => string) | null>(null);
	
	// 加载树数据
	async function loadTreeData() {
		if (rootIds.length === 0) {
			treeData = [];
			loading = false;
			return;
		}
		
		loading = true;
		error = null;
		
		try {
			// 并行获取所有 manifest
			const manifests: ArticleManifest[] = [];
			for (const id of rootIds) {
				try {
					const manifest = await fetchManifest(id);
					if (manifest) {
						manifests.push(manifest);
					}
				} catch (e) {
					console.warn(`Failed to fetch manifest ${id}:`, e);
				}
			}
			
			// 构建树结构
			treeData = buildTreeFromManifests(manifests, workspaceFilter || undefined);
			
			// 默认展开所有根节点
			const newExpanded = new Set<string>();
			treeData.forEach(node => {
				newExpanded.add(node.manifest.id);
			});
			expandedIds = newExpanded;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to load tree';
			console.error('Failed to load tree data:', e);
		} finally {
			loading = false;
		}
	}
	
	onMount(() => {
		loadTreeData();
	});
	
	// 切换展开/折叠
	function toggleExpand(id: string) {
		const newExpanded = new Set(expandedIds);
		if (newExpanded.has(id)) {
			newExpanded.delete(id);
		} else {
			newExpanded.add(id);
		}
		expandedIds = newExpanded;
	}
	
	// 处理点击
	function handleSelect(id: string) {
		onSelect(id);
	}
	
	// 创建子文章
	function handleCreateChild(parentId: string) {
		if (onCreateChild) {
			onCreateChild(parentId);
		}
	}
	
	// 展开/折叠所有
	function expandAll() {
		const allIds = new Set<string>();
		const collectIds = (nodes: any[]) => {
			nodes.forEach(node => {
				if (node.manifest?.id) {
					allIds.add(node.manifest.id);
				}
				if (node.children) {
					collectIds(node.children);
				}
			});
		};
		collectIds(treeData);
		expandedIds = allIds;
	}
	
	function collapseAll() {
		expandedIds = new Set();
	}
</script>

<div class="knowledge-tree-container">
	<!-- 工具栏 -->
	<div class="toolbar">
		<button
			type="button"
			onclick={expandAll}
			class="toolbar-btn"
			title={m.expand_all()}
		>
			{m.expand_all()}
		</button>
		<button
			type="button"
			onclick={collapseAll}
			class="toolbar-btn"
			title={m.collapse_all()}
		>
			{m.collapse_all()}
		</button>
	</div>
	
	<!-- 树形结构 -->
	{#if loading}
		<div class="loading">
			<span class="animate-pulse">{m.loading()}</span>
		</div>
	{:else if error}
		<div class="error">
			<p class="text-red-600">{error}</p>
			<button
				type="button"
				onclick={loadTreeData}
				class="retry-btn"
			>
				{m.retry()}
			</button>
		</div>
	{:else if treeData.length === 0}
		<div class="empty-state">
			<FolderIcon size={48} class="text-gray-300 mx-auto" />
			<p class="mt-4 text-gray-500">{m.no_items({ items: m.knowledge_base() })}</p>
			{#if showActions && rootIds.length === 0}
				<button
					type="button"
					onclick={() => onCreateChild('')}
					class="create-root-btn"
				>
					<PlusIcon size={16} />
					<span>{m.new_workspace()}</span>
				</button>
			{/if}
		</div>
	{:else}
		<div class="knowledge-tree">
			{#each treeData as node (node.manifest?.id)}
				{@const hasChildren = node.children && node.children.length > 0}
				{@const isExpanded = expandedIds.has(node.manifest?.id || '')}
				{@const isSelected = selectedId === node.manifest?.id}
				
				<!-- 根文章 -->
				<div class="tree-item">
					<div
						class="node-row {isSelected ? 'selected' : ''}"
						onclick={() => node.manifest?.id && handleSelect(node.manifest.id)}
					>
						{#if hasChildren}
							<button
								type="button"
								class="expand-btn {isExpanded ? 'expanded' : ''}"
								onclick={(e) => { e.stopPropagation(); node.manifest?.id && toggleExpand(node.manifest.id); }}
							>
								{#if isExpanded}
									<ChevronDownIcon size={14} />
								{:else}
									<ChevronRightIcon size={14} />
								{/if}
							</button>
						{:else}
							<span class="spacer"></span>
						{/if}
						
						<FolderIcon size={16} class="folder-icon" />
						
						<a
							href={node.manifest?.id ? localizeHref(`/a?id=${node.manifest.id}`) : '#'}
							class="node-title"
							onclick={(e) => { e.stopPropagation(); node.manifest?.id && handleSelect(node.manifest.id); }}
						>
							{node.manifest?.tree?.workspaceName || node.manifest?.metadata?.title || m.untitled()}
						</a>
						
						{#if showActions}
							<button
								type="button"
								class="action-btn"
								onclick={(e) => { e.stopPropagation(); node.manifest?.id && handleCreateChild(node.manifest.id); }}
								title={m.add_sub_article()}
							>
								<PlusIcon size={14} />
							</button>
						{/if}
					</div>
					
					<!-- 子节点 -->
					{#if hasChildren && isExpanded}
						<div class="children">
							{#each node.children as child (child.manifest?.id)}
								{@const childHasChildren = child.children && child.children.length > 0}
								{@const childIsExpanded = expandedIds.has(child.manifest?.id || '')}
								{@const childIsSelected = selectedId === child.manifest?.id}
								
								<div class="child-item">
									<div
										class="node-row child-row {childIsSelected ? 'selected' : ''}"
										onclick={() => child.manifest?.id && handleSelect(child.manifest.id)}
									>
										{#if childHasChildren}
											<button
												type="button"
												class="expand-btn {childIsExpanded ? 'expanded' : ''}"
												onclick={(e) => { e.stopPropagation(); child.manifest?.id && toggleExpand(child.manifest.id); }}
											>
												{#if childIsExpanded}
													<ChevronDownIcon size={14} />
												{:else}
													<ChevronRightIcon size={14} />
												{/if}
											</button>
										{:else}
											<span class="spacer"></span>
										{/if}
										
										<FileIcon size={14} class="file-icon" />
										
										<a
											href={child.manifest?.id ? localizeHref(`/a?id=${child.manifest.id}`) : '#'}
											class="node-title"
											onclick={(e) => { e.stopPropagation(); child.manifest?.id && handleSelect(child.manifest.id); }}
										>
											{child.manifest?.metadata?.title || m.untitled()}
										</a>
										
										{#if showActions}
											<button
												type="button"
												class="action-btn"
												onclick={(e) => { e.stopPropagation(); child.manifest?.id && handleCreateChild(child.manifest.id); }}
												title={m.add_sub_article()}
											>
												<PlusIcon size={14} />
											</button>
										{/if}
									</div>
									
									<!-- 递归渲染更深层的子节点 -->
									{#if childHasChildren && childIsExpanded}
										<div class="children nested">
											{#each child.children as grandchild (grandchild.manifest?.id)}
												<div class="child-item">
													<div
														class="node-row grandchild-row {selectedId === grandchild.manifest?.id ? 'selected' : ''}"
														onclick={() => grandchild.manifest?.id && handleSelect(grandchild.manifest.id)}
													>
														<span class="spacer"></span>
														<span class="connector"></span>
														<FileIcon size={12} class="file-icon small" />
														<a
															href={grandchild.manifest?.id ? localizeHref(`/a?id=${grandchild.manifest.id}`) : '#'}
															class="node-title"
															onclick={(e) => { e.stopPropagation(); grandchild.manifest?.id && handleSelect(grandchild.manifest.id); }}
														>
															{grandchild.manifest?.metadata?.title || m.untitled()}
														</a>
													</div>
												</div>
											{/each}
										</div>
									{/if}
								</div>
							{/each}
						</div>
					{/if}
				</div>
			{/each}
		</div>
	{/if}
</div>

<style>
	.knowledge-tree-container {
		font-size: 14px;
	}
	
	.toolbar {
		display: flex;
		gap: 8px;
		padding: 8px 12px;
		border-bottom: 1px solid #e5e7eb;
	}
	
	.toolbar-btn {
		padding: 4px 8px;
		font-size: 12px;
		color: #6b7280;
		background: none;
		border: 1px solid #e5e7eb;
		border-radius: 4px;
		cursor: pointer;
	}
	
	.toolbar-btn:hover {
		background: #f3f4f6;
		color: #374151;
	}
	
	.loading, .error, .empty-state {
		padding: 24px 16px;
		text-align: center;
	}
	
	.retry-btn, .create-root-btn {
		margin-top: 12px;
		padding: 8px 16px;
		font-size: 14px;
		color: white;
		background: #3b82f6;
		border: none;
		border-radius: 6px;
		cursor: pointer;
	}
	
	.create-root-btn {
		display: inline-flex;
		align-items: center;
		gap: 8px;
	}
	
	.knowledge-tree {
		padding: 8px 0;
	}
	
	.tree-item {
		margin-bottom: 2px;
	}
	
	.node-row {
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 6px 12px;
		border-radius: 4px;
		cursor: pointer;
		transition: background-color 0.15s;
	}
	
	.node-row:hover {
		background-color: #f3f4f6;
	}
	
	.node-row.selected {
		background-color: #e0e7ff;
	}
	
	.child-row {
		padding-left: 24px;
	}
	
	.grandchild-row {
		padding-left: 40px;
	}
	
	.expand-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 20px;
		height: 20px;
		padding: 0;
		border: none;
		background: none;
		color: #6b7280;
		cursor: pointer;
		border-radius: 2px;
	}
	
	.expand-btn:hover {
		background: #e5e7eb;
	}
	
	.spacer {
		width: 20px;
		flex-shrink: 0;
	}
	
	.folder-icon {
		color: #fbbf24;
		flex-shrink: 0;
	}
	
	.file-icon {
		color: #9ca3af;
		flex-shrink: 0;
	}
	
	.file-icon.small {
		width: 12px;
		height: 12px;
	}
	
	.node-title {
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		text-decoration: none;
		color: inherit;
	}
	
	.action-btn {
		display: none;
		align-items: center;
		justify-content: center;
		width: 24px;
		height: 24px;
		padding: 0;
		border: none;
		background: none;
		color: #9ca3af;
		cursor: pointer;
		border-radius: 4px;
	}
	
	.node-row:hover .action-btn {
		display: flex;
	}
	
	.action-btn:hover {
		background: #e5e7eb;
		color: #374151;
	}
	
	.children {
		margin-left: 0;
	}
	
	.children.nested {
		margin-left: 8px;
	}
	
	.child-item {
		margin-bottom: 1px;
	}
	
	.connector {
		width: 12px;
		height: 1px;
		background: #d1d5db;
		flex-shrink: 0;
	}
</style>
