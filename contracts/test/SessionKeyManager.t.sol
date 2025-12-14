// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {BaseTest} from "./BaseTest.sol";
import {SessionKeyManager} from "../src/SessionKeyManager.sol";
import {ISessionKeyManager} from "../src/interfaces/ISessionKeyManager.sol";
import {BlogHub} from "../src/BlogHub.sol";

/**
 * @title SessionKeyManagerTest
 * @dev SessionKeyManager 合约的单元测试
 */
contract SessionKeyManagerTest is BaseTest {
    // ============ 事件定义 ============
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

    // ============ 注册测试 ============

    function test_RegisterSessionKey_Success() public {
        bytes4[] memory selectors = new bytes4[](2);
        selectors[0] = BlogHub.evaluate.selector;
        selectors[1] = BlogHub.likeComment.selector;

        uint48 validAfter = uint48(block.timestamp);
        uint48 validUntil = uint48(block.timestamp + 1 days);

        vm.expectEmit(true, true, false, true);
        emit SessionKeyRegistered(
            user1,
            sessionKey,
            address(blogHub),
            validAfter,
            validUntil,
            SPENDING_LIMIT
        );

        vm.prank(user1);
        sessionKeyManager.registerSessionKey(
            sessionKey,
            validAfter,
            validUntil,
            address(blogHub),
            selectors,
            SPENDING_LIMIT
        );

        // 验证注册成功
        ISessionKeyManager.SessionKeyData memory data = sessionKeyManager.getSessionKeyData(user1, sessionKey);
        assertEq(data.sessionKey, sessionKey);
        assertEq(data.validAfter, validAfter);
        assertEq(data.validUntil, validUntil);
        assertEq(data.allowedContract, address(blogHub));
        assertEq(data.spendingLimit, SPENDING_LIMIT);
        assertEq(data.spentAmount, 0);
        assertEq(data.nonce, 0);
        assertEq(data.allowedSelectors.length, 2);
    }

    function test_RegisterSessionKey_RevertZeroSessionKey() public {
        bytes4[] memory selectors = new bytes4[](1);
        selectors[0] = BlogHub.evaluate.selector;

        vm.prank(user1);
        vm.expectRevert(SessionKeyManager.ZeroAddress.selector);
        sessionKeyManager.registerSessionKey(
            address(0),
            uint48(block.timestamp),
            uint48(block.timestamp + 1 days),
            address(blogHub),
            selectors,
            SPENDING_LIMIT
        );
    }

    function test_RegisterSessionKey_RevertZeroContract() public {
        bytes4[] memory selectors = new bytes4[](1);
        selectors[0] = BlogHub.evaluate.selector;

        vm.prank(user1);
        vm.expectRevert(SessionKeyManager.ZeroAddress.selector);
        sessionKeyManager.registerSessionKey(
            sessionKey,
            uint48(block.timestamp),
            uint48(block.timestamp + 1 days),
            address(0),
            selectors,
            SPENDING_LIMIT
        );
    }

    function test_RegisterSessionKey_RevertInvalidTimeRange() public {
        bytes4[] memory selectors = new bytes4[](1);
        selectors[0] = BlogHub.evaluate.selector;

        // validAfter >= validUntil
        vm.prank(user1);
        vm.expectRevert(SessionKeyManager.InvalidTimeRange.selector);
        sessionKeyManager.registerSessionKey(
            sessionKey,
            uint48(block.timestamp + 1 days),
            uint48(block.timestamp),
            address(blogHub),
            selectors,
            SPENDING_LIMIT
        );
    }

    function test_RegisterSessionKey_RevertExceedsMaxDuration() public {
        bytes4[] memory selectors = new bytes4[](1);
        selectors[0] = BlogHub.evaluate.selector;

        // 超过 7 天最大有效期
        vm.prank(user1);
        vm.expectRevert(SessionKeyManager.InvalidTimeRange.selector);
        sessionKeyManager.registerSessionKey(
            sessionKey,
            uint48(block.timestamp),
            uint48(block.timestamp + 8 days),
            address(blogHub),
            selectors,
            SPENDING_LIMIT
        );
    }

    function test_RegisterSessionKey_RevertAlreadyExists() public {
        _registerStandardSessionKey(user1, sessionKey, address(blogHub));

        bytes4[] memory selectors = new bytes4[](1);
        selectors[0] = BlogHub.evaluate.selector;

        vm.prank(user1);
        vm.expectRevert(SessionKeyManager.SessionKeyAlreadyExists.selector);
        sessionKeyManager.registerSessionKey(
            sessionKey,
            uint48(block.timestamp),
            uint48(block.timestamp + 1 days),
            address(blogHub),
            selectors,
            SPENDING_LIMIT
        );
    }

    function test_RegisterSessionKey_CanReregisterAfterExpiry() public {
        bytes4[] memory selectors = new bytes4[](1);
        selectors[0] = BlogHub.evaluate.selector;

        vm.prank(user1);
        sessionKeyManager.registerSessionKey(
            sessionKey,
            uint48(block.timestamp),
            uint48(block.timestamp + 1 hours),
            address(blogHub),
            selectors,
            SPENDING_LIMIT
        );

        // 时间推进到过期后
        vm.warp(block.timestamp + 2 hours);

        // 可以重新注册
        vm.prank(user1);
        sessionKeyManager.registerSessionKey(
            sessionKey,
            uint48(block.timestamp),
            uint48(block.timestamp + 1 days),
            address(blogHub),
            selectors,
            SPENDING_LIMIT
        );

        assertTrue(sessionKeyManager.isSessionKeyActive(user1, sessionKey));
    }

    // ============ 签名注册测试 ============

    function test_RegisterSessionKeyWithSignature_Success() public {
        bytes4[] memory selectors = new bytes4[](2);
        selectors[0] = BlogHub.evaluate.selector;
        selectors[1] = BlogHub.likeComment.selector;

        uint48 validAfter = uint48(block.timestamp);
        uint48 validUntil = uint48(block.timestamp + 1 days);
        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = sessionKeyManager.ownerNonces(user1);

        bytes memory signature = _signRegisterSessionKey(
            user1PrivateKey,
            user1,
            sessionKey,
            validAfter,
            validUntil,
            address(blogHub),
            selectors,
            SPENDING_LIMIT,
            nonce,
            deadline
        );

        vm.expectEmit(true, true, false, true);
        emit SessionKeyRegistered(
            user1,
            sessionKey,
            address(blogHub),
            validAfter,
            validUntil,
            SPENDING_LIMIT
        );

        // 由 relayer (user2) 提交
        vm.prank(user2);
        sessionKeyManager.registerSessionKeyWithSignature(
            user1,
            sessionKey,
            validAfter,
            validUntil,
            address(blogHub),
            selectors,
            SPENDING_LIMIT,
            deadline,
            signature
        );

        assertTrue(sessionKeyManager.isSessionKeyActive(user1, sessionKey));
        assertEq(sessionKeyManager.ownerNonces(user1), nonce + 1);
    }

    function test_RegisterSessionKeyWithSignature_RevertExpiredDeadline() public {
        bytes4[] memory selectors = new bytes4[](1);
        selectors[0] = BlogHub.evaluate.selector;

        uint256 deadline = block.timestamp - 1; // 已过期
        uint256 nonce = sessionKeyManager.ownerNonces(user1);

        bytes memory signature = _signRegisterSessionKey(
            user1PrivateKey,
            user1,
            sessionKey,
            uint48(block.timestamp),
            uint48(block.timestamp + 1 days),
            address(blogHub),
            selectors,
            SPENDING_LIMIT,
            nonce,
            deadline
        );

        vm.prank(user2);
        vm.expectRevert(SessionKeyManager.SignatureExpired.selector);
        sessionKeyManager.registerSessionKeyWithSignature(
            user1,
            sessionKey,
            uint48(block.timestamp),
            uint48(block.timestamp + 1 days),
            address(blogHub),
            selectors,
            SPENDING_LIMIT,
            deadline,
            signature
        );
    }

    function test_RegisterSessionKeyWithSignature_RevertInvalidSignature() public {
        bytes4[] memory selectors = new bytes4[](1);
        selectors[0] = BlogHub.evaluate.selector;

        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = sessionKeyManager.ownerNonces(user1);

        // 使用错误的私钥签名
        bytes memory signature = _signRegisterSessionKey(
            user2PrivateKey, // 错误的私钥
            user1,
            sessionKey,
            uint48(block.timestamp),
            uint48(block.timestamp + 1 days),
            address(blogHub),
            selectors,
            SPENDING_LIMIT,
            nonce,
            deadline
        );

        vm.prank(user2);
        vm.expectRevert(SessionKeyManager.InvalidSignature.selector);
        sessionKeyManager.registerSessionKeyWithSignature(
            user1,
            sessionKey,
            uint48(block.timestamp),
            uint48(block.timestamp + 1 days),
            address(blogHub),
            selectors,
            SPENDING_LIMIT,
            deadline,
            signature
        );
    }

    // ============ 撤销测试 ============

    function test_RevokeSessionKey_Success() public {
        _registerStandardSessionKey(user1, sessionKey, address(blogHub));
        assertTrue(sessionKeyManager.isSessionKeyActive(user1, sessionKey));

        vm.expectEmit(true, true, false, false);
        emit SessionKeyRevoked(user1, sessionKey);

        vm.prank(user1);
        sessionKeyManager.revokeSessionKey(sessionKey);

        assertFalse(sessionKeyManager.isSessionKeyActive(user1, sessionKey));
    }

    function test_RevokeSessionKey_RevertInvalidSessionKey() public {
        vm.prank(user1);
        vm.expectRevert(SessionKeyManager.InvalidSessionKey.selector);
        sessionKeyManager.revokeSessionKey(sessionKey);
    }

    // ============ 验证测试 ============

    function test_ValidateSessionKey_Success() public {
        _registerStandardSessionKey(user1, sessionKey, address(blogHub));

        bool valid = sessionKeyManager.validateSessionKey(
            user1,
            sessionKey,
            address(blogHub),
            BlogHub.evaluate.selector,
            1 ether
        );
        assertTrue(valid);
    }

    function test_ValidateSessionKey_FailNotRegistered() public view {
        bool valid = sessionKeyManager.validateSessionKey(
            user1,
            sessionKey,
            address(blogHub),
            BlogHub.evaluate.selector,
            1 ether
        );
        assertFalse(valid);
    }

    function test_ValidateSessionKey_FailNotYetActive() public {
        bytes4[] memory selectors = new bytes4[](1);
        selectors[0] = BlogHub.evaluate.selector;

        vm.prank(user1);
        sessionKeyManager.registerSessionKey(
            sessionKey,
            uint48(block.timestamp + 1 hours), // 1小时后生效
            uint48(block.timestamp + 1 days),
            address(blogHub),
            selectors,
            SPENDING_LIMIT
        );

        bool valid = sessionKeyManager.validateSessionKey(
            user1,
            sessionKey,
            address(blogHub),
            BlogHub.evaluate.selector,
            1 ether
        );
        assertFalse(valid);
    }

    function test_ValidateSessionKey_FailExpired() public {
        _registerStandardSessionKey(user1, sessionKey, address(blogHub));

        // 时间推进到过期后
        vm.warp(block.timestamp + 2 days);

        bool valid = sessionKeyManager.validateSessionKey(
            user1,
            sessionKey,
            address(blogHub),
            BlogHub.evaluate.selector,
            1 ether
        );
        assertFalse(valid);
    }

    function test_ValidateSessionKey_FailWrongContract() public {
        _registerStandardSessionKey(user1, sessionKey, address(blogHub));

        bool valid = sessionKeyManager.validateSessionKey(
            user1,
            sessionKey,
            address(paymaster), // 错误的合约
            BlogHub.evaluate.selector,
            1 ether
        );
        assertFalse(valid);
    }

    function test_ValidateSessionKey_FailWrongSelector() public {
        _registerStandardSessionKey(user1, sessionKey, address(blogHub));

        bool valid = sessionKeyManager.validateSessionKey(
            user1,
            sessionKey,
            address(blogHub),
            BlogHub.setPlatformFee.selector, // 未授权的选择器
            1 ether
        );
        assertFalse(valid);
    }

    function test_ValidateSessionKey_FailExceedsSpendingLimit() public {
        _registerStandardSessionKey(user1, sessionKey, address(blogHub));

        bool valid = sessionKeyManager.validateSessionKey(
            user1,
            sessionKey,
            address(blogHub),
            BlogHub.evaluate.selector,
            SPENDING_LIMIT + 1 // 超过限额
        );
        assertFalse(valid);
    }

    // ============ 验证并使用测试 ============

    function test_ValidateAndUseSessionKey_Success() public {
        _registerStandardSessionKey(user1, sessionKey, address(blogHub));

        bytes memory callData = abi.encodeWithSelector(
            BlogHub.evaluate.selector,
            1, // articleId
            1, // score
            "test comment",
            address(0),
            0
        );

        uint256 deadline = block.timestamp + 1 hours;
        ISessionKeyManager.SessionKeyData memory dataBefore = sessionKeyManager.getSessionKeyData(user1, sessionKey);
        uint256 nonce = dataBefore.nonce;

        bytes memory signature = _signSessionOperation(
            sessionKeyPrivateKey,
            user1,
            sessionKey,
            address(blogHub),
            BlogHub.evaluate.selector,
            callData,
            1 ether,
            nonce,
            deadline
        );

        vm.expectEmit(true, true, false, true);
        emit SessionKeyUsed(user1, sessionKey, address(blogHub), BlogHub.evaluate.selector, 1 ether);

        bool success = sessionKeyManager.validateAndUseSessionKey(
            user1,
            sessionKey,
            address(blogHub),
            BlogHub.evaluate.selector,
            callData,
            1 ether,
            deadline,
            signature
        );

        assertTrue(success);

        // 验证状态更新
        ISessionKeyManager.SessionKeyData memory dataAfter = sessionKeyManager.getSessionKeyData(user1, sessionKey);
        assertEq(dataAfter.spentAmount, 1 ether);
        assertEq(dataAfter.nonce, nonce + 1);
    }

    function test_ValidateAndUseSessionKey_RevertExpiredDeadline() public {
        _registerStandardSessionKey(user1, sessionKey, address(blogHub));

        bytes memory callData = abi.encodeWithSelector(BlogHub.evaluate.selector, 1, 1, "", address(0), 0);
        uint256 deadline = block.timestamp - 1; // 已过期

        bytes memory signature = _signSessionOperation(
            sessionKeyPrivateKey,
            user1,
            sessionKey,
            address(blogHub),
            BlogHub.evaluate.selector,
            callData,
            1 ether,
            0,
            deadline
        );

        vm.expectRevert(SessionKeyManager.SignatureExpired.selector);
        sessionKeyManager.validateAndUseSessionKey(
            user1,
            sessionKey,
            address(blogHub),
            BlogHub.evaluate.selector,
            callData,
            1 ether,
            deadline,
            signature
        );
    }

    function test_ValidateAndUseSessionKey_RevertInvalidSignature() public {
        _registerStandardSessionKey(user1, sessionKey, address(blogHub));

        bytes memory callData = abi.encodeWithSelector(BlogHub.evaluate.selector, 1, 1, "", address(0), 0);
        uint256 deadline = block.timestamp + 1 hours;

        // 使用错误的私钥签名
        bytes memory signature = _signSessionOperation(
            user1PrivateKey, // 错误的私钥
            user1,
            sessionKey,
            address(blogHub),
            BlogHub.evaluate.selector,
            callData,
            1 ether,
            0,
            deadline
        );

        vm.expectRevert(SessionKeyManager.InvalidSignature.selector);
        sessionKeyManager.validateAndUseSessionKey(
            user1,
            sessionKey,
            address(blogHub),
            BlogHub.evaluate.selector,
            callData,
            1 ether,
            deadline,
            signature
        );
    }

    // ============ 视图函数测试 ============

    function test_IsSessionKeyActive() public {
        assertFalse(sessionKeyManager.isSessionKeyActive(user1, sessionKey));

        _registerStandardSessionKey(user1, sessionKey, address(blogHub));
        assertTrue(sessionKeyManager.isSessionKeyActive(user1, sessionKey));

        // 过期后
        vm.warp(block.timestamp + 2 days);
        assertFalse(sessionKeyManager.isSessionKeyActive(user1, sessionKey));
    }

    function test_GetRemainingSpendingLimit() public {
        _registerStandardSessionKey(user1, sessionKey, address(blogHub));

        assertEq(sessionKeyManager.getRemainingSpendingLimit(user1, sessionKey), SPENDING_LIMIT);

        // 使用一些额度
        bytes memory callData = abi.encodeWithSelector(BlogHub.evaluate.selector, 1, 1, "", address(0), 0);
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory signature = _signSessionOperation(
            sessionKeyPrivateKey,
            user1,
            sessionKey,
            address(blogHub),
            BlogHub.evaluate.selector,
            callData,
            1 ether,
            0,
            deadline
        );

        sessionKeyManager.validateAndUseSessionKey(
            user1,
            sessionKey,
            address(blogHub),
            BlogHub.evaluate.selector,
            callData,
            1 ether,
            deadline,
            signature
        );

        assertEq(sessionKeyManager.getRemainingSpendingLimit(user1, sessionKey), SPENDING_LIMIT - 1 ether);
    }

    function test_GetAllowedSelectors() public {
        _registerStandardSessionKey(user1, sessionKey, address(blogHub));

        bytes4[] memory selectors = sessionKeyManager.getAllowedSelectors(user1, sessionKey);
        assertEq(selectors.length, 5);
        assertEq(selectors[0], BlogHub.evaluate.selector);
        assertEq(selectors[1], BlogHub.likeComment.selector);
        assertEq(selectors[2], BlogHub.follow.selector);
        assertEq(selectors[3], BlogHub.publish.selector);
        assertEq(selectors[4], BlogHub.collect.selector);
    }

    function test_DomainSeparator() public view {
        bytes32 domainSeparator = sessionKeyManager.DOMAIN_SEPARATOR();
        assertTrue(domainSeparator != bytes32(0));
    }

    function test_TypeHashes() public view {
        bytes32 registerTypeHash = sessionKeyManager.REGISTER_TYPEHASH();
        bytes32 operationTypeHash = sessionKeyManager.OPERATION_TYPEHASH();
        
        assertEq(registerTypeHash, REGISTER_SESSION_KEY_TYPEHASH);
        assertEq(operationTypeHash, SESSION_OPERATION_TYPEHASH);
    }

    function test_MaxSessionDuration() public view {
        assertEq(sessionKeyManager.MAX_SESSION_DURATION(), 7 days);
    }
}
