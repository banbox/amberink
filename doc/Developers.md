# DBlog 开发者指南

本文档为 DBlog 去中心化博客项目的完整技术指南，涵盖从本地部署到生产环境的全流程。

---

## 项目进度概览

| 模块 | 状态 | 说明 |
|------|------|------|
| 智能合约 | ✅ 已完成 | BlogHub, BlogPaymaster, BlogTokenPaymaster, SessionKeyManager |
| 单元测试 | ✅ 已完成 | 全部测试通过 |
| 部署脚本 | ✅ 已完成 | 支持本地/测试网/主网部署 |
| SubSquid 索引 | 🔨 开发中 | ABI 已生成，Processor 已配置，待本地测试 |
| Irys + Arweave | 🔲 待开发 | 文章内容永久存储 |
| SvelteKit 前端 | ✅ 已完成 | 用户界面、钱包集成、i18n 国际化 |

---

## 目录

**Part 1: 智能合约（已完成）**
1. [环境准备](#1-环境准备)
2. [本地部署验证](#2-本地部署验证)
3. [合约调用测试](#3-合约调用测试)
4. [Session Key 配置与测试](#4-session-key-配置与测试)
5. [Paymaster 配置](#5-paymaster-配置)

**Part 2: SubSquid 索引（待开发）**
6. [SubSquid 项目初始化](#6-subsquid-项目初始化)
7. [Schema 定义与实体映射](#7-schema-定义与实体映射)
8. [Processor 事件处理](#8-processor-事件处理)
9. [GraphQL API 与查询](#9-graphql-api-与查询)

**Part 3: Irys + Arweave 存储（待开发）**
10. [Irys SDK 集成](#10-irys-sdk-集成)
11. [文章上传与元数据](#11-文章上传与元数据)
12. [内容获取与缓存](#12-内容获取与缓存)

**Part 4: SvelteKit 前端（已完成）**
13. [前端项目初始化](#13-前端项目初始化)
14. [钱包连接与合约交互](#14-钱包连接与合约交互)
15. [Session Key 无感交互](#15-session-key-无感交互)
16. [页面与组件开发](#16-页面与组件开发)

**Part 5: 部署与运维**
17. [测试网部署](#17-测试网部署)
18. [主网部署检查清单](#18-主网部署检查清单)
19. [常见问题排查](#19-常见问题排查)

---

## 1. 环境准备

### 1.1 部署合约地址（本地 Anvil）

```
SessionKeyManager: 0x5FbDB2315678afecb367f032d93F642f64180aa3
BlogPaymaster:     0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512
BlogHub Impl:      0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0
BlogHub Proxy:     0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9
EntryPoint:        0x0000000071727De22E5E9d8BAf0edAc6f37da032
```

### 1.2 测试账户（Anvil 默认）

```bash
# Account #0 (Deployer/Owner)
Address: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
Private Key: 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80

# Account #1 (User1 - 作者)
Address: 0x70997970C51812dc3A010C7d01b50e0d17dc79C8
Private Key: 0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d

# Account #2 (User2 - 读者)
Address: 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC
Private Key: 0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a
```

---

## 2. 本地部署验证

### 2.1 启动本地链

```bash
# 终端 1: 启动 Anvil（保持运行）
cd contracts
anvil --dump-state cache/anvil.json --load-state cache/anvil.json
```

### 2.2 验证合约部署

```bash
cd contracts

export PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
forge script script/Deploy.s.sol --fork-url http://localhost:8545 --broadcast --tc DeployScript

# 升级智能合约
export BLOG_HUB_PROXY=0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9
forge script script/Deploy.s.sol --fork-url http://localhost:8545 --broadcast --tc UpgradeBlogHub

# 检查 BlogHub Proxy 是否正确初始化
cast call 0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9 "platformTreasury()(address)" --rpc-url http://localhost:8545

# 检查 platformFeeBps (默认 250 = 2.5%)
cast call 0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9 "platformFeeBps()(uint96)" --rpc-url http://localhost:8545

# 检查 SessionKeyManager 是否已设置
cast call 0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9 "sessionKeyManager()(address)" --rpc-url http://localhost:8545

# 检查 Paymaster 的 SessionKeyManager
cast call 0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512 "sessionKeyManager()(address)" --rpc-url http://localhost:8545
```

---

## 3. 合约调用测试

### 3.1 发布文章

```bash
# 使用 User1 发布文章（自己是作者）
# publish(string arweaveId, uint64 categoryId, uint96 royaltyBps, string originalAuthor, string title, string coverImage)
# originalAuthor 为空字符串表示发布者即作者
# title 为文章标题（最大128字节）
# coverImage 为封面图片 Arweave Hash（可为空，最大64字节）
cast send 0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9 \
  "publish(string,uint64,uint96,string,string,string)(uint256)" \
  "QmTestArweaveHash123456789" \
  1 \
  500 \
  "" \
  "My First Article" \
  "" \
  --private-key 0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d \
  --rpc-url http://localhost:8545

# 代发文章（记录真实作者，带封面图片）
cast send 0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9 \
  "publish(string,uint64,uint96,string,string,string)(uint256)" \
  "QmTestArweaveHash987654321" \
  1 \
  500 \
  "RealAuthor.eth" \
  "Web3 Development Guide" \
  "QmCoverImageHash123" \
  --private-key 0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d \
  --rpc-url http://localhost:8545

# 验证文章创建
cast call 0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9 "nextArticleId()(uint256)" --rpc-url http://localhost:8545
# 应返回 2（下一个文章ID）

# 查看文章详情（包含 originalAuthor, title, coverImage 字段）
cast call 0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9 \
  "articles(uint256)(string,address,string,string,string,uint64,uint64)" \
  1 \
  --rpc-url http://localhost:8545
```

### 3.2 评价文章（带打赏）

```bash
# 使用 User2 评价文章（喜欢 + 打赏 0.01 ETH）
# evaluate(uint256 articleId, uint8 score, string content, address referrer, uint256 parentCommentId)
# score: 0=中立, 1=喜欢, 2=不喜欢
cast send 0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9 \
  "evaluate(uint256,uint8,string,address,uint256)" \
  1 \
  1 \
  "Great article!" \
  0x0000000000000000000000000000000000000000 \
  0 \
  --value 0.01ether \
  --private-key 0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a \
  --rpc-url http://localhost:8545

# 注意：打赏金额会直接转账给作者，无需提取
```

### 3.3 纯评论（无打赏）

```bash
# 纯评论需要 score=0 且有内容
cast send 0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9 \
  "evaluate(uint256,uint8,string,address,uint256)" \
  1 \
  0 \
  "This is a comment without tip" \
  0x0000000000000000000000000000000000000000 \
  0 \
  --private-key 0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a \
  --rpc-url http://localhost:8545
```

### 3.4 关注用户

```bash
# User2 关注 User1
cast send 0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9 \
  "follow(address,bool)" \
  0x70997970C51812dc3A010C7d01b50e0d17dc79C8 \
  true \
  --private-key 0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a \
  --rpc-url http://localhost:8545
```

---

## 4. Session Key 配置与测试

Session Key 允许用户授权临时密钥执行特定操作，实现无感交互体验。

### 4.1 生成 Session Key

```javascript
// 前端代码示例 (ethers.js v6)
import { Wallet } from 'ethers';

// 生成临时密钥对
const sessionKeyWallet = Wallet.createRandom();
console.log('Session Key Address:', sessionKeyWallet.address);
console.log('Session Key Private Key:', sessionKeyWallet.privateKey);

// 保存到 localStorage
localStorage.setItem('sessionKey', JSON.stringify({
  address: sessionKeyWallet.address,
  privateKey: sessionKeyWallet.privateKey
}));
```

### 4.2 注册 Session Key（主钱包签名）

```bash
# 假设生成的 Session Key 地址为: 0x1234567890123456789012345678901234567890

# 使用 User1 注册 Session Key
# registerSessionKey(address sessionKey, uint48 validAfter, uint48 validUntil, address allowedContract, bytes4[] allowedSelectors, uint256 spendingLimit)

# 获取当前时间戳
CURRENT_TIME=$(cast block latest --rpc-url http://localhost:8545 | grep timestamp | awk '{print $2}')
VALID_UNTIL=$((CURRENT_TIME + 86400))  # 24小时后过期

# 函数选择器:
# evaluate: 0xff1f090a
# likeComment: 0xdffd40f2
# follow: 0x63c3cc16

cast send 0x5FbDB2315678afecb367f032d93F642f64180aa3 \
  "registerSessionKey(address,uint48,uint48,address,bytes4[],uint256)" \
  0x1234567890123456789012345678901234567890 \
  $CURRENT_TIME \
  $VALID_UNTIL \
  0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9 \
  "[0xff1f090a,0xdffd40f2,0x63c3cc16]" \
  1000000000000000000 \
  --private-key 0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d \
  --rpc-url http://localhost:8545
```

### 4.3 查询 Session Key 状态

```bash
# 检查 Session Key 是否激活
cast call 0x5FbDB2315678afecb367f032d93F642f64180aa3 \
  "isSessionKeyActive(address,address)(bool)" \
  0x70997970C51812dc3A010C7d01b50e0d17dc79C8 \
  0x1234567890123456789012345678901234567890 \
  --rpc-url http://localhost:8545

# 获取 Session Key 详细数据
cast call 0x5FbDB2315678afecb367f032d93F642f64180aa3 \
  "getSessionKeyData(address,address)" \
  0x70997970C51812dc3A010C7d01b50e0d17dc79C8 \
  0x1234567890123456789012345678901234567890 \
  --rpc-url http://localhost:8545

# 查询剩余消费额度
cast call 0x5FbDB2315678afecb367f032d93F642f64180aa3 \
  "getRemainingSpendingLimit(address,address)(uint256)" \
  0x70997970C51812dc3A010C7d01b50e0d17dc79C8 \
  0x1234567890123456789012345678901234567890 \
  --rpc-url http://localhost:8545
```

### 4.4 使用 Session Key 执行操作

Session Key 操作需要构建 EIP-712 签名，通常由前端完成：

```typescript
// 前端代码示例
import { ethers } from 'ethers';

const DOMAIN = {
  name: 'SessionKeyManager',
  version: '1',
  chainId: 31337, // Anvil chainId
  verifyingContract: '0x5FbDB2315678afecb367f032d93F642f64180aa3'
};

const TYPES = {
  SessionOperation: [
    { name: 'owner', type: 'address' },
    { name: 'sessionKey', type: 'address' },
    { name: 'target', type: 'address' },
    { name: 'selector', type: 'bytes4' },
    { name: 'callData', type: 'bytes' },
    { name: 'value', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' }
  ]
};

async function signSessionOperation(
  sessionKeyWallet: ethers.Wallet,
  owner: string,
  target: string,
  selector: string,
  callData: string,
  value: bigint,
  nonce: bigint,
  deadline: bigint
) {
  const message = {
    owner,
    sessionKey: sessionKeyWallet.address,
    target,
    selector,
    callData,
    value,
    nonce,
    deadline
  };
  
  return await sessionKeyWallet.signTypedData(DOMAIN, TYPES, message);
}
```

### 4.5 撤销 Session Key

```bash
# 主账户撤销 Session Key
cast send 0x5FbDB2315678afecb367f032d93F642f64180aa3 \
  "revokeSessionKey(address)" \
  0x1234567890123456789012345678901234567890 \
  --private-key 0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d \
  --rpc-url http://localhost:8545
```

---

## 5. Paymaster 配置

Paymaster 负责 ERC-4337 的 Gas 代付功能。

### 5.1 向 EntryPoint 存款

```bash
# Paymaster 需要在 EntryPoint 有存款才能工作
# 使用 Owner 账户操作
cast send 0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512 \
  "depositToEntryPoint()" \
  --value 1ether \
  --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 \
  --rpc-url http://localhost:8545

# 查看 EntryPoint 存款余额
cast call 0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512 \
  "getEntryPointDeposit()(uint256)" \
  --rpc-url http://localhost:8545
```

### 5.2 添加 Stake

```bash
# Paymaster 必须有 stake 才能工作
# unstakeDelaySec: 解锁延迟时间（秒），建议至少 1 天 = 86400
cast send 0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512 \
  "addStake(uint32)" \
  86400 \
  --value 0.5ether \
  --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 \
  --rpc-url http://localhost:8545

# 查看完整存款信息
cast call 0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512 \
  "getDepositInfo()(uint256,bool,uint112,uint32,uint48)" \
  --rpc-url http://localhost:8545
```

### 5.3 用户存款到 Paymaster

```bash
# 项目方/赞助商存款
cast send 0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512 \
  "deposit()" \
  --value 1ether \
  --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 \
  --rpc-url http://localhost:8545

# 查看余额
cast call 0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512 \
  "balanceOf(address)(uint256)" \
  0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 \
  --rpc-url http://localhost:8545
```

### 5.4 授权用户使用 Gas

```bash
# 项目方授权 User1 使用其余额支付 Gas
# approve(address spender, uint256 amount)
# type(uint256).max = 无限授权
cast send 0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512 \
  "approve(address,uint256)" \
  0x70997970C51812dc3A010C7d01b50e0d17dc79C8 \
  115792089237316195423570985008687907853269984665640564039457584007913129639935 \
  --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 \
  --rpc-url http://localhost:8545

# 检查授权额度
cast call 0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512 \
  "allowance(address,address)(uint256)" \
  0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 \
  0x70997970C51812dc3A010C7d01b50e0d17dc79C8 \
  --rpc-url http://localhost:8545

# 检查是否可以赞助
cast call 0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512 \
  "canSponsor(address,address,uint256)(bool)" \
  0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 \
  0x70997970C51812dc3A010C7d01b50e0d17dc79C8 \
  100000000000000000 \
  --rpc-url http://localhost:8545
```

### 5.5 使用脚本配置 Paymaster

```bash
# 使用部署脚本中的 ConfigurePaymaster
PAYMASTER=0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512 \
DEPOSIT_AMOUNT=1000000000000000000 \
STAKE_AMOUNT=500000000000000000 \
UNSTAKE_DELAY=86400 \
forge script script/Deploy.s.sol --fork-url http://localhost:8545 --broadcast --tc ConfigurePaymaster
```

---

# Part 2: SubSquid 索引

## 6. SubSquid 项目初始化

SubSquid 是去中心化的区块链索引服务，用于索引链上事件并提供 GraphQL API。

### 6.1 安装 Squid CLI

```bash
# 全局安装 Squid CLI
npm install -g @subsquid/cli

# 验证安装
sqd --version
```

### 6.2 创建 Squid 项目

```bash
# 使用 EVM 模板初始化
sqd init squid -t evm

# 进入项目目录
cd squid

# 安装依赖
npm install
```

### 6.3 项目结构

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

### 6.4 配置数据源

编辑 `squid.yaml`：

```yaml
# squid.yaml
manifestVersion: subsquid.io/v0.1
name: squid
version: 1
description: DBlog decentralized blog indexer

build:

deploy:
  addons:
    postgres:
  processor:
    cmd: ["node", "lib/main.js"]
  api:
    cmd: ["npx", "squid-graphql-server"]
```

编辑 `src/processor.ts` 配置

---

## 7. Schema 定义与实体映射

### 7.1 定义 GraphQL Schema

编辑 `schema.graphql`

### 7.2 生成 TypeORM 实体

```bash
# 根据 schema.graphql 生成实体类
npx squid-typeorm-codegen

# 编译 TypeScript 代码
npx tsc

```

### 7.3 复制合约 ABI

```bash
# 从 contracts 目录复制 ABI
mkdir -p src/abi
cp ../../contracts/out/BlogHub.sol/BlogHub.json src/abi/

# 生成类型安全的事件解码器
npx squid-evm-typegen src/abi src/abi/BlogHub.json
```

---

## 8. Processor 事件处理

### 8.1 事件处理逻辑

事件处理代码位于 `src/main.ts`，处理以下事件：

- **ArticlePublished** - 文章发布，创建 Article 和 User 实体
- **ArticleEvaluated** - 文章评价（点赞/踩/打赏），更新统计数据
- **CommentAdded** - 评论添加
- **FollowStatusChanged** - 关注状态变更

Processor 配置位于 `src/processor.ts`，订阅 BlogHub 合约的上述事件。

### 8.2 本地运行测试

```bash
# 启动本地 PostgreSQL（使用 Docker）
docker compose up -d

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

## 9. GraphQL API 与查询

### 9.1 常用查询示例
可在浏览器端打开`http://localhost:4350/graphql`测试graphql。
语句示例参考[graphsql_example.md](graphsql_example.md)

### 9.2 部署到 SubSquid Cloud

```bash
# 登录 SubSquid Cloud
sqd auth -k YOUR_DEPLOYMENT_KEY

# 部署
sqd deploy .
```

### 9.3 前端集成

```shell
# 创建 SvelteKit 项目
npx sv create frontend
cd frontend
npm install
npm run dev
```

SvelteKit 前端使用原生 fetch 调用 GraphQL API：

```typescript
// frontend/src/lib/graphql.ts
const GRAPHQL_URL = 'http://localhost:4350/graphql';

export async function queryGraphQL<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const response = await fetch(GRAPHQL_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables })
  });
  
  const result = await response.json();
  if (result.errors) {
    throw new Error(result.errors[0].message);
  }
  return result.data;
}

// 使用示例
export async function getLatestArticles(limit: number = 20, offset: number = 0) {
  return queryGraphQL<{ articles: Article[] }>(`
    query LatestArticles($limit: Int!, $offset: Int!) {
      articles(orderBy: createdAt_DESC, limit: $limit, offset: $offset) {
        id
        arweaveId
        author { id }
        originalAuthor
        likes
        dislikes
        totalTips
        createdAt
      }
    }
  `, { limit, offset });
}
```

---

# Part 3: Irys + Arweave 存储

## 10. Irys SDK 集成

Irys 是 Arweave 的上传层，提供快速、可靠的永久存储服务。Irys 提供两套 SDK：
- **服务端 SDK**：`@irys/upload` - 用于 Node.js 环境
- **浏览器端 SDK**：`@irys/web-upload` - 用于浏览器环境

### 10.1 安装依赖

**浏览器端（使用 Viem v2）：**

```bash
cd frontend
npm install @irys/web-upload @irys/web-upload-ethereum @irys/web-upload-ethereum-viem-v2 viem
```

### 10.2 初始化 Irys 客户端

**浏览器端（Viem v2 + @wagmi/core）：**

[frontend\src\lib\arweave\irys.ts](frontend\src\lib\arweave\irys.ts)

### 10.3 网络说明

Irys 有两个 Bundler 网络：

| 网络 | 说明 | 数据保留 |
|------|------|----------|
| **Mainnet** | 使用真实代币付费 | 永久存储 |
| **Devnet** | 使用免费水龙头代币 | 约 60 天后删除 |

- **网关地址**：`https://gateway.irys.xyz/{transactionId}`
- **Devnet 配置**：需要调用 `.withRpc(rpcURL).devnet()` 方法
- **支持的代币**：ETH、MATIC、BNB、AVAX、SOL 等，详见 [Supported Tokens](https://docs.irys.xyz/build/d/features/supported-tokens)

---

## 11. 文章上传与元数据

### 11.1 文章数据结构

[frontend\src\lib\arweave\types.ts](frontend\src\lib\arweave\types.ts)

### 11.2 上传文章到 Arweave

[frontend\src\lib\arweave\upload.ts](frontend\src\lib\arweave\upload.ts)

### 11.3 完整发布流程

[upload_example.ts](../learn/09_upload_example.ts)

---

## 12. 内容获取与缓存

### 12.1 从 Arweave 获取内容

> 📁 **实现文件**: [frontend/src/lib/arweave/fetch.ts](../frontend/src/lib/arweave/fetch.ts)

```typescript
// frontend/src/lib/arweave/fetch.ts
import { getArweaveGateways } from '$lib/config';
import type { ArticleMetadata } from './types';

// 从 Arweave 获取文章内容
export async function fetchArticleContent(arweaveId: string): Promise<ArticleMetadata> {
  const gateways = getArweaveGateways();
  
  for (const gateway of gateways) {
    try {
      const response = await fetch(`${gateway}/${arweaveId}`);
      if (response.ok) {
        return await response.json();
      }
    } catch (error) {
      console.warn(`Failed to fetch from ${gateway}:`, error);
    }
  }
  
  throw new Error('Failed to fetch article from all gateways');
}

// 获取图片 URL
export function getImageUrl(arweaveId: string): string {
  const gateways = getArweaveGateways();
  return `${gateways[0]}/${arweaveId}`;
}
```

### 12.2 客户端缓存策略

> 📁 **实现文件**: [frontend/src/lib/arweave/cache.ts](../frontend/src/lib/arweave/cache.ts)

```typescript
// frontend/src/lib/arweave/cache.ts
import { browser } from '$app/environment';
import { fetchArticleContent } from './fetch';
import type { ArticleMetadata, CachedArticle } from './types';

const CACHE_PREFIX = 'dblog_article_';
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

export function getCachedArticle(arweaveId: string): ArticleMetadata | null {
  if (!browser) return null;
  
  const cached = localStorage.getItem(CACHE_PREFIX + arweaveId);
  if (!cached) return null;
  
  const data: CachedArticle = JSON.parse(cached);
  if (Date.now() - data.cachedAt > CACHE_DURATION) {
    localStorage.removeItem(CACHE_PREFIX + arweaveId);
    return null;
  }
  
  return data.article;
}

export async function getArticleWithCache(arweaveId: string): Promise<ArticleMetadata> {
  const cached = getCachedArticle(arweaveId);
  if (cached) return cached;
  
  const article = await fetchArticleContent(arweaveId);
  setCachedArticle(arweaveId, article);
  return article;
}
```

### 12.3 模块导出索引

> 📁 **实现文件**: [frontend/src/lib/arweave/index.ts](../frontend/src/lib/arweave/index.ts)

```typescript
// frontend/src/lib/arweave/index.ts
// 类型导出
export type {
  ArticleMetadata,
  ArticleBundle,
  IrysTag,
  UploadReceipt,
  CachedArticle,
  IrysNetwork,
  IrysConfig
} from './types';

// Irys 客户端
export { createIrysUploader, getIrysBalance, fundIrys, getUploadPrice } from './irys';

// 上传功能
export { uploadArticle, uploadImage, uploadData } from './upload';

// 获取内容
export { fetchArticleContent, getImageUrl, getArweaveUrl, checkContentExists } from './fetch';

// 缓存功能
export { getCachedArticle, setCachedArticle, getArticleWithCache, clearAllCache } from './cache';
```

---

# Part 4: SvelteKit 前端

## 13. 前端项目初始化

### 13.1 创建 SvelteKit 项目

```bash
# 在项目根目录
npx sv create frontend

cd frontend
npm install

# Tailwind CSS v4 已集成，无需额外配置
```

### 13.2 安装依赖

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

### 13.3 项目结构

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

### 13.4 环境变量配置

```bash
# frontend/.env
# BlogHub Contract Address (Optimism Sepolia)
PUBLIC_BLOG_HUB_CONTRACT_ADDRESS=0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9

# Session Key Manager Contract Address
PUBLIC_SESSION_KEY_MANAGER_ADDRESS=0x5FbDB2315678afecb367f032d93F642f64180aa3

# RPC URL for blockchain interactions
PUBLIC_RPC_URL=https://sepolia.optimism.io

# Irys Network: 'mainnet' (permanent storage) or 'devnet' (test, ~60 days)
PUBLIC_IRYS_NETWORK=devnet

# Application Info
PUBLIC_APP_NAME=DBlog
PUBLIC_APP_VERSION=1.0.0

# Arweave Gateways (comma-separated)
PUBLIC_ARWEAVE_GATEWAYS=https://gateway.irys.xyz,https://arweave.net,https://arweave.dev
```

---

## 14. 钱包连接与合约交互

SvelteKit 前端使用 viem 直接与钱包和合约交互，无需 wagmi 封装。

### 14.1 配置文件

> 📁 **实现文件**: [frontend/src/lib/config.ts](../frontend/src/lib/config.ts)

```typescript
// frontend/src/lib/config.ts
const defaults = {
  blogHubContractAddress: '0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9' as `0x${string}`,
  sessionKeyManagerAddress: '0x0000000000000000000000000000000000000000' as `0x${string}`,
  rpcUrl: 'https://sepolia.optimism.io',
  irysNetwork: 'devnet' as 'mainnet' | 'devnet',
  appName: 'DBlog',
  appVersion: '1.0.0',
  arweaveGateways: ['https://gateway.irys.xyz', 'https://arweave.net', 'https://arweave.dev']
};

export function getBlogHubContractAddress(): `0x${string}` {
  return getConfig().blogHubContractAddress;
}

export function getSessionKeyManagerAddress(): `0x${string}` {
  return getConfig().sessionKeyManagerAddress;
}
```

### 14.2 钱包连接组件

> 📁 **实现文件**: [frontend/src/lib/components/WalletButton.svelte](../frontend/src/lib/components/WalletButton.svelte)

```svelte
<!-- frontend/src/lib/components/WalletButton.svelte -->
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { optimismSepolia } from 'viem/chains';
  import * as m from '$lib/paraglide/messages';

  let address = $state<string | undefined>();
  let isConnected = $state(false);
  let isLoading = $state(false);

  let displayAddress = $derived(
    address ? `${address.slice(0, 6)}...${address.slice(-4)}` : ''
  );

  async function handleConnect() {
    if (typeof window === 'undefined' || !window.ethereum) {
      alert('Please install MetaMask or another Ethereum wallet');
      return;
    }

    isLoading = true;
    try {
      const accounts = await window.ethereum.request({
        method: 'eth_requestAccounts'
      }) as string[];
      if (accounts.length > 0) {
        address = accounts[0];
        isConnected = true;
      }
      await ensureCorrectChain();
    } catch (error) {
      console.error('Failed to connect:', error);
    } finally {
      isLoading = false;
    }
  }

  async function ensureCorrectChain() {
    const targetChainIdHex = `0x${optimismSepolia.id.toString(16)}`;
    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: targetChainIdHex }]
      });
    } catch (switchError: unknown) {
      if ((switchError as { code?: number })?.code === 4902) {
        await window.ethereum.request({
          method: 'wallet_addEthereumChain',
          params: [{
            chainId: targetChainIdHex,
            chainName: optimismSepolia.name,
            nativeCurrency: optimismSepolia.nativeCurrency,
            rpcUrls: [optimismSepolia.rpcUrls.default.http[0]],
            blockExplorerUrls: [optimismSepolia.blockExplorers?.default.url]
          }]
        });
      }
    }
  }
</script>

{#if isConnected}
  <button class="..." onclick={handleDisconnect}>
    <span class="h-2 w-2 rounded-full bg-green-400"></span>
    {displayAddress}
  </button>
{:else}
  <button class="..." disabled={isLoading} onclick={handleConnect}>
    {isLoading ? '...' : m.connect_wallet()}
  </button>
{/if}
```

功能：
- 连接/断开钱包
- 显示连接状态和地址缩写
- 自动切换到 Optimism Sepolia 网络
- 监听账户和链变化事件
- 支持 i18n 多语言 (Paraglide)

### 14.3 合约交互封装

> 📁 **实现文件**: [frontend/src/lib/contracts.ts](../frontend/src/lib/contracts.ts)

```typescript
// frontend/src/lib/contracts.ts
import { createWalletClient, createPublicClient, custom, http } from 'viem';
import { optimismSepolia } from 'viem/chains';
import { getBlogHubContractAddress } from '$lib/config';

// 获取钱包客户端
async function getWalletClient() {
  if (typeof window === 'undefined' || !window.ethereum) {
    throw new Error('Ethereum provider not found');
  }
  await ensureCorrectChain();
  const account = await getEthereumAccount();
  return createWalletClient({
    account,
    chain: optimismSepolia,
    transport: custom(window.ethereum)
  });
}

// 发布文章到合约
export async function publishToContract(
  arweaveId: string,
  categoryId: bigint,
  royaltyBps: bigint,
  originalAuthor: string = '',
  title: string = '',
  coverImage: string = ''
): Promise<string> {
  const walletClient = await getWalletClient();
  const txHash = await walletClient.writeContract({
    address: getBlogHubContractAddress(),
    abi: BLOGHUB_ABI,
    functionName: 'publish',
    args: [arweaveId, categoryId, royaltyBps, originalAuthor, title, coverImage]
  });
  return txHash;
}
```

包含以下功能：
- `publishToContract()` - 发布文章到合约
- `evaluateArticle()` - 评价文章（点赞/踩/打赏）
- `followUser()` - 关注/取消关注用户
- `getArticle()` - 读取文章信息
- `EvaluationScore` - 评分枚举（Neutral=0, Like=1, Dislike=2）
- `ArticleData` - 文章数据接口
- `ContractError` - 合约错误类（支持 i18n 错误码）

---

## 15. Session Key 无感交互

Session Key 允许用户授权临时密钥执行特定操作，实现无感交互体验。

### 15.1 Session Key 管理

> 📁 **实现文件**: [frontend/src/lib/sessionKey.ts](../frontend/src/lib/sessionKey.ts)

```typescript
// frontend/src/lib/sessionKey.ts
import { createWalletClient, custom } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { optimismSepolia } from 'viem/chains';
import { browser } from '$app/environment';

const SESSION_KEY_STORAGE = 'dblog_session_key';
const SESSION_KEY_DURATION = 7 * 24 * 60 * 60; // 7 days

export interface StoredSessionKey {
  address: string;
  privateKey: string;
  owner: string;
  validUntil: number;
}

// 获取存储的 Session Key
export function getStoredSessionKey(): StoredSessionKey | null {
  if (!browser) return null;
  const stored = localStorage.getItem(SESSION_KEY_STORAGE);
  if (!stored) return null;
  
  const data: StoredSessionKey = JSON.parse(stored);
  if (Date.now() / 1000 > data.validUntil) {
    localStorage.removeItem(SESSION_KEY_STORAGE);
    return null;
  }
  return data;
}

// 生成并注册新的 Session Key
export async function createSessionKey(): Promise<StoredSessionKey> {
  const account = await getEthereumAccount();
  const privateKey = generatePrivateKey();
  const sessionKeyAccount = privateKeyToAccount(privateKey);
  
  const validAfter = Math.floor(Date.now() / 1000);
  const validUntil = validAfter + SESSION_KEY_DURATION;
  
  const walletClient = await getWalletClient();
  await walletClient.writeContract({
    address: getSessionKeyManagerAddress(),
    abi: SESSION_KEY_MANAGER_ABI,
    functionName: 'registerSessionKey',
    args: [
      sessionKeyAccount.address,
      validAfter,
      validUntil,
      getBlogHubContractAddress(),
      ALLOWED_SELECTORS,
      DEFAULT_SPENDING_LIMIT
    ]
  });
  
  const sessionKeyData: StoredSessionKey = {
    address: sessionKeyAccount.address,
    privateKey: privateKey,
    owner: account,
    validUntil
  };
  localStorage.setItem(SESSION_KEY_STORAGE, JSON.stringify(sessionKeyData));
  return sessionKeyData;
}
```

包含以下功能：
- `StoredSessionKey` - Session Key 数据结构接口
- `getStoredSessionKey()` - 获取存储的 Session Key
- `isSessionKeyValidForCurrentWallet()` - 检查 Session Key 是否对当前钱包有效
- `createSessionKey()` - 生成并注册新的 Session Key（7天有效期）
- `revokeSessionKey()` - 撤销 Session Key
- `clearLocalSessionKey()` - 清除本地存储的 Session Key
- `getSessionKeyAccount()` - 获取 Session Key 账户实例用于签名

### 15.2 允许的函数选择器

```typescript
// 允许 Session Key 调用的函数
const ALLOWED_SELECTORS: `0x${string}`[] = [
  '0xff1f090a', // evaluate
  '0xdffd40f2', // likeComment
  '0x63c3cc16'  // follow
];

// 默认消费额度 (10 ETH)
const DEFAULT_SPENDING_LIMIT = BigInt('10000000000000000000');
```

---

## 16. 页面与组件开发

### 16.1 全局布局

> 📁 **实现文件**: [frontend/src/routes/+layout.svelte](../frontend/src/routes/+layout.svelte)

```svelte
<!-- frontend/src/routes/+layout.svelte -->
<script lang="ts">
  import './layout.css';
  import WalletButton from '$lib/components/WalletButton.svelte';
  import * as m from '$lib/paraglide/messages';
  import { page } from '$app/state';
  import { locales, getLocale, localizeHref } from '$lib/paraglide/runtime';

  let { children } = $props();
</script>

<div class="flex min-h-screen flex-col bg-gray-50">
  <!-- Header -->
  <header class="sticky top-0 z-50 border-b border-gray-200 bg-white/80 backdrop-blur-sm">
    <div class="mx-auto flex h-16 max-w-7xl items-center justify-between px-4">
      <a href="/" class="flex items-center gap-2">
        <span class="text-xl font-bold text-gray-900">DBlog</span>
      </a>

      <div class="flex items-center gap-4">
        <!-- Language Switcher -->
        <div class="flex items-center gap-1 rounded-lg bg-gray-100 p-1">
          {#each locales as locale}
            <a
              href={localizeHref(page.url.pathname, { locale })}
              class="rounded-md px-3 py-1.5 text-sm font-medium"
              class:bg-white={getLocale() === locale}
            >
              {locale === 'en-us' ? 'EN' : '中'}
            </a>
          {/each}
        </div>
        <WalletButton />
      </div>
    </div>
  </header>

  <!-- Main Content -->
  <main class="flex-1">
    {@render children()}
  </main>

  <!-- Footer -->
  <footer class="border-t border-gray-200 bg-white">
    <div class="mx-auto max-w-7xl px-4 py-8 text-center text-gray-500">
      {m.tagline()} | Powered by Optimism + Arweave
    </div>
  </footer>
</div>
```

功能：
- 响应式布局，支持移动端
- 粘性导航栏带模糊背景
- 集成语言切换器 (Paraglide i18n)
- 钱包连接按钮

### 16.2 发布文章页面

> 📁 **实现文件**: [frontend/src/routes/publish/+page.svelte](../frontend/src/routes/publish/+page.svelte)

```svelte
<!-- frontend/src/routes/publish/+page.svelte -->
<script lang="ts">
  import * as m from '$lib/paraglide/messages';
  import { publishArticle } from '$lib/publish';
  import { ContractError } from '$lib/contracts';
  import { CATEGORY_KEYS } from '$lib/data';
  import SearchSelect from '$lib/components/SearchSelect.svelte';

  // Form state using Svelte 5 runes
  let title = $state('');
  let summary = $state('');
  let content = $state('');
  let selectedCategory = $state<bigint | null>(null);
  let coverImageFile = $state<File | null>(null);
  let coverImagePreview = $state<string | null>(null);
  let royaltyBps = $state<bigint>(500n);

  // Submit state
  let isSubmitting = $state(false);
  let submitStatus = $state<'idle' | 'uploading' | 'success' | 'error'>('idle');
  let statusMessage = $state('');

  // Handle form submission
  async function handleSubmit() {
    if (isSubmitting) return;
    
    try {
      isSubmitting = true;
      submitStatus = 'uploading';
      statusMessage = m.uploading_to_arweave();

      const result = await publishArticle({
        title: title.trim(),
        summary: summary.trim(),
        content: content.trim(),
        tags: [],
        coverImage: coverImageFile,
        categoryId: selectedCategory ?? 0n,
        royaltyBps: royaltyBps
      });

      submitStatus = 'success';
      statusMessage = m.publish_success({ 
        arweaveId: result.arweaveId, 
        txHash: result.txHash 
      });
    } catch (error) {
      submitStatus = 'error';
      if (error instanceof ContractError) {
        statusMessage = m[`error_${error.code}`]?.() ?? error.message;
      } else {
        statusMessage = m.publish_failed({ 
          error: error instanceof Error ? error.message : String(error) 
        });
      }
    } finally {
      isSubmitting = false;
    }
  }
</script>

<div class="min-h-screen bg-white">
  <div class="mx-auto max-w-3xl px-6 py-12">
    <header class="mb-12">
      <h1 class="mb-2 text-4xl font-light">{m.publish_article()}</h1>
      <p class="text-gray-500">{m.share_thoughts()}</p>
    </header>

    <form onsubmit={(e) => { e.preventDefault(); handleSubmit(); }} class="space-y-8">
      <!-- Title -->
      <div>
        <label for="title" class="mb-2 block text-sm font-medium">
          {m.title()} *
        </label>
        <input
          id="title"
          bind:value={title}
          type="text"
          placeholder={m.input_article_title()}
          class="w-full rounded-lg border px-4 py-3"
          disabled={isSubmitting}
        />
      </div>

      <!-- Content (Markdown) -->
      <div>
        <label for="content" class="mb-2 block text-sm font-medium">
          {m.content()} ({m.markdown_supported()}) *
        </label>
        <textarea
          id="content"
          bind:value={content}
          placeholder={m.write_article_here()}
          rows="12"
          class="w-full rounded-lg border px-4 py-3 font-mono text-sm"
          disabled={isSubmitting}
        ></textarea>
      </div>

      <!-- Status Message -->
      {#if submitStatus !== 'idle'}
        <div class="rounded-lg px-4 py-3 text-sm"
          class:bg-green-50={submitStatus === 'success'}
          class:bg-red-50={submitStatus === 'error'}
          class:bg-blue-50={submitStatus === 'uploading'}
        >
          {statusMessage}
        </div>
      {/if}

      <!-- Submit Button -->
      <button
        type="submit"
        disabled={isSubmitting}
        class="w-full rounded-lg bg-gray-900 px-6 py-3 font-medium text-white disabled:opacity-50"
      >
        {isSubmitting ? m.uploading_to_arweave() : m.publish_article()}
      </button>
    </form>
  </div>
</div>
```

功能：
- 使用 Svelte 5 runes (`$state`, `$derived`) 管理表单状态
- 支持 Markdown 内容编辑
- 封面图片上传预览
- 分类选择器组件 (SearchSelect)
- 完整的发布流程：上传到 Arweave → 发布到合约
- i18n 国际化支持
- 合约错误处理与友好提示

### 16.3 发布流程编排

> 📁 **实现文件**: [frontend/src/lib/publish.ts](../frontend/src/lib/publish.ts)

```typescript
// frontend/src/lib/publish.ts
import { uploadArticle, uploadImage } from '$lib/arweave';
import { publishToContract } from '$lib/contracts';

export interface PublishArticleParams {
  title: string;
  summary: string;
  content: string;
  tags: string[];
  coverImage: File | null;
  categoryId: bigint;
  royaltyBps: bigint;
  originalAuthor?: string;
}

export async function publishArticle(params: PublishArticleParams) {
  const { title, summary, content, tags, coverImage, categoryId, royaltyBps, originalAuthor = '' } = params;

  // Step 1: Upload cover image if provided
  let coverImageHash: string | undefined;
  if (coverImage) {
    coverImageHash = await uploadImage(coverImage, 'devnet');
  }

  // Step 2: Upload article to Arweave
  const arweaveId = await uploadArticle({
    title: title.trim(),
    summary: summary.trim(),
    content: content.trim(),
    coverImage: coverImageHash,
    tags
  }, 'devnet');

  // Step 3: Publish to blockchain
  const txHash = await publishToContract(
    arweaveId,
    categoryId,
    royaltyBps,
    originalAuthor,
    title.trim(),
    coverImageHash || ''
  );

  return { arweaveId, txHash };
}
```

---

## 前端集成指南

### 合约 ABI 导出

SvelteKit 前端在 `$lib/contracts.ts` 中直接定义了所需的 ABI，无需单独导出文件。如果需要完整 ABI：

```bash
# 导出 ABI 文件
cd contracts
forge build

# ABI 文件位置:
# - out/BlogHub.sol/BlogHub.json
# - out/BlogPaymaster.sol/BlogPaymaster.json
# - out/SessionKeyManager.sol/SessionKeyManager.json

# 提取纯 ABI (可选)
cat out/BlogHub.sol/BlogHub.json | jq '.abi' > ../frontend/src/lib/abi/BlogHub.json
```

---

# Part 5: 部署与运维

## 17. 测试网部署

### 17.1 准备工作

```bash
# 1. 获取测试币
# Optimism Sepolia Faucet: https://www.alchemy.com/faucets/optimism-sepolia

# 2. 设置环境变量
export PRIVATE_KEY=your_private_key_here
export OP_SEPOLIA_RPC=https://sepolia.optimism.io
export ETHERSCAN_API_KEY=your_etherscan_api_key

# 3. 验证余额
cast balance $(cast wallet address --private-key $PRIVATE_KEY) --rpc-url $OP_SEPOLIA_RPC
```

### 17.2 部署到 Optimism Sepolia

```bash
cd contracts

# 部署所有合约
forge script script/Deploy.s.sol \
  --rpc-url $OP_SEPOLIA_RPC \
  --broadcast \
  --verify \
  --etherscan-api-key $ETHERSCAN_API_KEY \
  --tc DeployScript

# 配置 Paymaster
PAYMASTER=<deployed_paymaster_address> \
DEPOSIT_AMOUNT=100000000000000000 \
STAKE_AMOUNT=100000000000000000 \
UNSTAKE_DELAY=86400 \
forge script script/Deploy.s.sol \
  --rpc-url $OP_SEPOLIA_RPC \
  --broadcast \
  --tc ConfigurePaymaster
```

### 17.3 验证部署

```bash
# 检查合约是否正确部署
cast call <BLOG_HUB_PROXY> "platformTreasury()(address)" --rpc-url $OP_SEPOLIA_RPC
cast call <BLOG_HUB_PROXY> "sessionKeyManager()(address)" --rpc-url $OP_SEPOLIA_RPC
cast call <PAYMASTER> "getEntryPointDeposit()(uint256)" --rpc-url $OP_SEPOLIA_RPC
```

---

## 18. 主网部署检查清单

### 18.1 部署前检查

- [ ] 所有单元测试通过: `forge test`
- [ ] 代码审计完成
- [ ] 多签钱包准备就绪（用于 Owner 权限）
- [ ] Treasury 地址确认
- [ ] Gas 预算充足
- [ ] 监控和告警系统就绪

### 18.2 部署参数确认

```solidity
// 推荐的主网参数
platformFeeBps = 250;        // 2.5% 平台费
defaultRoyaltyBps = 500;     // 5% 默认版税
maxRoyaltyBps = 10000;       // 最高 100% 版税
unstakeDelaySec = 86400;     // 1 天解锁延迟
sessionKeyMaxDuration = 7 days;
```

### 18.3 部署后操作

```bash
# 1. 验证合约源码
forge verify-contract <CONTRACT_ADDRESS> <CONTRACT_NAME> \
  --chain optimism \
  --etherscan-api-key $ETHERSCAN_API_KEY

# 2. 转移 Owner 权限到多签
cast send <BLOG_HUB_PROXY> \
  "grantRole(bytes32,address)" \
  0x0000000000000000000000000000000000000000000000000000000000000000 \
  <MULTISIG_ADDRESS> \
  --private-key $PRIVATE_KEY \
  --rpc-url $OP_MAINNET_RPC

# 3. 放弃部署者权限
cast send <BLOG_HUB_PROXY> \
  "renounceRole(bytes32,address)" \
  0x0000000000000000000000000000000000000000000000000000000000000000 \
  <DEPLOYER_ADDRESS> \
  --private-key $PRIVATE_KEY \
  --rpc-url $OP_MAINNET_RPC
```

### 18.4 监控指标

- Paymaster EntryPoint 余额
- Paymaster Stake 状态
- 合约暂停状态
- 异常大额交易
- Gas 价格波动

---

## 19. 常见问题排查

### 19.1 交易失败

```bash
# 检查合约是否暂停
cast call <BLOG_HUB_PROXY> "paused()(bool)" --rpc-url <RPC_URL>

# 检查文章是否存在
cast call <BLOG_HUB_PROXY> "nextArticleId()(uint256)" --rpc-url <RPC_URL>
```

### 19.2 Session Key 问题

```bash
# 检查 Session Key 是否激活
cast call <SESSION_KEY_MANAGER> \
  "isSessionKeyActive(address,address)(bool)" \
  <OWNER> <SESSION_KEY> \
  --rpc-url <RPC_URL>

# 检查剩余消费额度
cast call <SESSION_KEY_MANAGER> \
  "getRemainingSpendingLimit(address,address)(uint256)" \
  <OWNER> <SESSION_KEY> \
  --rpc-url <RPC_URL>

# 检查允许的函数选择器
cast call <SESSION_KEY_MANAGER> \
  "getAllowedSelectors(address,address)(bytes4[])" \
  <OWNER> <SESSION_KEY> \
  --rpc-url <RPC_URL>
```

### 19.3 Paymaster 问题

```bash
# 检查 EntryPoint 存款
cast call <PAYMASTER> "getEntryPointDeposit()(uint256)" --rpc-url <RPC_URL>

# 检查 Stake 状态
cast call <PAYMASTER> "getDepositInfo()(uint256,bool,uint112,uint32,uint48)" --rpc-url <RPC_URL>

# 检查用户余额和授权
cast call <PAYMASTER> \
  "getUserInfo(address,address)(uint256,uint256)" \
  <SPONSOR> <SPENDER> \
  --rpc-url <RPC_URL>
```

### 19.4 升级合约

```bash
# 部署新实现
forge script script/Deploy.s.sol \
  --rpc-url <RPC_URL> \
  --broadcast \
  --tc DeployBlogHub

# 升级代理
BLOG_HUB_PROXY=<PROXY_ADDRESS> \
forge script script/Deploy.s.sol \
  --rpc-url <RPC_URL> \
  --broadcast \
  --tc UpgradeBlogHub
```

---

## 附录

### A. 函数选择器速查

| 函数 | 选择器 |
|------|--------|
| `publish(string,uint64,uint96,string)` | `0x...` |
| `evaluate(uint256,uint8,string,address,uint256)` | `0xff1f090a` |
| `likeComment(uint256,uint256,address,address)` | `0xdffd40f2` |
| `follow(address,bool)` | `0x63c3cc16` |

```bash
# 获取函数选择器
cast sig "evaluate(uint256,uint8,string,address,uint256)"
```

### B. 事件签名速查

```bash
# ArticlePublished (包含 originalAuthor)
cast sig-event "ArticlePublished(uint256,address,uint256,string,string,uint256)"

# ArticleEvaluated
cast sig-event "ArticleEvaluated(uint256,address,uint8,uint256,uint256)"

# CommentAdded
cast sig-event "CommentAdded(uint256,address,string,uint256,uint8)"

# FollowStatusChanged
cast sig-event "FollowStatusChanged(address,address,bool)"
```

### C. 有用的 Cast 命令

```bash
# 解码交易数据
cast calldata-decode "evaluate(uint256,uint8,string,address,uint256)" <CALLDATA>

# 解码事件日志
cast logs --address <CONTRACT> --from-block <BLOCK> --rpc-url <RPC_URL>

# 模拟交易
cast call <CONTRACT> <FUNCTION_SIG> <ARGS> --rpc-url <RPC_URL>

# 估算 Gas
cast estimate <CONTRACT> <FUNCTION_SIG> <ARGS> --rpc-url <RPC_URL>
```

---

*文档版本: 3.0.0*
*最后更新: 2025-12*

**更新日志:**
- v3.0.0: 前端框架从 Nuxt.js 迁移到 SvelteKit；更新第13-16章为 SvelteKit 实现；使用 Svelte 5 runes 语法；集成 Paraglide i18n 国际化；使用 Tailwind CSS v4；简化依赖（移除 wagmi，直接使用 viem）
- v2.0.0: 完整重构文档结构；新增 SubSquid 索引开发指南（第6-9章）；新增 Irys+Arweave 存储集成指南（第10-12章）；新增 Nuxt.js 前端开发指南（第13-16章）；添加项目进度概览
- v1.2.0: 更新合约地址（BlogHub Proxy: 0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9）；更新函数选择器；移除 withdraw/accountBalance 相关功能（打赏现为直接转账）
- v1.1.0: `publish` 函数新增 `originalAuthor` 参数，支持代发文章记录真实作者
