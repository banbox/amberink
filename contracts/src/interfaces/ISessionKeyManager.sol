// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/**
 * @title ISessionKeyManager
 * @dev Session Key 管理器接口
 * 
 * Session Key 机制允许用户授权临时密钥代表其执行特定操作，
 * 实现无感交互体验（类似 Web2）。
 */
interface ISessionKeyManager {
    // --- 结构体 ---
    
    /**
     * @dev Session Key 配置
     * @param sessionKey 临时公钥地址
     * @param validAfter 生效时间戳
     * @param validUntil 过期时间戳
     * @param allowedContract 允许调用的合约地址
     * @param allowedSelectors 允许调用的函数选择器列表
     * @param spendingLimit 消费限额（wei）
     * @param spentAmount 已消费金额
     * @param nonce 防重放 nonce
     */
    struct SessionKeyData {
        address sessionKey;
        uint48 validAfter;
        uint48 validUntil;
        address allowedContract;
        bytes4[] allowedSelectors;
        uint256 spendingLimit;
        uint256 spentAmount;
        uint256 nonce;
    }

    // --- 事件 ---
    
    event SessionKeyRegistered(
        address indexed owner,
        address indexed sessionKey,
        address allowedContract,
        uint48 validAfter,
        uint48 validUntil,
        uint256 spendingLimit
    );
    
    event SessionKeyRevoked(
        address indexed owner,
        address indexed sessionKey
    );
    
    event SessionKeyUsed(
        address indexed owner,
        address indexed sessionKey,
        address target,
        bytes4 selector,
        uint256 value
    );

    // --- 函数 ---
    
    /**
     * @notice 注册一个新的 Session Key
     * @param sessionKey 临时公钥地址
     * @param validAfter 生效时间戳
     * @param validUntil 过期时间戳
     * @param allowedContract 允许调用的合约地址
     * @param allowedSelectors 允许调用的函数选择器
     * @param spendingLimit 消费限额
     */
    function registerSessionKey(
        address sessionKey,
        uint48 validAfter,
        uint48 validUntil,
        address allowedContract,
        bytes4[] calldata allowedSelectors,
        uint256 spendingLimit
    ) external;

    /**
     * @notice 撤销一个 Session Key
     * @param sessionKey 要撤销的临时公钥地址
     */
    function revokeSessionKey(address sessionKey) external;

    /**
     * @notice 验证 Session Key 是否有效
     * @param owner 主账户地址
     * @param sessionKey 临时公钥地址
     * @param target 目标合约地址
     * @param selector 函数选择器
     * @param value 交易金额
     * @return valid 是否有效
     */
    function validateSessionKey(
        address owner,
        address sessionKey,
        address target,
        bytes4 selector,
        uint256 value
    ) external view returns (bool valid);

    /**
     * @notice 获取 Session Key 数据
     * @param owner 主账户地址
     * @param sessionKey 临时公钥地址
     */
    function getSessionKeyData(
        address owner,
        address sessionKey
    ) external view returns (SessionKeyData memory);

    /**
     * @notice 检查 Session Key 是否已注册且有效
     * @param owner 主账户地址
     * @param sessionKey 临时公钥地址
     */
    function isSessionKeyActive(
        address owner,
        address sessionKey
    ) external view returns (bool);

    /**
     * @notice 验证并执行 Session Key 操作
     * @dev 由目标合约调用，验证 Session Key 签名并更新状态
     * @param owner 主账户地址
     * @param sessionKey Session Key 地址
     * @param target 目标合约地址
     * @param selector 函数选择器
     * @param callData 调用数据
     * @param value 交易金额
     * @param deadline 签名过期时间
     * @param signature Session Key 签名
     * @return success 是否验证成功
     */
    function validateAndUseSessionKey(
        address owner,
        address sessionKey,
        address target,
        bytes4 selector,
        bytes calldata callData,
        uint256 value,
        uint256 deadline,
        bytes calldata signature
    ) external returns (bool success);
}
