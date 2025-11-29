// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {PackedUserOperation} from "./IEntryPoint.sol";

/**
 * @dev ERC-4337 Paymaster 接口
 */
interface IPaymaster {
    enum PostOpMode {
        opSucceeded,  // 操作成功
        opReverted,   // 操作回滚
        postOpReverted // postOp 回滚
    }

    /**
     * @dev 验证 paymaster 是否愿意为此 UserOperation 付款
     * @param userOp - 用户操作
     * @param userOpHash - 用户操作的哈希
     * @param maxCost - 此操作的最大 gas 成本
     * @return context - 传递给 postOp 的上下文数据
     * @return validationData - 签名和时间范围验证数据
     *         格式: (sigFailed (1 bit) | validUntil (48 bits) | validAfter (48 bits))
     *         sigFailed=1 表示签名验证失败
     */
    function validatePaymasterUserOp(
        PackedUserOperation calldata userOp,
        bytes32 userOpHash,
        uint256 maxCost
    ) external returns (bytes memory context, uint256 validationData);

    /**
     * @dev 操作执行后的回调
     * @param mode - 操作结果模式
     * @param context - validatePaymasterUserOp 返回的上下文
     * @param actualGasCost - 实际消耗的 gas 成本
     * @param actualUserOpFeePerGas - 实际的 gas 价格
     */
    function postOp(
        PostOpMode mode,
        bytes calldata context,
        uint256 actualGasCost,
        uint256 actualUserOpFeePerGas
    ) external;
}
