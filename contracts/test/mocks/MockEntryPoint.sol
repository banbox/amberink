// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IEntryPoint, PackedUserOperation} from "../../src/interfaces/IEntryPoint.sol";

/**
 * @title MockEntryPoint
 * @dev 用于测试的 EntryPoint Mock 合约
 */
contract MockEntryPoint is IEntryPoint {
    mapping(address => uint256) private _balances;
    mapping(address => uint256) private _nonces;
    
    // Stake 信息
    struct StakeInfo {
        uint112 stake;
        uint32 unstakeDelaySec;
        uint48 withdrawTime;
        bool staked;
    }
    mapping(address => StakeInfo) private _stakes;

    // 用于测试的事件
    event UserOpHandled(address indexed sender, bytes32 userOpHash);
    event Deposited(address indexed account, uint256 amount);
    event Withdrawn(address indexed account, uint256 amount);
    event StakeAdded(address indexed account, uint256 amount, uint32 unstakeDelaySec);
    event StakeUnlocked(address indexed account);
    event StakeWithdrawn(address indexed account, uint256 amount);

    function handleOps(
        PackedUserOperation[] calldata ops,
        address payable beneficiary
    ) external override {
        for (uint256 i = 0; i < ops.length; i++) {
            bytes32 userOpHash = keccak256(abi.encode(ops[i]));
            emit UserOpHandled(ops[i].sender, userOpHash);
        }
        // 抑制未使用参数警告
        beneficiary;
    }

    function balanceOf(address account) external view override returns (uint256) {
        return _balances[account];
    }

    function depositTo(address account) external payable override {
        _balances[account] += msg.value;
        emit Deposited(account, msg.value);
    }

    function withdrawTo(
        address payable withdrawAddress,
        uint256 withdrawAmount
    ) external override {
        require(_balances[msg.sender] >= withdrawAmount, "Insufficient balance");
        _balances[msg.sender] -= withdrawAmount;
        (bool success, ) = withdrawAddress.call{value: withdrawAmount}("");
        require(success, "Transfer failed");
        emit Withdrawn(msg.sender, withdrawAmount);
    }

    function getNonce(
        address sender,
        uint192 key
    ) external view override returns (uint256 nonce) {
        return _nonces[sender] + uint256(key);
    }

    function addStake(uint32 unstakeDelaySec) external payable override {
        _stakes[msg.sender] = StakeInfo({
            stake: uint112(msg.value),
            unstakeDelaySec: unstakeDelaySec,
            withdrawTime: 0,
            staked: true
        });
        emit StakeAdded(msg.sender, msg.value, unstakeDelaySec);
    }

    function unlockStake() external override {
        StakeInfo storage info = _stakes[msg.sender];
        require(info.staked, "Not staked");
        info.withdrawTime = uint48(block.timestamp + info.unstakeDelaySec);
        emit StakeUnlocked(msg.sender);
    }

    function withdrawStake(address payable withdrawAddress) external override {
        StakeInfo storage info = _stakes[msg.sender];
        require(info.staked, "Not staked");
        require(info.withdrawTime > 0, "Not unlocked");
        require(block.timestamp >= info.withdrawTime, "Stake locked");
        
        uint256 amount = info.stake;
        delete _stakes[msg.sender];
        
        (bool success, ) = withdrawAddress.call{value: amount}("");
        require(success, "Transfer failed");
        emit StakeWithdrawn(msg.sender, amount);
    }

    function getDepositInfo(address account) external view override returns (
        uint256 deposit,
        bool staked,
        uint112 stake,
        uint32 unstakeDelaySec,
        uint48 withdrawTime
    ) {
        StakeInfo storage info = _stakes[account];
        return (
            _balances[account],
            info.staked,
            info.stake,
            info.unstakeDelaySec,
            info.withdrawTime
        );
    }

    // ============ 测试辅助函数 ============

    /// @dev 直接设置余额（用于测试）
    function setBalance(address account, uint256 amount) external {
        _balances[account] = amount;
    }

    /// @dev 增加 nonce（用于测试）
    function incrementNonce(address account) external {
        _nonces[account]++;
    }

    /// @dev 接收 ETH
    receive() external payable {}
}
