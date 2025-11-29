// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {ITokenPriceOracle, ITokenPriceFeed} from "./interfaces/ITokenPriceFeed.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title TokenPriceOracle
 * @dev 代币价格预言机实现，支持 Chainlink 价格源和手动设置价格
 * 
 * 支持两种模式：
 * 1. Chainlink 模式：使用 Chainlink 价格源获取实时价格
 * 2. 手动模式：管理员手动设置价格（用于测试或无 Chainlink 支持的代币）
 * 
 * 价格计算说明：
 * - 所有价格以 18 位精度存储
 * - tokenToEthPrice 表示 1 个代币（最小单位）值多少 ETH（wei）
 * - 例如：1 USDC (6 decimals) = 0.0005 ETH
 *   tokenToEthPrice = 0.0005 * 1e18 / 1e6 = 500000000000 (每个 USDC 最小单位的 ETH 价值)
 */
contract TokenPriceOracle is ITokenPriceOracle, Ownable {
    // --- 错误定义 ---
    error TokenNotSupported();
    error InvalidPrice();
    error ZeroAddress();
    error StalePrice();

    // --- 事件定义 ---
    event TokenPriceUpdated(address indexed token, uint256 price);
    event ChainlinkFeedUpdated(address indexed token, address indexed feed);
    event TokenSupportUpdated(address indexed token, bool supported);
    event StalePriceThresholdUpdated(uint256 newThreshold);

    // --- 结构体 ---
    struct TokenConfig {
        bool supported;
        bool useChainlink;
        address chainlinkFeed;      // Chainlink 价格源地址
        uint8 tokenDecimals;        // 代币精度
        uint256 manualPrice;        // 手动设置的价格（18 位精度）
        uint256 lastUpdateTime;     // 最后更新时间
    }

    // --- 状态变量 ---
    
    /// @notice 代币配置
    mapping(address => TokenConfig) public tokenConfigs;

    /// @notice 价格过期阈值（秒），默认 1 小时
    uint256 public stalePriceThreshold;

    /// @notice 价格精度
    uint256 public constant PRICE_PRECISION = 1e18;

    // --- 构造函数 ---
    constructor(address _owner) Ownable(_owner) {
        stalePriceThreshold = 3600; // 1 小时
    }

    // =============================================================
    //                      ITokenPriceOracle 实现
    // =============================================================

    /**
     * @notice 获取将指定数量的 ETH 兑换所需的代币数量
     * @param token 代币地址
     * @param ethAmount 需要的 ETH 数量（wei）
     * @return tokenAmount 所需的代币数量
     */
    function getTokenAmountForEth(
        address token,
        uint256 ethAmount
    ) external view override returns (uint256 tokenAmount) {
        TokenConfig memory config = tokenConfigs[token];
        if (!config.supported) revert TokenNotSupported();
        
        uint256 tokenToEthPrice = _getTokenToEthPrice(token, config);
        if (tokenToEthPrice == 0) revert InvalidPrice();
        
        // tokenAmount = ethAmount / tokenToEthPrice * tokenDecimals
        // 为了精度，先乘后除
        tokenAmount = (ethAmount * (10 ** config.tokenDecimals)) / tokenToEthPrice;
    }

    /**
     * @notice 获取指定数量代币可兑换的 ETH 数量
     * @param token 代币地址
     * @param tokenAmount 代币数量
     * @return ethAmount 可兑换的 ETH 数量（wei）
     */
    function getEthAmountForToken(
        address token,
        uint256 tokenAmount
    ) external view override returns (uint256 ethAmount) {
        TokenConfig memory config = tokenConfigs[token];
        if (!config.supported) revert TokenNotSupported();
        
        uint256 tokenToEthPrice = _getTokenToEthPrice(token, config);
        
        // ethAmount = tokenAmount * tokenToEthPrice / tokenDecimals
        ethAmount = (tokenAmount * tokenToEthPrice) / (10 ** config.tokenDecimals);
    }

    /**
     * @notice 检查代币是否被支持
     * @param token 代币地址
     */
    function isTokenSupported(address token) external view override returns (bool) {
        return tokenConfigs[token].supported;
    }

    // =============================================================
    //                      内部函数
    // =============================================================

    /**
     * @dev 获取代币的 ETH 价格
     * @param token 代币地址
     * @param config 代币配置
     * @return price 价格（18 位精度）
     */
    function _getTokenToEthPrice(
        address token,
        TokenConfig memory config
    ) internal view returns (uint256 price) {
        if (config.useChainlink && config.chainlinkFeed != address(0)) {
            return _getChainlinkPrice(config.chainlinkFeed);
        } else {
            // 检查手动价格是否过期
            if (block.timestamp > config.lastUpdateTime + stalePriceThreshold) {
                revert StalePrice();
            }
            return config.manualPrice;
        }
    }

    /**
     * @dev 从 Chainlink 获取价格
     * @param feed Chainlink 价格源地址
     * @return price 价格（18 位精度）
     */
    function _getChainlinkPrice(address feed) internal view returns (uint256 price) {
        ITokenPriceFeed priceFeed = ITokenPriceFeed(feed);
        
        (
            ,
            int256 answer,
            ,
            uint256 updatedAt,
        ) = priceFeed.latestRoundData();
        
        // 检查价格是否过期
        if (block.timestamp > updatedAt + stalePriceThreshold) {
            revert StalePrice();
        }
        
        if (answer <= 0) revert InvalidPrice();
        
        // 转换为 18 位精度
        uint8 feedDecimals = priceFeed.decimals();
        if (feedDecimals < 18) {
            price = uint256(answer) * (10 ** (18 - feedDecimals));
        } else if (feedDecimals > 18) {
            price = uint256(answer) / (10 ** (feedDecimals - 18));
        } else {
            price = uint256(answer);
        }
    }

    // =============================================================
    //                      管理功能
    // =============================================================

    /**
     * @notice 添加支持的代币（手动价格模式）
     * @param token 代币地址
     * @param tokenDecimals 代币精度
     * @param initialPrice 初始价格（18 位精度，表示 1 个代币最小单位值多少 wei）
     */
    function addToken(
        address token,
        uint8 tokenDecimals,
        uint256 initialPrice
    ) external onlyOwner {
        if (token == address(0)) revert ZeroAddress();
        if (initialPrice == 0) revert InvalidPrice();
        
        tokenConfigs[token] = TokenConfig({
            supported: true,
            useChainlink: false,
            chainlinkFeed: address(0),
            tokenDecimals: tokenDecimals,
            manualPrice: initialPrice,
            lastUpdateTime: block.timestamp
        });
        
        emit TokenSupportUpdated(token, true);
        emit TokenPriceUpdated(token, initialPrice);
    }

    /**
     * @notice 添加支持的代币（Chainlink 模式）
     * @param token 代币地址
     * @param tokenDecimals 代币精度
     * @param chainlinkFeed Chainlink 价格源地址
     */
    function addTokenWithChainlink(
        address token,
        uint8 tokenDecimals,
        address chainlinkFeed
    ) external onlyOwner {
        if (token == address(0)) revert ZeroAddress();
        if (chainlinkFeed == address(0)) revert ZeroAddress();
        
        tokenConfigs[token] = TokenConfig({
            supported: true,
            useChainlink: true,
            chainlinkFeed: chainlinkFeed,
            tokenDecimals: tokenDecimals,
            manualPrice: 0,
            lastUpdateTime: block.timestamp
        });
        
        emit TokenSupportUpdated(token, true);
        emit ChainlinkFeedUpdated(token, chainlinkFeed);
    }

    /**
     * @notice 更新代币的手动价格
     * @param token 代币地址
     * @param newPrice 新价格（18 位精度）
     */
    function updatePrice(address token, uint256 newPrice) external onlyOwner {
        TokenConfig storage config = tokenConfigs[token];
        if (!config.supported) revert TokenNotSupported();
        if (newPrice == 0) revert InvalidPrice();
        
        config.manualPrice = newPrice;
        config.lastUpdateTime = block.timestamp;
        config.useChainlink = false;
        
        emit TokenPriceUpdated(token, newPrice);
    }

    /**
     * @notice 更新代币的 Chainlink 价格源
     * @param token 代币地址
     * @param chainlinkFeed 新的 Chainlink 价格源地址
     */
    function updateChainlinkFeed(address token, address chainlinkFeed) external onlyOwner {
        TokenConfig storage config = tokenConfigs[token];
        if (!config.supported) revert TokenNotSupported();
        if (chainlinkFeed == address(0)) revert ZeroAddress();
        
        config.chainlinkFeed = chainlinkFeed;
        config.useChainlink = true;
        config.lastUpdateTime = block.timestamp;
        
        emit ChainlinkFeedUpdated(token, chainlinkFeed);
    }

    /**
     * @notice 移除代币支持
     * @param token 代币地址
     */
    function removeToken(address token) external onlyOwner {
        tokenConfigs[token].supported = false;
        emit TokenSupportUpdated(token, false);
    }

    /**
     * @notice 设置价格过期阈值
     * @param newThreshold 新阈值（秒）
     */
    function setStalePriceThreshold(uint256 newThreshold) external onlyOwner {
        stalePriceThreshold = newThreshold;
        emit StalePriceThresholdUpdated(newThreshold);
    }

    // =============================================================
    //                      视图函数
    // =============================================================

    /**
     * @notice 获取代币的当前价格
     * @param token 代币地址
     * @return price 价格（18 位精度）
     */
    function getTokenPrice(address token) external view returns (uint256 price) {
        TokenConfig memory config = tokenConfigs[token];
        if (!config.supported) revert TokenNotSupported();
        return _getTokenToEthPrice(token, config);
    }

    /**
     * @notice 获取代币的完整配置
     * @param token 代币地址
     */
    function getTokenConfig(address token) external view returns (
        bool supported,
        bool useChainlink,
        address chainlinkFeed,
        uint8 tokenDecimals,
        uint256 manualPrice,
        uint256 lastUpdateTime
    ) {
        TokenConfig memory config = tokenConfigs[token];
        return (
            config.supported,
            config.useChainlink,
            config.chainlinkFeed,
            config.tokenDecimals,
            config.manualPrice,
            config.lastUpdateTime
        );
    }
}
