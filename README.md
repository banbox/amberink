# AmberInk 去中心化永久内容发布平台
> Ink Once, Exist Forever

完全去中心化的永久内容发布平台，无后端参与。用户可发布、评价、收藏文章，所有数据存储在区块链和 Arweave 上。

**核心特性**：文章即 NFT（ERC-1155）、无感交互（Session Keys）、Gas 代付（ERC-4337）、内容加密

## 如何学习？
[最细节的手把手开发日志](learn/README.md)

此项目基本都是AI开发完成的，上面包含了最细的完整项目开发细节，逐步尝试即可复现你的dapp

## 技术架构

```perl
amberink/
├── contracts/        # Foundry 智能合约 (Solidity)
├── frontend/         # SvelteKit + TypeScript
├── squid/            # Subsquid 链上索引
├── learn/            # 学习教程
```

| 层级 | 技术栈 | 说明 |
|------|--------|------|
| 智能合约 | Solidity + Foundry | ERC-1155 NFT、ERC-2981 版税、UUPS 可升级 |
| 区块链 | Optimism | 低成本、高速交易 |
| 存储 | Arweave + Irys | 去中心化永久存储 |
| 索引 | Subsquid | 事件处理 + GraphQL 查询 |
| 前端 | SvelteKit + TailwindCSS | 响应式 Web 应用 |
| Web3 | viem + @wagmi/core + @reown/appkit | 钱包交互与连接 |

## 核心功能

### 1. 文章即 NFT
- 每篇文章对应 ERC-1155 NFT，支持收藏和二手交易版税
- TokenID 设计：创作者用 `articleId`，收藏者用 `articleId + 2^250` 区分

### 2. 无感交互（Session Keys）
用户仅需一次主钱包签名授权临时密钥，后续点赞、评论等操作由临时私钥签名，**无需反复唤起钱包**。

### 3. Gas 代付（ERC-4337）
- **资金池模式**：项目方/赞助商存款到 Paymaster 合约，授权用户使用
- **Token 模式**：用户可用 USDT/USDC 等 ERC-20 代币支付 Gas

### 4. 文章可见性 & 加密
- **公开**：所有人可见  
- **不公开**：仅链接可访问，不出现在公开列表  
- **加密**：使用钱包签名派生 AES-256-GCM 密钥加密内容，仅作者可解密

### 5. 智能合约功能
| 功能 | 说明 |
|------|------|
| `publish` | 发布文章（原创/转载、收藏价格、版税） |
| `evaluate` | 评价文章（点赞/踩/打赏）、评论、关注 |
| `collect` | 收藏文章 NFT |
| `editArticle` | 编辑元数据（标题、摘要、分类） |
| `updateUserProfile` | 更新用户资料（昵称、头像、简介） |

## 数据流简述
```
发布文章 → Arweave 存储内容(获得 arweaveId) → BlogHub 合约记录链上 
       → Subsquid 监听事件 → 索引数据 → 前端 GraphQL 查询展示
```

## TODO
- 多标签索引（类别、话题、地区）
- Markdown 编辑器 [cherry-markdown](https://github.com/Tencent/cherry-markdown)
- 去中心化身份 DID 接入
- 更新help.md，优化其他页面代码