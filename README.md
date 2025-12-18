# DBlog去中心化博客
此项目完全去中心化，无后端参与，相关角色：前端 + 智能合约 + 索引查询 + 存储。
基于Optimism(solidity) + Arweave(Irys) + Subsquid + SvelteKit

## 如何学习？
[最细节的手把手开发日志](learn/README.md)

此项目基本都是AI开发完成的，上面包含了最细的完整项目开发细节，逐步尝试即可复现你的dblog


```perl
dblog/
├── contracts/        # Foundry 智能合约
├── frontend/         # SvelteKit
├── squid/            # Subsquid 链上索引
├── learn/            # 学习教程
├── .gitmodules       # 统一管理所有 submodules（如 foundry 的 lib/）
```

## 关键点说明
* 文章即NFT：每个文章对应一个NFT，用户可收藏文章
* 内容存储：文章一次付费，永久存储在Arweave上。
* 数据索引：使用SubSquid去中心化索引，查询文章列表等

## 智能合约设计
标准：ERC-1155和ERC-2981（二手交易版税）
特性：可升级、支持打赏&NFT、版权、易读签名
采用 ERC-4337 账户抽象实现去中心化代付，结合 Session Keys 实现无感交互体验。
业务函数有两类（以evaluate为例）：
* evaluate: MetaMask / EOA 普通用户，使用原生 ETH 支付
* evaluateWithSessionKey: 高频交互用户，使用"临时密钥"签名 + 原生 ETH 支付

## SubSquid索引设计
只索引“关系”和“状态”，不索引文章全文。文章的标题、摘要等 Metadata 由前端获取 Arweave Hash 后在客户端（或 SSR 层）懒加载，或者由 Indexer 的 Worker 异步获取。 为了简化 MVP，我们采用前端懒加载策略，Indexer 只存 Hash。
用 Subsquid 的 Archive（block history ingestion）做可靠回溯，用 Processor 做高吞吐低延迟的事件->实体映射，且把对 Arweave 的 fetch 作为异步任务（避免阻塞事件处理）。

## 数据存储
使用Arweave永久存储文章内容
基于Irys作为数据上传获取链；（官方AR.IO的Turbo是中心化的）

## 前端集成
Web3交互：viem + @wagmi/core
钱包连接UI：@reown/appkit
数据查询：@urql/svelte
其他：prettier，eslint，tailwindcss，vitest，playwright，@inlang/paraglide-sveltekit

