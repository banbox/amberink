// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Test} from "forge-std/Test.sol";
import {SessionKeyManager} from "../src/SessionKeyManager.sol";
import {BlogPaymaster} from "../src/BlogPaymaster.sol";
import {BlogHub} from "../src/BlogHub.sol";
import {MockEntryPoint} from "./mocks/MockEntryPoint.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

/**
 * @title BaseTest
 * @dev 测试基础合约，提供通用的测试设置和辅助函数
 */
abstract contract BaseTest is Test {
    // ============ 合约实例 ============
    SessionKeyManager public sessionKeyManager;
    BlogPaymaster public paymaster;
    BlogHub public blogHub;
    BlogHub public blogHubImpl;
    MockEntryPoint public entryPoint;

    // ============ 测试账户 ============
    address public owner;
    uint256 public ownerPrivateKey;

    address public user1;
    uint256 public user1PrivateKey;

    address public user2;
    uint256 public user2PrivateKey;

    address public sessionKey;
    uint256 public sessionKeyPrivateKey;

    address public treasury;
    address public sponsor;
    uint256 public sponsorPrivateKey;

    // ============ 常量 ============
    uint256 public constant INITIAL_BALANCE = 100 ether;
    uint48 public constant SESSION_DURATION = 1 days;
    uint256 public constant SPENDING_LIMIT = 10 ether;

    // ============ EIP-712 相关 ============
    bytes32 public constant REGISTER_SESSION_KEY_TYPEHASH =
        keccak256(
            "RegisterSessionKey(address owner,address sessionKey,uint48 validAfter,uint48 validUntil,address allowedContract,bytes4[] allowedSelectors,uint256 spendingLimit,uint256 nonce,uint256 deadline)"
        );

    bytes32 public constant SESSION_OPERATION_TYPEHASH =
        keccak256(
            "SessionOperation(address owner,address sessionKey,address target,bytes4 selector,bytes callData,uint256 value,uint256 nonce,uint256 deadline)"
        );

    // ============ 设置函数 ============
    function setUp() public virtual {
        _setupAccounts();
        _deployContracts();
        _setupInitialState();
    }

    function _setupAccounts() internal {
        // 使用 makeAddrAndKey 创建带私钥的账户
        (owner, ownerPrivateKey) = makeAddrAndKey("owner");
        (user1, user1PrivateKey) = makeAddrAndKey("user1");
        (user2, user2PrivateKey) = makeAddrAndKey("user2");
        (sessionKey, sessionKeyPrivateKey) = makeAddrAndKey("sessionKey");
        (sponsor, sponsorPrivateKey) = makeAddrAndKey("sponsor");
        treasury = makeAddr("treasury");

        // 给账户充值
        vm.deal(owner, INITIAL_BALANCE);
        vm.deal(user1, INITIAL_BALANCE);
        vm.deal(user2, INITIAL_BALANCE);
        vm.deal(sponsor, INITIAL_BALANCE);
    }

    function _deployContracts() internal virtual {
        // 部署 MockEntryPoint
        entryPoint = new MockEntryPoint();

        // 部署 SessionKeyManager
        sessionKeyManager = new SessionKeyManager();

        // 部署 BlogPaymaster
        paymaster = new BlogPaymaster(address(entryPoint), owner);

        // 部署 BlogHub (使用代理模式)
        blogHubImpl = new BlogHub();
        bytes memory initData = abi.encodeWithSelector(BlogHub.initialize.selector, owner, treasury);
        ERC1967Proxy proxy = new ERC1967Proxy(address(blogHubImpl), initData);
        blogHub = BlogHub(payable(address(proxy)));
    }

    function _setupInitialState() internal virtual {
        // 设置 SessionKeyManager 到 Paymaster 和 BlogHub
        vm.startPrank(owner);
        paymaster.setSessionKeyManager(address(sessionKeyManager));
        blogHub.setSessionKeyManager(address(sessionKeyManager));
        vm.stopPrank();
    }

    // ============ 辅助函数 ============

    /**
     * @dev 获取 SessionKeyManager 的 EIP-712 域分隔符
     */
    function _getSessionKeyManagerDomainSeparator() internal view returns (bytes32) {
        return sessionKeyManager.DOMAIN_SEPARATOR();
    }

    /**
     * @dev 获取 BlogPaymaster 的 EIP-712 域分隔符
     */
    function _getPaymasterDomainSeparator() internal view returns (bytes32) {
        return paymaster.DOMAIN_SEPARATOR();
    }

    /**
     * @dev 创建 Session Key 注册签名
     */
    function _signRegisterSessionKey(
        uint256 signerPrivateKey,
        address _owner,
        address _sessionKey,
        uint48 validAfter,
        uint48 validUntil,
        address allowedContract,
        bytes4[] memory allowedSelectors,
        uint256 spendingLimit,
        uint256 nonce,
        uint256 deadline
    ) internal view returns (bytes memory) {
        bytes32 structHash = keccak256(
            abi.encode(
                REGISTER_SESSION_KEY_TYPEHASH,
                _owner,
                _sessionKey,
                validAfter,
                validUntil,
                allowedContract,
                keccak256(abi.encodePacked(allowedSelectors)),
                spendingLimit,
                nonce,
                deadline
            )
        );

        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", _getSessionKeyManagerDomainSeparator(), structHash));

        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerPrivateKey, digest);
        return abi.encodePacked(r, s, v);
    }

    /**
     * @dev 创建 Session Key 操作签名
     */
    function _signSessionOperation(
        uint256 signerPrivateKey,
        address _owner,
        address _sessionKey,
        address target,
        bytes4 selector,
        bytes memory callData,
        uint256 value,
        uint256 nonce,
        uint256 deadline
    ) internal view returns (bytes memory) {
        bytes32 structHash = keccak256(
            abi.encode(
                SESSION_OPERATION_TYPEHASH,
                _owner,
                _sessionKey,
                target,
                selector,
                keccak256(callData),
                value,
                nonce,
                deadline
            )
        );

        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", _getSessionKeyManagerDomainSeparator(), structHash));

        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerPrivateKey, digest);
        return abi.encodePacked(r, s, v);
    }

    /**
     * @dev 注册一个标准的 Session Key
     */
    function _registerStandardSessionKey(address _owner, address _sessionKey, address allowedContract) internal {
        bytes4[] memory selectors = new bytes4[](5);
        selectors[0] = BlogHub.evaluate.selector;
        selectors[1] = BlogHub.likeComment.selector;
        selectors[2] = BlogHub.follow.selector;
        selectors[3] = BlogHub.publish.selector;
        selectors[4] = BlogHub.collect.selector;

        vm.prank(_owner);
        sessionKeyManager.registerSessionKey(
            _sessionKey,
            uint48(block.timestamp),
            uint48(block.timestamp + SESSION_DURATION),
            allowedContract,
            selectors,
            SPENDING_LIMIT
        );
    }

    /**
     * @dev 发布一篇测试文章
     */
    function _publishTestArticle(address author) internal returns (uint256) {
        vm.prank(author);
        return
            blogHub.publish(
                BlogHub.PublishParams({
                    arweaveId: "test-arweave-hash",
                    categoryId: 1,
                    royaltyBps: 500,
                    originalAuthor: "",
                    title: "Test Title",
                    summary: "",
                    trueAuthor: address(0),
                    collectPrice: 0.01 ether,
                    maxCollectSupply: 100,
                    originality: BlogHub.Originality.Original,
                    visibility: BlogHub.Visibility.Public
                })
            );
    }

    /**
     * @dev 发布一篇带原作者的测试文章（代发场景）
     */
    function _publishTestArticleWithOriginalAuthor(
        address publisher,
        string memory originalAuthor
    ) internal returns (uint256) {
        vm.prank(publisher);
        return
            blogHub.publish(
                BlogHub.PublishParams({
                    arweaveId: "test-arweave-hash",
                    categoryId: 1,
                    royaltyBps: 500,
                    originalAuthor: originalAuthor,
                    title: "Test Title",
                    summary: "",
                    trueAuthor: address(0),
                    collectPrice: 0.01 ether,
                    maxCollectSupply: 100,
                    originality: BlogHub.Originality.Original,
                    visibility: BlogHub.Visibility.Public
                })
            );
    }

    /**
     * @dev 向 Paymaster 存入余额
     */
    function _depositToPaymaster(address account, uint256 amount) internal {
        vm.prank(account);
        paymaster.deposit{value: amount}();
    }
}
