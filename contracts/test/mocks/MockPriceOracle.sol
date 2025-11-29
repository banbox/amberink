// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {ITokenPriceOracle} from "../../src/interfaces/ITokenPriceFeed.sol";

/**
 * @title MockPriceOracle
 * @dev 用于测试的价格预言机 Mock 合约
 */
contract MockPriceOracle is ITokenPriceOracle {
    // token => price (18 decimals, 表示 1 个代币最小单位值多少 wei)
    mapping(address => uint256) public tokenPrices;
    mapping(address => uint8) public tokenDecimals;
    mapping(address => bool) public supportedTokens;

    /**
     * @dev 设置代币价格
     * @param token 代币地址
     * @param decimals_ 代币精度
     * @param pricePerToken 每个完整代币的 ETH 价格（18 位精度）
     *        例如：1 USDC = 0.0005 ETH，传入 500000000000000 (0.0005 * 1e18)
     */
    function setTokenPrice(
        address token,
        uint8 decimals_,
        uint256 pricePerToken
    ) external {
        tokenPrices[token] = pricePerToken;
        tokenDecimals[token] = decimals_;
        supportedTokens[token] = true;
    }

    function removeToken(address token) external {
        supportedTokens[token] = false;
    }

    /**
     * @notice 获取将指定数量的 ETH 兑换所需的代币数量
     * @param token 代币地址
     * @param ethAmount 需要的 ETH 数量（wei）
     * @return tokenAmount 所需的代币数量（代币最小单位）
     */
    function getTokenAmountForEth(
        address token,
        uint256 ethAmount
    ) external view override returns (uint256 tokenAmount) {
        require(supportedTokens[token], "Token not supported");
        uint256 pricePerToken = tokenPrices[token];
        require(pricePerToken > 0, "Price not set");
        
        // tokenAmount = ethAmount / pricePerToken * 10^decimals
        // 为了精度，先乘后除
        uint8 decimals_ = tokenDecimals[token];
        tokenAmount = (ethAmount * (10 ** decimals_)) / pricePerToken;
    }

    /**
     * @notice 获取指定数量代币可兑换的 ETH 数量
     * @param token 代币地址
     * @param tokenAmount 代币数量（代币最小单位）
     * @return ethAmount 可兑换的 ETH 数量（wei）
     */
    function getEthAmountForToken(
        address token,
        uint256 tokenAmount
    ) external view override returns (uint256 ethAmount) {
        require(supportedTokens[token], "Token not supported");
        uint256 pricePerToken = tokenPrices[token];
        
        // ethAmount = tokenAmount * pricePerToken / 10^decimals
        uint8 decimals_ = tokenDecimals[token];
        ethAmount = (tokenAmount * pricePerToken) / (10 ** decimals_);
    }

    function isTokenSupported(address token) external view override returns (bool) {
        return supportedTokens[token];
    }
}
