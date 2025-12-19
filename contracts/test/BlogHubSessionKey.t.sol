// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {BaseTest} from "./BaseTest.sol";
import {BlogHub} from "../src/BlogHub.sol";
import {ISessionKeyManager} from "../src/interfaces/ISessionKeyManager.sol";
import {SessionKeyManager} from "../src/SessionKeyManager.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

/**
 * @title BlogHubSessionKeyTest
 * @dev BlogHub 合约 Session Key 功能的单元测试
 */
contract BlogHubSessionKeyTest is BaseTest {
    // ============ 事件定义 ============
    event SessionKeyManagerUpdated(address indexed newManager);
    event SessionKeyOperationExecuted(
        address indexed owner,
        address indexed sessionKey,
        bytes4 selector
    );
    event ArticleEvaluated(
        uint256 indexed articleId,
        address indexed user,
        uint8 score,
        uint256 amountPaid
    );
    event ArticleCollected(
        uint256 indexed articleId,
        address indexed collector,
        uint256 amount,
        uint256 tokenId
    );
    event CommentLiked(
        uint256 indexed articleId,
        uint256 indexed commentId,
        address indexed liker,
        address commenter,
        uint256 amountPaid
    );
    event ReferralPaid(address indexed referrer, uint256 amount);
    event FollowStatusChanged(
        address indexed follower,
        address indexed target,
        bool isFollowing
    );

    // ============ 设置 ============

    function setUp() public override {
        super.setUp();
        // 为 user1 注册 Session Key
        _registerStandardSessionKey(user1, sessionKey, address(blogHub));
    }

    // ============ Session Key 管理测试 ============

    function test_SetSessionKeyManager_Success() public {
        address newManager = makeAddr("newManager");

        vm.expectEmit(true, false, false, false);
        emit SessionKeyManagerUpdated(newManager);

        vm.prank(owner);
        blogHub.setSessionKeyManager(newManager);

        assertEq(address(blogHub.sessionKeyManager()), newManager);
    }

    function test_SetSessionKeyManager_RevertZeroAddress() public {
        vm.prank(owner);
        vm.expectRevert(BlogHub.InvalidAddress.selector);
        blogHub.setSessionKeyManager(address(0));
    }

    function test_SetSessionKeyManager_RevertNotAdmin() public {
        vm.prank(user1);
        vm.expectRevert();
        blogHub.setSessionKeyManager(makeAddr("newManager"));
    }

    // ============ evaluateWithSessionKey 测试 ============

    function test_EvaluateWithSessionKey_Success() public {
        uint256 articleId = _publishTestArticle(user2);
        uint256 amount = 1 ether;
        uint256 deadline = block.timestamp + 1 hours;

        bytes memory callData = abi.encodeWithSelector(
            BlogHub.evaluate.selector,
            articleId,
            uint8(1),
            "",
            address(0),
            uint256(0)
        );

        ISessionKeyManager.SessionKeyData memory data = sessionKeyManager.getSessionKeyData(user1, sessionKey);
        uint256 nonce = data.nonce;

        bytes memory signature = _signSessionOperation(
            sessionKeyPrivateKey,
            user1,
            sessionKey,
            address(blogHub),
            BlogHub.evaluate.selector,
            callData,
            amount,
            nonce,
            deadline
        );

        vm.expectEmit(true, true, false, true);
        emit ArticleEvaluated(articleId, user1, 1, amount);

        vm.expectEmit(true, true, false, true);
        emit SessionKeyOperationExecuted(user1, sessionKey, BlogHub.evaluate.selector);

        // 由 relayer (owner) 代付 msg.value
        vm.prank(owner);
        blogHub.evaluateWithSessionKey{value: amount}(
            user1,
            sessionKey,
            articleId,
            1,
            "",
            address(0),
            0,
            deadline,
            signature
        );

        // 验证: Evaluate 不再铸造 NFT
        assertEq(blogHub.balanceOf(user1, articleId), 0);
    }

    function test_EvaluateWithSessionKey_WithComment() public {
        uint256 articleId = _publishTestArticle(user2);
        uint256 amount = 0.5 ether;
        string memory comment = "Great article via session key!";
        uint256 deadline = block.timestamp + 1 hours;

        bytes memory callData = abi.encodeWithSelector(
            BlogHub.evaluate.selector,
            articleId,
            uint8(1),
            comment,
            address(0),
            uint256(0)
        );

        ISessionKeyManager.SessionKeyData memory data = sessionKeyManager.getSessionKeyData(user1, sessionKey);

        bytes memory signature = _signSessionOperation(
            sessionKeyPrivateKey,
            user1,
            sessionKey,
            address(blogHub),
            BlogHub.evaluate.selector,
            callData,
            amount,
            data.nonce,
            deadline
        );

        vm.prank(owner);
        blogHub.evaluateWithSessionKey{value: amount}(
            user1,
            sessionKey,
            articleId,
            1,
            comment,
            address(0),
            0,
            deadline,
            signature
        );
    }

    function test_EvaluateWithSessionKey_ZeroAmount() public {
        uint256 articleId = _publishTestArticle(user2);
        string memory comment = "Free comment via session key";
        uint256 deadline = block.timestamp + 1 hours;

        bytes memory callData = abi.encodeWithSelector(
            BlogHub.evaluate.selector,
            articleId,
            uint8(1),
            comment,
            address(0),
            uint256(0)
        );

        ISessionKeyManager.SessionKeyData memory data = sessionKeyManager.getSessionKeyData(user1, sessionKey);

        bytes memory signature = _signSessionOperation(
            sessionKeyPrivateKey,
            user1,
            sessionKey,
            address(blogHub),
            BlogHub.evaluate.selector,
            callData,
            0,
            data.nonce,
            deadline
        );

        vm.prank(owner);
        vm.expectRevert(BlogHub.SpamProtection.selector);
        blogHub.evaluateWithSessionKey(
            user1,
            sessionKey,
            articleId,
            1,
            comment,
            address(0),
            0,
            deadline,
            signature
        );
    }

    function test_EvaluateWithSessionKey_RevertSessionKeyManagerNotSet() public {
        // 创建一个没有设置 SessionKeyManager 的 BlogHub
        BlogHub newBlogHub = new BlogHub();
        bytes memory initData = abi.encodeWithSelector(
            BlogHub.initialize.selector,
            owner,
            treasury
        );
        address proxy = address(new ERC1967Proxy(address(newBlogHub), initData));
        BlogHub blogHubNoManager = BlogHub(payable(proxy));

        vm.prank(user1);
        vm.expectRevert(BlogHub.SessionKeyManagerNotSet.selector);
        blogHubNoManager.evaluateWithSessionKey{value: 1 ether}(
            user1,
            sessionKey,
            1,
            1,
            "",
            address(0),
            0,
            block.timestamp + 1 hours,
            ""
        );
    }

    // ============ collectWithSessionKey 测试 ============

    function test_CollectWithSessionKey_Success() public {
        uint256 articleId = _publishTestArticle(user2);
        uint256 amount = 0.01 ether; // Default collect price
        uint256 deadline = block.timestamp + 1 hours;

        bytes memory callData = abi.encodeWithSelector(
            BlogHub.collect.selector,
            articleId,
            address(0)
        );

        ISessionKeyManager.SessionKeyData memory data = sessionKeyManager.getSessionKeyData(user1, sessionKey);

        bytes memory signature = _signSessionOperation(
            sessionKeyPrivateKey,
            user1,
            sessionKey,
            address(blogHub),
            BlogHub.collect.selector,
            callData,
            amount,
            data.nonce,
            deadline
        );

        vm.expectEmit(true, true, false, true);
        emit ArticleCollected(articleId, user1, amount, articleId);

        vm.expectEmit(true, true, false, true);
        emit SessionKeyOperationExecuted(user1, sessionKey, BlogHub.collect.selector);

        vm.prank(owner);
        blogHub.collectWithSessionKey{value: amount}(
            user1,
            sessionKey,
            articleId,
            address(0),
            deadline,
            signature
        );

        // 验证: Collect 应该铸造 NFT
        assertEq(blogHub.balanceOf(user1, articleId), 1);
    }

    // ============ likeCommentWithSessionKey 测试 ============

    function test_LikeCommentWithSessionKey_Success() public {
        uint256 articleId = _publishTestArticle(user2);
        address commenter = makeAddr("commenter");
        uint256 commentId = 1;
        uint256 amount = 0.5 ether;
        uint256 deadline = block.timestamp + 1 hours;

        bytes memory callData = abi.encodeWithSelector(
            BlogHub.likeComment.selector,
            articleId,
            commentId,
            commenter,
            address(0)
        );

        ISessionKeyManager.SessionKeyData memory data = sessionKeyManager.getSessionKeyData(user1, sessionKey);

        bytes memory signature = _signSessionOperation(
            sessionKeyPrivateKey,
            user1,
            sessionKey,
            address(blogHub),
            BlogHub.likeComment.selector,
            callData,
            amount,
            data.nonce,
            deadline
        );

        vm.expectEmit(true, true, true, true);
        emit CommentLiked(articleId, commentId, user1, commenter, amount);

        vm.expectEmit(true, true, false, true);
        emit SessionKeyOperationExecuted(user1, sessionKey, BlogHub.likeComment.selector);

        vm.prank(owner);
        blogHub.likeCommentWithSessionKey{value: amount}(
            user1,
            sessionKey,
            articleId,
            commentId,
            commenter,
            address(0),
            deadline,
            signature
        );

        // 验证: Like Comment 不再铸造 NFT
        assertEq(blogHub.balanceOf(user1, articleId), 0);
    }

    function test_LikeCommentWithSessionKey_RevertZeroAmount() public {
        uint256 articleId = _publishTestArticle(user2);
        uint256 deadline = block.timestamp + 1 hours;

        bytes memory callData = abi.encodeWithSelector(
            BlogHub.likeComment.selector,
            articleId,
            uint256(1),
            makeAddr("commenter"),
            address(0)
        );

        ISessionKeyManager.SessionKeyData memory data = sessionKeyManager.getSessionKeyData(user1, sessionKey);

        bytes memory signature = _signSessionOperation(
            sessionKeyPrivateKey,
            user1,
            sessionKey,
            address(blogHub),
            BlogHub.likeComment.selector,
            callData,
            0,
            data.nonce,
            deadline
        );

        vm.prank(owner);
        vm.expectRevert(BlogHub.SpamProtection.selector);
        blogHub.likeCommentWithSessionKey(
            user1,
            sessionKey,
            articleId,
            1,
            makeAddr("commenter"),
            address(0),
            deadline,
            signature
        );
    }

    // ============ followWithSessionKey 测试 ============

    function test_FollowWithSessionKey_Success() public {
        uint256 deadline = block.timestamp + 1 hours;

        bytes memory callData = abi.encodeWithSelector(
            BlogHub.follow.selector,
            user2,
            true
        );

        ISessionKeyManager.SessionKeyData memory data = sessionKeyManager.getSessionKeyData(user1, sessionKey);

        bytes memory signature = _signSessionOperation(
            sessionKeyPrivateKey,
            user1,
            sessionKey,
            address(blogHub),
            BlogHub.follow.selector,
            callData,
            0,
            data.nonce,
            deadline
        );

        vm.expectEmit(true, true, false, true);
        emit FollowStatusChanged(user1, user2, true);

        vm.expectEmit(true, true, false, true);
        emit SessionKeyOperationExecuted(user1, sessionKey, BlogHub.follow.selector);

        blogHub.followWithSessionKey(
            user1,
            sessionKey,
            user2,
            true,
            deadline,
            signature
        );
    }

    function test_UnfollowWithSessionKey_Success() public {
        uint256 deadline = block.timestamp + 1 hours;

        bytes memory callData = abi.encodeWithSelector(
            BlogHub.follow.selector,
            user2,
            false
        );

        ISessionKeyManager.SessionKeyData memory data = sessionKeyManager.getSessionKeyData(user1, sessionKey);

        bytes memory signature = _signSessionOperation(
            sessionKeyPrivateKey,
            user1,
            sessionKey,
            address(blogHub),
            BlogHub.follow.selector,
            callData,
            0,
            data.nonce,
            deadline
        );

        vm.expectEmit(true, true, false, true);
        emit FollowStatusChanged(user1, user2, false);

        vm.expectEmit(true, true, false, true);
        emit SessionKeyOperationExecuted(user1, sessionKey, BlogHub.follow.selector);

        blogHub.followWithSessionKey(
            user1,
            sessionKey,
            user2,
            false,
            deadline,
            signature
        );
    }

    function test_FollowWithSessionKey_RevertSessionKeyManagerNotSet() public {
        BlogHub newBlogHub = new BlogHub();
        bytes memory initData = abi.encodeWithSelector(
            BlogHub.initialize.selector,
            owner,
            treasury
        );
        address proxy = address(new ERC1967Proxy(address(newBlogHub), initData));
        BlogHub blogHubNoManager = BlogHub(payable(proxy));

        vm.prank(user1);
        vm.expectRevert(BlogHub.SessionKeyManagerNotSet.selector);
        blogHubNoManager.followWithSessionKey(
            user1,
            sessionKey,
            user2,
            true,
            block.timestamp + 1 hours,
            ""
        );
    }

    // ============ publishWithSessionKey 测试 ============

    event ArticlePublished(
        uint256 indexed articleId,
        address indexed author,
        uint16 indexed categoryId,
        string arweaveId,
        string originalAuthor,
        string title,
        string summary,
        uint96 collectPrice,
        uint32 maxCollectSupply,
        BlogHub.Originality originality
    );

    function test_PublishWithSessionKey_Success() public {
        uint256 deadline = block.timestamp + 1 hours;
        
        BlogHub.PublishParams memory params = BlogHub.PublishParams({
            arweaveId: "test-arweave-hash-session",
            categoryId: 1,
            royaltyBps: 500,
            originalAuthor: "",
            title: "Session Key Published Article",
            summary: "",
            trueAuthor: address(0),
            collectPrice: 0.01 ether,
            maxCollectSupply: 100,
            originality: BlogHub.Originality.Original
        });

        bytes memory callData = abi.encodeWithSelector(
            BlogHub.publish.selector,
            params
        );

        ISessionKeyManager.SessionKeyData memory data = sessionKeyManager.getSessionKeyData(user1, sessionKey);

        bytes memory signature = _signSessionOperation(
            sessionKeyPrivateKey,
            user1,
            sessionKey,
            address(blogHub),
            BlogHub.publish.selector,
            callData,
            0, // publish 不需要支付
            data.nonce,
            deadline
        );

        uint256 expectedArticleId = blogHub.nextArticleId();

        vm.expectEmit(true, true, true, true);
        emit ArticlePublished(
            expectedArticleId,
            user1,
            params.categoryId,
            params.arweaveId,
            params.originalAuthor,
            params.title,
            params.summary,
            params.collectPrice,
            params.maxCollectSupply,
            params.originality
        );

        vm.expectEmit(true, true, false, true);
        emit SessionKeyOperationExecuted(user1, sessionKey, BlogHub.publish.selector);

        uint256 articleId = blogHub.publishWithSessionKey(
            user1,
            sessionKey,
            params,
            deadline,
            signature
        );

        // 验证文章创建
        assertEq(articleId, expectedArticleId);
        
        // 验证 NFT 铸造给 owner (user1) - creator gets 1
        assertEq(blogHub.balanceOf(user1, articleId), 1);
        
        // 验证文章元数据
        (
            address storedAuthor,
            uint64 storedTimestamp,
            uint16 storedCategoryId,
            BlogHub.Originality storedOriginality,
            uint96 storedPrice,
            uint32 storedSupply,
            uint32 storedCount,
            string memory storedArweaveHash
        ) = blogHub.articles(articleId);
        
        assertEq(storedArweaveHash, params.arweaveId);
        assertEq(storedCategoryId, params.categoryId);
        assertEq(storedTimestamp, uint64(block.timestamp));
        assertEq(storedAuthor, user1);
        assertEq(storedPrice, params.collectPrice);
        assertEq(storedSupply, params.maxCollectSupply);
        assertEq(storedCount, 1);
        assertEq(uint(storedOriginality), uint(params.originality));
    }

    function test_PublishWithSessionKey_WithOriginalAuthor() public {
        uint256 deadline = block.timestamp + 1 hours;

        BlogHub.PublishParams memory params = BlogHub.PublishParams({
            arweaveId: "test-arweave-hash-proxy",
            categoryId: 2,
            royaltyBps: 1000,
            originalAuthor: "RealAuthorName",
            title: "Proxy Published Article",
            summary: "",
            trueAuthor: address(0),
            collectPrice: 0.01 ether,
            maxCollectSupply: 100,
            originality: BlogHub.Originality.SemiOriginal
        });

        bytes memory callData = abi.encodeWithSelector(
            BlogHub.publish.selector,
            params
        );

        ISessionKeyManager.SessionKeyData memory data = sessionKeyManager.getSessionKeyData(user1, sessionKey);

        bytes memory signature = _signSessionOperation(
            sessionKeyPrivateKey,
            user1,
            sessionKey,
            address(blogHub),
            BlogHub.publish.selector,
            callData,
            0,
            data.nonce,
            deadline
        );

        uint256 articleId = blogHub.publishWithSessionKey(
            user1,
            sessionKey,
            params,
            deadline,
            signature
        );

        // originalAuthor 只通过 event 输出，不做链上存储
        (address storedAuthor, , , , , , , ) = blogHub.articles(articleId);
        assertEq(storedAuthor, user1);
    }

    function test_PublishWithSessionKey_RevertOriginalAuthorTooLong() public {
        uint256 deadline = block.timestamp + 1 hours;
        string memory longOriginalAuthor = "This is a very long original author name that exceeds the maximum allowed length of 64 bytes";

        BlogHub.PublishParams memory params = BlogHub.PublishParams({
            arweaveId: "test-hash",
            categoryId: 1,
            royaltyBps: 500,
            originalAuthor: longOriginalAuthor,
            title: "Title",
            summary: "",
            trueAuthor: address(0),
            collectPrice: 0,
            maxCollectSupply: 0,
            originality: BlogHub.Originality.Original
        });

        bytes memory callData = abi.encodeWithSelector(
            BlogHub.publish.selector,
            params
        );

        ISessionKeyManager.SessionKeyData memory data = sessionKeyManager.getSessionKeyData(user1, sessionKey);

        bytes memory signature = _signSessionOperation(
            sessionKeyPrivateKey,
            user1,
            sessionKey,
            address(blogHub),
            BlogHub.publish.selector,
            callData,
            0,
            data.nonce,
            deadline
        );

        vm.expectRevert(BlogHub.OriginalAuthorTooLong.selector);
        blogHub.publishWithSessionKey(
            user1,
            sessionKey,
            params,
            deadline,
            signature
        );
    }

    function test_PublishWithSessionKey_RevertTitleTooLong() public {
        uint256 deadline = block.timestamp + 1 hours;
        string memory longTitle = "This is a very long title that exceeds the maximum allowed length of 128 bytes. It keeps going and going until it is definitely too long for the contract to accept.";

        BlogHub.PublishParams memory params = BlogHub.PublishParams({
            arweaveId: "test-hash",
            categoryId: 1,
            royaltyBps: 500,
            originalAuthor: "",
            title: longTitle,
            summary: "",
            trueAuthor: address(0),
            collectPrice: 0,
            maxCollectSupply: 0,
            originality: BlogHub.Originality.Original
        });

        bytes memory callData = abi.encodeWithSelector(
            BlogHub.publish.selector,
            params
        );

        ISessionKeyManager.SessionKeyData memory data = sessionKeyManager.getSessionKeyData(user1, sessionKey);

        bytes memory signature = _signSessionOperation(
            sessionKeyPrivateKey,
            user1,
            sessionKey,
            address(blogHub),
            BlogHub.publish.selector,
            callData,
            0,
            data.nonce,
            deadline
        );

        vm.expectRevert(BlogHub.TitleTooLong.selector);
        blogHub.publishWithSessionKey(
            user1,
            sessionKey,
            params,
            deadline,
            signature
        );
    }

    function test_PublishWithSessionKey_RevertSessionKeyManagerNotSet() public {
        BlogHub newBlogHub = new BlogHub();
        bytes memory initData = abi.encodeWithSelector(
            BlogHub.initialize.selector,
            owner,
            treasury
        );
        address proxy = address(new ERC1967Proxy(address(newBlogHub), initData));
        BlogHub blogHubNoManager = BlogHub(payable(proxy));

        BlogHub.PublishParams memory params = BlogHub.PublishParams({
            arweaveId: "test-hash",
            categoryId: 1,
            royaltyBps: 500,
            originalAuthor: "",
            title: "Title",
            summary: "",
            trueAuthor: address(0),
            collectPrice: 0,
            maxCollectSupply: 0,
            originality: BlogHub.Originality.Original
        });

        vm.expectRevert(BlogHub.SessionKeyManagerNotSet.selector);
        blogHubNoManager.publishWithSessionKey(
            user1,
            sessionKey,
            params,
            block.timestamp + 1 hours,
            ""
        );
    }

    function test_PublishWithSessionKey_RevertInvalidSignature() public {
        uint256 deadline = block.timestamp + 1 hours;

        BlogHub.PublishParams memory params = BlogHub.PublishParams({
            arweaveId: "test-hash",
            categoryId: 1,
            royaltyBps: 500,
            originalAuthor: "",
            title: "Title",
            summary: "",
            trueAuthor: address(0),
            collectPrice: 0,
            maxCollectSupply: 1,
            originality: BlogHub.Originality.Original
        });

        bytes memory callData = abi.encodeWithSelector(
            BlogHub.publish.selector,
            params
        );

        bytes memory invalidSignature = _signSessionOperation(
            user2PrivateKey,
            user1,
            sessionKey,
            address(blogHub),
            BlogHub.publish.selector,
            callData,
            0,
            0,
            deadline
        );

        vm.expectRevert(SessionKeyManager.InvalidSignature.selector);
        blogHub.publishWithSessionKey(
            user1,
            sessionKey,
            params,
            deadline,
            invalidSignature
        );
    }

    function test_PublishWithSessionKey_MultipleArticles() public {
        uint256 deadline = block.timestamp + 1 hours;

        BlogHub.PublishParams memory params1 = BlogHub.PublishParams({
            arweaveId: "arweave-hash-1",
            categoryId: 1,
            royaltyBps: 500,
            originalAuthor: "",
            title: "First Article",
            summary: "",
            trueAuthor: address(0),
            collectPrice: 0.01 ether,
            maxCollectSupply: 100,
            originality: BlogHub.Originality.Original
        });

        bytes memory callData1 = abi.encodeWithSelector(
            BlogHub.publish.selector,
            params1
        );

        ISessionKeyManager.SessionKeyData memory data1 = sessionKeyManager.getSessionKeyData(user1, sessionKey);

        bytes memory signature1 = _signSessionOperation(
            sessionKeyPrivateKey,
            user1,
            sessionKey,
            address(blogHub),
            BlogHub.publish.selector,
            callData1,
            0,
            data1.nonce,
            deadline
        );

        uint256 articleId1 = blogHub.publishWithSessionKey(
            user1,
            sessionKey,
            params1,
            deadline,
            signature1
        );

        BlogHub.PublishParams memory params2 = BlogHub.PublishParams({
            arweaveId: "arweave-hash-2",
            categoryId: 2,
            royaltyBps: 1000,
            originalAuthor: "",
            title: "Second Article",
            summary: "",
            trueAuthor: address(0),
            collectPrice: 0.01 ether,
            maxCollectSupply: 100,
            originality: BlogHub.Originality.Original
        });

        bytes memory callData2 = abi.encodeWithSelector(
            BlogHub.publish.selector,
            params2
        );

        ISessionKeyManager.SessionKeyData memory data2 = sessionKeyManager.getSessionKeyData(user1, sessionKey);
        assertEq(data2.nonce, data1.nonce + 1);

        bytes memory signature2 = _signSessionOperation(
            sessionKeyPrivateKey,
            user1,
            sessionKey,
            address(blogHub),
            BlogHub.publish.selector,
            callData2,
            0,
            data2.nonce,
            deadline
        );

        uint256 articleId2 = blogHub.publishWithSessionKey(
            user1,
            sessionKey,
            params2,
            deadline,
            signature2
        );

        assertEq(articleId2, articleId1 + 1);
        assertEq(blogHub.balanceOf(user1, articleId1), 1);
        assertEq(blogHub.balanceOf(user1, articleId2), 1);
    }

    function test_MultipleSessionKeyOperations() public {
        uint256 articleId = _publishTestArticle(user2);
        uint256 deadline = block.timestamp + 1 hours;
        uint256 amount = 1 ether;

        bytes memory callData1 = abi.encodeWithSelector(
            BlogHub.evaluate.selector,
            articleId,
            uint8(1),
            "First comment",
            address(0),
            uint256(0)
        );

        ISessionKeyManager.SessionKeyData memory data1 = sessionKeyManager.getSessionKeyData(user1, sessionKey);

        bytes memory signature1 = _signSessionOperation(
            sessionKeyPrivateKey,
            user1,
            sessionKey,
            address(blogHub),
            BlogHub.evaluate.selector,
            callData1,
            amount,
            data1.nonce,
            deadline
        );

        vm.prank(owner);
        blogHub.evaluateWithSessionKey{value: amount}(
            user1,
            sessionKey,
            articleId,
            1,
            "First comment",
            address(0),
            0,
            deadline,
            signature1
        );

        bytes memory callData2 = abi.encodeWithSelector(
            BlogHub.follow.selector,
            user2,
            true
        );

        ISessionKeyManager.SessionKeyData memory data2 = sessionKeyManager.getSessionKeyData(user1, sessionKey);
        assertEq(data2.nonce, data1.nonce + 1);

        bytes memory signature2 = _signSessionOperation(
            sessionKeyPrivateKey,
            user1,
            sessionKey,
            address(blogHub),
            BlogHub.follow.selector,
            callData2,
            0,
            data2.nonce,
            deadline
        );

        vm.prank(owner);
        blogHub.followWithSessionKey(
            user1,
            sessionKey,
            user2,
            true,
            deadline,
            signature2
        );

        assertEq(blogHub.balanceOf(user1, articleId), 0);
    }

    function test_Evaluate_PaymentWithReferrer_SameAsDirect() public {
        uint256 articleId = _publishTestArticle(user2);
        address referrer = makeAddr("referrer");
        uint256 amount = 1 ether;

        uint256 expectedPlatformShare = (amount * blogHub.platformFeeBps()) / 10000;
        uint256 expectedReferralShare = (amount * 1000) / 10000;
        uint256 expectedAuthorShare = amount - expectedPlatformShare - expectedReferralShare;

        uint256 snap = vm.snapshot();

        uint256 treasuryBefore = treasury.balance;
        uint256 authorBefore = user2.balance;
        uint256 payerBefore = user1.balance;

        vm.prank(user1);
        blogHub.evaluate{value: amount}(articleId, 1, "", referrer, 0);

        assertEq(treasury.balance - treasuryBefore, expectedPlatformShare);
        assertEq(payerBefore - user1.balance, amount);
        assertEq(user2.balance - authorBefore, expectedAuthorShare);

        vm.revertTo(snap);

        uint256 deadline = block.timestamp + 1 hours;
        bytes memory callData = abi.encodeWithSelector(
            BlogHub.evaluate.selector,
            articleId,
            uint8(1),
            "",
            referrer,
            uint256(0)
        );

        ISessionKeyManager.SessionKeyData memory data = sessionKeyManager.getSessionKeyData(user1, sessionKey);
        bytes memory signature = _signSessionOperation(
            sessionKeyPrivateKey,
            user1,
            sessionKey,
            address(blogHub),
            BlogHub.evaluate.selector,
            callData,
            amount,
            data.nonce,
            deadline
        );

        treasuryBefore = treasury.balance;
        authorBefore = user2.balance;
        uint256 ownerBefore = owner.balance;
        uint256 referrerBefore = referrer.balance;

        vm.prank(owner);
        blogHub.evaluateWithSessionKey{value: amount}(
            user1,
            sessionKey,
            articleId,
            1,
            "",
            referrer,
            0,
            deadline,
            signature
        );

        assertEq(treasury.balance - treasuryBefore, expectedPlatformShare);
        assertEq(ownerBefore - owner.balance, amount);
        assertEq(referrer.balance - referrerBefore, expectedReferralShare);
        assertEq(user2.balance - authorBefore, expectedAuthorShare);
    }

    function test_Evaluate_InvalidReferrer_NoReferral_SameAsDirect() public {
        uint256 articleId = _publishTestArticle(user2);
        address referrer = user1;
        uint256 amount = 1 ether;

        uint256 expectedPlatformShare = (amount * blogHub.platformFeeBps()) / 10000;
        uint256 expectedReferralShare = 0;
        uint256 expectedAuthorShare = amount - expectedPlatformShare;

        uint256 snap = vm.snapshot();

        uint256 treasuryBefore = treasury.balance;
        uint256 authorBefore = user2.balance;
        uint256 payerBefore = user1.balance;

        vm.prank(user1);
        blogHub.evaluate{value: amount}(articleId, 1, "", referrer, 0);

        assertEq(treasury.balance - treasuryBefore, expectedPlatformShare);
        assertEq(payerBefore - user1.balance, amount);
        assertEq(user2.balance - authorBefore, expectedAuthorShare);

        vm.revertTo(snap);

        uint256 deadline = block.timestamp + 1 hours;
        bytes memory callData = abi.encodeWithSelector(
            BlogHub.evaluate.selector,
            articleId,
            uint8(1),
            "",
            referrer,
            uint256(0)
        );

        ISessionKeyManager.SessionKeyData memory data = sessionKeyManager.getSessionKeyData(user1, sessionKey);
        bytes memory signature = _signSessionOperation(
            sessionKeyPrivateKey,
            user1,
            sessionKey,
            address(blogHub),
            BlogHub.evaluate.selector,
            callData,
            amount,
            data.nonce,
            deadline
        );

        treasuryBefore = treasury.balance;
        authorBefore = user2.balance;
        uint256 ownerBefore = owner.balance;
        uint256 referrerBefore = referrer.balance;

        vm.prank(owner);
        blogHub.evaluateWithSessionKey{value: amount}(
            user1,
            sessionKey,
            articleId,
            1,
            "",
            referrer,
            0,
            deadline,
            signature
        );

        assertEq(treasury.balance - treasuryBefore, expectedPlatformShare);
        assertEq(ownerBefore - owner.balance, amount);
        assertEq(referrer.balance - referrerBefore, expectedReferralShare);
        assertEq(user2.balance - authorBefore, expectedAuthorShare);
    }

    function test_Collect_PaymentWithReferrer_SameAsDirect() public {
        uint256 articleId = _publishTestArticle(user2);
        address referrer = makeAddr("referrer");
        uint256 amount = 0.01 ether;

        uint256 expectedPlatformShare = (amount * blogHub.platformFeeBps()) / 10000;
        uint256 expectedReferralShare = (amount * 1000) / 10000;
        uint256 expectedAuthorShare = amount - expectedPlatformShare - expectedReferralShare;

        uint256 snap = vm.snapshot();

        (,,,, uint96 collectPrice0, uint32 maxSupply0, uint32 collectCount0, ) = blogHub.articles(articleId);
        assertEq(collectPrice0, amount);
        assertEq(maxSupply0, 100);
        assertEq(collectCount0, 1);

        uint256 treasuryBefore = treasury.balance;
        uint256 authorBefore = user2.balance;
        uint256 referrerBefore = referrer.balance;

        vm.prank(user1);
        blogHub.collect{value: amount}(articleId, referrer);

        assertEq(blogHub.balanceOf(user1, articleId), 1);

        (,,,, , , uint32 collectCount1, ) = blogHub.articles(articleId);
        assertEq(collectCount1, 2);

        assertEq(treasury.balance - treasuryBefore, expectedPlatformShare);
        assertEq(referrer.balance - referrerBefore, expectedReferralShare);
        assertEq(user2.balance - authorBefore, expectedAuthorShare);

        vm.revertTo(snap);

        uint256 deadline = block.timestamp + 1 hours;
        bytes memory callData = abi.encodeWithSelector(
            BlogHub.collect.selector,
            articleId,
            referrer
        );

        ISessionKeyManager.SessionKeyData memory data = sessionKeyManager.getSessionKeyData(user1, sessionKey);
        bytes memory signature = _signSessionOperation(
            sessionKeyPrivateKey,
            user1,
            sessionKey,
            address(blogHub),
            BlogHub.collect.selector,
            callData,
            amount,
            data.nonce,
            deadline
        );

        (,,,, collectPrice0, maxSupply0, collectCount0, ) = blogHub.articles(articleId);
        assertEq(collectPrice0, amount);
        assertEq(maxSupply0, 100);
        assertEq(collectCount0, 1);

        treasuryBefore = treasury.balance;
        authorBefore = user2.balance;
        referrerBefore = referrer.balance;

        vm.prank(owner);
        blogHub.collectWithSessionKey{value: amount}(
            user1,
            sessionKey,
            articleId,
            referrer,
            deadline,
            signature
        );

        assertEq(blogHub.balanceOf(user1, articleId), 1);

        (,,,, , , collectCount1, ) = blogHub.articles(articleId);
        assertEq(collectCount1, 2);

        assertEq(treasury.balance - treasuryBefore, expectedPlatformShare);
        assertEq(referrer.balance - referrerBefore, expectedReferralShare);
        assertEq(user2.balance - authorBefore, expectedAuthorShare);
    }

    function test_Collect_MaxSupplyReached_SameAsDirect() public {
        uint256 amount = 0.01 ether;

        vm.prank(user2);
        uint256 articleId = blogHub.publish(
            BlogHub.PublishParams({
                arweaveId: "test-arweave-hash",
                categoryId: 1,
                royaltyBps: 500,
                originalAuthor: "",
                title: "Test Title",
                summary: "",
                trueAuthor: address(0),
                collectPrice: uint96(amount),
                maxCollectSupply: 2,
                originality: BlogHub.Originality.Original
            })
        );

        uint256 snap = vm.snapshot();

        vm.prank(user1);
        blogHub.collect{value: amount}(articleId, address(0));

        vm.prank(user1);
        vm.expectRevert(BlogHub.MaxSupplyReached.selector);
        blogHub.collect{value: amount}(articleId, address(0));

        vm.revertTo(snap);

        uint256 deadline = block.timestamp + 1 hours;
        bytes memory callData = abi.encodeWithSelector(
            BlogHub.collect.selector,
            articleId,
            address(0)
        );

        ISessionKeyManager.SessionKeyData memory data1 = sessionKeyManager.getSessionKeyData(user1, sessionKey);
        bytes memory signature1 = _signSessionOperation(
            sessionKeyPrivateKey,
            user1,
            sessionKey,
            address(blogHub),
            BlogHub.collect.selector,
            callData,
            amount,
            data1.nonce,
            deadline
        );

        vm.prank(owner);
        blogHub.collectWithSessionKey{value: amount}(
            user1,
            sessionKey,
            articleId,
            address(0),
            deadline,
            signature1
        );

        ISessionKeyManager.SessionKeyData memory data2 = sessionKeyManager.getSessionKeyData(user1, sessionKey);
        bytes memory signature2 = _signSessionOperation(
            sessionKeyPrivateKey,
            user1,
            sessionKey,
            address(blogHub),
            BlogHub.collect.selector,
            callData,
            amount,
            data2.nonce,
            deadline
        );

        vm.prank(owner);
        vm.expectRevert(BlogHub.MaxSupplyReached.selector);
        blogHub.collectWithSessionKey{value: amount}(
            user1,
            sessionKey,
            articleId,
            address(0),
            deadline,
            signature2
        );
    }

    function test_LikeComment_PaymentWithReferrer_SameAsDirect() public {
        uint256 articleId = _publishTestArticle(user2);
        address commenter = makeAddr("commenter");
        address referrer = makeAddr("referrer");
        uint256 commentId = 1;
        uint256 amount = 1 ether;

        uint256 expectedPlatformShare = (amount * blogHub.platformFeeBps()) / 10000;
        uint256 expectedReferralShare = (amount * 1000) / 10000;
        uint256 expectedRemaining = amount - expectedPlatformShare - expectedReferralShare;
        uint256 expectedAuthorShare = expectedRemaining / 2;
        uint256 expectedCommenterShare = expectedRemaining - expectedAuthorShare;

        uint256 snap = vm.snapshot();

        uint256 treasuryBefore = treasury.balance;
        uint256 authorBefore = user2.balance;
        uint256 commenterBefore = commenter.balance;
        uint256 referrerBefore = referrer.balance;

        vm.prank(user1);
        blogHub.likeComment{value: amount}(articleId, commentId, commenter, referrer);

        assertEq(treasury.balance - treasuryBefore, expectedPlatformShare);
        assertEq(referrer.balance - referrerBefore, expectedReferralShare);
        assertEq(user2.balance - authorBefore, expectedAuthorShare);
        assertEq(commenter.balance - commenterBefore, expectedCommenterShare);

        vm.revertTo(snap);

        uint256 deadline = block.timestamp + 1 hours;
        bytes memory callData = abi.encodeWithSelector(
            BlogHub.likeComment.selector,
            articleId,
            commentId,
            commenter,
            referrer
        );

        ISessionKeyManager.SessionKeyData memory data = sessionKeyManager.getSessionKeyData(user1, sessionKey);
        bytes memory signature = _signSessionOperation(
            sessionKeyPrivateKey,
            user1,
            sessionKey,
            address(blogHub),
            BlogHub.likeComment.selector,
            callData,
            amount,
            data.nonce,
            deadline
        );

        treasuryBefore = treasury.balance;
        authorBefore = user2.balance;
        commenterBefore = commenter.balance;
        referrerBefore = referrer.balance;

        vm.prank(owner);
        blogHub.likeCommentWithSessionKey{value: amount}(
            user1,
            sessionKey,
            articleId,
            commentId,
            commenter,
            referrer,
            deadline,
            signature
        );

        assertEq(treasury.balance - treasuryBefore, expectedPlatformShare);
        assertEq(referrer.balance - referrerBefore, expectedReferralShare);
        assertEq(user2.balance - authorBefore, expectedAuthorShare);
        assertEq(commenter.balance - commenterBefore, expectedCommenterShare);
    }

    function test_PublishWithSessionKey_RevertRoyaltyTooHigh() public {
        uint256 deadline = block.timestamp + 1 hours;
        
        BlogHub.PublishParams memory params = BlogHub.PublishParams({
            arweaveId: "test-hash",
            categoryId: 1,
            royaltyBps: 10001, // Invalid
            originalAuthor: "",
            title: "Title",
            summary: "",
            trueAuthor: address(0),
            collectPrice: 0,
            maxCollectSupply: 0,
            originality: BlogHub.Originality.Original
        });

        bytes memory callData = abi.encodeWithSelector(
            BlogHub.publish.selector,
            params.arweaveId,
            params.categoryId,
            params.royaltyBps,
            params.originalAuthor,
            params.title,
            params.summary,
            params.trueAuthor,
            params.collectPrice,
            params.maxCollectSupply,
            params.originality
        );

        ISessionKeyManager.SessionKeyData memory data = sessionKeyManager.getSessionKeyData(user1, sessionKey);

        bytes memory signature = _signSessionOperation(
            sessionKeyPrivateKey,
            user1,
            sessionKey,
            address(blogHub),
            BlogHub.publish.selector,
            callData,
            0,
            data.nonce,
            deadline
        );

        vm.expectRevert(BlogHub.RoyaltyTooHigh.selector);
        blogHub.publishWithSessionKey(
            user1,
            sessionKey,
            params,
            deadline,
            signature
        );
    }
}
