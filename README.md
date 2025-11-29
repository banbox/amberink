# DBlog去中心化博客
此项目完全去中心化，无后端参与，相关角色：前端 + 智能合约 + 索引查询 + 存储。
基于Optimism(solidity) + Arweave(Irys) + Subsquid + SvelteKit


```perl
dblog/
├── contracts/        # Foundry 项目
│   ├── lib/          # 会包含 as submodule 的 OpenZeppelin 等
│   ├── src/
│   ├── foundry.toml
│   └── ...
│
├── frontend/
│   └── ...           # SvelteKit
│
├── .gitmodules       # 统一管理所有 submodules（如 foundry 的 lib/）
└── .git/
```

## 关键点说明
* 文章即NFT：每个文章对应一个NFT，用户可收藏文章
* 内容存储：文章具体内容和元数据存储在Arweave上。
* 数据索引：使用SubSquid去中心化索引，查询文章列表等

## 智能合约设计
单体ERC-1155合约+CollectModule插件架构
标准：ERC-1155和ERC-2981（二手交易版税）
特性：可升级、支持打赏&NFT、版权、易读签名
业务函数有两类（以evaluate为例）：
* evaluate: MetaMask / EOA 普通用户，使用原生 ETH 支付
* evaluateWithSessionKey: 高频交互用户，使用"临时密钥"签名 + 合约内余额支付

### ERC-4337 账户抽象 + Session Keys
采用 ERC-4337 账户抽象实现去中心化代付，结合 Session Keys 实现无感交互体验。

#### 核心合约
- **BlogHub** - 主业务合约，支持文章发布、评价、点赞、关注等
- **BlogPaymaster** - ERC-4337 Paymaster，负责 Gas 代付
- **SessionKeyManager** - Session Key 管理，实现无感签名

#### Session Keys（无感交互）
解决问题：每次点赞/评论都需要唤起钱包签名，体验差

**工作流程：**
1. 用户登录 dApp 时，前端生成临时密钥对（Ephemeral Key Pair）
2. 用户使用主钱包签名授权该临时公钥（**唯一一次弹窗**）
3. 临时私钥保存在浏览器 LocalStorage
4. 后续点赞/评论等操作由临时私钥签名，**无需唤起钱包**
5. 链上验证：Session Key 签名 + 主账户授权 + 权限范围

**安全特性：**
- 时间限制：最长 7 天有效期
- 权限限制：只能调用指定合约的指定函数（如 `evaluate`、`likeComment`、`follow`）
- 消费限额：限制可消费的最大金额
- 可撤销：主账户可随时撤销 Session Key

#### 代付机制
- **Gas 代付**：Sponsor 存款到 BlogPaymaster 并授权用户，用户发送 UserOperation 时自动从 Sponsor 余额扣除 Gas
- **业务支付**：用户可在 BlogHub 存入余额，通过 Session Key 使用余额进行赞赏/点赞（无需授权他人）

```text
┌─────────────────────────────────────────────────────────────┐
│                    无感交互流程                              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. 首次登录: 生成 Session Key + 主钱包授权（唯一弹窗）      │
│                                                             │
│  2. 后续操作: 点赞/评论 → 临时私钥签名 → 提交到 Bundler     │
│              （完全无感，类似 Web2 体验）                    │
│                                                             │
│  3. 链上验证:                                               │
│     ├─ SessionKeyManager: 验证授权有效性                    │
│     ├─ BlogPaymaster: 验证并扣除 Gas 费用                   │
│     └─ BlogHub: 执行业务逻辑                                │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## SubSquid索引设计
只索引“关系”和“状态”，不索引文章全文。文章的标题、摘要等 Metadata 由前端获取 Arweave Hash 后在客户端（或 SSR 层）懒加载，或者由 Indexer 的 Worker 异步获取。 为了简化 MVP，我们采用前端懒加载策略，Indexer 只存 Hash。
用 Subsquid 的 Archive（block history ingestion）做可靠回溯，用 Processor 做高吞吐低延迟的事件->实体映射，且把对 Arweave 的 fetch 作为异步任务（避免阻塞事件处理）。

## 数据存储
使用Arweave永久存储文章内容
基于Irys作为数据上传获取链；（官方AR.IO的Turbo是中心化的）

## 前端集成
Web3交互：viem + @wagmi/core + svelte-wagmi
钱包连接UI：@reown/appkit的纯js模式
数据查询：@urql/svelte
