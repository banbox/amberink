
## 核心合约
- **BlogHub** - 主业务合约，支持文章发布、评价、点赞、关注等
- **BlogPaymaster** - ERC-4337 Paymaster，负责 Gas 代付
- **SessionKeyManager** - Session Key 管理，实现无感签名

## Session Keys（无感交互）
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

## 代付机制
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

## 技术架构说明
[Foundry](https://book.getfoundry.sh/)是基于Rust的以太坊合约开发平台

### Forge
以太坊测试工具(类似Truffle, Hardhat)
```shell
# build
$ forge build
# test
$ forge test
# format
$ forge fmt
# gas snapshot
$ forge snapshot
```

### Anvil
本地以太坊开发节点(类似Ganache，Hardhat Network)
```shell
$ anvil --load-state cache/anvil.json
$ anvil --dump-state cache/anvil.json --load-state cache/anvil.json
```

### Deploy

```shell
export PRIVATE_KEY=<YOUR_PRIVATE_KEY>

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

### Cast
命令行的以太坊合约交互工具，可发起合约调用
```shell
$ cast <subcommand>
```
