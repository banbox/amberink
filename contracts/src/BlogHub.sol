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
    error InsufficientPayment();
    error MaxSupplyReached();
    error CollectNotEnabled();
    error CollectPriceTooHigh();
    error CategoryIdTooHigh();
    error MaxCollectSupplyTooHigh();
    
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

    // --- 结构体 ---
    struct Article {
        // --- Slot 0 (31 bytes，剩余1 bytes) ---
        address author;       // 20 bytes
        uint64 timestamp;     // 8 bytes
        uint16 categoryId;    // 2 bytes
        Originality originality; // enum uint8 (1 byte)
        
        // --- Slot 1 (16 bytes，剩余 16 bytes) ---
        uint96 collectPrice; // 8 bytes
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

    // --- 状态变量 ---
    uint256 public nextArticleId;

    // 平台手续费 (Basis Points, 100 = 1%)
    uint96 public platformFeeBps;
    address public platformTreasury;

    // 文章存储
    mapping(uint256 => Article) public articles;

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
        uint256 indexed categoryId,
        string arweaveId,       // Irys 可变文件夹的 manifest ID
        string originalAuthor,
        string title,
        uint256 timestamp,
        address trueAuthor,
        uint256 collectPrice,
        uint256 maxCollectSupply,
        Originality originality
    );

    // 核心评价事件：SubSquid 可通过 score 区分喜欢(1)还是不喜欢(2)
    event ArticleEvaluated(
        uint256 indexed articleId,
        address indexed user,
        uint8 score, // 1: Like, 0: Neutral, 2: Dislike
        uint256 amountPaid,
        uint256 timestamp
    );

    // 收藏事件
    event ArticleCollected(
        uint256 indexed articleId,
        address indexed collector,
        uint256 amount,
        uint256 tokenId,
        uint256 timestamp
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
        uint256 amountPaid,
        uint256 timestamp
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
        platformFeeBps = 250; // 默认 2.5% 平台抽成
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

    function _validatePublishParams(
        uint96 royaltyBps,
        string calldata originalAuthor,
        string calldata title
    ) internal pure {
        if (royaltyBps > 10000) revert RoyaltyTooHigh();
        if (bytes(originalAuthor).length > MAX_ORIGINAL_AUTHOR_LENGTH) revert OriginalAuthorTooLong();
        if (bytes(title).length > MAX_TITLE_LENGTH) revert TitleTooLong();
    }

    function _executeFollow(address follower, address target, bool status) internal {
        emit FollowStatusChanged(follower, target, status);
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
                // 不喜欢时，金额归平台（直接转账）
                (bool success, ) = payable(platformTreasury).call{value: amount}("");
                if (!success) revert TransferFailed();
            } else {
                address validReferrer = _validateReferrer(_referrer, sender, articleAuthor);
                uint256 authorShare = _distributePlatformAndReferralFees(amount, validReferrer);
                if (authorShare > 0) {
                    (bool success, ) = payable(articleAuthor).call{value: authorShare}("");
                    if (!success) revert TransferFailed();
                }
            }

            emit ArticleEvaluated(
                _articleId,
                sender,
                _score,
                amount,
                block.timestamp
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
        address validReferrer = _validateReferrer(_referrer, sender, articleAuthor);
        uint256 authorShare = _distributePlatformAndReferralFees(amount, validReferrer);
        
        if (authorShare > 0) {
            (bool success, ) = payable(articleAuthor).call{value: authorShare}("");
            if (!success) revert TransferFailed();
        }

        emit ArticleCollected(
            _articleId,
            sender,
            amount,
            _articleId, // TokenID = ArticleID
            block.timestamp
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

        uint256 halfShare = remaining / 2;
        uint256 commenterShare = remaining - halfShare;

        if (halfShare > 0) {
            // 作者份额给 trueAuthor
            (bool success1, ) = payable(articleAuthor).call{value: halfShare}("");
            if (!success1) revert TransferFailed();
        }
        if (commenterShare > 0) {
            (bool success2, ) = payable(_commenter).call{value: commenterShare}("");
            if (!success2) revert TransferFailed();
        }

        emit CommentLiked(
            _articleId,
            _commentId,
            sender,
            _commenter,
            amount,
            block.timestamp
        );
    }

    /**
     * @dev 校验推荐人地址有效性
     */
    function _validateReferrer(
        address referrer,
        address sender,
        address invalid0
    ) internal pure returns (address) {
        if (referrer == address(0) || referrer == sender || referrer == invalid0) return address(0);
        return referrer;
    }

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

        if (platformShare > 0) {
            (bool success1, ) = payable(platformTreasury).call{value: platformShare}("");
            if (!success1) revert TransferFailed();
        }
        if (referralShare > 0) {
            (bool success2, ) = payable(_referrer).call{value: referralShare}("");
            if (!success2) revert TransferFailed();
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
     * 支持 meta-transactions (使用 _msgSender())
     */
    function publish(
        string calldata _arweaveId,
        uint64 _categoryId,
        uint96 _royaltyBps,
        string calldata _originalAuthor,
        string calldata _title,
        address _trueAuthor,
        uint256 _collectPrice,
        uint256 _maxCollectSupply,
        Originality _originality
    ) external whenNotPaused returns (uint256) {
        _validatePublishParams(_royaltyBps, _originalAuthor, _title);

        if (_collectPrice > type(uint96).max) revert CollectPriceTooHigh();
        if (_categoryId > type(uint16).max) revert CategoryIdTooHigh();
        if (_maxCollectSupply > type(uint32).max) revert MaxCollectSupplyTooHigh();

        address publisher = _msgSender();
        address trueAuthor = _trueAuthor != address(0) ? _trueAuthor : publisher;
        uint256 newId = nextArticleId++;

        articles[newId] = Article({
            arweaveHash: _arweaveId,
            categoryId: uint16(_categoryId),
            timestamp: uint64(block.timestamp),
            author: trueAuthor,
            collectPrice: uint96(_collectPrice),
            maxCollectSupply: uint32(_maxCollectSupply),
            collectCount: 1,
            originality: _originality
        });

        _mint(publisher, newId, 1, "");

        address royaltyReceiver = trueAuthor;
        _setTokenRoyalty(newId, royaltyReceiver, _royaltyBps);

        emit ArticlePublished(
            newId,
            publisher,
            _categoryId,
            _arweaveId,
            _originalAuthor,
            _title,
            block.timestamp,
            trueAuthor,
            _collectPrice,
            _maxCollectSupply,
            _originality
        );
        return newId;
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
        _executeFollow(_msgSender(), _target, _status);
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
        ISessionKeyManager manager = _requireSessionKeyManager();
        bytes4 selector = BlogHub.evaluate.selector;

        // 构建 callData 用于验证
        bytes memory callData = abi.encodeWithSelector(
            selector,
            _articleId,
            _score,
            _content,
            _referrer,
            _parentCommentId
        );

        _validateAndUseSessionKey(
            manager,
            owner,
            sessionKey,
            selector,
            callData,
            msg.value,
            deadline,
            signature
        );

        // 执行评价操作（以 owner 身份），资金分配由 _executeEvaluate 内部处理
        _executeEvaluate(owner, _articleId, _score, _content, _referrer, _parentCommentId, msg.value);

        emit SessionKeyOperationExecuted(owner, sessionKey, selector);
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
        ISessionKeyManager manager = _requireSessionKeyManager();
        bytes4 selector = BlogHub.collect.selector;

        // 构建 callData 用于验证
        bytes memory callData = abi.encodeWithSelector(
            selector,
            _articleId,
            _referrer
        );

        _validateAndUseSessionKey(
            manager,
            owner,
            sessionKey,
            selector,
            callData,
            msg.value,
            deadline,
            signature
        );

        // 执行收藏操作（以 owner 身份）
        _executeCollect(owner, _articleId, _referrer, msg.value);

        emit SessionKeyOperationExecuted(owner, sessionKey, selector);
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
        ISessionKeyManager manager = _requireSessionKeyManager();
        bytes4 selector = BlogHub.likeComment.selector;

        // 构建 callData 用于验证
        bytes memory callData = abi.encodeWithSelector(
            selector,
            _articleId,
            _commentId,
            _commenter,
            _referrer
        );

        _validateAndUseSessionKey(
            manager,
            owner,
            sessionKey,
            selector,
            callData,
            msg.value,
            deadline,
            signature
        );

        // likeComment 必须有支付金额
        if (msg.value == 0) revert SpamProtection();

        // 执行点赞操作（以 owner 身份），资金分配由 _executeLikeComment 内部处理
        _executeLikeComment(owner, _articleId, _commentId, _commenter, _referrer, msg.value);

        emit SessionKeyOperationExecuted(owner, sessionKey, selector);
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
        ISessionKeyManager manager = _requireSessionKeyManager();
        bytes4 selector = BlogHub.follow.selector;

        // 构建 callData 用于验证
        bytes memory callData = abi.encodeWithSelector(
            selector,
            _target,
            _status
        );

        _validateAndUseSessionKey(
            manager,
            owner,
            sessionKey,
            selector,
            callData,
            0,
            deadline,
            signature
        );

        // 执行关注操作
        _executeFollow(owner, _target, _status);

        emit SessionKeyOperationExecuted(owner, sessionKey, selector);
    }

    /**
     * @notice 使用 Session Key 发布文章（无感交互）
     * @dev 由于参数过多，使用 Struct 避免 Stack Too Deep
     */
    struct PublishParams {
        string arweaveId;
        uint64 categoryId;
        uint96 royaltyBps;
        string originalAuthor;
        string title;
        address trueAuthor;
        uint256 collectPrice;
        uint256 maxCollectSupply;
        Originality originality;
    }

    function publishWithSessionKey(
        address owner,
        address sessionKey,
        PublishParams calldata params,
        uint256 deadline,
        bytes calldata signature
    ) external whenNotPaused returns (uint256) {
        ISessionKeyManager manager = _requireSessionKeyManager();
        _validatePublishParams(params.royaltyBps, params.originalAuthor, params.title);
        bytes4 selector = BlogHub.publish.selector;

        bytes memory callData = _encodePublishCallData(params);

        // 验证 Session Key
        _validateAndUseSessionKey(
            manager,
            owner,
            sessionKey,
            selector,
            callData,
            0,
            deadline,
            signature
        );

        if (params.collectPrice > type(uint96).max) revert CollectPriceTooHigh();
        if (params.categoryId > type(uint16).max) revert CategoryIdTooHigh();
        if (params.maxCollectSupply > type(uint32).max) revert MaxCollectSupplyTooHigh();

        address trueAuthor = params.trueAuthor != address(0) ? params.trueAuthor : owner;

        uint256 newId = nextArticleId++;

        articles[newId] = Article({
            arweaveHash: params.arweaveId,
            categoryId: uint16(params.categoryId),
            timestamp: uint64(block.timestamp),
            author: trueAuthor,
            collectPrice: uint96(params.collectPrice),
            maxCollectSupply: uint32(params.maxCollectSupply),
            collectCount: 1,
            originality: params.originality
        });

        _mint(owner, newId, 1, "");

        address royaltyReceiver = trueAuthor;
        _setTokenRoyalty(newId, royaltyReceiver, params.royaltyBps);

        emit ArticlePublished(
            newId,
            owner,
            params.categoryId,
            params.arweaveId,
            params.originalAuthor,
            params.title,
            block.timestamp,
            trueAuthor,
            params.collectPrice,
            params.maxCollectSupply,
            params.originality
        );

        emit SessionKeyOperationExecuted(owner, sessionKey, selector);

        return newId;
    }

    function _encodePublishCallData(
        PublishParams calldata params
    ) internal pure returns (bytes memory) {
        return
            abi.encodeWithSelector(
                BlogHub.publish.selector,
                params.arweaveId,
                params.categoryId,
                params.royaltyBps,
                params.originalAuthor,
                params.title,
                params.trueAuthor,
                params.collectPrice,
                params.maxCollectSupply,
                params.originality
            );
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

    /**
     * @dev 这个 gap 是为了将来升级合约添加新状态变量时，不破坏存储布局。
     * 这是一个最佳实践。
     * 状态变量: nextArticleId(1) + platformFeeBps+platformTreasury(1) + articles(1) + sessionKeyManager(1) + minActionValue(1) = 5 slots
     * 总计保留 6 slots 的位置，gap = 50 - 6 = 44
     */
    uint256[44] private __gap;
}
