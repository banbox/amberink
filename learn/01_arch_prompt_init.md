# Role
你现在的身份是 Web3 领域的 **首席系统架构师 (Chief Architect)**，精通 Solidity 智能合约设计、Foundry 开发框架、The Graph 索引协议以及 SvelteKit 前端开发。

# Goal
请为我设计一份 **去中心化博客平台（类似 Mirror.xyz）** 的详细技术架构方案。
该方案的目标是供高级开发者直接参考并开始编码，因此需要包含具体的接口定义、数据结构和技术选型理由。

# Technical Constraints & Stack
1.  **核心业务逻辑 (High Fidelity)**：
    -   **文章即 NFT**：每篇文章发布时，本质上是铸造（Mint）了一个 NFT（或部署了一个相关合约），用户可以“收藏（Collect）”文章。
    -   **内容存储**：文章的具体内容（Markdown）和元数据（Metadata）存储在 IPFS 上。
2.  **区块链网络**：Optimism (L2)。
3.  **智能合约**：
    -   语言：Solidity。
    -   工具：Foundry。
    -   模式建议：请权衡“工厂模式（为每篇文章部署新合约）”与“单体 ERC-1155 模式”的优劣，并推荐一种最适合 Mirror 仿盘的方案。
4.  **数据索引**：必须使用 **The Graph** 构建 Subgraph，用于查询“某用户的所有文章”、“文章详情”等数据，前端不直接读取合约状态。
5.  **前端框架**：**SvelteKit**。
    -   注意：鉴于 Web3 生态对 React 的偏向，请特别说明在 SvelteKit 中如何优雅地处理钱包连接（Wallet Connection）和合约交互（建议基于 Viem 或 Wagmi Core）。

# Deliverables (Output Requirements)
请按照以下结构输出方案：

## 1. 系统架构全景图 (System Architecture)
使用 Mermaid 语法绘制流程图，展示：
User -> SvelteKit Client -> IPFS (Upload) -> Optimism (Mint) -> The Graph (Index) -> Client (Query) 的完整数据流闭环。

## 2. 智能合约设计 (Smart Contract Design)
不要写完整的代码，但必须提供核心合约的 **Interface 定义** 和 **核心数据结构 (Structs)**。
-   解释你选择的 NFT 标准（ERC-721 vs 1155）及其理由。
-   定义 `publish(string memory ipfsHash, ...)` 函数的签名。
-   定义 `collect(uint256 articleId)` 的逻辑思路。

## 3. The Graph 索引设计 (Subgraph Schema)
提供 `schema.graphql` 的草稿，定义实体（Entities），例如：
-   `User` (Author/Collector)
-   `Article` (包含 contentURI, timestamp, owner, collectorCount 等)
-   `Collection` (记录收藏关系)

## 4. 前端集成策略 (SvelteKit Specifics)
-   推荐适用于 Svelte 的 Web3 库组合（例如：`@wagmi/core` + `viem` + 自定义 Store）。
-   展示一段伪代码：如何在 Svelte 组件中通过 GraphQL Client (urql/apollo) 获取文章列表。

## 5. 项目目录结构 (Project Structure)
推荐一个 Monorepo 结构，包含 `contracts/`, `subgraph/`, `web/` 的组织方式。

---
请开始你的设计，确保方案具备**可落地性**和**专业深度**。