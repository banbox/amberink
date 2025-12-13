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
import {EIP712Upgradeable} from "@openzeppelin/contracts-upgradeable/utils/cryptography/EIP712Upgradeable.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {ISessionKeyManager} from "./interfaces/ISessionKeyManager.sol";

/**
 * @title BlogHub V2
 * @dev 集成了 UUPS 可升级、EIP-712 签名、权限管理的博客合约。
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
    MulticallUpgradeable,
    EIP712Upgradeable
{
    using ECDSA for bytes32;

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
    error ZeroAmount();
    error SessionKeyValidationFailed();
    error SessionKeyManagerNotSet();
    error OriginalAuthorTooLong();
    error TitleTooLong();
    error InsufficientPayment();
    error MaxSupplyReached();
    error CollectNotEnabled();
    
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
        string arweaveHash;    // Irys 可变文件夹的 manifest ID
        address author;
        string originalAuthor; // 真实作者（用于代发场景，最大64字节）
        string title;          // 文章标题（最大128字节，用于列表展示）
        uint64 categoryId;
        uint64 timestamp;
        // New Fields
        address trueAuthor;    // 真实作者钱包地址（用于接收资金）
        uint256 collectPrice;  // 收藏价格
        uint256 maxCollectSupply; // 最大收藏数量 (0 表示不可收藏，除非是老数据兼容处理)
        uint256 collectCount;     // 当前收藏数量
        Originality originality;  // 原创性声明
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
        __EIP712_init("BlogHub", "2"); // EIP-712 域名和版本 (升级到 V2)

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

        Article memory article = articles[_articleId];

        // --- 资金处理 ---
        if (amount > 0) {
            // 资金分配
            if (_score == SCORE_DISLIKE) {
                // 不喜欢时，金额归平台（直接转账）
                (bool success, ) = payable(platformTreasury).call{value: amount}("");
                if (!success) revert TransferFailed();
            } else {
                
                address[] memory invalidAddrs = new address[](1);
                invalidAddrs[0] = article.author;
                address validReferrer = _validateReferrer(_referrer, sender, invalidAddrs);
                uint256 authorShare = _distributePlatformAndReferralFees(amount, validReferrer);
                if (authorShare > 0) {
                    // 优先转给 trueAuthor
                    address recipient = article.trueAuthor != address(0) ? article.trueAuthor : article.author;
                    (bool success, ) = payable(recipient).call{value: authorShare}("");
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
        
        // 需重新读取 storage 以更新 collectCount
        Article storage articleStorage = articles[_articleId];
        Article memory article = articles[_articleId]; // memory copy for reading config

        if (article.maxCollectSupply > 0 && article.collectCount >= article.maxCollectSupply) {
            revert MaxSupplyReached();
        }
        // 如果 maxCollectSupply 为 0，且 collectCount 也为 0 (旧文章默认值)，这里需要判断策略。
        // 假设 maxCollectSupply 0 意味着不可收藏（除非特殊逻辑）。
        // 简单起见，如果 maxCollectSupply == 0，视为不可收藏。
        // 如果想发布无限量的，作者应设置一个极大值。
        if (article.maxCollectSupply == 0) {
            revert CollectNotEnabled();
        }

        if (amount < article.collectPrice) {
            revert InsufficientPayment();
        }

        // 更新计数
        articleStorage.collectCount++;

        // 铸造 NFT
        _mint(sender, _articleId, 1, "");

        // 资金分配
        address[] memory invalidAddrs = new address[](1);
        invalidAddrs[0] = article.author;
        address validReferrer = _validateReferrer(_referrer, sender, invalidAddrs);
        uint256 authorShare = _distributePlatformAndReferralFees(amount, validReferrer);
        
        if (authorShare > 0) {
            address recipient = article.trueAuthor != address(0) ? article.trueAuthor : article.author;
            (bool success, ) = payable(recipient).call{value: authorShare}("");
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

        Article memory article = articles[_articleId];

        // --- 资金分配 ---
        address[] memory invalidAddrs = new address[](2);
        invalidAddrs[0] = article.author;
        invalidAddrs[1] = _commenter;
        address validReferrer = _validateReferrer(_referrer, sender, invalidAddrs);

        uint256 remaining = _distributePlatformAndReferralFees(amount, validReferrer);

        uint256 halfShare = remaining / 2;
        uint256 commenterShare = remaining - halfShare;

        if (halfShare > 0) {
            // 作者份额给 trueAuthor
            address recipient = article.trueAuthor != address(0) ? article.trueAuthor : article.author;
            (bool success1, ) = payable(recipient).call{value: halfShare}("");
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
        address _referrer,
        address _sender,
        address[] memory _invalidAddresses
    ) internal pure returns (address) {
        if (_referrer == _sender) return address(0);
        for (uint256 i = 0; i < _invalidAddresses.length; i++) {
            if (_referrer == _invalidAddresses[i]) return address(0);
        }
        return _referrer;
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

        return _amount - platformShare - referralShare;
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
        if (_royaltyBps > 10000) revert RoyaltyTooHigh();
        if (bytes(_originalAuthor).length > MAX_ORIGINAL_AUTHOR_LENGTH) revert OriginalAuthorTooLong();
        if (bytes(_title).length > MAX_TITLE_LENGTH) revert TitleTooLong();
        
        address author = _msgSender();
        uint256 newId = nextArticleId++;

        // 存储文章元数据
        articles[newId] = Article({
            arweaveHash: _arweaveId,
            author: author,
            originalAuthor: _originalAuthor,
            title: _title,
            categoryId: _categoryId,
            timestamp: uint64(block.timestamp),
            trueAuthor: _trueAuthor,
            collectPrice: _collectPrice,
            maxCollectSupply: _maxCollectSupply,
            collectCount: 0,
            originality: _originality
        });

        // 1. 铸造 NFT (初始归作者所有 - 创世 NFT 1个)
        articles[newId].collectCount = 1;
        _mint(author, newId, 1, "");

        // 2. 设置独立的 ERC2981 版税 (归作者所有，或者 trueAuthor?)
        // 版税通常给收款人
        address royaltyReceiver = _trueAuthor != address(0) ? _trueAuthor : author;
        _setTokenRoyalty(newId, royaltyReceiver, _royaltyBps);

        emit ArticlePublished(
            newId,
            author,
            _categoryId,
            _arweaveId,
            _originalAuthor,
            _title,
            block.timestamp,
            _trueAuthor,
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
        emit FollowStatusChanged(_msgSender(), _target, _status);
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
        if (address(sessionKeyManager) == address(0)) revert SessionKeyManagerNotSet();

        // 构建 callData 用于验证
        bytes memory callData = abi.encodeWithSelector(
            this.evaluate.selector,
            _articleId,
            _score,
            _content,
            _referrer,
            _parentCommentId
        );

        // 验证 Session Key
        bool valid = sessionKeyManager.validateAndUseSessionKey(
            owner,
            sessionKey,
            address(this),
            this.evaluate.selector,
            callData,
            msg.value,
            deadline,
            signature
        );

        if (!valid) revert SessionKeyValidationFailed();

        // 执行评价操作（以 owner 身份），资金分配由 _executeEvaluate 内部处理
        _executeEvaluate(owner, _articleId, _score, _content, _referrer, _parentCommentId, msg.value);

        emit SessionKeyOperationExecuted(owner, sessionKey, this.evaluate.selector);
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
        if (address(sessionKeyManager) == address(0)) revert SessionKeyManagerNotSet();

        // 构建 callData 用于验证
        bytes memory callData = abi.encodeWithSelector(
            this.collect.selector,
            _articleId,
            _referrer
        );

        // 验证 Session Key
        bool valid = sessionKeyManager.validateAndUseSessionKey(
            owner,
            sessionKey,
            address(this),
            this.collect.selector,
            callData,
            msg.value,
            deadline,
            signature
        );

        if (!valid) revert SessionKeyValidationFailed();

        // 执行收藏操作（以 owner 身份）
        _executeCollect(owner, _articleId, _referrer, msg.value);

        emit SessionKeyOperationExecuted(owner, sessionKey, this.collect.selector);
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
        if (address(sessionKeyManager) == address(0)) revert SessionKeyManagerNotSet();

        // 构建 callData 用于验证
        bytes memory callData = abi.encodeWithSelector(
            this.likeComment.selector,
            _articleId,
            _commentId,
            _commenter,
            _referrer
        );

        // 验证 Session Key
        bool valid = sessionKeyManager.validateAndUseSessionKey(
            owner,
            sessionKey,
            address(this),
            this.likeComment.selector,
            callData,
            msg.value,
            deadline,
            signature
        );

        if (!valid) revert SessionKeyValidationFailed();

        // likeComment 必须有支付金额
        if (msg.value == 0) revert ZeroAmount();

        // 执行点赞操作（以 owner 身份），资金分配由 _executeLikeComment 内部处理
        _executeLikeComment(owner, _articleId, _commentId, _commenter, _referrer, msg.value);

        emit SessionKeyOperationExecuted(owner, sessionKey, this.likeComment.selector);
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
        if (address(sessionKeyManager) == address(0)) revert SessionKeyManagerNotSet();

        // 构建 callData 用于验证
        bytes memory callData = abi.encodeWithSelector(
            this.follow.selector,
            _target,
            _status
        );

        // 验证 Session Key
        bool valid = sessionKeyManager.validateAndUseSessionKey(
            owner,
            sessionKey,
            address(this),
            this.follow.selector,
            callData,
            0, // follow 操作不需要支付
            deadline,
            signature
        );

        if (!valid) revert SessionKeyValidationFailed();

        // 执行关注操作
        emit FollowStatusChanged(owner, _target, _status);

        emit SessionKeyOperationExecuted(owner, sessionKey, this.follow.selector);
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
        if (address(sessionKeyManager) == address(0)) revert SessionKeyManagerNotSet();
        if (params.royaltyBps > 10000) revert RoyaltyTooHigh();
        if (bytes(params.originalAuthor).length > MAX_ORIGINAL_AUTHOR_LENGTH) revert OriginalAuthorTooLong();
        if (bytes(params.title).length > MAX_TITLE_LENGTH) revert TitleTooLong();

        // 构建 callData 用于验证
        // 注意：这里需要确保 ABI 编码与 client 端签名构建一致
        bytes memory callData = abi.encodeWithSelector(
            this.publish.selector,
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

        // 验证 Session Key
        bool valid = sessionKeyManager.validateAndUseSessionKey(
            owner,
            sessionKey,
            address(this),
            this.publish.selector,
            callData,
            0, // publish 操作不需要支付
            deadline,
            signature
        );

        if (!valid) revert SessionKeyValidationFailed();

        // 执行发布操作（以 owner 身份）
        uint256 newId = nextArticleId++;

        // 存储文章元数据
        articles[newId] = Article({
            arweaveHash: params.arweaveId,
            author: owner,
            originalAuthor: params.originalAuthor,
            title: params.title,
            categoryId: params.categoryId,
            timestamp: uint64(block.timestamp),
            trueAuthor: params.trueAuthor,
            collectPrice: params.collectPrice,
            maxCollectSupply: params.maxCollectSupply,
            collectCount: 0,
            originality: params.originality
        });

        if (params.maxCollectSupply > 0) {
             articles[newId].collectCount = 1;
             _mint(owner, newId, 1, "");
        }

        address royaltyReceiver = params.trueAuthor != address(0) ? params.trueAuthor : owner;
        _setTokenRoyalty(newId, royaltyReceiver, params.royaltyBps);

        emit ArticlePublished(
            newId,
            owner,
            params.categoryId,
            params.arweaveId,
            params.originalAuthor,
            params.title,
            block.timestamp,
            params.trueAuthor,
            params.collectPrice,
            params.maxCollectSupply,
            params.originality
        );

        emit SessionKeyOperationExecuted(owner, sessionKey, this.publish.selector);

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

    /**
     * @dev 这个 gap 是为了将来升级合约添加新状态变量时，不破坏存储布局。
     * 这是一个最佳实践。
     * 状态变量: nextArticleId(1) + platformFeeBps+platformTreasury(1) + articles(1) + sessionKeyManager(1) + minActionValue(1) = 5 slots
     * 总计保留 6 slots 的位置，gap = 50 - 6 = 44
     */
    uint256[44] private __gap;
}
