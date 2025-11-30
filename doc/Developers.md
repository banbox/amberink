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
| SvelteKit 前端 | 🔲 待开发 | 用户界面、钱包集成 |

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

**Part 4: SvelteKit 前端（待开发）**
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
# publish(string arweaveId, uint64 categoryId, uint96 royaltyBps, string originalAuthor)
# originalAuthor 为空字符串表示发布者即作者
cast send 0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9 \
  "publish(string,uint64,uint96,string)(uint256)" \
  "QmTestArweaveHash123456789" \
  1 \
  500 \
  "" \
  --private-key 0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d \
  --rpc-url http://localhost:8545

# 代发文章（记录真实作者）
cast send 0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9 \
  "publish(string,uint64,uint96,string)(uint256)" \
  "QmTestArweaveHash987654321" \
  1 \
  500 \
  "RealAuthor.eth" \
  --private-key 0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d \
  --rpc-url http://localhost:8545

# 验证文章创建
cast call 0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9 "nextArticleId()(uint256)" --rpc-url http://localhost:8545
# 应返回 2（下一个文章ID）

# 查看文章详情（包含 originalAuthor 字段）
cast call 0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9 \
  "articles(uint256)(string,address,string,uint64,uint64)" \
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
npx sv create frontend
cd frontend
npm run dev
```

```typescript
// frontend/src/lib/graphql.ts
import { Client, cacheExchange, fetchExchange } from '@urql/svelte'

export const graphqlClient = new Client({
  url: process.env.SUBSQUID_GRAPHQL_URL || 'http://localhost:4350/graphql',
  exchanges: [cacheExchange, fetchExchange]
})
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

```typescript
// frontend/src/lib/irys.ts
import { WebUploader } from '@irys/web-upload'
import { WebEthereum } from '@irys/web-upload-ethereum'
import { ViemV2Adapter } from '@irys/web-upload-ethereum-viem-v2'
import { createWalletClient, createPublicClient, custom } from 'viem'
import { optimismSepolia } from 'viem/chains'

// 连接到 Irys Mainnet
export async function getIrysUploader() {
  const [account] = await window.ethereum.request({ method: 'eth_requestAccounts' })
  
  const walletClient = createWalletClient({
    account,
    chain: optimismSepolia,
    transport: custom(window.ethereum)
  })
  
  const publicClient = createPublicClient({
    chain: optimismSepolia,
    transport: custom(window.ethereum)
  })
  
  const irysUploader = await WebUploader(WebEthereum).withAdapter(
    ViemV2Adapter(walletClient, { publicClient })
  )
  return irysUploader
}

// 连接到 Irys Devnet（测试用，免费但数据约60天后删除）
export async function getIrysUploaderDevnet() {
  const [account] = await window.ethereum.request({ method: 'eth_requestAccounts' })
  
  const walletClient = createWalletClient({
    account,
    chain: optimismSepolia,
    transport: custom(window.ethereum)
  })
  
  const publicClient = createPublicClient({
    chain: optimismSepolia,
    transport: custom(window.ethereum)
  })
  
  // RPC URL 可从 https://chainlist.org/ 获取最新地址
  const rpcURL = 'https://sepolia.optimism.io'
  const irysUploader = await WebUploader(WebEthereum)
    .withAdapter(ViemV2Adapter(walletClient, { publicClient }))
    .withRpc(rpcURL)
    .devnet()
  return irysUploader
}

// 检查余额
export async function getIrysBalance(uploader: any): Promise<string> {
  const balance = await uploader.getLoadedBalance()
  return uploader.utils.fromAtomic(balance).toString()
}

// 充值（Mainnet 需要）
export async function fundIrys(uploader: any, amount: string) {
  const fundTx = await uploader.fund(uploader.utils.toAtomic(amount))
  console.log(`Successfully funded ${uploader.utils.fromAtomic(fundTx.quantity)} ${uploader.token}`)
  return fundTx.id
}
```


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

```typescript
// frontend/src/lib/types.ts
export interface ArticleMetadata {
  title: string
  summary: string
  content: string           // Markdown 格式
  coverImage?: string       // 封面图 Arweave Hash
  tags: string[]
  createdAt: number         // Unix 时间戳
  version: string           // 数据格式版本
}

export interface ArticleBundle {
  metadata: ArticleMetadata
  contentType: 'application/json'
}
```

### 11.2 上传文章到 Arweave

```typescript
// frontend/src/lib/article.ts
import { getIrysUploader } from './irys'
import type { ArticleMetadata } from './types'

export async function uploadArticle(metadata: ArticleMetadata): Promise<string> {
  const uploader = await getIrysUploader()
  
  // 准备数据
  const data = JSON.stringify({
    ...metadata,
    version: '1.0.0',
    createdAt: Date.now()
  })
  
  // 添加标签（用于 Arweave GraphQL 查询）
  const tags = [
    { name: 'Content-Type', value: 'application/json' },
    { name: 'App-Name', value: 'DBlog' },
    { name: 'App-Version', value: '1.0.0' },
    { name: 'Type', value: 'article' },
    { name: 'Title', value: metadata.title },
    ...metadata.tags.map(tag => ({ name: 'Tag', value: tag }))
  ]
  
  try {
    // 上传数据
    const receipt = await uploader.upload(data, { tags })
    console.log(`Article uploaded ==> https://gateway.irys.xyz/${receipt.id}`)
    return receipt.id  // 返回 Transaction ID
  } catch (e) {
    console.error('Error when uploading article:', e)
    throw e
  }
}

// 上传图片文件
export async function uploadImage(file: File): Promise<string> {
  const uploader = await getIrysUploader()
  
  const tags = [
    { name: 'Content-Type', value: file.type },
    { name: 'App-Name', value: 'DBlog' },
    { name: 'Type', value: 'image' }
  ]
  
  try {
    const receipt = await uploader.uploadFile(file, { tags })
    console.log(`Image uploaded ==> https://gateway.irys.xyz/${receipt.id}`)
    return receipt.id
  } catch (e) {
    console.error('Error when uploading image:', e)
    throw e
  }
}
```

### 11.3 完整发布流程

```typescript
// frontend/src/lib/publish.ts
import { uploadArticle, uploadImage } from './article'
import { publishToContract } from './contracts'

export async function publishArticle(
  title: string,
  summary: string,
  content: string,
  coverImage: File | null,
  tags: string[],
  categoryId: bigint,
  royaltyBps: bigint,
  originalAuthor: string = ''
) {
  // 1. 上传封面图（如果有）
  let coverImageHash = ''
  if (coverImage) {
    coverImageHash = await uploadImage(coverImage)
  }
  
  // 2. 上传文章内容到 Arweave
  const arweaveId = await uploadArticle({
    title,
    summary,
    content,
    coverImage: coverImageHash,
    tags,
    createdAt: Date.now(),
    version: '1.0.0'
  })
  
  // 3. 调用智能合约发布
  const txHash = await publishToContract(
    arweaveId,
    categoryId,
    royaltyBps,
    originalAuthor
  )
  
  return { arweaveId, txHash }
}
```

---

## 12. 内容获取与缓存

### 12.1 从 Arweave 获取内容

```typescript
// frontend/src/lib/arweave.ts
import type { ArticleMetadata } from './types'

// Arweave 网关列表（用于负载均衡和容错）
// Irys 官方网关优先
const ARWEAVE_GATEWAYS = [
  'https://gateway.irys.xyz',
  'https://arweave.net',
  'https://arweave.dev'
]

export async function fetchArticleContent(arweaveId: string): Promise<ArticleMetadata> {
  // 尝试多个网关
  for (const gateway of ARWEAVE_GATEWAYS) {
    try {
      const response = await fetch(`${gateway}/${arweaveId}`, {
        headers: { 'Accept': 'application/json' }
      })
      
      if (response.ok) {
        return await response.json()
      }
    } catch (error) {
      console.warn(`Gateway ${gateway} failed:`, error)
    }
  }
  
  throw new Error('Failed to fetch article from all gateways')
}

// 获取图片 URL（优先使用 Irys 网关）
export function getImageUrl(arweaveId: string): string {
  return `https://gateway.irys.xyz/${arweaveId}`
}
```

### 12.2 客户端缓存策略

```typescript
// frontend/src/lib/cache.ts
import { browser } from '$app/environment'

const CACHE_PREFIX = 'dblog_article_'
const CACHE_TTL = 24 * 60 * 60 * 1000  // 24 小时

interface CachedArticle {
  data: ArticleMetadata
  timestamp: number
}

export function getCachedArticle(arweaveId: string): ArticleMetadata | null {
  if (!browser) return null
  
  const cached = localStorage.getItem(CACHE_PREFIX + arweaveId)
  if (!cached) return null
  
  const { data, timestamp }: CachedArticle = JSON.parse(cached)
  
  // 检查是否过期
  if (Date.now() - timestamp > CACHE_TTL) {
    localStorage.removeItem(CACHE_PREFIX + arweaveId)
    return null
  }
  
  return data
}

export function setCachedArticle(arweaveId: string, data: ArticleMetadata) {
  if (!browser) return
  
  const cached: CachedArticle = {
    data,
    timestamp: Date.now()
  }
  
  localStorage.setItem(CACHE_PREFIX + arweaveId, JSON.stringify(cached))
}

// 带缓存的获取函数
export async function getArticleWithCache(arweaveId: string): Promise<ArticleMetadata> {
  // 先检查缓存
  const cached = getCachedArticle(arweaveId)
  if (cached) return cached
  
  // 从 Arweave 获取
  const data = await fetchArticleContent(arweaveId)
  
  // 存入缓存
  setCachedArticle(arweaveId, data)
  
  return data
}
```

### 12.3 SvelteKit 服务端渲染

```typescript
// frontend/src/routes/article/[id]/+page.server.ts
import type { PageServerLoad } from './$types'
import { fetchArticleContent } from '$lib/arweave'
import { graphqlClient } from '$lib/graphql'

export const load: PageServerLoad = async ({ params }) => {
  // 从 SubSquid 获取文章链上数据
  const { data } = await graphqlClient.query(ArticleDetailQuery, {
    articleId: params.id
  }).toPromise()
  
  if (!data?.articleById) {
    throw error(404, 'Article not found')
  }
  
  // 从 Arweave 获取文章内容
  const content = await fetchArticleContent(data.articleById.arweaveId)
  
  return {
    article: data.articleById,
    content
  }
}
```

---

# Part 4: SvelteKit 前端

## 13. 前端项目初始化

### 13.1 创建 SvelteKit 项目

```bash
# 在项目根目录
npx sv create frontend

# 选择配置:
# - Template: SvelteKit minimal
# - Type checking: TypeScript
# - Additional options: prettier, eslint, tailwindcss

cd frontend
npm install
```

### 13.2 安装依赖

```bash
# Web3 相关
npm install viem @wagmi/core svelte-wagmi @reown/appkit

# GraphQL
npm install @urql/svelte graphql

# Arweave/Irys（浏览器端，使用 Viem v2）
npm install @irys/web-upload @irys/web-upload-ethereum @irys/web-upload-ethereum-viem-v2

# UI 组件
npm install lucide-svelte bits-ui tailwind-variants clsx tailwind-merge

# Markdown 渲染
npm install marked dompurify @types/dompurify
```

### 13.3 项目结构

```
frontend/
├── src/
│   ├── lib/
│   │   ├── abi/              # 合约 ABI
│   │   ├── components/       # 可复用组件
│   │   │   ├── ui/           # 基础 UI 组件
│   │   │   ├── ArticleCard.svelte
│   │   │   ├── CommentList.svelte
│   │   │   └── WalletButton.svelte
│   │   ├── stores/           # Svelte stores
│   │   │   ├── wallet.ts
│   │   │   └── session.ts
│   │   ├── contracts.ts      # 合约交互
│   │   ├── graphql.ts        # GraphQL 客户端
│   │   ├── irys.ts           # Irys 上传
│   │   ├── arweave.ts        # Arweave 获取
│   │   └── sessionKey.ts     # Session Key 管理
│   ├── routes/
│   │   ├── +layout.svelte    # 全局布局
│   │   ├── +page.svelte      # 首页（文章列表）
│   │   ├── article/
│   │   │   ├── [id]/+page.svelte      # 文章详情
│   │   │   └── new/+page.svelte       # 发布文章
│   │   ├── user/
│   │   │   └── [address]/+page.svelte # 用户主页
│   │   └── settings/+page.svelte      # 设置页面
│   └── app.html
├── static/
├── tailwind.config.js
└── svelte.config.js
```

### 13.4 环境变量配置

```bash
# frontend/.env
PUBLIC_CHAIN_ID=11155420
PUBLIC_RPC_URL=https://sepolia.optimism.io
PUBLIC_BLOG_HUB_ADDRESS=0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9
PUBLIC_SESSION_KEY_MANAGER_ADDRESS=0x5FbDB2315678afecb367f032d93F642f64180aa3
PUBLIC_PAYMASTER_ADDRESS=0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512
PUBLIC_SUBSQUID_GRAPHQL_URL=http://localhost:4350/graphql
PUBLIC_REOWN_PROJECT_ID=your_reown_project_id
```

---

## 14. 钱包连接与合约交互

### 14.1 Wagmi 配置

```typescript
// frontend/src/lib/wagmi.ts
import { createConfig, http } from '@wagmi/core'
import { optimismSepolia, localhost } from '@wagmi/core/chains'
import { injected, walletConnect } from '@wagmi/connectors'

const projectId = import.meta.env.PUBLIC_REOWN_PROJECT_ID

export const config = createConfig({
  chains: [optimismSepolia, localhost],
  connectors: [
    injected(),
    walletConnect({ projectId })
  ],
  transports: {
    [optimismSepolia.id]: http(),
    [localhost.id]: http('http://localhost:8545')
  }
})
```

### 14.2 钱包连接组件

```svelte
<!-- frontend/src/lib/components/WalletButton.svelte -->
<script lang="ts">
  import { connect, disconnect, getAccount } from '@wagmi/core'
  import { config } from '$lib/wagmi'
  import { onMount } from 'svelte'
  
  let address: string | undefined
  let isConnected = false
  
  onMount(() => {
    const account = getAccount(config)
    address = account.address
    isConnected = account.isConnected
  })
  
  async function handleConnect() {
    try {
      await connect(config, { connector: injected() })
      const account = getAccount(config)
      address = account.address
      isConnected = true
    } catch (error) {
      console.error('Failed to connect:', error)
    }
  }
  
  async function handleDisconnect() {
    await disconnect(config)
    address = undefined
    isConnected = false
  }
</script>

{#if isConnected}
  <button 
    class="px-4 py-2 bg-gray-800 text-white rounded-lg"
    on:click={handleDisconnect}
  >
    {address?.slice(0, 6)}...{address?.slice(-4)}
  </button>
{:else}
  <button 
    class="px-4 py-2 bg-blue-600 text-white rounded-lg"
    on:click={handleConnect}
  >
    连接钱包
  </button>
{/if}
```

### 14.3 合约交互封装

```typescript
// frontend/src/lib/contracts.ts
import { readContract, writeContract, getAccount } from '@wagmi/core'
import { config } from './wagmi'
import BlogHubABI from './abi/BlogHub.json'

const BLOG_HUB_ADDRESS = import.meta.env.PUBLIC_BLOG_HUB_ADDRESS as `0x${string}`

// 发布文章
export async function publishToContract(
  arweaveId: string,
  categoryId: bigint,
  royaltyBps: bigint,
  originalAuthor: string = ''
) {
  const hash = await writeContract(config, {
    address: BLOG_HUB_ADDRESS,
    abi: BlogHubABI,
    functionName: 'publish',
    args: [arweaveId, categoryId, royaltyBps, originalAuthor]
  })
  return hash
}

// 评价文章（点赞/踩/打赏）
export async function evaluateArticle(
  articleId: bigint,
  score: number,  // 0=中立, 1=喜欢, 2=不喜欢
  comment: string,
  referrer: string = '0x0000000000000000000000000000000000000000',
  parentCommentId: bigint = 0n,
  tipAmount: bigint = 0n
) {
  const hash = await writeContract(config, {
    address: BLOG_HUB_ADDRESS,
    abi: BlogHubABI,
    functionName: 'evaluate',
    args: [articleId, score, comment, referrer, parentCommentId],
    value: tipAmount
  })
  return hash
}

// 关注/取消关注
export async function followUser(targetAddress: string, isFollow: boolean) {
  const hash = await writeContract(config, {
    address: BLOG_HUB_ADDRESS,
    abi: BlogHubABI,
    functionName: 'follow',
    args: [targetAddress, isFollow]
  })
  return hash
}

// 读取文章信息
export async function getArticle(articleId: bigint) {
  return await readContract(config, {
    address: BLOG_HUB_ADDRESS,
    abi: BlogHubABI,
    functionName: 'articles',
    args: [articleId]
  })
}
```

---

## 15. Session Key 无感交互

### 15.1 Session Key 管理

```typescript
// frontend/src/lib/sessionKey.ts
import { Wallet } from 'ethers'
import { writeContract, getAccount } from '@wagmi/core'
import { config } from './wagmi'
import SessionKeyManagerABI from './abi/SessionKeyManager.json'

const SESSION_KEY_STORAGE = 'dblog_session_key'
const SESSION_KEY_MANAGER = import.meta.env.PUBLIC_SESSION_KEY_MANAGER_ADDRESS as `0x${string}`
const BLOG_HUB_ADDRESS = import.meta.env.PUBLIC_BLOG_HUB_ADDRESS as `0x${string}`

interface StoredSessionKey {
  address: string
  privateKey: string
  owner: string
  validUntil: number
}

// 检查是否有有效的 Session Key
export function getStoredSessionKey(): StoredSessionKey | null {
  if (typeof window === 'undefined') return null
  
  const stored = localStorage.getItem(SESSION_KEY_STORAGE)
  if (!stored) return null
  
  const data: StoredSessionKey = JSON.parse(stored)
  
  // 检查是否过期
  if (Date.now() / 1000 > data.validUntil) {
    localStorage.removeItem(SESSION_KEY_STORAGE)
    return null
  }
  
  // 检查 owner 是否匹配当前连接的钱包
  const account = getAccount(config)
  if (account.address?.toLowerCase() !== data.owner.toLowerCase()) {
    return null
  }
  
  return data
}

// 生成并注册新的 Session Key
export async function createSessionKey(): Promise<StoredSessionKey> {
  const account = getAccount(config)
  if (!account.address) throw new Error('Wallet not connected')
  
  // 1. 生成临时密钥对
  const sessionKeyWallet = Wallet.createRandom()
  
  // 2. 设置有效期（7天）
  const validAfter = Math.floor(Date.now() / 1000)
  const validUntil = validAfter + 7 * 24 * 60 * 60
  
  // 3. 允许的函数选择器
  const allowedSelectors = [
    '0xff1f090a', // evaluate
    '0xdffd40f2', // likeComment
    '0x63c3cc16', // follow
  ]
  
  // 4. 消费限额（10 ETH）
  const spendingLimit = BigInt('10000000000000000000')
  
  // 5. 调用合约注册（需要用户签名）
  await writeContract(config, {
    address: SESSION_KEY_MANAGER,
    abi: SessionKeyManagerABI,
    functionName: 'registerSessionKey',
    args: [
      sessionKeyWallet.address,
      validAfter,
      validUntil,
      BLOG_HUB_ADDRESS,
      allowedSelectors,
      spendingLimit
    ]
  })
  
  // 6. 保存到 localStorage
  const sessionKeyData: StoredSessionKey = {
    address: sessionKeyWallet.address,
    privateKey: sessionKeyWallet.privateKey,
    owner: account.address,
    validUntil
  }
  
  localStorage.setItem(SESSION_KEY_STORAGE, JSON.stringify(sessionKeyData))
  
  return sessionKeyData
}

// 使用 Session Key 签名操作
export async function signWithSessionKey(
  target: string,
  selector: string,
  callData: string,
  value: bigint = 0n
) {
  const sessionKey = getStoredSessionKey()
  if (!sessionKey) throw new Error('No valid session key')
  
  const wallet = new Wallet(sessionKey.privateKey)
  
  // 获取 nonce
  // ... 实现 EIP-712 签名逻辑
  
  return signature
}

// 撤销 Session Key
export async function revokeSessionKey() {
  const sessionKey = getStoredSessionKey()
  if (!sessionKey) return
  
  await writeContract(config, {
    address: SESSION_KEY_MANAGER,
    abi: SessionKeyManagerABI,
    functionName: 'revokeSessionKey',
    args: [sessionKey.address]
  })
  
  localStorage.removeItem(SESSION_KEY_STORAGE)
}
```

### 15.2 Session Key 状态组件

```svelte
<!-- frontend/src/lib/components/SessionKeyStatus.svelte -->
<script lang="ts">
  import { onMount } from 'svelte'
  import { getStoredSessionKey, createSessionKey, revokeSessionKey } from '$lib/sessionKey'
  
  let hasSessionKey = false
  let validUntil: Date | null = null
  let isLoading = false
  
  onMount(() => {
    checkSessionKey()
  })
  
  function checkSessionKey() {
    const sk = getStoredSessionKey()
    hasSessionKey = !!sk
    validUntil = sk ? new Date(sk.validUntil * 1000) : null
  }
  
  async function handleCreate() {
    isLoading = true
    try {
      await createSessionKey()
      checkSessionKey()
    } catch (error) {
      console.error('Failed to create session key:', error)
    } finally {
      isLoading = false
    }
  }
  
  async function handleRevoke() {
    isLoading = true
    try {
      await revokeSessionKey()
      checkSessionKey()
    } catch (error) {
      console.error('Failed to revoke session key:', error)
    } finally {
      isLoading = false
    }
  }
</script>

<div class="p-4 border rounded-lg">
  <h3 class="font-semibold mb-2">无感交互模式</h3>
  
  {#if hasSessionKey}
    <p class="text-green-600 mb-2">✓ 已启用</p>
    <p class="text-sm text-gray-500 mb-4">
      有效期至: {validUntil?.toLocaleDateString()}
    </p>
    <button 
      class="px-3 py-1 bg-red-100 text-red-600 rounded"
      on:click={handleRevoke}
      disabled={isLoading}
    >
      撤销授权
    </button>
  {:else}
    <p class="text-gray-500 mb-2">未启用</p>
    <p class="text-sm text-gray-400 mb-4">
      启用后，点赞、评论、关注等操作无需每次签名
    </p>
    <button 
      class="px-3 py-1 bg-blue-600 text-white rounded"
      on:click={handleCreate}
      disabled={isLoading}
    >
      {isLoading ? '授权中...' : '启用无感交互'}
    </button>
  {/if}
</div>
```

---

## 16. 页面与组件开发

### 16.1 全局布局

```svelte
<!-- frontend/src/routes/+layout.svelte -->
<script lang="ts">
  import '../app.css'
  import WalletButton from '$lib/components/WalletButton.svelte'
</script>

<div class="min-h-screen bg-gray-50">
  <header class="bg-white border-b">
    <nav class="container mx-auto px-4 py-4 flex justify-between items-center">
      <a href="/" class="text-xl font-bold">DBlog</a>
      
      <div class="flex items-center gap-4">
        <a href="/article/new" class="text-gray-600 hover:text-gray-900">
          发布文章
        </a>
        <WalletButton />
      </div>
    </nav>
  </header>
  
  <main class="container mx-auto px-4 py-8">
    <slot />
  </main>
  
  <footer class="bg-white border-t mt-auto">
    <div class="container mx-auto px-4 py-6 text-center text-gray-500">
      DBlog - 去中心化博客 | Powered by Optimism + Arweave
    </div>
  </footer>
</div>
```

### 16.2 首页（文章列表）

```svelte
<!-- frontend/src/routes/+page.svelte -->
<script lang="ts">
  import { onMount } from 'svelte'
  import { queryStore, gql } from '@urql/svelte'
  import { graphqlClient } from '$lib/graphql'
  import ArticleCard from '$lib/components/ArticleCard.svelte'
  
  const articlesQuery = queryStore({
    client: graphqlClient,
    query: gql`
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
    `,
    variables: { limit: 20, offset: 0 }
  })
</script>

<div class="max-w-3xl mx-auto">
  <h1 class="text-2xl font-bold mb-6">最新文章</h1>
  
  {#if $articlesQuery.fetching}
    <p class="text-gray-500">加载中...</p>
  {:else if $articlesQuery.error}
    <p class="text-red-500">加载失败: {$articlesQuery.error.message}</p>
  {:else}
    <div class="space-y-4">
      {#each $articlesQuery.data?.articles || [] as article}
        <ArticleCard {article} />
      {/each}
    </div>
  {/if}
</div>
```

### 16.3 文章卡片组件

```svelte
<!-- frontend/src/lib/components/ArticleCard.svelte -->
<script lang="ts">
  import { onMount } from 'svelte'
  import { getArticleWithCache } from '$lib/cache'
  import { formatEther } from 'viem'
  import { ThumbsUp, ThumbsDown, MessageCircle } from 'lucide-svelte'
  
  export let article: {
    id: string
    arweaveId: string
    author: { id: string }
    likes: number
    dislikes: number
    totalTips: bigint
    createdAt: string
  }
  
  let metadata: { title: string; summary: string } | null = null
  
  onMount(async () => {
    try {
      metadata = await getArticleWithCache(article.arweaveId)
    } catch (error) {
      console.error('Failed to load article metadata:', error)
    }
  })
</script>

<a 
  href="/article/{article.id}" 
  class="block p-6 bg-white rounded-lg border hover:shadow-md transition"
>
  {#if metadata}
    <h2 class="text-xl font-semibold mb-2">{metadata.title}</h2>
    <p class="text-gray-600 mb-4 line-clamp-2">{metadata.summary}</p>
  {:else}
    <div class="animate-pulse">
      <div class="h-6 bg-gray-200 rounded w-3/4 mb-2"></div>
      <div class="h-4 bg-gray-200 rounded w-full mb-4"></div>
    </div>
  {/if}
  
  <div class="flex items-center justify-between text-sm text-gray-500">
    <span>
      {article.author.id.slice(0, 6)}...{article.author.id.slice(-4)}
    </span>
    
    <div class="flex items-center gap-4">
      <span class="flex items-center gap-1">
        <ThumbsUp size={16} />
        {article.likes}
      </span>
      <span class="flex items-center gap-1">
        <ThumbsDown size={16} />
        {article.dislikes}
      </span>
      {#if article.totalTips > 0n}
        <span class="text-green-600">
          {formatEther(article.totalTips)} ETH
        </span>
      {/if}
    </div>
  </div>
</a>
```

### 16.4 发布文章页面

```svelte
<!-- frontend/src/routes/article/new/+page.svelte -->
<script lang="ts">
  import { goto } from '$app/navigation'
  import { publishArticle } from '$lib/publish'
  
  let title = ''
  let summary = ''
  let content = ''
  let tags = ''
  let categoryId = 1n
  let royaltyBps = 500n  // 5%
  let coverImage: File | null = null
  let isPublishing = false
  let error = ''
  
  async function handleSubmit() {
    if (!title || !content) {
      error = '请填写标题和内容'
      return
    }
    
    isPublishing = true
    error = ''
    
    try {
      const { arweaveId, txHash } = await publishArticle(
        title,
        summary,
        content,
        coverImage,
        tags.split(',').map(t => t.trim()).filter(Boolean),
        categoryId,
        royaltyBps
      )
      
      // 跳转到文章页面
      goto(`/article/${arweaveId}`)
    } catch (err) {
      error = err instanceof Error ? err.message : '发布失败'
    } finally {
      isPublishing = false
    }
  }
  
  function handleImageChange(e: Event) {
    const input = e.target as HTMLInputElement
    coverImage = input.files?.[0] || null
  }
</script>

<div class="max-w-3xl mx-auto">
  <h1 class="text-2xl font-bold mb-6">发布文章</h1>
  
  {#if error}
    <div class="p-4 bg-red-100 text-red-600 rounded mb-4">{error}</div>
  {/if}
  
  <form on:submit|preventDefault={handleSubmit} class="space-y-6">
    <div>
      <label class="block text-sm font-medium mb-2">标题</label>
      <input 
        type="text" 
        bind:value={title}
        class="w-full px-4 py-2 border rounded-lg"
        placeholder="文章标题"
      />
    </div>
    
    <div>
      <label class="block text-sm font-medium mb-2">摘要</label>
      <textarea 
        bind:value={summary}
        class="w-full px-4 py-2 border rounded-lg"
        rows="2"
        placeholder="简短描述"
      ></textarea>
    </div>
    
    <div>
      <label class="block text-sm font-medium mb-2">内容 (Markdown)</label>
      <textarea 
        bind:value={content}
        class="w-full px-4 py-2 border rounded-lg font-mono"
        rows="15"
        placeholder="使用 Markdown 格式编写..."
      ></textarea>
    </div>
    
    <div>
      <label class="block text-sm font-medium mb-2">封面图片</label>
      <input 
        type="file" 
        accept="image/*"
        on:change={handleImageChange}
        class="w-full"
      />
    </div>
    
    <div>
      <label class="block text-sm font-medium mb-2">标签（逗号分隔）</label>
      <input 
        type="text" 
        bind:value={tags}
        class="w-full px-4 py-2 border rounded-lg"
        placeholder="Web3, 区块链, 教程"
      />
    </div>
    
    <div class="grid grid-cols-2 gap-4">
      <div>
        <label class="block text-sm font-medium mb-2">分类</label>
        <select bind:value={categoryId} class="w-full px-4 py-2 border rounded-lg">
          <option value={1n}>技术</option>
          <option value={2n}>生活</option>
          <option value={3n}>观点</option>
        </select>
      </div>
      
      <div>
        <label class="block text-sm font-medium mb-2">版税比例</label>
        <select bind:value={royaltyBps} class="w-full px-4 py-2 border rounded-lg">
          <option value={0n}>0%</option>
          <option value={250n}>2.5%</option>
          <option value={500n}>5%</option>
          <option value={1000n}>10%</option>
        </select>
      </div>
    </div>
    
    <button 
      type="submit"
      class="w-full py-3 bg-blue-600 text-white rounded-lg font-medium disabled:opacity-50"
      disabled={isPublishing}
    >
      {isPublishing ? '发布中...' : '发布文章'}
    </button>
  </form>
</div>
```

---

## 前端集成指南（原第6章，保留作为参考）

### 合约 ABI 导出

```bash
# 导出 ABI 文件
cd contracts
forge build

# ABI 文件位置:
# - out/BlogHub.sol/BlogHub.json
# - out/BlogPaymaster.sol/BlogPaymaster.json
# - out/SessionKeyManager.sol/SessionKeyManager.json

# 提取纯 ABI
cat out/BlogHub.sol/BlogHub.json | jq '.abi' > ../frontend/src/abi/BlogHub.json
cat out/BlogPaymaster.sol/BlogPaymaster.json | jq '.abi' > ../frontend/src/abi/BlogPaymaster.json
cat out/SessionKeyManager.sol/SessionKeyManager.json | jq '.abi' > ../frontend/src/abi/SessionKeyManager.json
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

*文档版本: 2.0.0*
*最后更新: 2025-11*

**更新日志:**
- v2.0.0: 完整重构文档结构；新增 SubSquid 索引开发指南（第6-9章）；新增 Irys+Arweave 存储集成指南（第10-12章）；新增 SvelteKit 前端开发指南（第13-16章）；添加项目进度概览
- v1.2.0: 更新合约地址（BlogHub Proxy: 0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9）；更新函数选择器；移除 withdraw/accountBalance 相关功能（打赏现为直接转账）
- v1.1.0: `publish` 函数新增 `originalAuthor` 参数，支持代发文章记录真实作者
