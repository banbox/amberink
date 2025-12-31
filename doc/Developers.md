# AmberInk 开发者指南

本文档为 AmberInk 去中心化博客项目的完整技术指南，涵盖从本地部署到生产环境的全流程。

---

## 目录

**Part 1: 智能合约（已完成）**
- 详见 [contracts.md](contracts.md) - 包含环境准备、本地部署、合约调用、Session Key、Paymaster 配置、测试网/主网部署、问题排查

**Part 2: SubSquid 索引（已完成）**
1. [SubSquid 项目初始化](#1-subsquid-项目初始化)
2. [Schema 定义与实体映射](#2-schema-定义与实体映射)
3. [Processor 事件处理](#3-processor-事件处理)
4. [GraphQL API 与查询](#4-graphql-api-与查询)

**Part 3: Irys + Arweave 存储（已完成）**
5. [Irys SDK 集成](#5-irys-sdk-集成)
6. [文章上传与元数据](#6-文章上传与元数据)
7. [内容获取与缓存](#7-内容获取与缓存)

**Part 4: SvelteKit 前端（已完成）**
8. [前端项目初始化](#8-前端项目初始化)
9. [钱包连接与合约交互](#9-钱包连接与合约交互)
10. [Session Key 无感交互](#10-session-key-无感交互)
11. [页面与组件开发](#11-页面与组件开发)

---

# Part 1: 智能合约

> **完整文档**: [contracts.md](contracts.md)

智能合约部分包含以下内容：

| 章节 | 说明 |
|------|------|
| [环境准备](contracts.md#1-环境准备) | 合约地址、测试账户 |
| [本地部署验证](contracts.md#2-本地部署验证) | Anvil 启动、部署、升级 |
| [合约调用测试](contracts.md#3-合约调用测试) | 发布文章、评价、关注 |
| [Session Key 配置](contracts.md#4-session-key-配置与测试) | 生成、注册、查询、撤销 |
| [Paymaster 配置](contracts.md#5-paymaster-配置) | EntryPoint 存款、Stake、授权 |
| [测试网部署](contracts.md#6-测试网部署) | Optimism Sepolia 部署 |
| [主网部署检查清单](contracts.md#7-主网部署检查清单) | 部署前/后检查、监控 |
| [常见问题排查](contracts.md#8-常见问题排查) | 交易失败、Session Key、Paymaster 问题 |
| [附录：速查表](contracts.md#9-附录速查表) | 函数选择器、事件签名、Cast 命令 |

---

# 重要约定
### 环境变量配置

项目提供三套环境配置文件，根据开发阶段选择使用：

| 环境 | 配置文件 | 区块链 | SubSquid | Irys/Arweave |
|------|----------|--------|----------|--------------|
| **dev** | `.env.dev` | 本地 Anvil (31337) | 本地 localhost:4350 | Devnet (测试) |
| **test** | `.env.test` | Optimism Sepolia (11155420) | SubSquid Cloud (测试) | Devnet (测试) |
| **prod** | `.env.prod` | Optimism Mainnet (10) | SubSquid Cloud (生产) | Mainnet (永久) |

**切换环境：**

```bash
cp .env.example .env
```

# Part 2: SubSquid 索引

## 1. SubSquid 项目初始化

SubSquid 是去中心化的区块链索引服务，用于索引链上事件并提供 GraphQL API。

### 1.1 安装 Squid CLI

```bash
# 全局安装 Squid CLI
npm install -g @subsquid/cli

# 验证安装
sqd --version
```

### 1.2 创建 Squid 项目

```bash
# 使用 EVM 模板初始化
sqd init squid -t evm

# 进入项目目录
cd squid

# 安装依赖
npm install
```

### 1.3 项目结构

```
squid/
├── src/
│   ├── abi/              # 合约 ABI（从 contracts/out 复制）
│   ├── model/            # 自动生成的 TypeORM 实体
│   ├── processor.ts      # 事件处理逻辑
│   └── main.ts           # 入口文件
├── schema.graphql        # GraphQL Schema 定义
├── squid.yaml            # Squid 配置
└── commands.json         # CLI 命令配置
```

### 1.4 配置数据源

编辑 `squid.yaml`

编辑 `src/processor.ts`

---

## 2. Schema 定义与实体映射

### 2.1 复制合约 ABI

```bash
# 从 contracts 目录复制 ABI
mkdir -p src/abi
cp ../contracts/out/BlogHub.sol/BlogHub.json src/abi/
cp ../contracts/out/SessionKeyManager.sol/SessionKeyManager.json src/abi/

# 生成类型安全的事件解码器: squid\src\abi
npx squid-evm-typegen src/abi src/abi/BlogHub.json
npx squid-evm-typegen src/abi src/abi/SessionKeyManager.json
```

### 2.2 定义 GraphQL Schema

编辑 `schema.graphql`

### 2.3 生成 TypeORM 实体

```bash
# 根据 schema.graphql 生成实体类: src/model/generated
npx squid-typeorm-codegen

# 编译 TypeScript 代码: lib/
npx tsc

```

---

## 3. Processor 事件处理

### 3.1 事件处理逻辑

事件处理代码位于 `src/main.ts`，处理以下事件：

- **ArticlePublished** - 文章发布，创建 Article 和 User 实体
- **ArticleEvaluated** - 文章评价（点赞/踩/打赏），更新统计数据
- **ArticleCollected** - 文章收藏（NFT），记录收藏关系
- **CommentAdded** - 评论添加
- **CommentLiked** - 评论点赞
- **FollowStatusChanged** - 关注状态变更
- **ArticleEdited** - 文章编辑（标题、摘要、分类）
- **UserProfileUpdated** - 用户资料更新

Processor 配置位于 `src/processor.ts`，订阅 BlogHub 合约的所有核心事件。


### 3.2 本地运行测试

```bash
# 启动本地 PostgreSQL（使用 Docker）
docker compose up -d

# 应用数据库迁移（先应用已有的迁移文件）
npx squid-typeorm-migration apply

# 生成数据库迁移
npx squid-typeorm-migration generate

# 应用数据库迁移
npx squid-typeorm-migration apply

npm run build

# 启动 Processor
node -r dotenv/config lib/main.js

# 另一个终端启动 GraphQL 服务
npx squid-graphql-server
```

---

## 4. GraphQL API 与查询

### 4.1 常用查询示例
可在浏览器端打开`http://localhost:4350/graphql`测试graphql。
语句示例参考[graphsql_example.md](graphsql_example.md)

### 4.2 部署到 SubSquid Cloud

```bash
# 登录 SubSquid Cloud
sqd auth -k YOUR_DEPLOYMENT_KEY

# 部署
sqd deploy .
```

### 4.3 部署到自己服务器

```bash
cd squid
cp .env.example .env.test  # or prod
vim .env.test
cp .env.test .env
npx tsc
npx squid-typeorm-migration apply
npm run build
pm2 start ecosystem.config.js
```
在nginx中配置4350端口到某个域名

# Part 3: Irys + Arweave 存储

## 5. Irys SDK 集成

Irys 是 Arweave 的上传层，提供快速、可靠的永久存储服务。Irys 提供两套 SDK：
- **服务端 SDK**：`@irys/upload` - 用于 Node.js 环境
- **浏览器端 SDK**：`@irys/web-upload` - 用于浏览器环境

### 5.1 安装依赖

**浏览器端（使用 Viem v2）：**

```bash
cd frontend
npm install @irys/web-upload @irys/web-upload-ethereum @irys/web-upload-ethereum-viem-v2 viem
```

### 5.2 初始化 Irys 客户端

**浏览器端（Viem v2 + @wagmi/core）：**

[frontend\src\lib\arweave\irys.ts](frontend\src\lib\arweave\irys.ts)

### 5.3 网络说明

Irys 有两个 Bundler 网络：

| 网络 | 说明 | 数据保留 |
|------|------|----------|
| **Mainnet** | 使用真实代币付费 | 永久存储 |
| **Devnet** | 使用免费水龙头代币 | 约 60 天后删除 |

- **网关地址**：`https://gateway.irys.xyz/{transactionId}`
- **Devnet 配置**：需要调用 `.withRpc(rpcURL).devnet()` 方法
- **支持的代币**：ETH、MATIC、BNB、AVAX、SOL 等，详见 [Supported Tokens](https://docs.irys.xyz/build/d/features/supported-tokens)

---

## 6. 文章上传与元数据

### 6.1 文章数据结构

[frontend\src\lib\arweave\types.ts](frontend\src\lib\arweave\types.ts)

### 6.2 上传文章到 Arweave

[frontend\src\lib\arweave\upload.ts](frontend\src\lib\arweave\upload.ts)

### 6.3 完整发布流程

[upload_example.ts](../learn/09_upload_example.ts)

---

## 7. 内容获取

### 7.1 从 Arweave 获取内容

> 📁 **实现文件**: [frontend/src/lib/arweave/fetch.ts](../frontend/src/lib/arweave/fetch.ts)

提供以下函数：
- `fetchArticleContent(arweaveId)` - 获取文章 JSON 内容
- `getImageUrl(arweaveId)` - 获取图片 URL
- `getArweaveUrl(arweaveId, gateway?)` - 获取 Arweave 内容 URL
- `fetchRawContent(arweaveId)` - 获取原始二进制数据
- `fetchTextContent(arweaveId)` - 获取文本内容
- `checkContentExists(arweaveId)` - 检查内容是否存在
- `fetchArticleMarkdown(arweaveId)` - 获取文章元数据（标题、内容、摘要等）
- `fetchArticleSummaryFromTags(arweaveId)` - 获取文章摘要

所有函数支持多网关自动切换容错。

### 7.2 模块导出索引

> 📁 **实现文件**: [frontend/src/lib/arweave/index.ts](../frontend/src/lib/arweave/index.ts)

统一导出 Arweave 模块的所有类型和函数。

---

# Part 4: SvelteKit 前端

## 8. 前端项目初始化

### 8.1 创建 SvelteKit 项目

```bash
# 在项目根目录
npx sv create frontend

cd frontend
npm install

# Tailwind CSS v4 已集成，无需额外配置
```

### 8.2 安装依赖

```bash
# Web3 相关
npm install viem

# Arweave/Irys（浏览器端，使用 Viem v2）
npm install @irys/web-upload @irys/web-upload-ethereum @irys/web-upload-ethereum-viem-v2

# 国际化 (Paraglide)
npm install @inlang/paraglide-js

# Markdown 渲染
npm install -D mdsvex

# 开发依赖
npm install -D @tailwindcss/typography @tailwindcss/vite
```

### 8.3 项目结构

```
frontend/
├── src/
│   ├── lib/                  # 共享库代码
│   │   ├── arweave/          # Arweave/Irys 集成
│   │   │   ├── irys.ts       # Irys 客户端
│   │   │   ├── upload.ts     # 上传功能
│   │   │   ├── fetch.ts      # 内容获取
│   │   │   ├── cache.ts      # 缓存管理
│   │   │   └── types.ts      # 类型定义
│   │   ├── components/       # 可复用组件
│   │   │   ├── WalletButton.svelte
│   │   │   └── SearchSelect.svelte
│   │   ├── paraglide/        # i18n 生成代码
│   │   ├── config.ts         # 应用配置
│   │   ├── contracts.ts      # 合约交互
│   │   ├── sessionKey.ts     # Session Key 管理
│   │   └── publish.ts        # 发布流程编排
│   ├── routes/               # 页面路由
│   │   ├── +layout.svelte    # 全局布局
│   │   ├── +page.svelte      # 首页
│   │   ├── a/[id]/           # 文章详情页 (/a/1, /a/2, ...)
│   │   │   ├── +page.ts      # 数据加载
│   │   │   └── +page.svelte  # 页面组件
│   │   └── publish/
│   │       └── +page.svelte  # 发布文章页
│   ├── app.html              # HTML 模板
│   └── app.d.ts              # 类型声明
├── messages/                 # i18n 翻译文件
│   ├── en-us.json
│   └── zh-cn.json
├── static/                   # 静态资源
├── svelte.config.js          # Svelte 配置
├── vite.config.ts            # Vite 配置
└── package.json
```

---

## 9. 钱包连接与合约交互

SvelteKit 前端使用 viem 直接与钱包和合约交互，无需 wagmi 封装。

### 9.1 配置文件

> 📁 **实现文件**: [frontend/src/lib/config.ts](../frontend/src/lib/config.ts)

通过环境变量配置，提供以下 getter 函数：
- `getBlogHubContractAddress()` - BlogHub 合约地址
- `getSessionKeyManagerAddress()` - SessionKeyManager 合约地址
- `getRpcUrl()` - RPC URL
- `getChainId()` - 链 ID
- `getIrysNetwork()` - Irys 网络（mainnet/devnet）
- `getArweaveGateways()` - Arweave 网关列表
- `getSubsquidEndpoint()` - SubSquid GraphQL 端点

### 9.2 钱包连接组件

> 📁 **实现文件**: [frontend/src/lib/components/WalletButton.svelte](../frontend/src/lib/components/WalletButton.svelte)

功能：
- 连接/断开钱包
- 显示连接状态和地址缩写
- 自动切换到 Optimism Sepolia 网络
- 监听账户和链变化事件
- 支持 i18n 多语言 (Paraglide)

### 9.3 合约交互封装

> 📁 **实现文件**: [frontend/src/lib/contracts.ts](../frontend/src/lib/contracts.ts)

包含以下功能：
- `publishToContract()` / `publishToContractWithSessionKey()` - 发布文章到合约
- `evaluateArticle()` / `evaluateArticleWithSessionKey()` - 评价文章（点赞/踩/打赏）
- `followUser()` / `followUserWithSessionKey()` - 关注/取消关注用户
- `collectArticle()` / `collectArticleWithSessionKey()` - 收藏文章 NFT
- `editArticle()` / `editArticleWithSessionKey()` - 编辑文章元数据
- `updateUserProfile()` / `updateUserProfileWithSessionKey()` - 更新用户资料
- `ContractError` - 合约错误类（支持 i18n 错误码）

---

## 10. Session Key 无感交互

Session Key 允许用户授权临时密钥执行特定操作，实现无感交互体验。

### 10.1 Session Key 管理

> 📁 **实现文件**: [frontend/src/lib/sessionKey.ts](../frontend/src/lib/sessionKey.ts)

包含以下功能：
- `StoredSessionKey` - Session Key 数据结构接口
- `getStoredSessionKey()` - 获取存储的 Session Key
- `isSessionKeyValidForCurrentWallet()` - 检查 Session Key 是否对当前钱包有效
- `createSessionKey()` - 生成并注册新的 Session Key（7天有效期）
- `revokeSessionKey()` - 撤销 Session Key
- `clearLocalSessionKey()` - 清除本地存储的 Session Key
- `getSessionKeyAccount()` - 获取 Session Key 账户实例用于签名

### 10.2 允许的函数选择器

```typescript
// 允许 Session Key 调用的函数
const ALLOWED_SELECTORS: `0x${string}`[] = [
  '0xff1f090a', // evaluate
  '0xdffd40f2', // likeComment
  '0x63c3cc16', // follow
  '0x21a25d60', // publish
  '0x8d3c100a'  // collect
];

// Session Key 有效期：7 天
const SESSION_KEY_DURATION = 7 * 24 * 60 * 60; // 604800 秒

// 默认消费额度 (10 ETH)
const DEFAULT_SPENDING_LIMIT = BigInt('10000000000000000000');
```

---

## 11. 页面与组件开发

### 11.1 全局布局

> 📁 **实现文件**: [frontend/src/routes/+layout.svelte](../frontend/src/routes/+layout.svelte)

功能：
- 响应式布局，支持移动端
- 粘性导航栏带模糊背景
- 集成语言切换器 (Paraglide i18n)
- 钱包连接按钮

### 11.2 发布文章页面

> 📁 **实现文件**: [frontend/src/routes/publish/+page.svelte](../frontend/src/routes/publish/+page.svelte)

功能：
- 使用 Svelte 5 runes (`$state`, `$derived`) 管理表单状态
- 支持 Markdown 内容编辑
- 封面图片上传预览
- 分类选择器组件 (SearchSelect)
- 原创标记选择（Original/SemiOriginal/Reprint）
- 版税设置（0-100%）
- 收藏价格和最大收藏数量配置
- 完整的发布流程：获取/创建 Session Key → 上传到 Arweave → 发布到合约
- i18n 国际化支持
- 合约错误处理与友好提示
- Session Key 自动创建和余额检查

### 11.3 发布流程编排

> 📁 **实现文件**: [frontend/src/lib/publish.ts](../frontend/src/lib/publish.ts)

发布流程分四步：
1. 获取或创建 Session Key（若无有效的则创建新的，需一次 MetaMask 签名）
2. 检查 Session Key 余额（若不足则自动补充）
3. 上传文章文件夹到 Arweave（包含内容、摘要、封面图片）
4. 调用合约 `publish()` 方法记录链上（使用 Session Key 签名，无需 Gas 费）

### 11.4 文章详情页

> 📁 **实现文件**: 
> - [frontend/src/routes/a/[id]/+page.svelte](../frontend/src/routes/a/[id]/+page.svelte) - 页面组件
> - [frontend/src/routes/a/[id]/+page.ts](../frontend/src/routes/a/[id]/+page.ts) - 数据加载

**URL 设计**: `/a/[id]` - 使用最短路径，其中 `id` 为文章的 **ArweaveID**（Irys manifest ID）

> **重要**: 文章使用 ArweaveID 作为主键标识符（而非链上自增 articleId），这样可以：
> - 保持与 Arweave 存储的稳定对应关系
> - 支持文章编辑后的元数据更新

功能：
- 从 SubSquid 获取文章元数据（标题、作者、统计、分类、原创标记等）
- 从 Arweave 获取文章内容（带本地缓存，24小时 TTL）
- 响应式布局，支持移动端
- 显示封面图、分类、作者信息、原创标记
- 文章统计（点赞、踩、打赏、收藏数）
- 评论和评价展示
- 分享功能（Web Share API / 复制链接）
- 链上信息展示（区块号、交易哈希）
- 收藏功能（NFT）

### 11.5 GraphQL 查询

> 📁 **实现文件**: [frontend/src/lib/graphql/queries.ts](../frontend/src/lib/graphql/queries.ts)

包含以下查询：
- `ARTICLES_QUERY` - 分页获取文章列表（带分类过滤）
- `ALL_ARTICLES_QUERY` - 分页获取所有文章
- `ARTICLE_BY_ID_QUERY` - 根据 ID 获取单篇文章详情
- `ARTICLE_COUNT_QUERY` - 获取文章总数

---

# 部署与运维

智能合约的部署与运维相关内容已迁移至 [contracts.md](contracts.md)：

| 章节 | 说明 |
|------|------|
| [测试网部署](contracts.md#6-测试网部署) | Optimism Sepolia 部署流程 |
| [主网部署检查清单](contracts.md#7-主网部署检查清单) | 部署前/后检查、监控指标 |
| [常见问题排查](contracts.md#8-常见问题排查) | 交易失败、Session Key、Paymaster 问题 |
| [附录：速查表](contracts.md#9-附录速查表) | 函数选择器、事件签名、Cast 命令 |
