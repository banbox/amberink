# AmberInk 去中心化永久内容发布平台项目概述

## 项目整体概述

AmberInk 是一个完全去中心化的永久内容发布平台，无后端参与。采用 Optimism（Solidity）+ Arweave（Irys）+ Subsquid + SvelteKit 技术栈。用户可发布文章、评价、点赞、关注、收藏等，所有数据存储在链上和 Arweave 上，通过 Subsquid 索引查询。核心特性：文章即 NFT（ERC-1155），支持 ERC-4337 账户抽象和 Session Keys 实现无感交互体验。

## 技术架构与实现方案

- **智能合约**: Solidity + Foundry - ERC-1155 NFT、ERC-2981 版税、UUPS 可升级、ERC-4337 账户抽象
- **链**: Optimism - 低成本、高速交易
- **内容存储**: Arweave + Irys - 永久去中心化存储
- **链上索引**: Subsquid - 事件处理、数据同步、GraphQL 查询
- **前端框架**: SvelteKit + TypeScript - 全栈 Web 框架
- **样式**: TailwindCSS - 原子化 CSS
- **Web3 交互**: viem + @wagmi/core - 钱包交互
- **钱包连接**: @reown/appkit - 多钱包支持
- **数据查询**: @urql/svelte - GraphQL 客户端
- **国际化**: @inlang/paraglide-sveltekit - 多语言支持
- **安全**: ERC-4337 Paymaster + Session Keys - 无感签名、Gas 代付

---

# 核心文件索引

## 智能合约层 (contracts/)

### 主业务合约 (src/)

- **BlogHub.sol**: 核心业务合约，基于 ERC-1155 Upgradeable。支持文章发布（publish）、评价（evaluate）、评论（addComment）、点赞评论（likeComment）、关注（follow）、收藏（collect）、编辑文章（editArticle）等功能。定义 PublishParams、EditArticleParams、Article 等结构体，包含文章元数据、评价分数、原创性标记（Original/SemiOriginal/Reprint）。支持 ERC-2981 版税、AccessControl 权限、Pausable 暂停、ReentrancyGuard 重入保护、UUPS 可升级、Multicall 多调用。收藏者 TokenID 使用 COLLECTOR_TOKEN_OFFSET (2^250) 与文章 ID 组合。

- **BlogPaymaster.sol**: ERC-4337 Paymaster 合约，实现 Gas 代付。支持资金池模式（balanceOf 记录用户余额）、授权代付（allowance 机制允许他人使用余额）、Session Key 模式。完全去中心化，无需信任第三方 Relayer。支持 EIP-712 签名、ECDSA 验证、重入保护。

- **BlogTokenPaymaster.sol**: ERC-4337 Token Paymaster 合约，允许用户使用 ERC-20 代币（USDT、USDC 等）支付 Gas。通过 TokenPriceOracle 获取代币/ETH 汇率进行自动转换。支持 Session Key 模式。paymasterAndData 格式支持普通模式和 Session Key 模式。

- **SessionKeyManager.sol**: Session Key 管理合约，实现无感交互。用户在前端生成临时密钥对，主钱包签名授权一次（唯一弹窗），后续操作由临时私钥签名。支持时间限制（最长 7 天）、权限限制（指定合约和函数选择器）、消费限额、可撤销。使用 EIP-712 标准签名和 ECDSA 验证。

- **TokenPriceOracle.sol**: 代币价格预言机。支持 Chainlink 价格源和手动设置价格两种模式。所有价格以 18 位精度存储，tokenToEthPrice 表示 1 个代币最小单位值多少 ETH。支持价格过期检查（stalePriceThreshold）。

### 接口定义 (src/interfaces/)

- **IEntryPoint.sol**: ERC-4337 EntryPoint 接口，定义 UserOperation 结构和验证方法。
- **IPaymaster.sol**: ERC-4337 Paymaster 接口，定义 validatePaymasterUserOp 和 postOp 方法。
- **ISessionKeyManager.sol**: Session Key 管理接口，定义注册、撤销、验证等方法。
- **ITokenPriceFeed.sol**: 代币价格预言机接口，定义价格查询方法。

### 工具库 (src/libraries/)

- **CallDataParser.sol**: ERC-4337 UserOperation callData 解析工具。支持直接调用和 execute 调用两种格式，从 callData 中提取目标合约地址和函数选择器。

### 部署与配置 (根目录)

- **foundry.toml**: Foundry 项目配置，定义编译器版本、优化设置、依赖库路径。
- **script/Deploy.s.sol**: 部署脚本，部署所有合约并进行初始化配置。

### 测试 (test/)

- **BaseTest.sol**: 测试基础合约，提供通用的测试设置、测试账户、常量定义、EIP-712 签名工具。
- **BlogHub.t.sol**: BlogHub 合约单元测试，测试文章发布、评价、评论、关注等核心功能。
- **BlogHubSessionKey.t.sol**: BlogHub 与 Session Key 集成测试，测试无感交互流程。
- **BlogPaymaster.t.sol**: BlogPaymaster 合约测试，测试资金池、授权代付、Gas 支付。
- **BlogTokenPaymaster.t.sol**: BlogTokenPaymaster 合约测试，测试 Token 支付 Gas 功能。
- **SessionKeyManager.t.sol**: SessionKeyManager 合约测试，测试 Session Key 注册、验证、撤销。

### 测试辅助 (test/mocks/)

- **MockEntryPoint.sol**: 模拟 ERC-4337 EntryPoint，用于本地测试。
- **MockERC20.sol**: 模拟 ERC-20 代币，用于测试 Token Paymaster。
- **MockPriceOracle.sol**: 模拟价格预言机，用于测试价格查询。

---

## 前端层 (frontend/)

### 应用入口 (src/)

- **app.html**: 主 HTML 模板，定义基本结构、meta 标签、根元素。
- **app.d.ts**: TypeScript 类型定义，扩展 App 命名空间。
- **hooks.server.ts**: 服务端钩子，处理服务端逻辑。
- **hooks.ts**: 客户端钩子，处理客户端初始化。

### 全局布局 (src/routes/)

- **+layout.svelte**: 全局布局组件，处理钱包连接初始化、主题管理、模态框、警告消息、国际化。
- **+layout.ts**: 布局数据加载，获取初始化数据。
- **+page.svelte**: 首页，展示文章列表、热门文章、分类筛选、搜索功能。
- **layout.css**: 全局样式，定义布局相关的 CSS。

### 核心服务库 (src/lib/)

- **contracts.ts**: 智能合约交互工具。定义 ContractError 错误类、错误解析函数、发布文章、评价、评论、点赞等链上操作。支持 viem 钱包客户端、Session Key 签名、错误处理。

- **sessionKey.ts**: Session Key 管理工具。生成临时密钥对、注册 Session Key、验证有效性、存储在 LocalStorage。支持 Session Key 余额检查、权限验证、过期检查、自动创建。支持 EIP-712 签名和 ECDSA 验证。

- **publish.ts**: 文章发布编排工具。协调 Arweave 上传和区块链发布流程。获取或创建有效 Session Key、上传文章文件夹、发布到 BlogHub 合约。

- **chains.ts**: 集中化链配置。定义支持的链（Ethereum、Optimism、Arbitrum、Base、Polygon、zkSync、Mantle、Scroll 等）及其 Pyth Network 预言机地址、BlogHub 合约地址、SessionKeyManager 合约地址。所有链相关配置的唯一来源。

- **chain.ts**: 链配置工具。管理不同网络的 RPC、合约地址、链 ID、网络参数等配置。

- **config.ts**: 全局配置管理。从 stores/config.svelte.ts 读取配置，提供 getter 函数。包含 RPC URL、链 ID、Arweave 网关、Gas 费用倍数、USD 定价等配置。支持用户在设置页面覆盖默认配置。

- **constants.ts**: 集中管理前端固定常量。包含 Irys 网关 URL、Session Key 配置（有效期、消费限额）、价格服务阈值、零地址等硬编码值。

- **priceService.ts**: 价格服务。从 Pyth Network 预言机获取原生代币价格（USD），支持多链，包含缓存机制。提供 USD/Wei 互转、格式化显示等工具函数。

- **data.ts**: 文章分类定义。定义 CATEGORY_KEYS 常量数组（40+ 分类），提供 formatEthDisplay 格式化函数。

- **categoryUtils.ts**: 分类工具函数。提供分类名称国际化、分类 ID 与 Key 转换等功能。

- **formatUtils.ts**: 格式化工具函数。提供 formatWeiToEth 等数值格式化函数，支持精度控制和阈值显示。

- **utils.ts**: 通用工具函数。包含 NFT TokenID 工具（COLLECTOR_TOKEN_OFFSET）、地址格式化（shortAddress）、日期格式化、零地址检查、infiniteScroll Svelte action。

- **wallet.ts**: 钱包工具函数。提供 getEthereumAccount、switchToTargetChain、getWalletClient、getPublicClient 等钱包交互函数。

- **contractErrors.ts**: 合约错误码定义。定义 ContractErrorCode 枚举，用于国际化错误消息。

- **index.ts**: 库导出文件，导出公共 API。

### 状态管理 (src/lib/stores/)

- **config.svelte.ts**: 响应式配置状态管理，使用 Svelte 5 runes ($state)。支持 localStorage 持久化，允许用户覆盖默认配置。定义 envDefaults、configFields 元数据、Pyth 预言机地址映射。
- **wallet.svelte.ts**: 钱包状态管理，使用 Svelte 5 runes。管理钱包连接状态、用户地址，提供 connectWallet、disconnectWallet、handleAccountsChanged 等函数。

### 组件库 (src/lib/components/)

- **WalletButton.svelte**: 钱包连接按钮，支持连接/断开钱包、显示地址。
- **SessionKeyStatus.svelte**: Session Key 状态显示，显示有效期、权限范围、余额信息。
- **ArticleListItem.svelte**: 文章列表项组件，展示文章标题、摘要、作者、评分、发布时间。
- **ArticleSearch.svelte**: 文章搜索组件，支持关键词搜索、范围筛选（全部/我的）、分类筛选、排序。
- **ArticleEditor.svelte**: 文章编辑器组件，支持 Markdown 编辑、实时预览、可见性设置（公开/不公开/加密）。
- **CategoryFilter.svelte**: 分类筛选组件，展示分类列表、支持多选。
- **CommentSection.svelte**: 评论区组件，支持评论展示、回复、点赞、分页。
- **ImageProcessor.svelte**: 图片处理组件，支持上传、预览、压缩、裁剪。
- **ContentImageManager.svelte**: 内容图片管理组件，管理文章中的图片。
- **SearchButton.svelte**: 搜索按钮组件，触发搜索操作。
- **SearchSelect.svelte**: 搜索选择组件，支持搜索和下拉选择。
- **Sidebar.svelte**: 侧边栏组件，导航菜单、用户信息、无限滚动加载。
- **UserAvatar.svelte**: 用户头像组件，统一显示用户头像和默认占位符。
- **LoadingState.svelte**: 加载状态组件，显示加载动画和提示。
- **LoadingSpinner.svelte**: 加载动画组件，SVG 旋转动画。
- **EndOfList.svelte**: 列表结束提示组件，显示"没有更多"信息。
- **EmptyState.svelte**: 空状态组件，显示无数据时的提示。
- **ErrorAlert.svelte**: 错误提示组件，显示错误信息。
- **OriginalityTag.svelte**: 原创性标签组件，显示原创/部分原创/转载标识。
- **EditorSkeleton.svelte**: 编辑器骨架屏组件，编辑器加载占位。
- **ProfileSkeleton.svelte**: 用户资料骨架屏组件，资料页加载占位。
- **icons/**: 图标组件库（35 个 SVG 图标）。

### Arweave 集成 (src/lib/arweave/)

- **irys.ts**: Irys 客户端初始化和管理。支持 Mainnet（永久存储）和 Devnet（测试用）两种网络。支持 MetaMask 模式和 Session Key 模式。创建 Irys Uploader、管理余额、处理上传。

- **folder.ts**: Irys 可更新文件夹功能。实现文章文件夹结构（index.md 文章内容、coverImage 封面、内容图片）、Manifest 下载、文件夹更新。支持 mutable folders 获取最新版本。

- **upload.ts**: Arweave 上传功能。上传文章文件夹、图片到 Arweave。支持 MetaMask 和 Session Key 两种模式。支持加密文章两阶段上传（先上传获取 manifestId，再加密内容后更新）。

- **fetch.ts**: Arweave 内容获取。从 Arweave 网关下载文章、图片、Manifest，支持多网关重试。自动处理 devnet/mainnet 不同的 mutable folder URL。

- **crypto.ts**: 文章内容加密/解密模块。使用钱包签名派生 AES-256-GCM 密钥（通过 HKDF），支持加密/解密内容、检测加密内容。

- **encryptionKeyCache.ts**: 加密密钥缓存。将 arweaveId 与加密签名的映射缓存到 localStorage，避免每次查看加密文章时重复签名。

- **types.ts**: Arweave 相关类型定义。定义 Visibility 枚举（Public/Private/Encrypted）、ArticleMetadata、ArticleFolderUploadParams（含 signatureProvider 回调）、ContentImageInfo 等类型。

- **index.ts**: Arweave 模块导出，导出公共 API。

### GraphQL 查询 (src/lib/graphql/)

- **client.ts**: GraphQL 客户端初始化。创建 urql 客户端，连接到 Subsquid GraphQL 端点。

- **queries.ts**: GraphQL 查询定义。定义查询文章列表、用户信息、评论、关注等的 GraphQL 查询。

- **index.ts**: GraphQL 模块导出，导出查询函数。

### 路由页面 (src/routes/)

- **+page.svelte**: 首页，展示文章列表、热门文章、分类筛选、搜索功能。仅显示公开可见文章。
- **+layout.svelte**: 全局布局组件，处理钱包连接初始化、主题管理、模态框、警告消息、国际化。
- **+layout.ts**: 布局数据加载，获取初始化数据。
- **layout.css**: 全局样式，定义布局相关的 CSS。

- **a/+page.svelte**: 文章详情页面，按 Arweave ID 显示完整文章内容、评论、评分。支持加密文章解密（需作者钱包签名）。

- **edit/+page.svelte**: 文章编辑页面，修改已发布文章的元数据（标题、摘要、分类）。

- **publish/+page.svelte**: 文章发布页面，编辑文章内容、上传封面、设置元数据、可见性（公开/不公开/加密）、发布到链。

- **library/+page.svelte**: 用户文库页面，展示用户发布的所有文章、收藏的文章。

- **profile/+page.svelte**: 用户资料页面，展示用户信息、发布的文章列表。

- **settings/+page.svelte**: 用户设置页面，修改用户资料、管理 Session Key、设置偏好。

- **u/+page.svelte**: 用户主页，展示用户信息、发布的文章、粉丝关注。

### 配置文件

- **package.json**: 项目依赖和脚本，定义构建、开发、测试命令。
- **svelte.config.js**: SvelteKit 配置，定义适配器、预处理、路由等。
- **vite.config.ts**: Vite 构建配置，定义插件、优化、服务器设置。
- **tsconfig.json**: TypeScript 配置，定义编译选项、路径别名。
- **eslint.config.js**: ESLint 配置，定义代码检查规则。
- **.env.dev**: 开发环境变量，包含开发网络配置。
- **.env.prod**: 生产环境变量，包含生产网络配置。
- **.env.example**: 环境变量示例，展示所需的环境变量。
- **.prettierrc**: Prettier 配置，定义代码格式化规则。
- **.prettierignore**: Prettier 忽略文件列表。
- **.npmrc**: npm 配置，定义包管理器设置。

---

## 链上索引层 (squid/)

### 处理器配置 (src/)

- **processor.ts**: EvmBatchProcessor 配置。定义 BlogHub 和 SessionKeyManager 合约地址、RPC 端点、事件监听。监听 ArticlePublished、ArticleEvaluated、CommentAdded、CommentLiked、FollowStatusChanged、ArticleCollected、UserProfileUpdated、ArticleEdited、SessionKeyRegistered、SessionKeyRevoked、SessionKeyUsed 等 11 个事件。支持本地 Anvil 和 Optimism Sepolia 网络。支持 Gateway 加速数据同步。

### 事件处理 (src/)

- **main.ts**: 核心事件处理逻辑。处理所有 BlogHub 和 SessionKeyManager 事件并更新数据库。包含 ensureUser、ensureArticleByArweaveId、ensureComment 等辅助函数。维护缓存映射（arweaveIdCache、articleIdToArweaveId）提高查询效率。处理文章发布、评价、评论、点赞、关注、收藏、用户资料更新、文章编辑、Session Key 注册/撤销/使用等事件。支持 Session Key 交易记录（限制 500 条/用户，保留 3 个月）。

### 数据模型 (src/model/generated/)

- **article.model.ts**: Article 实体模型，包含 arweaveId（主键）、articleId、作者、标题、摘要、分类、原创性、可见性、收藏价格、收藏数、点赞/踩数、打赏总额、创建/编辑时间、区块号、交易哈希等字段。
- **user.model.ts**: User 实体模型，包含钱包地址、昵称、头像、简介、文章总数、粉丝数、关注数、当前 Session Key、资料更新时间、创建时间等字段。
- **evaluation.model.ts**: Evaluation 实体模型，记录用户对文章的评价（点赞/踩/打赏）、评价者、被评价文章、评价分数、打赏金额、评论内容、推荐人、创建时间、交易哈希。
- **comment.model.ts**: Comment 实体模型，记录用户评论、评论 ID、评论者、所属文章、评论内容、父评论 ID（回复时）、点赞数、创建时间、交易哈希。
- **follow.model.ts**: Follow 实体模型，记录关注关系、关注者、被关注者、是否活跃、创建/更新时间。
- **collection.model.ts**: Collection 实体模型，记录用户收藏、收藏者、被收藏文章、TokenID、收藏数量、创建时间、交易哈希。
- **transaction.model.ts**: Transaction 实体模型，记录 Session Key 交易、主账户、Session Key、目标合约、函数选择器、交易数据、交易值、创建时间、交易哈希。
- **index.ts**: 模型导出文件，导出所有实体模型。
- **marshal.ts**: 数据序列化工具，处理模型与数据库之间的转换。

### ABI 和类型生成 (src/abi/)

- **BlogHub.ts**: 由 squid-evm-typegen 生成的 BlogHub 合约类型。包含事件解析、函数编码、类型定义。
- **BlogHub.json**: BlogHub 合约 ABI JSON 文件，包含所有函数和事件的定义。
- **SessionKeyManager.ts**: 由 squid-evm-typegen 生成的 SessionKeyManager 合约类型。
- **SessionKeyManager.json**: SessionKeyManager 合约 ABI JSON 文件。

### 服务器扩展 (src/server-extension/)

- 自定义 GraphQL 服务器扩展（如需要）。

### 数据库 (db/)

- **schema.graphql**: GraphQL schema 定义，定义所有实体（User、Article、Evaluation、Comment、Follow、Collection、Transaction）、字段、关系、查询。
- **migrations/**: 数据库迁移文件目录，包含所有数据库结构变更。

### 配置文件

- **package.json**: 项目依赖和脚本，定义构建、开发、测试命令。
- **.env**: 环境变量，包含 RPC_ETH_HTTP、BLOG_HUB_ADDRESS、SESSION_KEY_MANAGER_ADDRESS 等配置。
- **squid.yaml**: Squid 配置文件，定义处理器、数据库、服务器设置。

---

## 项目特点

1. **完全去中心化**: 无后端服务，所有数据存储在链上和 Arweave 上
2. **NFT 文章**: 每个文章对应 ERC-1155 NFT，创作者和收藏者的 NFT 使用不同的 TokenID 区分：
   - **创作者 TokenID**: `articleId`（低位）
   - **收藏者 TokenID**: `articleId + COLLECTOR_TOKEN_OFFSET`（高位标识 + 低位文章ID）
   - `COLLECTOR_TOKEN_OFFSET = 1 << 250`（2^250，预留 250 位给文章ID）
3. **永久存储**: 文章内容存储在 Arweave，一次付费永久保存
4. **无感交互**: Session Keys 实现无需每次 MetaMask 签名的体验
5. **Gas 代付**: Paymaster 支持用户或项目方代付 Gas 费用
6. **Token 支付**: 支持使用 ERC-20 代币支付 Gas
7. **版税机制**: ERC-2981 标准支持二手交易版税
8. **可升级合约**: UUPS 代理模式支持合约升级
9. **权限管理**: 基于 AccessControl 的角色权限管理
10. **高效索引**: Subsquid 提供低延迟的链上数据查询
11. **多语言支持**: 前端支持中英文切换
12. **响应式设计**: 支持移动端和桌面端适配
13. **文章可见性**: 支持公开、不公开（仅作者可见）、加密三种可见性模式
14. **文章加密**: 使用钱包签名派生 AES-256-GCM 密钥加密文章内容，仅作者可解密

---

## 开发指南

### 智能合约开发
- 使用 Foundry 进行开发、测试、部署
- 新增功能时遵循现有的参数结构体模式（避免 Stack Too Deep）
- 所有时间戳使用 uint64（秒级）或 uint48（ERC-4337 标准）
- 重要操作需要权限检查和事件发出

### 前端开发
- 新增页面时在 src/routes/ 中创建对应目录
- 组件开发遵循单一职责原则，放在 src/lib/components/ 中
- 所有链上交互通过 src/lib/contracts.ts 进行
- Session Key 管理通过 src/lib/sessionKey.ts 进行
- 文章发布通过 src/lib/publish.ts 进行编排
- 使用 TailwindCSS 原子类进行样式设计

### 链上索引开发
- 新增事件监听时在 src/processor.ts 中添加事件 topic
- 事件处理逻辑在 src/main.ts 中实现
- 数据模型在 src/model/ 中定义
- 修改 schema.graphql 后需要运行 `sqd codegen` 生成 TypeORM 类
- 修改数据库结构后需要运行 `sqd migration:generate` 生成迁移文件

### Arweave 存储
- 文章内容通过 Irys 上传到 Arweave
- 前端通过 src/lib/arweave/ 工具进行上传
- 上传返回 arweaveId，用于链上记录和查询

### 部署流程
1. 部署智能合约到 Optimism（使用 Foundry）
2. 更新 src/lib/config.ts 中的合约地址
3. 部署 Subsquid 索引（到 Subsquid Cloud 或自托管）
4. 部署前端（到 Vercel、Netlify 等）

---

## 关键概念

### Session Keys 工作流
1. 用户登录时，前端生成临时密钥对（Ephemeral Key Pair）
2. 用户使用主钱包签名授权该临时公钥（唯一一次弹窗）
3. 临时私钥保存在浏览器 LocalStorage
4. 后续点赞、评论等操作由临时私钥签名，无需唤起钱包
5. 链上验证：SessionKeyManager 验证授权有效性

### Gas 代付机制
- **Sponsor 模式**: 项目方存款到 BlogPaymaster，授权用户使用其余额
- **Token 模式**: 用户使用 ERC-20 代币支付 Gas，TokenPaymaster 自动转换为 ETH

### 数据流
1. 用户发布文章 → 文章内容上传到 Arweave（获得 arweaveId）→ 调用 BlogHub.publish() 记录链上 → Subsquid 监听事件 → 索引数据 → GraphQL 查询
2. 用户评价文章 → 调用 BlogHub.evaluate() → Subsquid 监听 ArticleEvaluated 事件 → 更新评价数据
3. 用户评论 → 调用 BlogHub.addComment() → Subsquid 监听 CommentAdded 事件 → 更新评论数据

