# DBlog 开发者指南

本文档为 DBlog 去中心化博客项目的完整技术指南，涵盖从本地部署到生产环境的全流程。

---

## 目录

1. [环境准备](#1-环境准备)
2. [本地部署验证](#2-本地部署验证)
3. [合约调用测试](#3-合约调用测试)
4. [Session Key 配置与测试](#4-session-key-配置与测试)
5. [Paymaster 配置](#5-paymaster-配置)
6. [前端集成指南](#6-前端集成指南)
7. [测试网部署](#7-测试网部署)
8. [主网部署检查清单](#8-主网部署检查清单)
9. [常见问题排查](#9-常见问题排查)

---

## 1. 环境准备

### 1.1 已部署合约地址（本地 Anvil）

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
anvil
```

### 2.2 验证合约部署

```bash
cd contracts

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

## 6. 前端集成指南

### 6.1 合约 ABI 导出

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

### 6.2 Viem 配置示例

```typescript
// frontend/src/lib/contracts.ts
import { createPublicClient, createWalletClient, http, custom } from 'viem';
import { optimism, localhost } from 'viem/chains';
import BlogHubABI from '../abi/BlogHub.json';
import SessionKeyManagerABI from '../abi/SessionKeyManager.json';
import BlogPaymasterABI from '../abi/BlogPaymaster.json';

// 合约地址配置
export const CONTRACTS = {
  local: {
    blogHub: '0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9',
    sessionKeyManager: '0x5FbDB2315678afecb367f032d93F642f64180aa3',
    paymaster: '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512',
  },
  optimismSepolia: {
    blogHub: '0x...', // 部署后填入
    sessionKeyManager: '0x...',
    paymaster: '0x...',
  }
};

// 创建客户端
export const publicClient = createPublicClient({
  chain: localhost,
  transport: http('http://localhost:8545')
});

// 读取文章
export async function getArticle(articleId: bigint) {
  return await publicClient.readContract({
    address: CONTRACTS.local.blogHub,
    abi: BlogHubABI,
    functionName: 'articles',
    args: [articleId]
  });
}

// 发布文章
// originalAuthor: 真实作者名称，为空字符串表示发布者即作者
export async function publishArticle(
  walletClient: any,
  arweaveId: string,
  categoryId: bigint,
  royaltyBps: bigint,
  originalAuthor: string = ''
) {
  const hash = await walletClient.writeContract({
    address: CONTRACTS.local.blogHub,
    abi: BlogHubABI,
    functionName: 'publish',
    args: [arweaveId, categoryId, royaltyBps, originalAuthor]
  });
  return hash;
}
```

### 6.3 Session Key 前端流程

```typescript
// frontend/src/lib/sessionKey.ts
import { Wallet } from 'ethers';
import { signTypedData } from 'viem/accounts';

const SESSION_KEY_STORAGE = 'dblog_session_key';

interface SessionKeyData {
  address: string;
  privateKey: string;
  owner: string;
  validUntil: number;
}

// 1. 检查是否有有效的 Session Key
export function getStoredSessionKey(): SessionKeyData | null {
  const stored = localStorage.getItem(SESSION_KEY_STORAGE);
  if (!stored) return null;
  
  const data = JSON.parse(stored) as SessionKeyData;
  if (Date.now() / 1000 > data.validUntil) {
    localStorage.removeItem(SESSION_KEY_STORAGE);
    return null;
  }
  return data;
}

// 2. 生成新的 Session Key
export function generateSessionKey(): { address: string; privateKey: string } {
  const wallet = Wallet.createRandom();
  return {
    address: wallet.address,
    privateKey: wallet.privateKey
  };
}

// 3. 注册 Session Key（需要主钱包签名）
export async function registerSessionKey(
  walletClient: any,
  sessionKeyAddress: string,
  blogHubAddress: string
) {
  const validAfter = Math.floor(Date.now() / 1000);
  const validUntil = validAfter + 7 * 24 * 60 * 60; // 7天
  const spendingLimit = BigInt('10000000000000000000'); // 10 ETH
  
  // 允许的函数选择器
  const allowedSelectors = [
    '0xff1f090a', // evaluate
    '0xdffd40f2', // likeComment
    '0x63c3cc16', // follow
  ];
  
  const hash = await walletClient.writeContract({
    address: CONTRACTS.local.sessionKeyManager,
    abi: SessionKeyManagerABI,
    functionName: 'registerSessionKey',
    args: [
      sessionKeyAddress,
      validAfter,
      validUntil,
      blogHubAddress,
      allowedSelectors,
      spendingLimit
    ]
  });
  
  return { hash, validUntil };
}

// 4. 使用 Session Key 签名操作
export async function signWithSessionKey(
  sessionKeyPrivateKey: string,
  owner: string,
  target: string,
  selector: string,
  callData: string,
  value: bigint,
  nonce: bigint,
  deadline: bigint
) {
  const domain = {
    name: 'SessionKeyManager',
    version: '1',
    chainId: 31337,
    verifyingContract: CONTRACTS.local.sessionKeyManager
  };
  
  const types = {
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
  
  const sessionKeyWallet = new Wallet(sessionKeyPrivateKey);
  
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
  
  return await sessionKeyWallet.signTypedData(domain, types, message);
}
```

### 6.4 事件监听

```typescript
// 监听文章发布事件
publicClient.watchContractEvent({
  address: CONTRACTS.local.blogHub,
  abi: BlogHubABI,
  eventName: 'ArticlePublished',
  onLogs: (logs) => {
    for (const log of logs) {
      console.log('New article:', {
        articleId: log.args.articleId,
        author: log.args.author,
        arweaveId: log.args.arweaveId
      });
    }
  }
});

// 监听评价事件
publicClient.watchContractEvent({
  address: CONTRACTS.local.blogHub,
  abi: BlogHubABI,
  eventName: 'ArticleEvaluated',
  onLogs: (logs) => {
    for (const log of logs) {
      console.log('Article evaluated:', {
        articleId: log.args.articleId,
        user: log.args.user,
        score: log.args.score,
        amount: log.args.amountPaid
      });
    }
  }
});
```

---

## 7. 测试网部署

### 7.1 准备工作

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

### 7.2 部署到 Optimism Sepolia

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

### 7.3 验证部署

```bash
# 检查合约是否正确部署
cast call <BLOG_HUB_PROXY> "platformTreasury()(address)" --rpc-url $OP_SEPOLIA_RPC
cast call <BLOG_HUB_PROXY> "sessionKeyManager()(address)" --rpc-url $OP_SEPOLIA_RPC
cast call <PAYMASTER> "getEntryPointDeposit()(uint256)" --rpc-url $OP_SEPOLIA_RPC
```

---

## 8. 主网部署检查清单

### 8.1 部署前检查

- [ ] 所有单元测试通过: `forge test`
- [ ] 代码审计完成
- [ ] 多签钱包准备就绪（用于 Owner 权限）
- [ ] Treasury 地址确认
- [ ] Gas 预算充足
- [ ] 监控和告警系统就绪

### 8.2 部署参数确认

```solidity
// 推荐的主网参数
platformFeeBps = 250;        // 2.5% 平台费
defaultRoyaltyBps = 500;     // 5% 默认版税
maxRoyaltyBps = 10000;       // 最高 100% 版税
unstakeDelaySec = 86400;     // 1 天解锁延迟
sessionKeyMaxDuration = 7 days;
```

### 8.3 部署后操作

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

### 8.4 监控指标

- Paymaster EntryPoint 余额
- Paymaster Stake 状态
- 合约暂停状态
- 异常大额交易
- Gas 价格波动

---

## 9. 常见问题排查

### 9.1 交易失败

```bash
# 检查合约是否暂停
cast call <BLOG_HUB_PROXY> "paused()(bool)" --rpc-url <RPC_URL>

# 检查文章是否存在
cast call <BLOG_HUB_PROXY> "nextArticleId()(uint256)" --rpc-url <RPC_URL>
```

### 9.2 Session Key 问题

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

### 9.3 Paymaster 问题

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

### 9.4 升级合约

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

*文档版本: 1.2.0*
*最后更新: 2024-11*

**更新日志:**
- v1.2.0: 更新合约地址（BlogHub Proxy: 0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9）；更新函数选择器；移除 withdraw/accountBalance 相关功能（打赏现为直接转账）
- v1.1.0: `publish` 函数新增 `originalAuthor` 参数，支持代发文章记录真实作者
