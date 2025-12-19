// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/**
 * @title CallDataParser
 * @dev 用于解析 ERC-4337 UserOperation callData 的工具库
 */
library CallDataParser {
    /**
     * @dev 从 callData 中提取目标合约地址和函数选择器
     * 支持两种格式：
     * 1. 直接调用: selector + params
     * 2. execute 调用: execute(address dest, uint256 value, bytes func)
     * 
     * ABI 编码布局 for execute(address dest, uint256 value, bytes calldata func):
     * - bytes 0-3: selector (0xb61d27f6)
     * - bytes 4-35: dest (address, 左填充 12 字节)
     * - bytes 36-67: value (uint256)
     * - bytes 68-99: offset to func data (通常是 0x60 = 96)
     * - bytes 100-131: func length
     * - bytes 132+: func data (包含内部函数的 selector)
     */
    function extractTargetAndSelector(bytes calldata callData) internal pure returns (address target, bytes4 selector) {
        if (callData.length < 4) {
            return (address(0), bytes4(0));
        }
        
        selector = bytes4(callData[:4]);
        
        // 检查是否是 execute 函数 (0xb61d27f6)
        // execute(address dest, uint256 value, bytes calldata func)
        if (selector == bytes4(0xb61d27f6) && callData.length >= 100) {
            // 解析 dest 地址 (bytes 4-35, 取后 20 字节)
            target = address(uint160(uint256(bytes32(callData[4:36]))));
            // 解析内部函数选择器
            // func offset 在 bytes 68-99
            uint256 funcOffset = uint256(bytes32(callData[68:100]));
            // func 数据起始位置 = 4 (selector) + funcOffset
            uint256 funcStart = 4 + funcOffset;
            // func 数据的前 32 字节是长度，之后是实际数据
            if (callData.length >= funcStart + 36) {
                // 内部函数的 selector 在 func 数据的前 4 字节
                selector = bytes4(callData[funcStart + 32:funcStart + 36]);
            }
        } else {
            // 直接调用，target 需要从 UserOp 的其他字段获取
            // 这里返回 address(0)，由调用方处理
            target = address(0);
        }
    }
}
