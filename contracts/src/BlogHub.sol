// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {ERC1155Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC1155/ERC1155Upgradeable.sol";
import {ERC2981Upgradeable} from "@openzeppelin/contracts-upgradeable/token/common/ERC2981Upgradeable.sol";
import {AccessControlUpgradeable} from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import {PausableUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {MulticallUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/MulticallUpgradeable.sol";
import {ISessionKeyManager} from "./interfaces/ISessionKeyManager.sol";

/**
 * @title BlogHub V2
 * @dev 集成了 UUPS 可升级、权限管理的博客合约。
 * 支持 ERC-4337 账户抽象，配合 BlogPaymaster 实现完全去中心化的代付功能。
 */
contract BlogHub is
    Initializable,
    ERC1155Upgradeable,
    ERC2981Upgradeable,
    AccessControlUpgradeable,
    PausableUpgradeable,
    ReentrancyGuard,
    UUPSUpgradeable,
    MulticallUpgradeable
{
    // --- Custom Errors (Gas Saving) ---
    error InvalidLength();
    error InvalidScore();
    error ContentRequiredForScore();
    error ArticleNotFound();
    error RoyaltyTooHigh();
    error FeeTooHigh();
    error InvalidAddress();
    error TransferFailed();
    error SpamProtection();
    error InvalidCommenter();
    error SessionKeyValidationFailed();
    error SessionKeyManagerNotSet();
    error OriginalAuthorTooLong();
    error TitleTooLong();
    error SummaryTooLong();
    error InsufficientPayment();
    error MaxSupplyReached();
    error CollectNotEnabled();
    error NotArticleAuthor();
    
    // 定义常量：最大评论长度（字节）
    // 140单词英文大约 700-1000 字节，中文约 400 汉字 = 1200 字节
    uint256 public constant MAX_COMMENT_LENGTH = 1024;
    // 评价分数常量：0:中立, 1:喜欢, 2:不喜欢
    uint8 public constant SCORE_NEUTRAL = 0;
    uint8 public constant SCORE_LIKE = 1;
    uint8 public constant SCORE_DISLIKE = 2;
    // --- 角色定义 ---
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    // --- 枚举 ---
    enum Originality {
        Original,       // 完全原创
        SemiOriginal,   // 部分原创
        Reprint         // 转载
    }

    // --- 参数结构体（避免 Stack Too Deep）---
    struct PublishParams {
        string arweaveId;
        uint16 categoryId;
        uint96 royaltyBps;
        string originalAuthor;
        string title;
        string summary;
        address trueAuthor;
        uint96 collectPrice;
        uint32 maxCollectSupply;
        Originality originality;
    }

    struct EditArticleParams {
        uint256 articleId;
        string originalAuthor;
        string title;
        string summary;
        uint16 categoryId;
    }

    // --- 结构体 ---
    struct Article {
        // --- Slot 0 (31 bytes，剩余1 bytes) ---
        address author;       // 20 bytes
        uint64 timestamp;     // 8 bytes
        uint16 categoryId;    // 2 bytes
        Originality originality; // enum uint8 (1 byte)
        
        // --- Slot 1 (20 bytes，剩余 12 bytes) ---
        uint96 collectPrice; // 12 bytes
        uint32 maxCollectSupply;  // 4 bytes
        uint32 collectCount;  // 4 bytes
        
        // --- String Slots ---
        // string 类型因为长度不固定，通常无法与普通变量打包，会开启新 Slot
        string arweaveHash;
    }

    // 最大原作者名称长度（64字节，足够存储大多数用户名/ENS域名）
    uint256 public constant MAX_ORIGINAL_AUTHOR_LENGTH = 64;
    // 最大标题长度（128字节，约40个中文字符或128个英文字符）
    uint256 public constant MAX_TITLE_LENGTH = 128;
    // 最大摘要长度（512字节，约170个中文字符）
    uint256 public constant MAX_SUMMARY_LENGTH = 512;
    // 用户资料字段最大长度
    uint256 public constant MAX_NICKNAME_LENGTH = 64;
    uint256 public constant MAX_BIO_LENGTH = 256;
    uint256 public constant MAX_AVATAR_LENGTH = 128;

    // --- 状态变量 ---
    uint256 public nextArticleId;

    // 平台手续费 (Basis Points, 100 = 1%)
    uint96 public platformFeeBps;
    address public platformTreasury;

    // 文章存储
    mapping(uint256 => Article) public articles;
    
    // ArweaveID 到 ArticleID 的映射（用于通过 ArweaveID 查找文章）
    mapping(string => uint256) public arweaveIdToArticleId;

    // --- Session Key 管理 ---
    /// @notice Session Key 管理器合约地址
    ISessionKeyManager public sessionKeyManager;

    // 最低评论/评价金额（防 Spam），可由管理员调整
    // 默认 0.0001 ETH = 100000000000000 wei
    uint256 public minActionValue;

    // --- 事件定义 ---
    event ArticlePublished(
        uint256 indexed articleId,
        address indexed author,
        uint16 indexed categoryId,
        string arweaveId,       // Irys 可变文件夹的 manifest ID
        string originalAuthor,
        string title,
        string summary,
        uint96 collectPrice,
        uint32 maxCollectSupply,
        Originality originality
    );

    // 核心评价事件：SubSquid 可通过 score 区分喜欢(1)还是不喜欢(2)
    event ArticleEvaluated(
        uint256 indexed articleId,
        address indexed user,
        uint8 score, // 1: Like, 0: Neutral, 2: Dislike
        uint256 amountPaid
    );

    // 收藏事件
    event ArticleCollected(
        uint256 indexed articleId,
        address indexed collector,
        uint256 amount,
        uint256 tokenId
    );

    // 评论事件：只在 content 不为空时触发
    event CommentAdded(
        uint256 indexed articleId,
        address indexed commenter,
        string content,
        uint256 parentCommentId, // 如果是顶级评论/评价，此处为 0
        uint8 score // 关联该评论的态度
    );

    event FollowStatusChanged(
        address indexed follower,
        address indexed target,
        bool isFollowing
    );

    event ReferralPaid(address indexed referrer, uint256 amount);

    // 评论点赞事件
    event CommentLiked(
        uint256 indexed articleId,
        uint256 indexed commentId,
        address indexed liker,
        address commenter,
        uint256 amountPaid
    );

    event PlatformFeeUpdated(uint96 newFeeBps);
    event TreasuryUpdated(address newTreasury);
    event SessionKeyManagerUpdated(address indexed newManager);
    event SessionKeyOperationExecuted(
        address indexed owner,
        address indexed sessionKey,
        bytes4 selector
    );
    event MinActionValueUpdated(uint256 newValue);

    // 文章编辑事件 (author/arweaveId/originality 不可修改，SubSquid可从 ArticlePublished 获取)
    event ArticleEdited(
        uint256 indexed articleId,
        string originalAuthor,
        string title,
        string summary,
        uint16 categoryId
    );

    // 用户资料更新事件
    event UserProfileUpdated(
        address indexed user,
        string nickname,
        string avatar,
        string bio
    );

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @dev 初始化函数，替代构造函数
     * @param _initialOwner 合约初始管理员
     * @param _treasury 平台国库地址
     */
    function initialize(
        address _initialOwner,
        address _treasury
    ) public initializer {
        __ERC1155_init(""); // 实际 URI 建议由前端根据 ID 拼接，或者实现 uri() 函数
        __ERC2981_init();
        __AccessControl_init();
        __Pausable_init();
        __Multicall_init();

        // 权限设置
        _grantRole(DEFAULT_ADMIN_ROLE, _initialOwner);
        _grantRole(UPGRADER_ROLE, _initialOwner);
        _grantRole(PAUSER_ROLE, _initialOwner);

        // 默认参数
        platformTreasury = _treasury;
        platformFeeBps = 1000; // 默认 10% 平台抽成
        _setDefaultRoyalty(_initialOwner, 500); // 默认 5% 版税
        nextArticleId = 1; // 从 1 开始 ID（避免 id=0 的歧义）
        minActionValue = 0.00002 ether; // 默认约 0.01 USD (价格500USD) 防 Spam
    }

    // =============================================================
    //                      内部工具函数
    // =============================================================

    function _requireSessionKeyManager() internal view returns (ISessionKeyManager manager) {
        manager = sessionKeyManager;
        if (address(manager) == address(0)) revert SessionKeyManagerNotSet();
    }

    function _validateAndUseSessionKey(
        ISessionKeyManager manager,
        address owner,
        address sessionKey,
        bytes4 selector,
        bytes memory callData,
        uint256 value,
        uint256 deadline,
        bytes calldata signature
    ) internal {
        bool valid = manager.validateAndUseSessionKey(
            owner,
            sessionKey,
            address(this),
            selector,
            callData,
            value,
            deadline,
            signature
        );
        if (!valid) revert SessionKeyValidationFailed();
    }

    function _safeTransferETH(address to, uint256 amount) internal {
        (bool success, ) = payable(to).call{value: amount}("");
        if (!success) revert TransferFailed();
    }

    function _validateStringParams(
        string calldata originalAuthor,
        string calldata title,
        string calldata summary
    ) internal pure {
        if (bytes(originalAuthor).length > MAX_ORIGINAL_AUTHOR_LENGTH) revert OriginalAuthorTooLong();
        if (bytes(title).length > MAX_TITLE_LENGTH) revert TitleTooLong();
        if (bytes(summary).length > MAX_SUMMARY_LENGTH) revert SummaryTooLong();
    }

    function _validatePublishParams(
        uint96 royaltyBps,
        string calldata originalAuthor,
        string calldata title,
        string calldata summary
    ) internal pure {
        if (royaltyBps > 10000) revert RoyaltyTooHigh();
        _validateStringParams(originalAuthor, title, summary);
    }


    /**
     * @dev 创建文章的核心逻辑（内部函数，避免代码重复）
     */
    function _createArticle(
        address publisher,
        PublishParams calldata params
    ) internal returns (uint256 newId) {
        address author = params.trueAuthor != address(0) ? params.trueAuthor : publisher;
        newId = nextArticleId++;

        articles[newId] = Article({
            arweaveHash: params.arweaveId,
            categoryId: params.categoryId,
            timestamp: uint64(block.timestamp),
            author: author,
            collectPrice: params.collectPrice,
            maxCollectSupply: params.maxCollectSupply,
            collectCount: 1,
            originality: params.originality
        });
        arweaveIdToArticleId[params.arweaveId] = newId;

        // NFT、版税都归真实作者
        _mint(author, newId, 1, "");
        _setTokenRoyalty(newId, author, params.royaltyBps);

        emit ArticlePublished(
            newId,
            author,
            params.categoryId,
            params.arweaveId,
            params.originalAuthor,
            params.title,
            params.summary,
            params.collectPrice,
            params.maxCollectSupply,
            params.originality
        );
    }

    /**
     * @dev 执行文章编辑的核心逻辑（内部函数）
     * @param sender 操作发起人
     * @param params 编辑参数结构体
     */
    function _executeEditArticle(
        address sender,
        EditArticleParams calldata params
    ) internal {
        if (params.articleId == 0 || params.articleId >= nextArticleId) revert ArticleNotFound();
        
        Article storage article = articles[params.articleId];
        
        // 只有文章作者可以编辑
        if (article.author != sender) revert NotArticleAuthor();
        
        // 验证参数
        _validateStringParams(params.originalAuthor, params.title, params.summary);
        // 更新文章信息
        article.categoryId = params.categoryId;
        
        emit ArticleEdited(
            params.articleId,
            params.originalAuthor,
            params.title,
            params.summary,
            params.categoryId
        );
    }

    /**
     * @dev 执行评价的核心逻辑（内部函数）
     * @param sender 操作发起人
     * @param _articleId 文章ID
     * @param _score 评价分数
     * @param _content 评论内容
     * @param _referrer 推荐人地址
     * @param _parentCommentId 父评论ID
     * @param amount 支付金额
     */
    function _executeEvaluate(
        address sender,
        uint256 _articleId,
        uint8 _score,
        string calldata _content,
        address _referrer,
        uint256 _parentCommentId,
        uint256 amount
    ) internal {
        if (_articleId >= nextArticleId) revert ArticleNotFound();
        if (_score > 2) revert InvalidScore();

        uint256 contentLength = bytes(_content).length;
        if (contentLength > MAX_COMMENT_LENGTH) revert InvalidLength();

        if (contentLength == 0 && _score == SCORE_NEUTRAL && amount == 0) {
            revert ContentRequiredForScore();
        }

        if (contentLength > 0 && amount < minActionValue)
            revert SpamProtection();

        Article storage article = articles[_articleId];
        address articleAuthor = article.author;

        // --- 资金处理 ---
        if (amount > 0) {
            // 资金分配
            if (_score == SCORE_DISLIKE) {
                _safeTransferETH(platformTreasury, amount);
            } else {
                address validReferrer = _validateReferrer(_referrer, sender, articleAuthor, address(0));
                uint256 authorShare = _distributePlatformAndReferralFees(amount, validReferrer);
                if (authorShare > 0) _safeTransferETH(articleAuthor, authorShare);
            }

            emit ArticleEvaluated(
                _articleId,
                sender,
                _score,
                amount
            );
        }

        if (contentLength > 0) {
            emit CommentAdded(
                _articleId,
                sender,
                _content,
                _parentCommentId,
                _score
            );
        }
    }

    /**
     * @dev 执行收藏的核心逻辑
     */
    function _executeCollect(
        address sender,
        uint256 _articleId,
        address _referrer,
        uint256 amount
    ) internal {
        if (_articleId >= nextArticleId) revert ArticleNotFound();

        Article storage article = articles[_articleId];
        address articleAuthor = article.author;

        uint256 maxSupply = article.maxCollectSupply;
        if (maxSupply == 0) revert CollectNotEnabled();
        if (article.collectCount >= maxSupply) revert MaxSupplyReached();

        uint256 collectPrice = article.collectPrice;
        if (amount < collectPrice) {
            revert InsufficientPayment();
        }

        // 更新计数
        unchecked {
            article.collectCount++;
        }

        // 铸造 NFT
        _mint(sender, _articleId, 1, "");

        // 资金分配
        address validReferrer = _validateReferrer(_referrer, sender, articleAuthor, address(0));
        uint256 authorShare = _distributePlatformAndReferralFees(amount, validReferrer);
        if (authorShare > 0) _safeTransferETH(articleAuthor, authorShare);

        emit ArticleCollected(
            _articleId,
            sender,
            amount,
            _articleId // TokenID = ArticleID
        );
    }

    /**
     * @dev 执行评论点赞的核心逻辑（内部函数）
     * @param sender 操作发起人
     * @param _articleId 文章ID
     * @param _commentId 评论ID
     * @param _commenter 评论人地址
     * @param _referrer 推荐人地址
     * @param amount 支付金额
     */
    function _executeLikeComment(
        address sender,
        uint256 _articleId,
        uint256 _commentId,
        address _commenter,
        address _referrer,
        uint256 amount
    ) internal {
        if (_articleId >= nextArticleId) revert ArticleNotFound();
        if (_commenter == address(0)) revert InvalidCommenter();
        if (amount == 0) revert SpamProtection();

        Article storage article = articles[_articleId];
        address articleAuthor = article.author;

        // --- 资金分配 ---
        address validReferrer = _validateReferrer(
            _referrer,
            sender,
            articleAuthor,
            _commenter
        );

        uint256 remaining = _distributePlatformAndReferralFees(amount, validReferrer);

        uint256 authorShare = remaining / 2;
        if (authorShare > 0) _safeTransferETH(articleAuthor, authorShare);
        uint256 commenterShare = remaining - authorShare;
        if (commenterShare > 0) _safeTransferETH(_commenter, commenterShare);

        emit CommentLiked(
            _articleId,
            _commentId,
            sender,
            _commenter,
            amount
        );
    }

    /**
     * @dev 校验推荐人地址有效性
     */
    function _validateReferrer(
        address referrer,
        address sender,
        address invalid0,
        address invalid1
    ) internal pure returns (address) {
        if (
            referrer == address(0) ||
            referrer == sender ||
            referrer == invalid0 ||
            referrer == invalid1
        ) return address(0);
        return referrer;
    }

    /**
     * @dev 分配平台费和推荐费，返回剩余金额
     */
    function _distributePlatformAndReferralFees(
        uint256 _amount,
        address _referrer
    ) internal returns (uint256 remaining) {
        uint256 platformShare = (_amount * platformFeeBps) / 10000;
        // 固定推荐费率 10%
        uint256 referralShare = (_referrer != address(0))
            ? (_amount * 1000) / 10000
            : 0;

        if (platformShare > 0) _safeTransferETH(platformTreasury, platformShare);
        if (referralShare > 0) {
            _safeTransferETH(_referrer, referralShare);
            emit ReferralPaid(_referrer, referralShare);
        }

        unchecked {
            return _amount - platformShare - referralShare;
        }
    }

    // =============================================================
    //                      核心业务逻辑
    // =============================================================

    /**
     * @dev 发布文章 (铸造 NFT)
     * @param params 发布参数结构体（避免 Stack Too Deep）
     */
    function publish(
        PublishParams calldata params
    ) external whenNotPaused returns (uint256) {
        _validatePublishParams(params.royaltyBps, params.originalAuthor, params.title, params.summary);
        return _createArticle(_msgSender(), params);
    }

    /**
     * @dev 评价文章 (Tip/Comment)
     */
    function evaluate(
        uint256 _articleId,
        uint8 _score,
        string calldata _content,
        address _referrer,
        uint256 _parentCommentId
    ) external payable nonReentrant whenNotPaused {
        _executeEvaluate(_msgSender(), _articleId, _score, _content, _referrer, _parentCommentId, msg.value);
    }

    /**
     * @dev 收藏文章 (Collect)
     * 铸造 NFT
     */
    function collect(
        uint256 _articleId,
        address _referrer
    ) external payable nonReentrant whenNotPaused {
        _executeCollect(_msgSender(), _articleId, _referrer, msg.value);
    }

    /**
     * @dev 对评论点赞
     */
    function likeComment(
        uint256 _articleId,
        uint256 _commentId,
        address _commenter,
        address _referrer
    ) external payable nonReentrant whenNotPaused {
        _executeLikeComment(_msgSender(), _articleId, _commentId, _commenter, _referrer, msg.value);
    }

    /**
     * @dev 关注用户
     */
    function follow(address _target, bool _status) external whenNotPaused {
        emit FollowStatusChanged(_msgSender(), _target, _status);
    }

    /**
     * @dev 编辑文章信息（仅作者可调用）
     * @param params 编辑参数结构体（避免 Stack Too Deep）
     */
    function editArticle(
        EditArticleParams calldata params
    ) external whenNotPaused {
        _executeEditArticle(_msgSender(), params);
    }

    // =============================================================
    //                          元数据
    // =============================================================

    /**
     * @dev 重写 uri 函数，使其返回 Irys 可变文件夹的预览 URL
     * 格式: https://gateway.irys.xyz/mutable/{manifestId}/index.md
     * 文章内容固定路径: index.md
     * 封面图片固定路径: coverImage
     */
    function uri(uint256 _id) public view override returns (string memory) {
        if (_id == 0 || _id >= nextArticleId) revert ArticleNotFound();
        return
            string(
                abi.encodePacked(
                    "https://gateway.irys.xyz/mutable/",
                    articles[_id].arweaveHash,
                    "/index.md"
                )
            );
    }

    // =============================================================
    //                      管理功能
    // =============================================================

    function setPlatformFee(
        uint96 _feeBps
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        // 这里限制平台费最高 30%
        if (_feeBps > 3000) revert FeeTooHigh();
        platformFeeBps = _feeBps;
        emit PlatformFeeUpdated(_feeBps);
    }

    function setPlatformTreasury(
        address _treasury
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (_treasury == address(0)) revert InvalidAddress();
        platformTreasury = _treasury;
        emit TreasuryUpdated(_treasury);
    }

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    /**
     * @notice 设置 Session Key 管理器地址
     * @param _sessionKeyManager Session Key 管理器合约地址
     */
    function setSessionKeyManager(
        address _sessionKeyManager
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (_sessionKeyManager == address(0)) revert InvalidAddress();
        sessionKeyManager = ISessionKeyManager(_sessionKeyManager);
        emit SessionKeyManagerUpdated(_sessionKeyManager);
    }

    /**
     * @notice 设置最低操作金额（防 Spam）
     * @param _minActionValue 新的最低金额（wei）
     */
    function setMinActionValue(
        uint256 _minActionValue
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        minActionValue = _minActionValue;
        emit MinActionValueUpdated(_minActionValue);
    }

    // =============================================================
    //                      Session Key 操作
    // =============================================================

    /**
     * @notice 使用 Session Key 执行评价操作（无感交互）
     */
    function evaluateWithSessionKey(
        address owner,
        address sessionKey,
        uint256 _articleId,
        uint8 _score,
        string calldata _content,
        address _referrer,
        uint256 _parentCommentId,
        uint256 deadline,
        bytes calldata signature
    ) external payable nonReentrant whenNotPaused {
        {
            ISessionKeyManager manager = _requireSessionKeyManager();
            bytes4 selector = BlogHub.evaluate.selector;
            bytes memory callData = abi.encodeWithSelector(selector, _articleId, _score, _content, _referrer, _parentCommentId);
            _validateAndUseSessionKey(manager, owner, sessionKey, selector, callData, msg.value, deadline, signature);
        }
        _executeEvaluate(owner, _articleId, _score, _content, _referrer, _parentCommentId, msg.value);
        emit SessionKeyOperationExecuted(owner, sessionKey, BlogHub.evaluate.selector);
    }

    /**
     * @notice 使用 Session Key 执行收藏操作
     */
    function collectWithSessionKey(
        address owner,
        address sessionKey,
        uint256 _articleId,
        address _referrer,
        uint256 deadline,
        bytes calldata signature
    ) external payable nonReentrant whenNotPaused {
        {
            ISessionKeyManager manager = _requireSessionKeyManager();
            bytes4 selector = BlogHub.collect.selector;
            bytes memory callData = abi.encodeWithSelector(selector, _articleId, _referrer);
            _validateAndUseSessionKey(manager, owner, sessionKey, selector, callData, msg.value, deadline, signature);
        }
        _executeCollect(owner, _articleId, _referrer, msg.value);
        emit SessionKeyOperationExecuted(owner, sessionKey, BlogHub.collect.selector);
    }

    /**
     * @notice 使用 Session Key 执行评论点赞操作（无感交互）
     */
    function likeCommentWithSessionKey(
        address owner,
        address sessionKey,
        uint256 _articleId,
        uint256 _commentId,
        address _commenter,
        address _referrer,
        uint256 deadline,
        bytes calldata signature
    ) external payable nonReentrant whenNotPaused {
        if (msg.value == 0) revert SpamProtection();
        {
            ISessionKeyManager manager = _requireSessionKeyManager();
            bytes4 selector = BlogHub.likeComment.selector;
            bytes memory callData = abi.encodeWithSelector(selector, _articleId, _commentId, _commenter, _referrer);
            _validateAndUseSessionKey(manager, owner, sessionKey, selector, callData, msg.value, deadline, signature);
        }
        _executeLikeComment(owner, _articleId, _commentId, _commenter, _referrer, msg.value);
        emit SessionKeyOperationExecuted(owner, sessionKey, BlogHub.likeComment.selector);
    }

    /**
     * @notice 使用 Session Key 执行关注操作（无感交互）
     */
    function followWithSessionKey(
        address owner,
        address sessionKey,
        address _target,
        bool _status,
        uint256 deadline,
        bytes calldata signature
    ) external whenNotPaused {
        {
            ISessionKeyManager manager = _requireSessionKeyManager();
            bytes4 selector = BlogHub.follow.selector;
            bytes memory callData = abi.encodeWithSelector(selector, _target, _status);
            _validateAndUseSessionKey(manager, owner, sessionKey, selector, callData, 0, deadline, signature);
        }
        emit FollowStatusChanged(owner, _target, _status);
        emit SessionKeyOperationExecuted(owner, sessionKey, BlogHub.follow.selector);
    }

    /**
     * @notice 使用 Session Key 编辑文章（无感交互）
     */
    function editArticleWithSessionKey(
        address owner,
        address sessionKey,
        EditArticleParams calldata params,
        uint256 deadline,
        bytes calldata signature
    ) external whenNotPaused {
        {
            ISessionKeyManager manager = _requireSessionKeyManager();
            bytes4 selector = BlogHub.editArticle.selector;
            bytes memory callData = abi.encodeWithSelector(BlogHub.editArticle.selector, params);
            _validateAndUseSessionKey(manager, owner, sessionKey, selector, callData, 0, deadline, signature);
        }
        _executeEditArticle(owner, params);
        emit SessionKeyOperationExecuted(owner, sessionKey, BlogHub.editArticle.selector);
    }


    /**
     * @notice 使用 Session Key 发布文章（无感交互）
     */
    function publishWithSessionKey(
        address owner,
        address sessionKey,
        PublishParams calldata params,
        uint256 deadline,
        bytes calldata signature
    ) external whenNotPaused returns (uint256) {
        {
            ISessionKeyManager manager = _requireSessionKeyManager();
            _validatePublishParams(params.royaltyBps, params.originalAuthor, params.title, params.summary);
            bytes4 selector = BlogHub.publish.selector;
            _validateAndUseSessionKey(manager, owner, sessionKey, selector, abi.encodeWithSelector(selector, params), 0, deadline, signature);
        }
        uint256 newId = _createArticle(owner, params);
        emit SessionKeyOperationExecuted(owner, sessionKey, BlogHub.publish.selector);
        return newId;
    }


    // =============================================================
    //                      底层 Override (必须实现)
    // =============================================================

    function _authorizeUpgrade(
        address newImplementation
    ) internal override onlyRole(UPGRADER_ROLE) {}

    // 解决多重继承导致的 supportsInterface 冲突
    function supportsInterface(
        bytes4 interfaceId
    )
        public
        view
        override(
            ERC1155Upgradeable,
            ERC2981Upgradeable,
            AccessControlUpgradeable
        )
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }

    // =============================================================
    //                      用户资料（Event-based）
    // =============================================================

    /**
     * @notice 更新用户资料（仅通过事件存储，不占用合约 storage）
     * @param _nickname 昵称（最大 64 字节）
     * @param _avatar 头像 URL/IPFS/Arweave ID（最大 128 字节）
     * @param _bio 个人简介（最大 256 字节）
     */
    function updateProfile(
        string calldata _nickname,
        string calldata _avatar,
        string calldata _bio
    ) external whenNotPaused {
        if (bytes(_nickname).length > MAX_NICKNAME_LENGTH) revert InvalidLength();
        if (bytes(_avatar).length > MAX_AVATAR_LENGTH) revert InvalidLength();
        if (bytes(_bio).length > MAX_BIO_LENGTH) revert InvalidLength();

        emit UserProfileUpdated(
            _msgSender(),
            _nickname,
            _avatar,
            _bio
        );
    }

    // =============================================================
    //                      ArweaveID 查询功能
    // =============================================================

    /**
     * @notice 通过 ArweaveID 获取文章的 ArticleID
     * @param _arweaveId Arweave/Irys 存储 ID
     * @return articleId 文章 ID（如果不存在返回 0）
     */
    function getArticleIdByArweaveId(string calldata _arweaveId) external view returns (uint256) {
        return arweaveIdToArticleId[_arweaveId];
    }

    /**
     * @notice 通过 ArweaveID 获取完整文章信息
     * @param _arweaveId Arweave/Irys 存储 ID
     * @return article 文章结构体
     */
    function getArticleByArweaveId(string calldata _arweaveId) external view returns (Article memory) {
        uint256 articleId = arweaveIdToArticleId[_arweaveId];
        if (articleId == 0) revert ArticleNotFound();
        return articles[articleId];
    }

    /**
     * @dev 这个 gap 是为了将来升级合约添加新状态变量时，不破坏存储布局。
     * 这是一个最佳实践。
     * 状态变量: nextArticleId(1) + platformFeeBps+platformTreasury(1) + articles(1) + sessionKeyManager(1) + minActionValue(1) + arweaveIdToArticleId(1) = 6 slots
     * 总计保留 6 slots 的位置，gap = 50 - 6 = 44
     */
    uint256[43] private __gap;
}
