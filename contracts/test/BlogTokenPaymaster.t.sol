// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Test} from "forge-std/Test.sol";
import {BlogTokenPaymaster} from "../src/BlogTokenPaymaster.sol";
import {TokenPriceOracle} from "../src/TokenPriceOracle.sol";
import {SessionKeyManager} from "../src/SessionKeyManager.sol";
import {MockEntryPoint} from "./mocks/MockEntryPoint.sol";
import {MockERC20} from "./mocks/MockERC20.sol";
import {MockPriceOracle} from "./mocks/MockPriceOracle.sol";
import {PackedUserOperation} from "../src/interfaces/IEntryPoint.sol";
import {IPaymaster} from "../src/interfaces/IPaymaster.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title BlogTokenPaymasterTest
 * @dev BlogTokenPaymaster 合约的测试
 */
contract BlogTokenPaymasterTest is Test {
    // ============ 合约实例 ============
    BlogTokenPaymaster public tokenPaymaster;
    MockEntryPoint public entryPoint;
    MockPriceOracle public priceOracle;
    SessionKeyManager public sessionKeyManager;
    
    MockERC20 public usdc;
    MockERC20 public usdt;

    // ============ 测试账户 ============
    address public owner;
    uint256 public ownerPrivateKey;
    
    address public user1;
    uint256 public user1PrivateKey;
    
    address public user2;
    uint256 public user2PrivateKey;
    
    address public sessionKey;
    uint256 public sessionKeyPrivateKey;

    // ============ 常量 ============
    uint256 public constant INITIAL_ETH_BALANCE = 100 ether;
    uint256 public constant INITIAL_TOKEN_BALANCE = 10000 * 1e6; // 10000 USDC/USDT
    uint256 public constant ETH_PRICE_IN_USD = 2000; // 1 ETH = 2000 USD
    
    // USDC/USDT 价格：1 USD = 0.0005 ETH (当 1 ETH = 2000 USD)
    // pricePerToken = 0.0005 * 1e18 = 500000000000000
    uint256 public constant STABLE_COIN_PRICE = 500000000000000; // 0.0005 ETH per token

    // ============ EIP-712 相关 ============
    bytes32 public constant SESSION_KEY_TOKEN_USEROP_TYPEHASH = keccak256(
        "SessionKeyTokenUserOp(address owner,address sessionKey,address token,bytes32 userOpHash,uint256 nonce,uint256 deadline)"
    );

    // ============ 设置函数 ============
    function setUp() public {
        _setupAccounts();
        _deployContracts();
        _setupTokens();
        _setupInitialState();
    }

    function _setupAccounts() internal {
        (owner, ownerPrivateKey) = makeAddrAndKey("owner");
        (user1, user1PrivateKey) = makeAddrAndKey("user1");
        (user2, user2PrivateKey) = makeAddrAndKey("user2");
        (sessionKey, sessionKeyPrivateKey) = makeAddrAndKey("sessionKey");

        vm.deal(owner, INITIAL_ETH_BALANCE);
        vm.deal(user1, INITIAL_ETH_BALANCE);
        vm.deal(user2, INITIAL_ETH_BALANCE);
    }

    function _deployContracts() internal {
        // 部署 MockEntryPoint
        entryPoint = new MockEntryPoint();

        // 部署价格预言机
        priceOracle = new MockPriceOracle();

        // 部署 SessionKeyManager
        sessionKeyManager = new SessionKeyManager();

        // 部署 BlogTokenPaymaster
        tokenPaymaster = new BlogTokenPaymaster(
            address(entryPoint),
            address(priceOracle),
            owner
        );
    }

    function _setupTokens() internal {
        // 部署 Mock 代币
        usdc = new MockERC20("USD Coin", "USDC", 6);
        usdt = new MockERC20("Tether USD", "USDT", 6);

        // 设置代币价格
        priceOracle.setTokenPrice(address(usdc), 6, STABLE_COIN_PRICE);
        priceOracle.setTokenPrice(address(usdt), 6, STABLE_COIN_PRICE);

        // 给用户铸造代币
        usdc.mint(user1, INITIAL_TOKEN_BALANCE);
        usdc.mint(user2, INITIAL_TOKEN_BALANCE);
        usdt.mint(user1, INITIAL_TOKEN_BALANCE);
        usdt.mint(user2, INITIAL_TOKEN_BALANCE);
    }

    function _setupInitialState() internal {
        // 添加支持的代币
        vm.startPrank(owner);
        tokenPaymaster.addSupportedToken(address(usdc));
        tokenPaymaster.addSupportedToken(address(usdt));
        tokenPaymaster.setSessionKeyManager(address(sessionKeyManager));
        
        // 向 EntryPoint 存款（Paymaster 需要 ETH 来支付 Gas）
        tokenPaymaster.depositToEntryPoint{value: 10 ether}();
        vm.stopPrank();
    }

    // ============ 代币存取测试 ============

    function test_DepositToken() public {
        uint256 depositAmount = 1000 * 1e6; // 1000 USDC

        vm.startPrank(user1);
        usdc.approve(address(tokenPaymaster), depositAmount);
        tokenPaymaster.depositToken(address(usdc), depositAmount);
        vm.stopPrank();

        assertEq(tokenPaymaster.getTokenBalance(user1, address(usdc)), depositAmount);
        assertEq(usdc.balanceOf(address(tokenPaymaster)), depositAmount);
    }

    function test_DepositTokenTo() public {
        uint256 depositAmount = 1000 * 1e6;

        vm.startPrank(user1);
        usdc.approve(address(tokenPaymaster), depositAmount);
        tokenPaymaster.depositTokenTo(user2, address(usdc), depositAmount);
        vm.stopPrank();

        assertEq(tokenPaymaster.getTokenBalance(user2, address(usdc)), depositAmount);
    }

    function test_WithdrawToken() public {
        uint256 depositAmount = 1000 * 1e6;
        uint256 withdrawAmount = 500 * 1e6;

        vm.startPrank(user1);
        usdc.approve(address(tokenPaymaster), depositAmount);
        tokenPaymaster.depositToken(address(usdc), depositAmount);
        
        uint256 balanceBefore = usdc.balanceOf(user1);
        tokenPaymaster.withdrawToken(address(usdc), withdrawAmount);
        vm.stopPrank();

        assertEq(tokenPaymaster.getTokenBalance(user1, address(usdc)), depositAmount - withdrawAmount);
        assertEq(usdc.balanceOf(user1), balanceBefore + withdrawAmount);
    }

    function test_WithdrawAllToken() public {
        uint256 depositAmount = 1000 * 1e6;

        vm.startPrank(user1);
        usdc.approve(address(tokenPaymaster), depositAmount);
        tokenPaymaster.depositToken(address(usdc), depositAmount);
        
        uint256 balanceBefore = usdc.balanceOf(user1);
        tokenPaymaster.withdrawAllToken(address(usdc));
        vm.stopPrank();

        assertEq(tokenPaymaster.getTokenBalance(user1, address(usdc)), 0);
        assertEq(usdc.balanceOf(user1), balanceBefore + depositAmount);
    }

    function test_RevertDepositUnsupportedToken() public {
        MockERC20 unsupportedToken = new MockERC20("Unsupported", "UNS", 18);
        unsupportedToken.mint(user1, 1000 ether);

        vm.startPrank(user1);
        unsupportedToken.approve(address(tokenPaymaster), 1000 ether);
        
        vm.expectRevert(BlogTokenPaymaster.TokenNotSupported.selector);
        tokenPaymaster.depositToken(address(unsupportedToken), 1000 ether);
        vm.stopPrank();
    }

    // ============ 价格计算测试 ============

    function test_EstimateTokenCost() public view {
        // 1 ETH 需要多少 USDC？
        // 1 ETH = 2000 USD, 所以需要 2000 USDC
        // 加上 3% 价格加成 = 2060 USDC (默认 priceMarkupBps = 300)
        uint256 ethAmount = 1 ether;
        uint256 expectedTokenAmount = 2000 * 1e6; // 2000 USDC
        uint256 expectedWithMarkup = expectedTokenAmount + (expectedTokenAmount * 300 / 10000); // +3%

        uint256 actualCost = tokenPaymaster.estimateTokenCost(address(usdc), ethAmount);
        assertEq(actualCost, expectedWithMarkup);
    }

    function test_EstimateTokenCost_SmallAmount() public view {
        // 0.001 ETH 需要多少 USDC？
        // 0.001 ETH = 2 USD = 2 USDC
        // 加上 3% = 2.06 USDC (默认 priceMarkupBps = 300)
        uint256 ethAmount = 0.001 ether;
        uint256 expectedTokenAmount = 2 * 1e6; // 2 USDC
        uint256 expectedWithMarkup = expectedTokenAmount + (expectedTokenAmount * 300 / 10000);

        uint256 actualCost = tokenPaymaster.estimateTokenCost(address(usdc), ethAmount);
        assertEq(actualCost, expectedWithMarkup);
    }

    function test_CanPayWithToken() public {
        uint256 depositAmount = 1000 * 1e6; // 1000 USDC

        vm.startPrank(user1);
        usdc.approve(address(tokenPaymaster), depositAmount);
        tokenPaymaster.depositToken(address(usdc), depositAmount);
        vm.stopPrank();

        // 1000 USDC 可以支付约 0.5 ETH 的 Gas（考虑 5% 加成后约 0.476 ETH）
        assertTrue(tokenPaymaster.canPayWithToken(user1, address(usdc), 0.4 ether));
        assertFalse(tokenPaymaster.canPayWithToken(user1, address(usdc), 1 ether));
    }

    // ============ Paymaster 验证测试 ============

    function test_ValidatePaymasterUserOp_NormalMode() public {
        uint256 depositAmount = 1000 * 1e6;
        uint256 maxCost = 0.01 ether; // 预估 Gas 成本

        // 用户存入代币
        vm.startPrank(user1);
        usdc.approve(address(tokenPaymaster), depositAmount);
        tokenPaymaster.depositToken(address(usdc), depositAmount);
        vm.stopPrank();

        // 计算预期的代币消耗
        uint256 expectedTokenCost = tokenPaymaster.estimateTokenCost(address(usdc), maxCost);
        uint256 balanceBefore = tokenPaymaster.getTokenBalance(user1, address(usdc));

        // 构建 UserOperation
        PackedUserOperation memory userOp = _buildUserOp(
            user1,
            address(usdc),
            expectedTokenCost + 1e6, // maxTokenCost 略高于预期
            0 // mode = 0 (normal)
        );

        bytes32 userOpHash = keccak256(abi.encode(userOp));

        // 模拟 EntryPoint 调用
        vm.prank(address(entryPoint));
        (bytes memory context, uint256 validationData) = tokenPaymaster.validatePaymasterUserOp(
            userOp,
            userOpHash,
            maxCost
        );

        // 验证结果
        assertEq(validationData, 0);
        assertTrue(context.length > 0);

        // 验证代币被预扣
        uint256 balanceAfter = tokenPaymaster.getTokenBalance(user1, address(usdc));
        assertEq(balanceAfter, balanceBefore - expectedTokenCost);
    }

    function test_ValidatePaymasterUserOp_InsufficientBalance() public {
        uint256 depositAmount = 10 * 1e6; // 只存 10 USDC
        uint256 maxCost = 0.1 ether; // 需要约 200 USDC

        vm.startPrank(user1);
        usdc.approve(address(tokenPaymaster), depositAmount);
        tokenPaymaster.depositToken(address(usdc), depositAmount);
        vm.stopPrank();

        uint256 maxTokenCost = tokenPaymaster.estimateTokenCost(address(usdc), maxCost);

        PackedUserOperation memory userOp = _buildUserOp(
            user1,
            address(usdc),
            maxTokenCost,
            0
        );

        bytes32 userOpHash = keccak256(abi.encode(userOp));

        vm.prank(address(entryPoint));
        vm.expectRevert(BlogTokenPaymaster.InsufficientTokenBalance.selector);
        tokenPaymaster.validatePaymasterUserOp(userOp, userOpHash, maxCost);
    }

    function test_PostOp_Refund() public {
        uint256 depositAmount = 1000 * 1e6;
        uint256 maxCost = 0.01 ether;
        uint256 actualCost = 0.005 ether; // 实际只用了一半

        vm.startPrank(user1);
        usdc.approve(address(tokenPaymaster), depositAmount);
        tokenPaymaster.depositToken(address(usdc), depositAmount);
        vm.stopPrank();

        uint256 preChargedTokenAmount = tokenPaymaster.estimateTokenCost(address(usdc), maxCost);
        uint256 actualTokenCost = tokenPaymaster.estimateTokenCost(address(usdc), actualCost);

        PackedUserOperation memory userOp = _buildUserOp(
            user1,
            address(usdc),
            preChargedTokenAmount + 1e6,
            0
        );

        bytes32 userOpHash = keccak256(abi.encode(userOp));

        // 验证阶段
        vm.prank(address(entryPoint));
        (bytes memory context, ) = tokenPaymaster.validatePaymasterUserOp(
            userOp,
            userOpHash,
            maxCost
        );

        uint256 balanceAfterValidation = tokenPaymaster.getTokenBalance(user1, address(usdc));

        // PostOp 阶段
        vm.prank(address(entryPoint));
        tokenPaymaster.postOp(
            IPaymaster.PostOpMode.opSucceeded,
            context,
            actualCost,
            0
        );

        // 验证退款
        uint256 balanceAfterPostOp = tokenPaymaster.getTokenBalance(user1, address(usdc));
        uint256 expectedRefund = preChargedTokenAmount - actualTokenCost;
        assertEq(balanceAfterPostOp, balanceAfterValidation + expectedRefund);
    }

    function test_PostOp_FullRefundOnRevert() public {
        uint256 depositAmount = 1000 * 1e6;
        uint256 maxCost = 0.01 ether;

        vm.startPrank(user1);
        usdc.approve(address(tokenPaymaster), depositAmount);
        tokenPaymaster.depositToken(address(usdc), depositAmount);
        vm.stopPrank();

        uint256 preChargedTokenAmount = tokenPaymaster.estimateTokenCost(address(usdc), maxCost);
        uint256 balanceBefore = tokenPaymaster.getTokenBalance(user1, address(usdc));

        PackedUserOperation memory userOp = _buildUserOp(
            user1,
            address(usdc),
            preChargedTokenAmount + 1e6,
            0
        );

        bytes32 userOpHash = keccak256(abi.encode(userOp));

        // 验证阶段
        vm.prank(address(entryPoint));
        (bytes memory context, ) = tokenPaymaster.validatePaymasterUserOp(
            userOp,
            userOpHash,
            maxCost
        );

        // PostOp 阶段 - 操作回滚
        vm.prank(address(entryPoint));
        tokenPaymaster.postOp(
            IPaymaster.PostOpMode.opReverted,
            context,
            0,
            0
        );

        // 验证全额退款
        uint256 balanceAfter = tokenPaymaster.getTokenBalance(user1, address(usdc));
        assertEq(balanceAfter, balanceBefore);
    }

    // ============ 管理功能测试 ============

    function test_AddRemoveSupportedToken() public {
        MockERC20 newToken = new MockERC20("New Token", "NEW", 18);

        vm.startPrank(owner);
        tokenPaymaster.addSupportedToken(address(newToken));
        assertTrue(tokenPaymaster.supportedTokens(address(newToken)));

        tokenPaymaster.removeSupportedToken(address(newToken));
        assertFalse(tokenPaymaster.supportedTokens(address(newToken)));
        vm.stopPrank();
    }

    function test_SetPriceMarkup() public {
        vm.prank(owner);
        tokenPaymaster.setPriceMarkup(1000); // 10%

        assertEq(tokenPaymaster.priceMarkupBps(), 1000);
    }

    function test_RevertSetPriceMarkupTooHigh() public {
        vm.prank(owner);
        vm.expectRevert(BlogTokenPaymaster.TokenCostTooHigh.selector);
        tokenPaymaster.setPriceMarkup(5000); // 50% - 超过最大值
    }

    function test_WithdrawAccumulatedTokens() public {
        uint256 depositAmount = 1000 * 1e6;

        vm.startPrank(user1);
        usdc.approve(address(tokenPaymaster), depositAmount);
        tokenPaymaster.depositToken(address(usdc), depositAmount);
        vm.stopPrank();

        // 模拟一些代币被消耗后，owner 提取累积的代币
        vm.prank(owner);
        tokenPaymaster.withdrawAccumulatedTokens(address(usdc), owner, 100 * 1e6);

        assertEq(usdc.balanceOf(owner), 100 * 1e6);
    }

    // ============ 辅助函数 ============

    function _buildUserOp(
        address sender,
        address token,
        uint256 maxTokenCost,
        uint8 mode
    ) internal view returns (PackedUserOperation memory) {
        // paymasterAndData: [paymaster (20)][mode (1)][token (20)][maxTokenCost (32)]
        bytes memory paymasterAndData = abi.encodePacked(
            address(tokenPaymaster),
            mode,
            token,
            maxTokenCost
        );

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

    function _buildSessionKeyUserOp(
        address _owner,
        address _sessionKey,
        address token,
        uint256 maxTokenCost,
        uint256 deadline,
        bytes memory signature
    ) internal view returns (PackedUserOperation memory) {
        // paymasterAndData: [paymaster (20)][mode=1 (1)][token (20)][maxTokenCost (32)][owner (20)][sessionKey (20)][deadline (32)][signature (65)]
        bytes memory paymasterAndData = abi.encodePacked(
            address(tokenPaymaster),
            uint8(1), // mode = 1 (session key)
            token,
            maxTokenCost,
            _owner,
            _sessionKey,
            deadline,
            signature
        );

        return PackedUserOperation({
            sender: _owner,
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
