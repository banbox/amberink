// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {BaseTest} from "./BaseTest.sol";
import {BlogHub} from "../src/BlogHub.sol";

/**
 * @title BlogHubTest
 * @dev BlogHub 合约的核心功能单元测试
 */
contract BlogHubTest is BaseTest {
    // ============ 事件定义 ============
    event ArticlePublished(
        uint256 indexed articleId,
        address indexed author,
        uint16 indexed categoryId,
        string arweaveId,
        string originalAuthor,
        string title,
        string summary,
        uint96 collectPrice,
        uint16 maxCollectSupply,
        BlogHub.Originality originality,
        BlogHub.Visibility visibility
    );

    event ArticleEvaluated(uint256 indexed articleId, address indexed user, uint8 score, uint256 amountPaid);

    event CommentAdded(
        uint256 indexed articleId,
        address indexed commenter,
        string content,
        uint256 parentCommentId,
        uint8 score
    );

    event FollowStatusChanged(address indexed follower, address indexed target, bool isFollowing);

    event CommentLiked(
        uint256 indexed articleId,
        uint256 indexed commentId,
        address indexed liker,
        address commenter,
        uint256 amountPaid
    );

    event ReferralPaid(address indexed referrer, uint256 amount);

    // ============ 初始化测试 ============

    function test_Initialize_Success() public view {
        assertTrue(blogHub.hasRole(blogHub.DEFAULT_ADMIN_ROLE(), owner));
        assertTrue(blogHub.hasRole(blogHub.UPGRADER_ROLE(), owner));
        assertTrue(blogHub.hasRole(blogHub.PAUSER_ROLE(), owner));
        assertEq(blogHub.platformTreasury(), treasury);
        assertEq(blogHub.platformFeeBps(), 1000); // 默认 10% 平台抽成
        assertEq(blogHub.nextArticleId(), 1);
    }

    // ============ 发布文章测试 ============

    function test_Publish_Success() public {
        string memory arweaveHash = "test-arweave-hash-123";
        uint16 categoryId = 1;
        uint96 royaltyBps = 500;
        string memory originalAuthor = "";
        string memory title = "Test Article Title";
        address trueAuthor = address(0);
        uint96 collectPrice = 0.01 ether;
        uint16 maxCollectSupply = 100;
        BlogHub.Originality originality = BlogHub.Originality.Original;
        BlogHub.Visibility visibility = BlogHub.Visibility.Public;

        vm.expectEmit(true, true, true, true);
        emit ArticlePublished(
            1,
            user1,
            categoryId,
            arweaveHash,
            originalAuthor,
            title,
            "", // summary
            collectPrice,
            maxCollectSupply,
            originality,
            visibility
        );

        vm.prank(user1);
        uint256 articleId = blogHub.publish(
            BlogHub.PublishParams({
                arweaveId: arweaveHash,
                categoryId: categoryId,
                royaltyBps: royaltyBps,
                originalAuthor: originalAuthor,
                title: title,
                summary: "",
                trueAuthor: trueAuthor,
                collectPrice: collectPrice,
                maxCollectSupply: maxCollectSupply,
                originality: originality,
                visibility: visibility
            })
        );

        assertEq(articleId, 1);
        assertEq(blogHub.nextArticleId(), 2);

        // 验证文章数据
        (
            address storedAuthor,
            uint64 storedTimestamp,
            uint16 catId,
            BlogHub.Originality storedOriginality,
            BlogHub.Visibility storedVisibility,
            uint96 storedCollectPrice,
            uint16 storedMaxCollectSupply,
            uint16 storedCollectCount,
            string memory hash
        ) = blogHub.articles(articleId);
        assertEq(hash, arweaveHash);
        assertEq(storedAuthor, trueAuthor == address(0) ? user1 : trueAuthor);
        assertEq(catId, categoryId);
        assertEq(storedTimestamp, block.timestamp);
        assertEq(storedCollectPrice, collectPrice);
        assertEq(storedMaxCollectSupply, maxCollectSupply);
        assertEq(storedCollectCount, 0);
        assertEq(uint256(storedOriginality), uint256(originality));
        assertEq(uint256(storedVisibility), uint256(visibility));

        // 验证 NFT 铸造
        assertEq(blogHub.balanceOf(user1, articleId), 1);
    }

    function test_Publish_WithOriginalAuthor() public {
        string memory arweaveHash = "test-arweave-hash-456";
        uint16 categoryId = 2;
        uint96 royaltyBps = 500;
        string memory originalAuthor = "RealAuthor.eth";
        string memory title = "Another Article";
        address trueAuthor = address(0);
        uint96 collectPrice = 0.01 ether;
        uint16 maxCollectSupply = 100;
        BlogHub.Originality originality = BlogHub.Originality.Original;
        BlogHub.Visibility visibility = BlogHub.Visibility.Public;

        vm.expectEmit(true, true, true, true);
        emit ArticlePublished(
            1,
            user1,
            categoryId,
            arweaveHash,
            originalAuthor,
            title,
            "", // summary
            collectPrice,
            maxCollectSupply,
            originality,
            visibility
        );

        vm.prank(user1);
        uint256 articleId = blogHub.publish(
            BlogHub.PublishParams({
                arweaveId: arweaveHash,
                categoryId: categoryId,
                royaltyBps: royaltyBps,
                originalAuthor: originalAuthor,
                title: title,
                summary: "",
                trueAuthor: trueAuthor,
                collectPrice: collectPrice,
                maxCollectSupply: maxCollectSupply,
                originality: originality,
                visibility: visibility
            })
        );

        // 验证文章数据
        (address storedAuthor, uint64 storedTs, uint16 catId, , , , , , string memory hash) = blogHub.articles(
            articleId
        );
        assertEq(hash, arweaveHash);
        assertEq(storedAuthor, user1); // 存储的 author 为收款作者（trueAuthor 为空则为发布者）
        assertEq(catId, categoryId);
        assertEq(storedTs, block.timestamp);
    }

    function test_Publish_RevertOriginalAuthorTooLong() public {
        // 创建超长的原作者名称 (>64 字节)
        bytes memory longAuthor = new bytes(65);
        for (uint256 i = 0; i < 65; i++) {
            longAuthor[i] = "a";
        }

        vm.prank(user1);
        vm.expectRevert(BlogHub.OriginalAuthorTooLong.selector);
        blogHub.publish(
            BlogHub.PublishParams({
                arweaveId: "hash",
                categoryId: 1,
                royaltyBps: 500,
                originalAuthor: string(longAuthor),
                title: "Title",
                summary: "",
                trueAuthor: address(0),
                collectPrice: 0,
                maxCollectSupply: 0,
                originality: BlogHub.Originality.Original,
                visibility: BlogHub.Visibility.Public
            })
        );
    }

    function test_Publish_RevertRoyaltyTooHigh() public {
        vm.prank(user1);
        vm.expectRevert(BlogHub.RoyaltyTooHigh.selector);
        blogHub.publish(
            BlogHub.PublishParams({
                arweaveId: "hash",
                categoryId: 1,
                royaltyBps: 10001,
                originalAuthor: "",
                title: "Title",
                summary: "",
                trueAuthor: address(0),
                collectPrice: 0,
                maxCollectSupply: 0,
                originality: BlogHub.Originality.Original,
                visibility: BlogHub.Visibility.Public
            })
        ); // 超过 100%
    }

    function test_Publish_MultipleArticles() public {
        vm.startPrank(user1);
        uint256 id1 = blogHub.publish(
            BlogHub.PublishParams({
                arweaveId: "hash1",
                categoryId: 1,
                royaltyBps: 500,
                originalAuthor: "",
                title: "Title1",
                summary: "",
                trueAuthor: address(0),
                collectPrice: 0.01 ether,
                maxCollectSupply: 100,
                originality: BlogHub.Originality.Original,
                visibility: BlogHub.Visibility.Public
            })
        );
        uint256 id2 = blogHub.publish(
            BlogHub.PublishParams({
                arweaveId: "hash2",
                categoryId: 2,
                royaltyBps: 300,
                originalAuthor: "Author2",
                title: "Title2",
                summary: "",
                trueAuthor: address(0),
                collectPrice: 0.01 ether,
                maxCollectSupply: 100,
                originality: BlogHub.Originality.Original,
                visibility: BlogHub.Visibility.Public
            })
        );
        uint256 id3 = blogHub.publish(
            BlogHub.PublishParams({
                arweaveId: "hash3",
                categoryId: 1,
                royaltyBps: 1000,
                originalAuthor: "Author3.eth",
                title: "Title3",
                summary: "",
                trueAuthor: address(0),
                collectPrice: 0.01 ether,
                maxCollectSupply: 100,
                originality: BlogHub.Originality.Original,
                visibility: BlogHub.Visibility.Public
            })
        );
        vm.stopPrank();

        assertEq(id1, 1);
        assertEq(id2, 2);
        assertEq(id3, 3);
        assertEq(blogHub.nextArticleId(), 4);
    }

    // ============ 评价文章测试 ============

    function test_Evaluate_LikeWithPayment() public {
        uint256 articleId = _publishTestArticle(user1);
        uint256 paymentAmount = 1 ether;

        // 记录初始余额
        uint256 treasuryBalanceBefore = treasury.balance;
        uint256 authorBalanceBefore = user1.balance;

        vm.expectEmit(true, true, false, true);
        emit ArticleEvaluated(articleId, user2, 1, paymentAmount);

        vm.prank(user2);
        blogHub.evaluate{value: paymentAmount}(articleId, 1, "", address(0), 0);

        // 验证 NFT 铸造给评价者
        assertEq(blogHub.balanceOf(user2, articleId), 0);

        // 验证资金直接转账 (10% 平台费)
        uint256 platformFee = (paymentAmount * 1000) / 10000;
        uint256 authorShare = paymentAmount - platformFee;

        assertEq(treasury.balance, treasuryBalanceBefore + platformFee);
        assertEq(user1.balance, authorBalanceBefore + authorShare);
    }

    function test_Evaluate_DislikeWithPayment() public {
        uint256 articleId = _publishTestArticle(user1);
        uint256 paymentAmount = 1 ether;

        // 记录初始余额
        uint256 treasuryBalanceBefore = treasury.balance;
        uint256 authorBalanceBefore = user1.balance;

        vm.prank(user2);
        blogHub.evaluate{value: paymentAmount}(articleId, 2, "", address(0), 0);

        // Dislike 时全部直接转给平台
        assertEq(treasury.balance, treasuryBalanceBefore + paymentAmount);
        assertEq(user1.balance, authorBalanceBefore); // 作者余额不变

        // Dislike 不铸造 NFT
        assertEq(blogHub.balanceOf(user2, articleId), 0);
    }

    function test_Evaluate_WithComment() public {
        uint256 articleId = _publishTestArticle(user1);
        string memory comment = "Great article!";

        vm.expectEmit(true, true, false, true);
        emit CommentAdded(articleId, user2, comment, 0, 1);

        vm.prank(user2);
        blogHub.evaluate{value: 0.1 ether}(articleId, 1, comment, address(0), 0);
    }

    function test_Evaluate_WithReferrer() public {
        uint256 articleId = _publishTestArticle(user1);
        uint256 paymentAmount = 1 ether;
        address referrer = makeAddr("referrer");

        // 记录初始余额
        uint256 referrerBalanceBefore = referrer.balance;

        vm.expectEmit(true, false, false, true);
        emit ReferralPaid(referrer, (paymentAmount * 1000) / 10000); // 10%

        vm.prank(user2);
        blogHub.evaluate{value: paymentAmount}(articleId, 1, "", referrer, 0);

        // 验证推荐费直接转账
        uint256 referralFee = (paymentAmount * 1000) / 10000;
        assertEq(referrer.balance, referrerBalanceBefore + referralFee);
    }

    function test_Evaluate_RevertArticleNotFound() public {
        vm.prank(user2);
        vm.expectRevert(BlogHub.ArticleNotFound.selector);
        blogHub.evaluate{value: 1 ether}(999, 1, "", address(0), 0);
    }

    function test_Evaluate_RevertInvalidScore() public {
        uint256 articleId = _publishTestArticle(user1);

        vm.prank(user2);
        vm.expectRevert(BlogHub.InvalidScore.selector);
        blogHub.evaluate{value: 1 ether}(articleId, 3, "", address(0), 0);
    }

    function test_Evaluate_RevertCommentTooLong() public {
        uint256 articleId = _publishTestArticle(user1);

        // 创建超长评论
        bytes memory longComment = new bytes(1025);
        for (uint256 i = 0; i < 1025; i++) {
            longComment[i] = "a";
        }

        vm.prank(user2);
        vm.expectRevert(BlogHub.InvalidLength.selector);
        blogHub.evaluate{value: 1 ether}(articleId, 1, string(longComment), address(0), 0);
    }

    function test_Evaluate_RevertNeutralWithoutContent() public {
        uint256 articleId = _publishTestArticle(user1);

        vm.prank(user2);
        vm.expectRevert(BlogHub.ContentRequiredForScore.selector);
        blogHub.evaluate(articleId, 0, "", address(0), 0); // 中立评分但无内容和金额
    }

    // ============ 评论点赞测试 ============

    function test_LikeComment_Success() public {
        uint256 articleId = _publishTestArticle(user1);
        address commenter = makeAddr("commenter");
        uint256 commentId = 1;
        uint256 paymentAmount = 1 ether;

        // 记录初始余额
        uint256 treasuryBalanceBefore = treasury.balance;
        uint256 authorBalanceBefore = user1.balance;
        uint256 commenterBalanceBefore = commenter.balance;

        vm.expectEmit(true, true, true, true);
        emit CommentLiked(articleId, commentId, user2, commenter, paymentAmount);

        vm.prank(user2);
        blogHub.likeComment{value: paymentAmount}(articleId, commentId, commenter, address(0));

        // 验证 NFT 铸造
        assertEq(blogHub.balanceOf(user2, articleId), 0);

        // 验证资金直接转账 (10% 平台费)
        uint256 platformFee = (paymentAmount * 1000) / 10000;
        uint256 remaining = paymentAmount - platformFee;
        uint256 halfShare = remaining / 2;
        uint256 commenterShare = remaining - halfShare;

        assertEq(treasury.balance, treasuryBalanceBefore + platformFee);
        assertEq(user1.balance, authorBalanceBefore + halfShare); // 作者
        assertEq(commenter.balance, commenterBalanceBefore + commenterShare);
    }

    function test_LikeComment_RevertZeroPayment() public {
        uint256 articleId = _publishTestArticle(user1);

        vm.prank(user2);
        vm.expectRevert(BlogHub.SpamProtection.selector);
        blogHub.likeComment(articleId, 1, makeAddr("commenter"), address(0));
    }

    function test_LikeComment_RevertInvalidCommenter() public {
        uint256 articleId = _publishTestArticle(user1);

        vm.prank(user2);
        vm.expectRevert(BlogHub.InvalidCommenter.selector);
        blogHub.likeComment{value: 1 ether}(articleId, 1, address(0), address(0));
    }

    // ============ 关注测试 ============

    function test_Follow_Success() public {
        vm.expectEmit(true, true, false, true);
        emit FollowStatusChanged(user1, user2, true);

        vm.prank(user1);
        blogHub.follow(user2, true);
    }

    function test_Unfollow_Success() public {
        vm.prank(user1);
        blogHub.follow(user2, true);

        vm.expectEmit(true, true, false, true);
        emit FollowStatusChanged(user1, user2, false);

        vm.prank(user1);
        blogHub.follow(user2, false);
    }

    // ============ URI 测试 ============

    function test_Uri_Success() public {
        string memory arweaveHash = "abc123xyz";
        vm.prank(user1);
        uint256 articleId = blogHub.publish(
            BlogHub.PublishParams({
                arweaveId: arweaveHash,
                categoryId: 1,
                royaltyBps: 500,
                originalAuthor: "",
                title: "Test Article",
                summary: "",
                trueAuthor: address(0),
                collectPrice: 0.01 ether,
                maxCollectSupply: 100,
                originality: BlogHub.Originality.Original,
                visibility: BlogHub.Visibility.Public
            })
        );

        // URI 现在使用 Irys 可变文件夹格式
        string memory expectedUri = string(
            abi.encodePacked("https://gateway.irys.xyz/mutable/", arweaveHash, "/index.md")
        );
        assertEq(blogHub.uri(articleId), expectedUri);
    }

    function test_Uri_RevertNotFound() public {
        vm.expectRevert(BlogHub.ArticleNotFound.selector);
        blogHub.uri(0);

        vm.expectRevert(BlogHub.ArticleNotFound.selector);
        blogHub.uri(999);
    }

    // ============ 暂停测试 ============

    function test_Pause_Success() public {
        vm.prank(owner);
        blogHub.pause();

        assertTrue(blogHub.paused());
    }

    function test_Pause_RevertNotPauser() public {
        vm.prank(user1);
        vm.expectRevert();
        blogHub.pause();
    }

    function test_Unpause_Success() public {
        vm.startPrank(owner);
        blogHub.pause();
        blogHub.unpause();
        vm.stopPrank();

        assertFalse(blogHub.paused());
    }

    function test_Publish_RevertWhenPaused() public {
        vm.prank(owner);
        blogHub.pause();

        vm.prank(user1);
        vm.expectRevert();
        blogHub.publish(
            BlogHub.PublishParams({
                arweaveId: "hash",
                categoryId: 1,
                royaltyBps: 500,
                originalAuthor: "",
                title: "Title",
                summary: "",
                trueAuthor: address(0),
                collectPrice: 0,
                maxCollectSupply: 0,
                originality: BlogHub.Originality.Original,
                visibility: BlogHub.Visibility.Public
            })
        );
    }

    // ============ 管理功能测试 ============

    function test_SetPlatformFee_Success() public {
        vm.prank(owner);
        blogHub.setPlatformFee(500);

        assertEq(blogHub.platformFeeBps(), 500);
    }

    function test_SetPlatformFee_RevertTooHigh() public {
        vm.prank(owner);
        vm.expectRevert(BlogHub.FeeTooHigh.selector);
        blogHub.setPlatformFee(3001); // 超过 30%
    }

    function test_SetPlatformFee_RevertNotAdmin() public {
        vm.prank(user1);
        vm.expectRevert();
        blogHub.setPlatformFee(500);
    }

    function test_SetPlatformTreasury_Success() public {
        address newTreasury = makeAddr("newTreasury");

        vm.prank(owner);
        blogHub.setPlatformTreasury(newTreasury);

        assertEq(blogHub.platformTreasury(), newTreasury);
    }

    function test_SetPlatformTreasury_RevertZeroAddress() public {
        vm.prank(owner);
        vm.expectRevert(BlogHub.InvalidAddress.selector);
        blogHub.setPlatformTreasury(address(0));
    }

    // ============ 接口支持测试 ============

    function test_SupportsInterface() public view {
        // ERC1155
        assertTrue(blogHub.supportsInterface(0xd9b67a26));
        // ERC2981
        assertTrue(blogHub.supportsInterface(0x2a55205a));
        // AccessControl
        assertTrue(blogHub.supportsInterface(0x7965db0b));
    }
}
