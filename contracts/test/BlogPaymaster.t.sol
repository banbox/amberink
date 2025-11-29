// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {BaseTest} from "./BaseTest.sol";
import {BlogPaymaster} from "../src/BlogPaymaster.sol";
import {IPaymaster} from "../src/interfaces/IPaymaster.sol";
import {PackedUserOperation} from "../src/interfaces/IEntryPoint.sol";

/**
 * @title BlogPaymasterTest
 * @dev BlogPaymaster 合约的单元测试
 */
contract BlogPaymasterTest is BaseTest {
    // ============ 事件定义 ============
    event Deposited(address indexed account, uint256 amount);
    event Withdrawn(address indexed account, uint256 amount);
    event ApprovalSet(address indexed owner, address indexed spender, uint256 amount);
    event GasPaid(
        address indexed sponsor,
        address indexed spender,
        uint256 amount,
        bytes32 userOpHash
    );
    event EntryPointDeposited(uint256 amount);
    event EntryPointWithdrawn(address indexed to, uint256 amount);
    event SessionKeyManagerUpdated(address indexed newManager);

    // ============ 资金管理测试 ============

    function test_Deposit_Success() public {
        uint256 depositAmount = 1 ether;

        vm.expectEmit(true, false, false, true);
        emit Deposited(user1, depositAmount);

        vm.prank(user1);
        paymaster.deposit{value: depositAmount}();

        assertEq(paymaster.balanceOf(user1), depositAmount);
    }

    function test_Deposit_RevertZeroAmount() public {
        vm.prank(user1);
        vm.expectRevert(BlogPaymaster.ZeroAmount.selector);
        paymaster.deposit{value: 0}();
    }

    function test_DepositTo_Success() public {
        uint256 depositAmount = 1 ether;

        vm.expectEmit(true, false, false, true);
        emit Deposited(user2, depositAmount);

        vm.prank(user1);
        paymaster.depositTo{value: depositAmount}(user2);

        assertEq(paymaster.balanceOf(user2), depositAmount);
    }

    function test_DepositTo_RevertZeroAddress() public {
        vm.prank(user1);
        vm.expectRevert(BlogPaymaster.ZeroAddress.selector);
        paymaster.depositTo{value: 1 ether}(address(0));
    }

    function test_Withdraw_Success() public {
        uint256 depositAmount = 2 ether;
        uint256 withdrawAmount = 1 ether;

        vm.startPrank(user1);
        paymaster.deposit{value: depositAmount}();
        
        uint256 balanceBefore = user1.balance;
        
        vm.expectEmit(true, false, false, true);
        emit Withdrawn(user1, withdrawAmount);
        
        paymaster.withdraw(withdrawAmount);
        vm.stopPrank();

        assertEq(paymaster.balanceOf(user1), depositAmount - withdrawAmount);
        assertEq(user1.balance, balanceBefore + withdrawAmount);
    }

    function test_Withdraw_RevertZeroAmount() public {
        vm.prank(user1);
        vm.expectRevert(BlogPaymaster.ZeroAmount.selector);
        paymaster.withdraw(0);
    }

    function test_Withdraw_RevertInsufficientBalance() public {
        vm.prank(user1);
        vm.expectRevert(BlogPaymaster.InsufficientBalance.selector);
        paymaster.withdraw(1 ether);
    }

    function test_WithdrawAll_Success() public {
        uint256 depositAmount = 2 ether;

        vm.startPrank(user1);
        paymaster.deposit{value: depositAmount}();
        
        uint256 balanceBefore = user1.balance;
        
        vm.expectEmit(true, false, false, true);
        emit Withdrawn(user1, depositAmount);
        
        paymaster.withdrawAll();
        vm.stopPrank();

        assertEq(paymaster.balanceOf(user1), 0);
        assertEq(user1.balance, balanceBefore + depositAmount);
    }

    function test_WithdrawAll_RevertZeroBalance() public {
        vm.prank(user1);
        vm.expectRevert(BlogPaymaster.ZeroAmount.selector);
        paymaster.withdrawAll();
    }

    function test_ReceiveETH() public {
        uint256 amount = 1 ether;

        vm.prank(user1);
        (bool success, ) = address(paymaster).call{value: amount}("");
        assertTrue(success);

        assertEq(paymaster.balanceOf(user1), amount);
    }

    // ============ 授权管理测试 ============

    function test_Approve_Success() public {
        uint256 amount = 5 ether;

        vm.expectEmit(true, true, false, true);
        emit ApprovalSet(user1, user2, amount);

        vm.prank(user1);
        paymaster.approve(user2, amount);

        assertEq(paymaster.allowance(user1, user2), amount);
    }

    function test_Approve_RevertZeroAddress() public {
        vm.prank(user1);
        vm.expectRevert(BlogPaymaster.ZeroAddress.selector);
        paymaster.approve(address(0), 1 ether);
    }

    function test_IncreaseAllowance_Success() public {
        vm.startPrank(user1);
        paymaster.approve(user2, 1 ether);
        paymaster.increaseAllowance(user2, 2 ether);
        vm.stopPrank();

        assertEq(paymaster.allowance(user1, user2), 3 ether);
    }

    function test_DecreaseAllowance_Success() public {
        vm.startPrank(user1);
        paymaster.approve(user2, 5 ether);
        paymaster.decreaseAllowance(user2, 2 ether);
        vm.stopPrank();

        assertEq(paymaster.allowance(user1, user2), 3 ether);
    }

    function test_DecreaseAllowance_ToZero() public {
        vm.startPrank(user1);
        paymaster.approve(user2, 2 ether);
        paymaster.decreaseAllowance(user2, 5 ether); // 超过当前额度
        vm.stopPrank();

        assertEq(paymaster.allowance(user1, user2), 0);
    }

    // ============ EntryPoint 存款管理测试 ============

    function test_DepositToEntryPoint_Success() public {
        uint256 amount = 1 ether;

        vm.expectEmit(false, false, false, true);
        emit EntryPointDeposited(amount);

        vm.prank(owner);
        paymaster.depositToEntryPoint{value: amount}();

        assertEq(entryPoint.balanceOf(address(paymaster)), amount);
    }

    function test_DepositToEntryPoint_RevertNotOwner() public {
        vm.prank(user1);
        vm.expectRevert();
        paymaster.depositToEntryPoint{value: 1 ether}();
    }

    function test_WithdrawFromEntryPoint_Success() public {
        uint256 amount = 1 ether;

        vm.startPrank(owner);
        paymaster.depositToEntryPoint{value: amount}();
        
        uint256 ownerBalanceBefore = owner.balance;
        paymaster.withdrawFromEntryPoint(amount);
        vm.stopPrank();

        assertEq(owner.balance, ownerBalanceBefore + amount);
    }

    function test_AddStake_Success() public {
        uint256 amount = 1 ether;
        uint32 unstakeDelay = 1 days;

        vm.prank(owner);
        paymaster.addStake{value: amount}(unstakeDelay);

        (,bool staked, uint112 stake, uint32 delay,) = paymaster.getDepositInfo();
        assertTrue(staked);
        assertEq(stake, amount);
        assertEq(delay, unstakeDelay);
    }

    function test_GetEntryPointDeposit() public {
        uint256 amount = 1 ether;

        vm.prank(owner);
        paymaster.depositToEntryPoint{value: amount}();

        assertEq(paymaster.getEntryPointDeposit(), amount);
    }

    // ============ Session Key 管理测试 ============

    function test_SetSessionKeyManager_Success() public {
        address newManager = makeAddr("newManager");

        vm.expectEmit(true, false, false, false);
        emit SessionKeyManagerUpdated(newManager);

        vm.prank(owner);
        paymaster.setSessionKeyManager(newManager);

        assertEq(address(paymaster.sessionKeyManager()), newManager);
    }

    function test_SetSessionKeyManager_RevertNotOwner() public {
        vm.prank(user1);
        vm.expectRevert();
        paymaster.setSessionKeyManager(makeAddr("newManager"));
    }

    // ============ 视图函数测试 ============

    function test_CanSponsor_Success() public {
        _depositToPaymaster(sponsor, 10 ether);
        
        vm.prank(sponsor);
        paymaster.approve(user1, 5 ether);

        assertTrue(paymaster.canSponsor(sponsor, user1, 3 ether));
        assertTrue(paymaster.canSponsor(sponsor, sponsor, 8 ether)); // 自己赞助自己
    }

    function test_CanSponsor_FailInsufficientBalance() public {
        _depositToPaymaster(sponsor, 1 ether);
        
        vm.prank(sponsor);
        paymaster.approve(user1, 5 ether);

        assertFalse(paymaster.canSponsor(sponsor, user1, 3 ether));
    }

    function test_CanSponsor_FailInsufficientAllowance() public {
        _depositToPaymaster(sponsor, 10 ether);
        
        vm.prank(sponsor);
        paymaster.approve(user1, 1 ether);

        assertFalse(paymaster.canSponsor(sponsor, user1, 3 ether));
    }

    function test_GetUserInfo() public {
        _depositToPaymaster(user1, 5 ether);
        
        vm.prank(user1);
        paymaster.approve(user2, 3 ether);

        (uint256 balance, uint256 allowanceAmount) = paymaster.getUserInfo(user1, user2);
        assertEq(balance, 5 ether);
        assertEq(allowanceAmount, 3 ether);
    }

    function test_GetSessionKeyNonce() public view {
        uint256 nonce = paymaster.getSessionKeyNonce(user1, sessionKey);
        assertEq(nonce, 0);
    }

    function test_DomainSeparator() public view {
        bytes32 domainSeparator = paymaster.DOMAIN_SEPARATOR();
        assertTrue(domainSeparator != bytes32(0));
    }

    function test_SessionKeyTypehash() public view {
        bytes32 typehash = paymaster.SESSION_KEY_TYPEHASH();
        assertTrue(typehash != bytes32(0));
    }

    // ============ canExecuteWithSessionKey 测试 ============

    function test_CanExecuteWithSessionKey_Success() public {
        _registerStandardSessionKey(user1, sessionKey, address(blogHub));
        _depositToPaymaster(sponsor, 10 ether);
        
        vm.prank(sponsor);
        paymaster.approve(user1, 5 ether);

        bool canExecute = paymaster.canExecuteWithSessionKey(
            user1,
            sessionKey,
            address(blogHub),
            blogHub.evaluate.selector,
            sponsor,
            1 ether
        );
        assertTrue(canExecute);
    }

    function test_CanExecuteWithSessionKey_FailInvalidSessionKey() public {
        // 不注册 Session Key
        _depositToPaymaster(sponsor, 10 ether);
        
        vm.prank(sponsor);
        paymaster.approve(user1, 5 ether);

        bool canExecute = paymaster.canExecuteWithSessionKey(
            user1,
            sessionKey,
            address(blogHub),
            blogHub.evaluate.selector,
            sponsor,
            1 ether
        );
        assertFalse(canExecute);
    }

    function test_CanExecuteWithSessionKey_FailInsufficientBalance() public {
        _registerStandardSessionKey(user1, sessionKey, address(blogHub));
        // 不存款
        
        vm.prank(sponsor);
        paymaster.approve(user1, 5 ether);

        bool canExecute = paymaster.canExecuteWithSessionKey(
            user1,
            sessionKey,
            address(blogHub),
            blogHub.evaluate.selector,
            sponsor,
            1 ether
        );
        assertFalse(canExecute);
    }

    // ============ validatePaymasterUserOp 测试 (普通模式) ============

    function test_ValidatePaymasterUserOp_NormalMode_Success() public {
        _depositToPaymaster(sponsor, 10 ether);
        
        // 构建 paymasterAndData: [paymaster (20)][mode=0 (1)][sponsor (20)]
        bytes memory paymasterAndData = abi.encodePacked(
            address(paymaster),
            uint8(0), // mode = 0
            sponsor
        );

        PackedUserOperation memory userOp = _createMockUserOp(sponsor, paymasterAndData);
        bytes32 userOpHash = keccak256(abi.encode(userOp));
        uint256 maxCost = 1 ether;

        vm.prank(address(entryPoint));
        (bytes memory context, uint256 validationData) = paymaster.validatePaymasterUserOp(
            userOp,
            userOpHash,
            maxCost
        );

        assertEq(validationData, 0);
        assertTrue(context.length > 0);
        assertEq(paymaster.balanceOf(sponsor), 10 ether - maxCost);
    }

    function test_ValidatePaymasterUserOp_NormalMode_WithAllowance() public {
        _depositToPaymaster(sponsor, 10 ether);
        
        vm.prank(sponsor);
        paymaster.approve(user1, 5 ether);

        bytes memory paymasterAndData = abi.encodePacked(
            address(paymaster),
            uint8(0),
            sponsor
        );

        PackedUserOperation memory userOp = _createMockUserOp(user1, paymasterAndData);
        bytes32 userOpHash = keccak256(abi.encode(userOp));
        uint256 maxCost = 1 ether;

        vm.prank(address(entryPoint));
        (bytes memory context, uint256 validationData) = paymaster.validatePaymasterUserOp(
            userOp,
            userOpHash,
            maxCost
        );

        assertEq(validationData, 0);
        assertTrue(context.length > 0);
        assertEq(paymaster.balanceOf(sponsor), 10 ether - maxCost);
        assertEq(paymaster.allowance(sponsor, user1), 5 ether - maxCost);
    }

    function test_ValidatePaymasterUserOp_RevertOnlyEntryPoint() public {
        bytes memory paymasterAndData = abi.encodePacked(
            address(paymaster),
            uint8(0),
            sponsor
        );

        PackedUserOperation memory userOp = _createMockUserOp(user1, paymasterAndData);

        vm.prank(user1);
        vm.expectRevert(BlogPaymaster.OnlyEntryPoint.selector);
        paymaster.validatePaymasterUserOp(userOp, bytes32(0), 1 ether);
    }

    function test_ValidatePaymasterUserOp_RevertInsufficientBalance() public {
        // 不存款

        bytes memory paymasterAndData = abi.encodePacked(
            address(paymaster),
            uint8(0),
            sponsor
        );

        PackedUserOperation memory userOp = _createMockUserOp(sponsor, paymasterAndData);

        vm.prank(address(entryPoint));
        vm.expectRevert(BlogPaymaster.InsufficientBalance.selector);
        paymaster.validatePaymasterUserOp(userOp, bytes32(0), 1 ether);
    }

    function test_ValidatePaymasterUserOp_RevertInsufficientAllowance() public {
        _depositToPaymaster(sponsor, 10 ether);
        // 不授权

        bytes memory paymasterAndData = abi.encodePacked(
            address(paymaster),
            uint8(0),
            sponsor
        );

        PackedUserOperation memory userOp = _createMockUserOp(user1, paymasterAndData);

        vm.prank(address(entryPoint));
        vm.expectRevert(BlogPaymaster.InsufficientAllowance.selector);
        paymaster.validatePaymasterUserOp(userOp, bytes32(0), 1 ether);
    }

    // ============ postOp 测试 ============

    function test_PostOp_NormalMode_Success() public {
        _depositToPaymaster(sponsor, 10 ether);

        bytes memory paymasterAndData = abi.encodePacked(
            address(paymaster),
            uint8(0),
            sponsor
        );

        PackedUserOperation memory userOp = _createMockUserOp(sponsor, paymasterAndData);
        bytes32 userOpHash = keccak256(abi.encode(userOp));
        uint256 maxCost = 2 ether;

        vm.prank(address(entryPoint));
        (bytes memory context,) = paymaster.validatePaymasterUserOp(userOp, userOpHash, maxCost);

        uint256 actualGasCost = 1 ether;

        vm.prank(address(entryPoint));
        paymaster.postOp(IPaymaster.PostOpMode.opSucceeded, context, actualGasCost, 0);

        // 退款 = maxCost - actualGasCost = 1 ether
        assertEq(paymaster.balanceOf(sponsor), 10 ether - actualGasCost);
    }

    function test_PostOp_NormalMode_Reverted() public {
        _depositToPaymaster(sponsor, 10 ether);

        bytes memory paymasterAndData = abi.encodePacked(
            address(paymaster),
            uint8(0),
            sponsor
        );

        PackedUserOperation memory userOp = _createMockUserOp(sponsor, paymasterAndData);
        bytes32 userOpHash = keccak256(abi.encode(userOp));
        uint256 maxCost = 2 ether;

        vm.prank(address(entryPoint));
        (bytes memory context,) = paymaster.validatePaymasterUserOp(userOp, userOpHash, maxCost);

        vm.prank(address(entryPoint));
        paymaster.postOp(IPaymaster.PostOpMode.opReverted, context, 0, 0);

        // 全额退款
        assertEq(paymaster.balanceOf(sponsor), 10 ether);
    }

    // ============ 辅助函数 ============

    function _createMockUserOp(
        address sender,
        bytes memory paymasterAndData
    ) internal pure returns (PackedUserOperation memory) {
        return PackedUserOperation({
            sender: sender,
            nonce: 0,
            initCode: "",
            callData: "",
            accountGasLimits: bytes32(0),
            preVerificationGas: 0,
            gasFees: bytes32(0),
            paymasterAndData: paymasterAndData,
            signature: ""
        });
    }
}
