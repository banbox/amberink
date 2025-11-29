// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/**
 * @dev ERC-4337 UserOperation 结构体 (PackedUserOperation for v0.7+)
 */
struct PackedUserOperation {
    address sender;
    uint256 nonce;
    bytes initCode;
    bytes callData;
    bytes32 accountGasLimits; // packed: validationGasLimit (16 bytes) | callGasLimit (16 bytes)
    uint256 preVerificationGas;
    bytes32 gasFees; // packed: maxPriorityFeePerGas (16 bytes) | maxFeePerGas (16 bytes)
    bytes paymasterAndData;
    bytes signature;
}

/**
 * @dev ERC-4337 EntryPoint 接口 (简化版，仅包含 Paymaster 所需部分)
 */
interface IEntryPoint {
    /**
     * @dev 执行一批 UserOperations
     */
    function handleOps(
        PackedUserOperation[] calldata ops,
        address payable beneficiary
    ) external;

    /**
     * @dev 获取账户的 deposit 余额
     */
    function balanceOf(address account) external view returns (uint256);

    /**
     * @dev 向 EntryPoint 存款
     */
    function depositTo(address account) external payable;

    /**
     * @dev 从 EntryPoint 提款
     */
    function withdrawTo(
        address payable withdrawAddress,
        uint256 withdrawAmount
    ) external;

    /**
     * @dev 获取账户的 nonce
     */
    function getNonce(
        address sender,
        uint192 key
    ) external view returns (uint256 nonce);

    /**
     * @dev 添加 stake（Paymaster 必须有 stake 才能工作）
     * @param unstakeDelaySec 解锁延迟时间（秒）
     */
    function addStake(uint32 unstakeDelaySec) external payable;

    /**
     * @dev 解锁 stake
     */
    function unlockStake() external;

    /**
     * @dev 提取 stake（需要先 unlockStake 并等待延迟时间）
     * @param withdrawAddress 提取地址
     */
    function withdrawStake(address payable withdrawAddress) external;

    /**
     * @dev 获取账户的 deposit 信息
     */
    function getDepositInfo(address account) external view returns (
        uint256 deposit,
        bool staked,
        uint112 stake,
        uint32 unstakeDelaySec,
        uint48 withdrawTime
    );
}
