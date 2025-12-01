你好。很高兴能以首席架构师的身份协助你。你选择 **Optimism + Arweave + Subsquid + SvelteKit** 是构建高性能去中心化内容平台的**黄金组合**。

针对你的需求，我将为你制定核心架构方案。重点在于如何平衡链上成本（Gas）与链下查询效率（Indexing），特别是那个复杂的“混合推荐算法”。

-----

### 1\. 智能合约架构 (Solidity & Foundry)

**决策：模式选择**

  * **推荐方案**：**单体 ERC-1155 (Singleton) + 逻辑合约**。
  * **理由**：
      * **工厂模式 (Mirror v1)**：在 L2 上虽然 Gas 便宜，但部署合约依然是昂贵的（200k-500k gas）。且如果你有 10 万篇文章，Subsquid 需要监听 10 万个合约地址，维护成本极高。
      * **ERC-1155 单体**：所有文章都是同一个合约下的不同 `TokenID`。Mint 成本极低，Subsquid 只需要监听**一个地址**。这最适合高频内容平台。

**合约拆分设计：**

1.  **`ContentRegistry.sol` (ERC-1155)**: 核心资产合约。
2.  **`BlogHub.sol`**: 业务逻辑入口（发布、评论、关注、配置分类）。

#### 核心代码思路 (Foundry Style)

我们采用 **“Events First”** 的设计哲学。Subsquid 依赖 Event 来构建数据库，因此 Event 必须包含所有必要数据。

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {ERC1155} from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract BlogHub is ERC1155, Ownable {
    // 状态变量尽量少，省 Gas。复杂关系交给 Subsquid。
    uint256 public nextArticleId;

    // 分类可以是预设的 Enum，也可以是 uint ID。这里假设用 ID 管理。
    mapping(uint256 => string) public categories; 

    // Events - Indexer 的核心数据源
    event ArticlePublished(
        uint256 indexed articleId,
        address indexed author,
        uint256 indexed categoryId,
        string arweaveId, // 内容存在 Arweave
        uint256 timestamp
    );

    event ArticleCollected(
        uint256 indexed articleId,
        address indexed collector,
        uint256 tokenId,
        uint256 amount
    );

    // 评论不上链存储内容，只存 Hash 或 ArweaveID，省 Gas
    event CommentAdded(
        uint256 indexed articleId,
        address indexed commenter,
        string contentHash, // 简短评论可直接存，长评存 Arweave ID
        uint256 parentCommentId // 支持楼中楼
    );

    // 关注也是一种事件
    event FollowStatusChanged(
        address indexed follower,
        address indexed target,
        bool isFollowing
    );

    constructor() ERC1155("") Ownable(msg.sender) {}

    // 核心业务：发布文章
    function publish(string calldata _arweaveId, uint256 _categoryId) external returns (uint256) {
        uint256 newId = nextArticleId++;
        
        // 铸造初始 NFT 给作者 (Soulbound 概念或作为管理权凭证，可选)
        // 或这里仅仅是注册文章，Collect 时才 Mint
        _mint(msg.sender, newId, 1, ""); 

        emit ArticlePublished(newId, msg.sender, _categoryId, _arweaveId, block.timestamp);
        return newId;
    }

    // 核心业务：收藏文章
    function collect(uint256 _articleId) external payable {
        // 可以在此加入收费逻辑
        _mint(msg.sender, _articleId, 1, "");
        emit ArticleCollected(_articleId, msg.sender, _articleId, 1);
    }

    // 核心业务：评论
    function comment(uint256 _articleId, string calldata _contentHash, uint256 _parentId) external {
        emit CommentAdded(_articleId, msg.sender, _contentHash, _parentId);
    }
    
    // 核心业务：关注
    function follow(address _target, bool _status) external {
        emit FollowStatusChanged(msg.sender, _target, _status);
    }
}
```

-----

### 2\. 数据索引与推荐引擎 (Subsquid)

这是最关键的部分。你需要利用 Subsquid 处理复杂的推荐逻辑。

#### 2.1 Schema 设计 (`schema.graphql`)

我们需要构建关系型数据结构来支持高效查询。

```graphql
type User @entity {
  id: ID! # Wallet Address
  following: [Follow!]! @derivedFrom(field: "follower")
  followers: [Follow!]! @derivedFrom(field: "following")
  articles: [Article!]! @derivedFrom(field: "author")
  collections: [Collect!]! @derivedFrom(field: "user")
  interests: [Category!]! # 用户感兴趣的分类（需前端设置或通过交互推断）
}

type Follow @entity {
  id: ID! # composite: follower-following
  follower: User!
  following: User!
  timestamp: DateTime!
}

type Article @entity {
  id: ID! # TokenID
  author: User!
  category: Category!
  arweaveId: String!
  timestamp: DateTime!
  
  # 计数器 - 用于计算热度
  collectCount: Int! @index
  commentCount: Int! @index
  
  # 评分 - 甚至可以在 Processor 中计算一个 "hotScore" 并存储
  hotScore: Float! @index 
}

type Category @entity {
  id: ID! # Category ID
  name: String!
}
```

#### 2.2 推荐算法实现 (Custom Resolvers vs. Processor Logic)

你的推荐逻辑比较复杂（多阶段、混合源、去重）。单纯的 GraphQL `where` 查询很难一次性搞定。

**方案 A：在 Indexing 阶段预计算 (推荐)**
在 `processor.ts` 处理 Event 时，实时更新文章的 `hotScore`。
$$HotScore = (W_1 \times Collects) + (W_2 \times Comments) - (Decay \times TimeElapsed)$$
这样查询时只需按 `hotScore` 排序。

**方案 B：Subsquid Custom Resolver (混合查询)**
这是实现你描述的“三阶段加载”的最佳方式。我们不在前端做复杂的拼接，而是在 Subsquid Server 端写一个自定义 GraphQL Resolver。

*你需要编写一个 TypeORM 的 SQL 查询来执行这个逻辑：*

1.  **输入**：`viewerAddress` (当前用户), `offset`, `limit`.
2.  **SQL 逻辑**：
      * **CTE 1 (Interested)**: 获取用户关注的 Author IDs 和感兴趣的 Category IDs。
      * **CTE 2 (Priority Set)**: `SELECT * FROM article WHERE author_id IN (CTE1) OR category_id IN (CTE1) ORDER BY hot_score DESC LIMIT 5`.
      * **CTE 3 (Global Set)**: `SELECT * FROM article WHERE id NOT IN (SELECT id FROM CTE2) ORDER BY hot_score DESC`.
      * **Result**: `UNION ALL` 这两个结果集，并应用分页。

**关于去重 (Deduplication):**
你提到了布隆过滤器。在 Client-Server 交互中传输布隆过滤器比较重。
**最佳实践**：
使用 **Cursor-based Pagination** (基于游标的分页) 结合 **Exclude List**。

  * 但最简单的方式是依靠上面的 **Custom Resolver**。你的 Subsquid API 就像一个后端服务，前端只需请求 `query { recommendedFeed(user: "0x...", offset: 0) { ... } }`，后端 SQL 保证返回的数据是按照优先级排序且去重的。

-----

### 3\. 前端实现 (SvelteKit + Web3)

SvelteKit 的 SSR (服务端渲染) 和 React 的 Hooks 机制不同。你需要一套在 Svelte 中优雅的状态管理方案。

#### 3.1 钱包连接架构

不要直接在组件里写连接逻辑。创建一个全局 Store。

**推荐库**:

  * `@wagmi/core` (Vanilla JS 核心逻辑)
  * `viem` (底层交互)
  * `@reown/appkit` (前 Web3Modal，UI 组件)

**代码结构建议 (`src/lib/stores/wallet.ts`)**:

```typescript
import { writable } from 'svelte/store';
import { createConfig, http, connect, disconnect, getAccount, watchAccount } from '@wagmi/core';
import { optimism } from '@wagmi/core/chains';
import { injected } from '@wagmi/core/connectors';
import { reconnect } from '@wagmi/core/actions';

// 1. 配置 Wagmi
export const config = createConfig({
  chains: [optimism],
  transports: {
    [optimism.id]: http(),
  },
  connectors: [injected()], // 或者使用 AppKit 的 adapter
});

// 2. Svelte Store 定义状态
export const account = writable({
  address: undefined as `0x${string}` | undefined,
  isConnected: false,
  status: 'disconnected',
});

// 3. 初始化监听器 (在 +layout.svelte onMount 中调用)
export function initWallet() {
  reconnect(config); // 尝试恢复连接
  
  // 监听账户变化并更新 Store
  watchAccount(config, {
    onChange(data) {
      account.set({
        address: data.address,
        isConnected: data.isConnected,
        status: data.status,
      });
    },
  });
}

// 4. 导出动作
export const connectWallet = async () => {
    await connect(config, { connector: injected() });
};
```

#### 3.2 SvelteKit 加载数据的逻辑 (Feed Stream)

在 `+page.svelte` 中，利用 Svelte 的响应式特性处理“滚动加载”。

```html
<script lang="ts">
  import { onMount } from 'svelte';
  import { fetchRecommendedFeed } from '$lib/api/subsquid'; // 封装的 GraphQL 请求
  import ArticleCard from '$lib/components/ArticleCard.svelte';

  export let data; // 来自 +page.ts 的初始数据
  
  let articles = [];
  let offset = 0;
  let loading = false;
  let allLoaded = false;

  // 初始加载
  $: if (data.initialArticles) {
      articles = data.initialArticles;
      offset = articles.length;
  }

  // 滚动加载函数
  async function loadMore() {
      if (loading || allLoaded) return;
      loading = true;

      // 请求 Subsquid，传入当前的 offset
      // Subsquid 的 Custom Resolver 会根据 offset 自动判断是返回 "关注者内容" 还是 "全站热门"
      const newItems = await fetchRecommendedFeed({ offset, limit: 10 });
      
      if (newItems.length === 0) {
          allLoaded = true;
      } else {
          // Svelte 下简单的数组合并
          articles = [...articles, ...newItems]; 
          offset += newItems.length;
      }
      loading = false;
  }
</script>

<div class="feed-container">
    {#each articles as article (article.id)}
        <ArticleCard {article} />
    {/each}
    
    <div use:viewportAction on:enterViewport={loadMore}>
        {#if loading}Loading...{/if}
    </div>
</div>
```

-----

### 4\. 架构总结与下一步

**架构亮点：**

1.  **L2 Gas 优化**：使用单体 ERC-1155，只将核心元数据 hash 和关系事件上链。
2.  **混合推荐**：不依赖布隆过滤器的前端复杂去重，而是通过 **Subsquid Custom Resolver (SQL)** 在索引层解决“关注优先 + 热门兜底”的数据聚合问题。
3.  **SvelteKit 适配**：使用 `@wagmi/core` 分离 UI 与 逻辑，利用 Svelte Store 实现全局钱包状态管理。

**作为首席架构师，我建议你的下一步行动 (High-Value Next Step)：**

> **Would you like me to write the `schema.graphql` and the specific TypeORM SQL query for the Subsquid Custom Resolver?**
> (这个 SQL 查询是整个推荐系统的核心，写起来比较有技巧性，特别是处理“先取关注的前5个，不够再取全局热门，且全局热门不能包含前面已取过的”这个逻辑。)