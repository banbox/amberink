// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/**
 * @title ITokenPriceFeed
 * @dev 代币价格预言机接口，用于获取 ERC-20 代币与 ETH 的汇率
 * 兼容 Chainlink AggregatorV3Interface
 */
interface ITokenPriceFeed {
    /**
     * @dev 获取代币相对于 ETH 的价格
     * @return price 价格（18 位精度，表示 1 个代币值多少 ETH）
     *         例如：如果 1 USDC = 0.0005 ETH，返回 500000000000000 (0.0005 * 1e18)
     */
    function getTokenToEthPrice() external view returns (uint256 price);

    /**
     * @dev 获取价格精度
     * @return decimals 价格的小数位数
     */
    function decimals() external view returns (uint8);

    /**
     * @dev 获取最新价格数据（Chainlink 兼容）
     * @return roundId 轮次 ID
     * @return answer 价格
     * @return startedAt 开始时间
     * @return updatedAt 更新时间
     * @return answeredInRound 回答轮次
     */
    function latestRoundData()
        external
        view
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        );
}

/**
 * @title ITokenPriceOracle
 * @dev 简化的价格预言机接口，用于 BlogTokenPaymaster
 */
interface ITokenPriceOracle {
    /**
     * @dev 获取将指定数量的代币兑换为 ETH 所需的代币数量
     * @param token 代币地址
     * @param ethAmount 需要的 ETH 数量（wei）
     * @return tokenAmount 所需的代币数量
     */
    function getTokenAmountForEth(
        address token,
        uint256 ethAmount
    ) external view returns (uint256 tokenAmount);

    /**
     * @dev 获取指定数量代币可兑换的 ETH 数量
     * @param token 代币地址
     * @param tokenAmount 代币数量
     * @return ethAmount 可兑换的 ETH 数量（wei）
     */
    function getEthAmountForToken(
        address token,
        uint256 tokenAmount
    ) external view returns (uint256 ethAmount);

    /**
     * @dev 检查代币是否被支持
     * @param token 代币地址
     * @return supported 是否支持
     */
    function isTokenSupported(address token) external view returns (bool supported);
}
