# AmberInk 永久性发布平台
> Ink Once, Exist Forever

完全去中心化，无后端参与，相关角色：前端 + 智能合约 + 索引查询 + 存储。
基于Optimism(solidity) + Arweave(Irys) + Subsquid + SvelteKit

## 如何学习？
[最细节的手把手开发日志](learn/README.md)

此项目基本都是AI开发完成的，上面包含了最细的完整项目开发细节，逐步尝试即可复现你的dapp


```perl
amberink/
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
特性：可升级、支持打赏&NFT、版权、易读签名、文章编辑、用户资料更新
采用 ERC-4337 账户抽象实现去中心化代付，结合 Session Keys 实现无感交互体验。
核心功能：
* publish: 发布文章（支持原创/转载标记、收藏价格、版税）
* evaluate: 评价文章（点赞/踩/打赏）、评论、关注
* collect: 收藏文章NFT
* editArticle: 编辑文章元数据（标题、摘要、分类）
* updateUserProfile: 更新用户资料（昵称、头像、简介）
所有操作支持 Session Key 无感交互（无需每次 MetaMask 签名）

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

## TODO
* 支持多标签索引（类别，话题，地区等）
* 支持markdown编辑器[cherry-markdown](https://github.com/Tencent/cherry-markdown)
* 接入去中心化身份DID
