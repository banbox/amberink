// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {ISessionKeyManager} from "./interfaces/ISessionKeyManager.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title SessionKeyManager
 * @dev Session Key 管理合约
 * 
 * 实现 Session Keys 机制，允许用户授权临时密钥代表其执行特定操作。
 * 
 * 工作流程：
 * 1. 用户在前端生成临时密钥对（Ephemeral Key Pair）
 * 2. 用户使用主钱包签名授权该临时公钥（唯一一次弹窗）
 * 3. 临时私钥保存在浏览器本地存储
 * 4. 后续操作由临时私钥签名，无需唤起钱包
 * 5. 合约验证：临时公钥签名 + 主账户授权
 * 
 * 安全特性：
 * - 时间限制：Session Key 有明确的生效和过期时间
 * - 权限限制：只能调用指定合约的指定函数
 * - 消费限额：限制 Session Key 可消费的最大金额
 * - 可撤销：主账户可随时撤销 Session Key
 */
contract SessionKeyManager is ISessionKeyManager, EIP712, ReentrancyGuard {
    using ECDSA for bytes32;

    // --- 错误定义 ---
    error InvalidSessionKey();
    error SessionKeyExpired();
    error SessionKeyNotActive();
    error SessionKeyAlreadyExists();
    error UnauthorizedContract();
    error UnauthorizedSelector();
    error SpendingLimitExceeded();
    error InvalidSignature();
    error InvalidTimeRange();
    error ZeroAddress();
    error SignatureExpired();
    error InvalidNonce();

    // --- 常量 ---
    
    // EIP-712 TypeHash for session key registration
    bytes32 private constant REGISTER_SESSION_KEY_TYPEHASH = keccak256(
        "RegisterSessionKey(address owner,address sessionKey,uint48 validAfter,uint48 validUntil,address allowedContract,bytes4[] allowedSelectors,uint256 spendingLimit,uint256 nonce,uint256 deadline)"
    );

    // EIP-712 TypeHash for session key operation
    bytes32 private constant SESSION_OPERATION_TYPEHASH = keccak256(
        "SessionOperation(address owner,address sessionKey,address target,bytes4 selector,bytes callData,uint256 value,uint256 nonce,uint256 deadline)"
    );

    // 最大 Session Key 有效期（7 天）
    uint48 public constant MAX_SESSION_DURATION = 7 days;

    // --- 状态变量 ---
    
    /// @notice 存储 Session Key 数据: owner => sessionKey => SessionKeyData
    mapping(address => mapping(address => SessionKeyData)) private _sessionKeys;
    
    /// @notice 主账户的 nonce（用于注册签名防重放）
    mapping(address => uint256) public ownerNonces;

    // --- 构造函数 ---
    constructor() EIP712("SessionKeyManager", "1") {}

    // =============================================================
    //                      Session Key 注册
    // =============================================================

    /**
     * @notice 注册一个新的 Session Key（由主账户直接调用）
     */
    function registerSessionKey(
        address sessionKey,
        uint48 validAfter,
        uint48 validUntil,
        address allowedContract,
        bytes4[] calldata allowedSelectors,
        uint256 spendingLimit
    ) external override {
        _registerSessionKey(
            msg.sender,
            sessionKey,
            validAfter,
            validUntil,
            allowedContract,
            allowedSelectors,
            spendingLimit
        );
    }

    /**
     * @notice 通过签名注册 Session Key（允许 Relayer 代提交）
     * @dev 主账户签名授权，Relayer 可以代为提交上链
     * @param owner 主账户地址
     * @param sessionKey 临时公钥地址
     * @param validAfter 生效时间戳
     * @param validUntil 过期时间戳
     * @param allowedContract 允许调用的合约地址
     * @param allowedSelectors 允许调用的函数选择器
     * @param spendingLimit 消费限额
     * @param deadline 签名过期时间
     * @param signature 主账户签名
     */
    function registerSessionKeyWithSignature(
        address owner,
        address sessionKey,
        uint48 validAfter,
        uint48 validUntil,
        address allowedContract,
        bytes4[] calldata allowedSelectors,
        uint256 spendingLimit,
        uint256 deadline,
        bytes calldata signature
    ) external {
        if (block.timestamp > deadline) revert SignatureExpired();

        uint256 currentNonce = ownerNonces[owner]++;

        // 构建 EIP-712 签名哈希
        bytes32 structHash = keccak256(
            abi.encode(
                REGISTER_SESSION_KEY_TYPEHASH,
                owner,
                sessionKey,
                validAfter,
                validUntil,
                allowedContract,
                keccak256(abi.encodePacked(allowedSelectors)),
                spendingLimit,
                currentNonce,
                deadline
            )
        );

        bytes32 hash = _hashTypedDataV4(structHash);
        address signer = ECDSA.recover(hash, signature);

        if (signer != owner) revert InvalidSignature();

        _registerSessionKey(
            owner,
            sessionKey,
            validAfter,
            validUntil,
            allowedContract,
            allowedSelectors,
            spendingLimit
        );
    }

    /**
     * @dev 内部函数：注册 Session Key
     */
    function _registerSessionKey(
        address owner,
        address sessionKey,
        uint48 validAfter,
        uint48 validUntil,
        address allowedContract,
        bytes4[] calldata allowedSelectors,
        uint256 spendingLimit
    ) internal {
        if (sessionKey == address(0)) revert ZeroAddress();
        if (allowedContract == address(0)) revert ZeroAddress();
        if (validAfter >= validUntil) revert InvalidTimeRange();
        if (validUntil - validAfter > MAX_SESSION_DURATION) revert InvalidTimeRange();
        
        // 检查是否已存在有效的 Session Key
        SessionKeyData storage existing = _sessionKeys[owner][sessionKey];
        if (existing.sessionKey != address(0) && existing.validUntil > block.timestamp) {
            revert SessionKeyAlreadyExists();
        }

        // 存储 Session Key 数据
        _sessionKeys[owner][sessionKey] = SessionKeyData({
            sessionKey: sessionKey,
            validAfter: validAfter,
            validUntil: validUntil,
            allowedContract: allowedContract,
            allowedSelectors: allowedSelectors,
            spendingLimit: spendingLimit,
            spentAmount: 0,
            nonce: 0
        });

        emit SessionKeyRegistered(
            owner,
            sessionKey,
            allowedContract,
            validAfter,
            validUntil,
            spendingLimit
        );
    }

    // =============================================================
    //                      Session Key 撤销
    // =============================================================

    /**
     * @notice 撤销一个 Session Key
     */
    function revokeSessionKey(address sessionKey) external override {
        SessionKeyData storage data = _sessionKeys[msg.sender][sessionKey];
        if (data.sessionKey == address(0)) revert InvalidSessionKey();

        delete _sessionKeys[msg.sender][sessionKey];

        emit SessionKeyRevoked(msg.sender, sessionKey);
    }

    // =============================================================
    //                      Session Key 验证
    // =============================================================

    /**
     * @notice 验证 Session Key 是否有效（视图函数）
     */
    function validateSessionKey(
        address owner,
        address sessionKey,
        address target,
        bytes4 selector,
        uint256 value
    ) external view override returns (bool valid) {
        return _validateSessionKeyInternal(owner, sessionKey, target, selector, value);
    }

    /**
     * @dev 内部验证函数
     */
    function _validateSessionKeyInternal(
        address owner,
        address sessionKey,
        address target,
        bytes4 selector,
        uint256 value
    ) internal view returns (bool) {
        SessionKeyData storage data = _sessionKeys[owner][sessionKey];

        // 检查 Session Key 是否存在
        if (data.sessionKey == address(0)) return false;

        // 检查时间有效性
        if (block.timestamp < data.validAfter) return false;
        if (block.timestamp > data.validUntil) return false;

        // 检查目标合约
        if (data.allowedContract != target) return false;

        // 检查函数选择器
        bool selectorAllowed = false;
        for (uint256 i = 0; i < data.allowedSelectors.length; i++) {
            if (data.allowedSelectors[i] == selector) {
                selectorAllowed = true;
                break;
            }
        }
        if (!selectorAllowed) return false;

        // 检查消费限额
        if (data.spentAmount + value > data.spendingLimit) return false;

        return true;
    }

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
    ) external nonReentrant returns (bool success) {
        if (block.timestamp > deadline) revert SignatureExpired();

        // 验证 Session Key 权限
        if (!_validateSessionKeyInternal(owner, sessionKey, target, selector, value)) {
            revert SessionKeyNotActive();
        }

        SessionKeyData storage data = _sessionKeys[owner][sessionKey];
        uint256 currentNonce = data.nonce++;

        // 验证 Session Key 签名
        bytes32 structHash = keccak256(
            abi.encode(
                SESSION_OPERATION_TYPEHASH,
                owner,
                sessionKey,
                target,
                selector,
                keccak256(callData),
                value,
                currentNonce,
                deadline
            )
        );

        bytes32 hash = _hashTypedDataV4(structHash);
        address signer = ECDSA.recover(hash, signature);

        if (signer != sessionKey) revert InvalidSignature();

        // 更新消费金额
        data.spentAmount += value;

        emit SessionKeyUsed(owner, sessionKey, target, selector, value);

        return true;
    }

    // =============================================================
    //                      视图函数
    // =============================================================

    /**
     * @notice 获取 Session Key 数据
     */
    function getSessionKeyData(
        address owner,
        address sessionKey
    ) external view override returns (SessionKeyData memory) {
        return _sessionKeys[owner][sessionKey];
    }

    /**
     * @notice 检查 Session Key 是否已注册且有效
     */
    function isSessionKeyActive(
        address owner,
        address sessionKey
    ) external view override returns (bool) {
        SessionKeyData storage data = _sessionKeys[owner][sessionKey];
        if (data.sessionKey == address(0)) return false;
        if (block.timestamp < data.validAfter) return false;
        if (block.timestamp > data.validUntil) return false;
        return true;
    }

    /**
     * @notice 获取 Session Key 剩余消费额度
     */
    function getRemainingSpendingLimit(
        address owner,
        address sessionKey
    ) external view returns (uint256) {
        SessionKeyData storage data = _sessionKeys[owner][sessionKey];
        if (data.spendingLimit <= data.spentAmount) return 0;
        return data.spendingLimit - data.spentAmount;
    }

    /**
     * @notice 获取 Session Key 允许的函数选择器
     */
    function getAllowedSelectors(
        address owner,
        address sessionKey
    ) external view returns (bytes4[] memory) {
        return _sessionKeys[owner][sessionKey].allowedSelectors;
    }

    /**
     * @notice 获取 EIP-712 域分隔符
     */
    function DOMAIN_SEPARATOR() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    /**
     * @notice 获取注册 Session Key 的 TypeHash
     */
    function REGISTER_TYPEHASH() external pure returns (bytes32) {
        return REGISTER_SESSION_KEY_TYPEHASH;
    }

    /**
     * @notice 获取 Session 操作的 TypeHash
     */
    function OPERATION_TYPEHASH() external pure returns (bytes32) {
        return SESSION_OPERATION_TYPEHASH;
    }
}
