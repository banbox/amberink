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

- **contracts.ts**: 智能合约交互核心模块。定义 ContractError 类和 ContractErrorCode 错误码；实现发布、评价、评论、点赞、关注、收藏等所有链上操作；支持钱包模式和 Session Key 模式；包含参数验证、Gas 估算、错误解析等完整功能。完整 BlogHub ABI 定义。

- **sessionKey.ts**: Session Key 完整管理。生成临时密钥对、注册到链、余额管理（检查/充值）、Irys Balance Approval 创建、权限验证、过期检查。核心函数：`ensureSessionKeyReady`（统一准备流程）、`createSessionKey`、`fundSessionKey`、`ensureSessionKeyBalance`、`isSessionKeyActiveOnChain`。

- **publish.ts**: 文章发布流程编排。统一调用 `ensureSessionKeyReady` 准备 Session Key，协调 Arweave 上传和链上发布，支持加密文章签名回调。核心函数：`publishArticle`、`publishArticleWithSessionKeyInternal`、`isGaslessPublishingAvailable`。

- **chains.ts**: 多链配置中心。定义支持的所有链（Optimism、Base、Arbitrum、Polygon 等）的配置，包括 chainId、名称、RPC、区块浏览器、合约地址（BlogHub、SessionKeyManager、Pyth Oracle）、价格 Feed ID。各环境（dev/test/prod）的链白名单。

- **chain.ts**: 链工具函数。从 chains.ts 获取链配置、解析链信息。

- **config.ts**: 配置读取接口。从 stores/config.svelte.ts 读取配置，提供 `getConfig`、`getChainId`、`getIrysNetwork` 等 getter 函数。

- **constants.ts**: 硬编码常量。Irys 网关 URL、Session Key 默认配置（有效期 7 天、消费限额 10 ETH、Gas 估算值）、价格验证上限、零地址。

- **priceService.ts**: 原生代币价格服务。通过 Pyth Hermes API 获取实时价格（带缓存）；提供 `usdToWei`、`weiToUsd` 转换，`formatUsd`、`formatNativeToken` 格式化，`getNativeTokenSymbol` 获取符号。

- **data.ts**: 分类定义。40+ 文章分类 Key（如 Technology、Art、Finance 等）。

- **categoryUtils.ts**: 分类工具。分类名称国际化、ID/Key 互转。

- **formatUtils.ts**: 格式化工具。日期格式化（`formatDateShort`、`formatDateMedium`、`formatTimestamp`）、Wei/ETH 转换（`formatWeiToEth` 支持阈值和精度）、阅读时间计算（`getReadingTime` 支持多语言）。

- **utils.ts**: 通用工具。NFT TokenID 计算（`COLLECTOR_TOKEN_OFFSET = 1<<250`、`getArticleIdFromTokenId`）、地址格式化（`shortAddress`）、零地址检查、Svelte `infiniteScroll` action、反馈消息管理（`createFeedbackManager`）、钱包检查（`requireWallet`）。

- **wallet.ts**: 钱包交互。获取账户（`getEthereumAccount`）、切换链（`switchToTargetChain`）、获取客户端（`getWalletClient`、`getPublicClient`）。

- **contractErrors.ts**: 错误码枚举。定义所有合约错误码，用于 i18n。

### 状态管理 (src/lib/stores/)

- **config.svelte.ts**: 响应式配置管理（Svelte 5 runes $state）。环境配置硬编码（dev/test/prod），支持 localStorage 持久化用户覆盖。管理 RPC URL、chainId、Subsquid 端点、Irys 网络、USD 定价、缓存时长等。提供 `getConfig`、`setConfigValue`、`getEnvName`、`getPythContractAddress`、`getAllowedChainIds` 等函数。configFields 元数据支持设置 UI。
- **wallet.svelte.ts**: 钱包状态管理（Svelte 5 runes）。管理连接状态、用户地址，监听账户切换。提供 `connectWallet`、`disconnectWallet`、`handleAccountsChanged`。

### 工具模块 (src/lib/utils/)

- **articleUtils.ts**: 文章内容处理工具。`processContentImages`（替换相对路径为 Irys URL）、`getScoreColor`（评分渐变色）、`pollForArticleWithRetry`（轮询查询新发布文章）。
- **imageCompressor.ts**: 图片压缩工具。支持质量调整、尺寸限制。

### 组件库 (src/lib/components/)

- **WalletButton.svelte**: 钱包连接按钮，显示连接状态和地址。
- **SessionKeyStatus.svelte**: Session Key 状态展示，显示有效期、余额、权限。
- **ArticleListItem.svelte**: 文章列表项，展示标题、摘要、作者、评分、时间。
- **ArticleSearch.svelte**: 文章搜索，支持关键词、范围（全部/我的）、分类、排序。
- **ArticleEditor.svelte**: Markdown 编辑器，实时预览、可见性设置。
- **ArticleSkeleton.svelte**: 文章详情骨架屏。
- **Avatar.svelte**: 头像组件，统一头像显示逻辑。
- **CategoryFilter.svelte**: 分类筛选，多选支持。
- **CommentSection.svelte**: 评论区，展示、回复、点赞、分页。
- **AmountModal.svelte**: 数额输入弹窗（打赏/收藏等）。
- **CollectModal.svelte**: 收藏弹窗，显示价格和已收藏数。
- **ImageProcessor.svelte**: 图片处理，上传、预览、压缩。
- **ContentImageManager.svelte**: 文章内容图片管理。
- **SearchButton.svelte**: 搜索按钮。
- **SearchSelect.svelte**: 搜索下拉选择。
- **Sidebar.svelte**: 侧边栏导航，无限滚动。
- **UserAvatar.svelte**: 用户头像，默认占位符。
- **LoadingState.svelte**: 加载状态。
- **LoadingSpinner.svelte**: 加载动画。
- **EndOfList.svelte**: 列表结束提示。
- **EmptyState.svelte**: 空状态提示。
- **ErrorAlert.svelte**: 错误提示。
- **OriginalityTag.svelte**: 原创性标签。
- **EditorSkeleton.svelte**: 编辑器骨架屏。
- **ProfileSkeleton.svelte**: 用户资料骨架屏。
- **icons/**: SVG 图标库（35+ 图标）。

### Arweave 集成 (src/lib/arweave/)

- **irys.ts**: Irys 客户端初始化。支持 Mainnet/Devnet、MetaMask/Session Key 两种模式。使用 Viem 适配器连接钱包。提供 `createIrysUploader`、`getIrysUploader`、`createSessionKeyIrysUploader`、`ensureIrysBalance`、`calculateMinIrysBalance`、`calculateIrysFundAmount` 等函数。Session Key 模式使用自定义 EIP-1193 Provider 本地签名。

- **folder.ts**: Irys Mutable Folders 管理。文章文件夹结构：index.md（内容）、coverImage（封面）、内容图片。提供 `generateArticleFolderManifest`（SDK 生成）、`uploadManif est`、`uploadUpdatedManifest`（可变更新）、`downloadManifest`、`queryArticleVersions`（GraphQL 查询历史版本）、URL 生成（`getMutableFolderUrl`、`getStaticFolderUrl`）。

- **upload.ts**: 文章上传核心。支持 MetaMask/Session Key/Balance Approvals 三种模式。提供 `uploadArticleFolderWithSessionKey`（完整文章文件夹上传）、`uploadMarkdownContent`、`uploadCoverImageFile`、`uploadContentImageFile`。支持加密文章两阶段上传（先上传占位符获取 manifestId，签名派生密钥后更新加密内容）。Placeholder 缓存机制。

- **fetch.ts**: Arweave 内容获取。从网关下载文章/图片/Manifest，支持多网关重试。自动处理 devnet/mainnet URL 差异。提供 `fetchArticleContent`、`fetchImage`、`fetchManifest`、`fetchArticleMetadata`（从 Irys tags）。

- **crypto.ts**: 端到端加密。使用钱包签名（EIP-191）通过 HKDF 派生 AES-256-GCM 密钥。提供 `deriveEncryptionKey`、`encryptContent`、`decryptContent`、`isContentEncrypted`、`getSignMessageForArticle`。

- **encryptionKeyCache.ts**: 签名缓存。缓存 arweaveId → 钱包签名映射到 localStorage，避免重复签名。提供 `cacheEncryptionSignature`、`getCachedEncryptionSignature`、`clearEncryptionCache`。

- **types.ts**: 类型定义。`Visibility`（Public=0/Private=1/Encrypted=2）、`ArticleMetadata`、`ArticleFolderUploadParams`、`ContentImageInfo`、`IrysNetwork`、`IrysTag` 等。

- **index.ts**: 模块导出。

### GraphQL 查询 (src/lib/graphql/)

- **client.ts**: urql 客户端初始化，连接 Subsquid GraphQL 端点。
- **queries.ts**: 所有 GraphQL 查询定义。文章查询（列表、详情、按作者）、用户查询、评论查询、关注查询、收藏查询、评价查询。导出类型定义（ArticleData、UserData、CommentData 等）。
- **index.ts**: 导出客户端和查询。

### 路由页面 (src/routes/)

- **+page.svelte**: 首页。文章列表展示、分类筛选、搜索、排序、无限滚动加载。仅显示公开文章。
- **+layout.svelte**: 全局布局。钱包连接初始化、账户监听、主题管理、国际化加载。
- **+layout.ts**: 布局数据加载。
- **layout.css**: 全局布局样式。

- **a/+page.svelte**: 文章详情页。从 URL 参数读取文章 ID（`id`）和版本 ID（`version`），支持 `env` 参数切换环境。并行加载 Subsquid 数据和 Irys 内容，优先展示 Irys 数据。支持加密文章解密（签名派生密钥）。显示文章内容、评分、评论、收藏、打赏、关注等交互。支持 Session Key 无感交互。处理图片相对路径替换。轮询查询新发布文章。

- **edit/+page.svelte**: 文章编辑页。修改已发布文章元数据（标题、摘要、分类、真实作者、收藏价格等）。调用 BlogHub.editArticle。

- **publish/+page.svelte**: 文章发布页。Markdown 编辑器、封面上传、内容图片管理、元数据设置（标题、摘要、分类、原创性、可见性）、收藏定价。调用 `publishArticle` 完成 Arweave 上传和链上发布。支持草稿保存（localStorage）。

- **library/+page.svelte**: 用户文库。展示当前用户发布的文章和收藏的文章（两个标签页）。

- **profile/+page.svelte**: 个人中心。展示用户信息（昵称、简介、头像）、统计（文章数、粉丝数、关注数）、Session Key 管理（状态、创建、撤销）、发布的文章列表。

- **settings/+page.svelte**: 系统设置。配置管理界面，允许用户修改 RPC URL、chainId、Subsquid 端点、Arweave 网关、USD 定价等。从 config.svelte.ts 读取和保存配置。

- **u/+page.svelte**: 用户主页。从 URL 参数读取用户地址（`address`），展示用户资料、发布的文章、统计信息。

### 配置文件

- **package.json**: 项目依赖和脚本。
- **svelte.config.js**: SvelteKit 配置(适配器、预处理、路由)。
- **vite.config.ts**: Vite 构建配置(插件、优化、服务器)。
- **tsconfig.json**: TypeScript 配置(编译选项、路径别名)。
- **eslint.config.js**: ESLint 代码检查规则。
- **playwright.config.ts**: Playwright E2E 测试配置。
- **.prettierrc**: Prettier 格式化规则。
- **.prettierignore**: Prettier 忽略文件。
- **.npmrc**: npm 包管理器设置。

---

## 链上索引层 (squid/)

### 处理器配置 (src/)

- **processor.ts**: EvmBatchProcessor 配置。定义 BlogHub 和 SessionKeyManager 合约地址、RPC 端点、事件监听。监听 ArticlePublished、ArticleEvaluated、CommentAdded、CommentLiked、FollowStatusChanged、ArticleCollected、UserProfileUpdated、ArticleEdited、SessionKeyRegistered、SessionKeyRevoked、SessionKeyUsed 等 11 个事件。支持本地 Anvil 和 Optimism Sepolia 网络。支持 Gateway 加速数据同步。

### 事件处理 (src/)

- **main.ts**: 核心事件处理逻辑。处理所有 BlogHub 和 SessionKeyManager 事件并更新数据库。包含 ensureUser、ensureArticleByArweaveId、ensureComment 等辅助函数。维护缓存映射（arweaveIdCache、articleIdToArweaveId）提高查询效率。处理文章发布、评价、评论、点赞、关注、收藏、用户资料更新、文章编辑、Session Key 注册/撤销/使用等事件。支持 Session Key 交易记录（限制 500 条/用户，保留 3 个月）。

### 数据模型 (src/model/generated/)

- **article.model.ts**: Article 实体。arweaveId（主键）、articleId、author、title、summary、category、originality、visibility、collectPrice、collectCount、likes/dislikes、tipsTotal、createdAt、editedAt、blockHeight、txHash 等。
- **user.model.ts**: User 实体。地址（主键）、nickname、avatar、bio、totalArticles、followersCount、followingCount、currentSessionKey、profileUpdatedAt、createdAt。
- **evaluation.model.ts**: Evaluation 实体。id、evaluator、article、score、tipAmount、comment、referrer、createdAt、txHash。
- **comment.model.ts**: Comment 实体。commentId、commenter、article、content、parentCommentId、likes、createdAt、txHash。
- **follow.model.ts**: Follow 实体。id、follower、followee、active、createdAt、updatedAt。
- **collection.model.ts**: Collection 实体。id、collector、article、tokenId、amount、createdAt、txHash。
- **transaction.model.ts**: Transaction 实体。id、owner、sessionKey、target、selector、data、value、createdAt、txHash。Session Key 交易记录。
- **index.ts**: 模型导出。
- **marshal.ts**: 数据序列化工具。

### ABI 和类型生成 (src/abi/)

- **BlogHub.ts**: squid-evm-typegen 生成的 BlogHub ABI TypeScript 类型。事件解析、函数编码。
- **SessionKeyManager.ts**: squid-evm-typegen 生成的 SessionKeyManager ABI TypeScript 类型。

### 服务器扩展 (src/server-extension/)

- 自定义 GraphQL 服务器扩展（如需）。

### 数据库 (db/)

- **schema.graphql**: GraphQL schema 定义。定义所有实体（User、Article、Evaluation、Comment、Follow、Collection、Transaction）、字段、关系、查询。
- **migrations/**: 数据库迁移文件，记录所有结构变更。

### 配置文件

- **package.json**: 项目依赖和脚本。
- **.env**: 环境变量，RPC_ETH_HTTP、BLOG_HUB_ADDRESS、SESSION_KEY_MANAGER_ADDRESS、GATEWAY_URL、RPC_RATE_LIMIT、FINALITY_CONFIRMATION 等。
- **squid.yaml**: Squid 配置，处理器、数据库、GraphQL 服务器设置。

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
15. **可变文件夹**: 使用 Irys Mutable Folders 实现文章版本管理和在线更新
16. **多链支持**: 支持 Optimism、Base、Arbitrum、Polygon 等多条链，配置集中管理
17. **环境隔离**: dev/test/prod 三环境配置硬编码，支持用户覆盖和临时切换
18. **价格服务**: 通过 Pyth Network Hermes API 实时获取原生代币价格，支持 USD 定价
19. **Session Key 优化**: 自动余额管理、Irys Balance Approval、本地签名，最小化弹窗
20. **按需加载**: 文章详情页并行加载 Subsquid 和 Irys 数据，优先展示 Irys 内容

---

## 开发指南

### 智能合约开发
- 使用 Foundry 进行开发、测试、部署
- 新增功能时遵循现有的参数结构体模式（避免 Stack Too Deep）
- 所有时间戳使用 uint64（秒级）或 uint48（ERC-4337 标准）
- 重要操作需要权限检查和事件发出

### 前端开发
- 新增页面在 src/routes/ 创建目录
- 组件放在 src/lib/components/,遵循单一职责
- 链上交互统一通过 src/lib/contracts.ts
- Session Key 管理通过 src/lib/sessionKey.ts,使用 `ensureSessionKeyReady`
- 文章发布通过 src/lib/publish.ts 编排
- 配置管理使用 src/lib/stores/config.svelte.ts,支持环境切换
- 工具函数放在 src/lib/utils/ 或对应模块
- 使用 TailwindCSS 进行样式设计

### 链上索引开发
- 新增事件在 src/processor.ts 添加 topic
- 事件处理在 src/main.ts 实现
- 数据模型在 src/model/ 定义
- 修改 schema.graphql 后运行 `sqd codegen`
- 修改数据库结构后运行 `sqd migration:generate`

### Arweave 存储
- 使用 Irys Mutable Folders 存储文章(index.md、coverImage、内容图片)
- 前端通过 src/lib/arweave/ 上传
- 支持 MetaMask 和 Session Key 两种模式
- 加密文章使用两阶段上传(先占位符,后加密更新)

### 部署流程
1. 部署智能合约到目标链(Foundry)
2. 更新 src/lib/chains.ts 中的合约地址
3. 部署 Subsquid 索引(Subsquid Cloud 或自托管)
4. 配置 src/lib/stores/config.svelte.ts 环境默认值
5. 部署前端(Vercel、Netlify 等)

---

## 关键概念

### Session Keys 工作流
1. 前端生成临时密钥对(Ephemeral Key Pair)
2. 主钱包签名授权临时公钥(唯一弹窗,注册到链)
3. 临时私钥保存在 LocalStorage
4. 自动检查和充值 Session Key ETH 余额(按需弹窗)
5. 创建 Irys Balance Approval(按需弹窗)
6. 后续操作由临时私钥本地签名,无需唤起钱包
7. 链上 SessionKeyManager 验证授权有效性
8. 支持权限限制(指定合约和函数)、时间限制(最长 7 天)、消费限额
9. 使用 `ensureSessionKeyReady` 统一准备流程,最小化弹窗次数

### Gas 代付机制
- **Sponsor 模式**: 项目方存款到 BlogPaymaster，授权用户使用其余额
- **Token 模式**: 用户使用 ERC-20 代币支付 Gas，TokenPaymaster 自动转换为 ETH

### 数据流
1. 用户发布文章 → 文章内容上传到 Arweave（获得 arweaveId）→ 调用 BlogHub.publish() 记录链上 → Subsquid 监听事件 → 索引数据 → GraphQL 查询
2. 用户评价文章 → 调用 BlogHub.evaluate() → Subsquid 监听 ArticleEvaluated 事件 → 更新评价数据
3. 用户评论 → 调用 BlogHub.addComment() → Subsquid 监听 CommentAdded 事件 → 更新评论数据

