# amberink 智能合约开发指南

本文档为 amberink 智能合约的完整技术指南，涵盖从本地开发到生产部署的全流程。

---

## 目录

**基础篇**
1. [环境准备](#1-环境准备)
2. [本地部署验证](#2-本地部署验证)
3. [合约调用测试](#3-合约调用测试)

**进阶篇**
4. [Session Key 配置与测试](#4-session-key-配置与测试)
5. [Paymaster 配置](#5-paymaster-配置)

**部署篇**
6. [测试网部署](#6-测试网部署)
7. [主网部署检查清单](#7-主网部署检查清单)

**运维篇**
8. [常见问题排查](#8-常见问题排查)
9. [附录：速查表](#9-附录速查表)

---

# 基础篇

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

### 2.2 部署合约

```bash
cd contracts

export PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
forge script script/Deploy.s.sol --rpc-url http://localhost:8545 --broadcast --tc DeployScript
```

### 2.3 升级合约

```bash
# 升级智能合约
export BLOG_HUB_PROXY=0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9
forge script script/Deploy.s.sol --rpc-url http://localhost:8545 --broadcast --tc UpgradeBlogHub
```

### 2.4 验证部署状态

```bash
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
# publish(string arweaveId, uint64 categoryId, uint96 royaltyBps, string originalAuthor, string title, string summary, address trueAuthor, uint256 collectPrice, uint256 maxCollectSupply, uint8 originality)
# arweaveId: Irys 可变文件夹的 manifest ID（作为文章唯一标识）
# categoryId: 分类 ID
# royaltyBps: 版税（基点，100 = 1%，最高 10000 = 100%）
# originalAuthor: 原作者名称（最大 64 字节）
# title: 文章标题（最大 128 字节）
# summary: 文章摘要（最大 512 字节）
# trueAuthor: 真实作者地址，0x0 表示发布者为作者
# collectPrice: 收藏价格（0 表示不可收藏）
# maxCollectSupply: 最大收藏数量
# originality: 原创标记（0=Original, 1=SemiOriginal, 2=Reprint）

cast send 0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9 \
  "publish(string,uint64,uint96,string,string,string,address,uint256,uint256,uint8)(uint256)" \
  "QmTestArweaveHash987654321" \
  1 \
  500 \
  "RealAuthor.eth" \
  "Web3 Development Guide" \
  "Learn Web3 development from scratch" \
  0x0000000000000000000000000000000000000000 \
  0 \
  0 \
  0 \
  --private-key 0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d \
  --rpc-url http://localhost:8545

# 验证文章创建
cast call 0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9 "nextArticleId()(uint256)" --rpc-url http://localhost:8545
# 应返回 2（下一个文章ID）
```

### 3.2 评价文章（点赞/踩/打赏）

```bash
# evaluate(uint256 articleId, uint8 score, string content, address referrer, uint256 parentCommentId)
# score: 0=中立, 1=喜欢, 2=不喜欢
# content: 评论内容（可为空）
# referrer: 推荐人地址（可为 0x0）
# parentCommentId: 父评论 ID（顶级评论为 0）

# 点赞（带打赏）
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

# 注意：支付金额会按平台费/推荐费规则分配
```

### 3.3 评论（需支付最小金额）

```bash
# 评论内容不为空时需要支付金额 >= minActionValue（默认 0.0001 ether）
cast send 0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9 \
  "evaluate(uint256,uint8,string,address,uint256)" \
  1 \
  0 \
  "This is a comment" \
  0x0000000000000000000000000000000000000000 \
  0 \
  --value 0.0001ether \
  --private-key 0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a \
  --rpc-url http://localhost:8545
```

### 3.4 收藏文章（NFT）

```bash
# collect(uint256 articleId, uint256 amount)
# 收藏文章 NFT，amount 为收藏数量
cast send 0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9 \
  "collect(uint256,uint256)" \
  1 \
  1 \
  --value 0.01ether \
  --private-key 0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a \
  --rpc-url http://localhost:8545
```

### 3.5 关注用户

```bash
# follow(address target, bool isFollowing)
# User2 关注 User1
cast send 0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9 \
  "follow(address,bool)" \
  0x70997970C51812dc3A010C7d01b50e0d17dc79C8 \
  true \
  --private-key 0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a \
  --rpc-url http://localhost:8545
```

### 3.6 编辑文章

```bash
# editArticle(uint256 articleId, string originalAuthor, string title, string summary, uint64 categoryId)
# 仅可编辑元数据，arweaveId 和 author 不可修改
cast send 0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9 \
  "editArticle(uint256,string,string,string,uint64)" \
  1 \
  "Updated Author" \
  "Updated Title" \
  "Updated summary" \
  2 \
  --private-key 0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d \
  --rpc-url http://localhost:8545
```

### 3.7 更新用户资料

```bash
# updateUserProfile(string nickname, string avatar, string bio)
cast send 0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9 \
  "updateUserProfile(string,string,string)" \
  "MyNickname" \
  "QmAvatarHash" \
  "My bio here" \
  --private-key 0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d \
  --rpc-url http://localhost:8545
```

---

# 进阶篇

## 4. Session Key 配置与测试

Session Key 允许用户授权临时密钥执行特定操作，实现无感交互体验。

### 4.2 注册 Session Key（主钱包签名）

```bash
# 假设生成的 Session Key 地址为: 0x1234567890123456789012345678901234567890

# 获取当前时间戳
CURRENT_TIME=$(cast block latest --rpc-url http://localhost:8545 | grep timestamp | awk '{print $2}')
VALID_UNTIL=$((CURRENT_TIME + 604800))  # 7天后过期

# 允许的函数选择器:
# evaluate: 0xff1f090a
# likeComment: 0xdffd40f2
# follow: 0x63c3cc16
# publish: 0x21a25d60
# collect: 0x8d3c100a
# editArticle: 0x... (需查询)
# updateUserProfile: 0x... (需查询)

# registerSessionKey(address sessionKey, uint48 validAfter, uint48 validUntil, address allowedContract, bytes4[] allowedSelectors, uint256 spendingLimit)
cast send 0x5FbDB2315678afecb367f032d93F642f64180aa3 \
  "registerSessionKey(address,uint48,uint48,address,bytes4[],uint256)" \
  0x1234567890123456789012345678901234567890 \
  $CURRENT_TIME \
  $VALID_UNTIL \
  0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9 \
  "[0xff1f090a,0xdffd40f2,0x63c3cc16,0x21a25d60,0x8d3c100a]" \
  10000000000000000000 \
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
参考[contracts.ts](frontend\src\lib\contracts.ts)的createSessionKeySignature

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
forge script script/Deploy.s.sol --rpc-url http://localhost:8545 --broadcast --tc ConfigurePaymaster
```

---

# 部署篇

## 6. 测试网部署

### 6.1 准备工作

```bash
# 1. 获取测试币
# Optimism Sepolia Faucet: https://console.optimism.io/faucet

# 2. 设置环境变量
export PRIVATE_KEY=your_private_key_here
export ETHERSCAN_RPC=https://sepolia.optimism.io
export ETHERSCAN_API_KEY=your_etherscan_api_key

# 3. 验证余额
cast balance $(cast wallet address --private-key $PRIVATE_KEY) --rpc-url $ETHERSCAN_RPC
```

### 6.2 部署到 Optimism Sepolia

```bash
cd contracts

# 部署所有合约
forge script script/Deploy.s.sol --rpc-url $ETHERSCAN_RPC --broadcast --verify --tc DeployScript
# 如果ETHERSCAN_RPC需要api key，则传入--etherscan-api-key $ETHERSCAN_API_KEY

# 配置 Paymaster
PAYMASTER=<deployed_paymaster_address> \
DEPOSIT_AMOUNT=100000000000000000 \
STAKE_AMOUNT=100000000000000000 \
UNSTAKE_DELAY=86400 \
forge script script/Deploy.s.sol \
  --rpc-url $ETHERSCAN_RPC \
  --broadcast \
  --tc ConfigurePaymaster
```
升级合约：
```bash
# 升级代理
export BLOG_HUB_PROXY=<PROXY_ADDRESS>
forge script script/Deploy.s.sol --rpc-url $ETHERSCAN_RPC --broadcast --tc UpgradeBlogHub
```

### 6.3 验证部署

```bash
# 检查合约是否正确部署
cast call $BLOG_HUB_PROXY "platformTreasury()(address)" --rpc-url $ETHERSCAN_RPC
cast call $BLOG_HUB_PROXY "sessionKeyManager()(address)" --rpc-url $ETHERSCAN_RPC
cast call $PAYMASTER "getEntryPointDeposit()(uint256)" --rpc-url $ETHERSCAN_RPC
```

---

## 7. 主网部署检查清单

### 7.1 部署前检查

- [ ] 所有单元测试通过: `forge test`
- [ ] 代码审计完成
- [ ] 多签钱包准备就绪（用于 Owner 权限）
- [ ] Treasury 地址确认
- [ ] Gas 预算充足
- [ ] 监控和告警系统就绪

### 7.2 部署参数确认

```solidity
// 推荐的主网参数
platformFeeBps = 250;        // 2.5% 平台费
defaultRoyaltyBps = 500;     // 5% 默认版税
maxRoyaltyBps = 10000;       // 最高 100% 版税
unstakeDelaySec = 86400;     // 1 天解锁延迟
sessionKeyMaxDuration = 7 days;
```

### 7.3 部署后操作

```bash
# 1. 验证合约源码
forge verify-contract <CONTRACT_ADDRESS> <CONTRACT_NAME> --chain optimism
#  --etherscan-api-key $ETHERSCAN_API_KEY

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

### 7.4 监控指标

- Paymaster EntryPoint 余额
- Paymaster Stake 状态
- 合约暂停状态
- 异常大额交易
- Gas 价格波动

---

# 运维篇

## 8. 常见问题排查

### 8.2 Session Key 问题

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

### 8.3 Paymaster 问题

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

---

## 9. 附录：速查表

### A. 函数选择器

| 函数 | 选择器 |
|------|--------|
| `publish((string,uint16,uint96,string,string,string,address,uint96,uint32,uint8))` | `0x21a25d60` |
| `evaluate(uint256,uint8,string,address,uint256)` | `0xff1f090a` |
| `likeComment(uint256,uint256,address,address)` | `0xdffd40f2` |
| `follow(address,bool)` | `0x63c3cc16` |
| `collect(uint256,uint256)` | `0x8d3c100a` |
| `editArticle(uint256,string,string,string,uint64)` | `0x...` |
| `updateUserProfile(string,string,string)` | `0x...` |

```bash
# 获取函数选择器
cast sig "evaluate(uint256,uint8,string,address,uint256)"
cast sig "publish((string,uint16,uint96,string,string,string,address,uint96,uint32,uint8))"
```

### B. 事件签名

```bash
# ArticlePublished
cast sig-event "ArticlePublished(uint256,address,uint256,string,string,string,string,address,uint256,uint256,uint8)"

# ArticleEvaluated
cast sig-event "ArticleEvaluated(uint256,address,uint8,uint256)"

# ArticleCollected
cast sig-event "ArticleCollected(uint256,address,uint256,uint256)"

# CommentAdded
cast sig-event "CommentAdded(uint256,address,string,uint256,uint8)"

# CommentLiked
cast sig-event "CommentLiked(uint256,uint256,address,address,uint256)"

# FollowStatusChanged
cast sig-event "FollowStatusChanged(address,address,bool)"

# ArticleEdited
cast sig-event "ArticleEdited(uint256,string,string,string,uint64)"

# UserProfileUpdated
cast sig-event "UserProfileUpdated(address,string,string,string)"
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

*文档版本: 1.0.0*
*最后更新: 2025-12*
