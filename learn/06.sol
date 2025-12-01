// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {ERC1155Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC1155/ERC1155Upgradeable.sol";
import {ERC2981Upgradeable} from "@openzeppelin/contracts-upgradeable/token/common/ERC2981Upgradeable.sol";
import {AccessControlUpgradeable} from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import {PausableUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import {ReentrancyGuardUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {ERC2771ContextUpgradeable} from "@openzeppelin/contracts-upgradeable/metatx/ERC2771ContextUpgradeable.sol";
import {MulticallUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/MulticallUpgradeable.sol";
import {EIP712Upgradeable} from "@openzeppelin/contracts-upgradeable/utils/cryptography/EIP712Upgradeable.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/**
 * @title BlogHub V2
 * @dev 集成了 UUPS 可升级、EIP-712 签名、ERC-2771 元交易、提款模式和权限管理的博客合约。
 */
contract BlogHub is
    Initializable,
    ERC1155Upgradeable,
    ERC2981Upgradeable,
    AccessControlUpgradeable,
    PausableUpgradeable,
    ReentrancyGuardUpgradeable,
    UUPSUpgradeable,
    ERC2771ContextUpgradeable,
    MulticallUpgradeable,
    EIP712Upgradeable
{
    using ECDSA for bytes32;
    // 定义常量：最大评论长度（字节）
    // 140单词英文大约 700-1000 字节，中文约 400 汉字 = 1200 字节
    uint256 public constant MAX_COMMENT_LENGTH = 1024;
    // --- 角色定义 ---
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    // --- 状态变量 ---
    uint256 public nextArticleId;

    // 平台手续费 (Basis Points, 100 = 1%)
    uint96 public platformFeeBps;
    address public platformTreasury;

    // Pull Payment (提款模式): 记录每个地址可提取的余额
    mapping(address => uint256) public pendingWithdrawals;

    // 记录每篇文章的创建者（用于分配收益 & 验证文章是否存在）
    mapping(uint256 => address) public creatorOf;

    // EIP-712 TypeHash 定义
    // 用于链下签名关注： "Follow(address follower,address target,bool status,uint256 nonce,uint256 deadline)"
    bytes32 private constant FOLLOW_TYPEHASH =
        keccak256(
            "Follow(address follower,address target,bool status,uint256 nonce,uint256 deadline)"
        );

    mapping(address => uint256) public nonces; // EIP-712 防重放 Nonce

    // --- 事件定义 ---
    event ArticlePublished(
        uint256 indexed articleId,
        address indexed author,
        uint256 indexed categoryId,
        string arweaveId,
        uint256 timestamp
    );

    event ArticleCollected(
        uint256 indexed articleId,
        address indexed collector,
        uint256 tokenId,
        uint256 amount,
        uint256 pricePaid
    );

    event CommentAdded(
        uint256 indexed articleId,
        address indexed commenter,
        string content,
        uint256 parentCommentId
    );

    event FollowStatusChanged(
        address indexed follower,
        address indexed target,
        bool isFollowing
    );

    event ReferralPaid(address indexed referrer, uint256 amount);

    event Withdrawal(address indexed user, uint256 amount);
    event PlatformFeeUpdated(uint96 newFeeBps);
    event TreasuryUpdated(address newTreasury);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @dev 初始化函数，替代构造函数
     * @param _trustedForwarder ERC-2771 的可信转发器地址 (如 Gelato Relay 或 Biconomy)
     * @param _initialOwner 合约初始管理员
     * @param _treasury 平台国库地址
     */
    function initialize(
        address _trustedForwarder,
        address _initialOwner,
        address _treasury
    ) public initializer {
        __ERC1155_init(""); // 实际 URI 建议由前端根据 ID 拼接，或者实现 uri() 函数
        __ERC2981_init();
        __AccessControl_init();
        __Pausable_init();
        __ReentrancyGuard_init();
        __UUPS_init();
        __ERC2771Context_init(_trustedForwarder); // 设置 ERC-2771 Forwarder
        __Multicall_init();
        __EIP712_init("BlogHub", "1"); // EIP-712 域名和版本

        // 权限设置
        _grantRole(DEFAULT_ADMIN_ROLE, _initialOwner);
        _grantRole(UPGRADER_ROLE, _initialOwner);
        _grantRole(PAUSER_ROLE, _initialOwner);

        // 默认参数
        platformTreasury = _treasury;
        platformFeeBps = 250; // 默认 2.5% 平台抽成
        _setDefaultRoyalty(_initialOwner, 500); // 默认 5% 版税
        nextArticleId = 1; // 从 1 开始 ID（避免 id=0 的歧义）
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
        uint256 _categoryId,
        uint96 _royaltyBps
    ) external whenNotPaused returns (uint256) {
        address author = _msgSender();
        uint256 newId = nextArticleId++;

        // 1. 铸造 NFT (初始归作者所有)
        _mint(author, newId, 1, "");

        // 记录创建者（用于后续收益分配 / 验证）
        creatorOf[newId] = author;

        // 2. 设置独立的 ERC2981 版税 (归作者所有)
        require(_royaltyBps <= 10000, "Royalty too high");
        _setTokenRoyalty(newId, author, _royaltyBps);

        emit ArticlePublished(
            newId,
            author,
            _categoryId,
            _arweaveId,
            block.timestamp
        );
        return newId;
    }

    /**
     * @dev 收藏文章 (付费逻辑 + Pull Payment)
     * 资金分配顺序：platformFee -> royalty (via royaltyInfo) -> seller (creator)
     */
    function collect(
        uint256 _articleId
    ) external payable nonReentrant whenNotPaused {
        uint256 amountPaid = msg.value;
        require(amountPaid > 0, "Free collection not supported");

        address collector = _msgSender();
        address author = creatorOf[_articleId];
        require(author != address(0), "Article not found");

        // 不能自己推荐自己
        if (_referrer == collector || _referrer == author) {
            _referrer = address(0);
        }

        // 1. 铸造 NFT 给购买者
        _mint(collector, _articleId, 1, "");

        // --- 资金分配逻辑 (更符合一级市场) ---

        // A. 平台费 (例如 2.5%)
        uint256 platformShare = (amountPaid * platformFeeBps) / 10000;

        // B. 推荐人奖励 (例如 10%，用于激励早期读者转发)
        uint256 referralShare = 0;
        if (_referrer != address(0)) {
            // 这里可以定义一个常量 REFERRAL_FEE_BPS，例如 1000 (10%)
            referralShare = (amountPaid * 1000) / 10000;
        }

        // C. 作者获得剩余所有 (不再区分版税和销售款)
        uint256 authorShare = amountPaid - platformShare - referralShare;

        // --- 写入 Pull Payment 账本 ---
        if (platformShare > 0) {
            pendingWithdrawals[platformTreasury] += platformShare;
        }
        if (referralShare > 0) {
            pendingWithdrawals[_referrer] += referralShare;
            emit ReferralPaid(_referrer, referralShare);
        }
        if (authorShare > 0) {
            pendingWithdrawals[author] += authorShare;
        }

        emit ArticleCollected(_articleId, collector, _articleId, 1, amountPaid);
    }

    /**
     * @dev 评论 (上链存证)
     */
    function comment(
        uint256 _articleId,
        string calldata _content,
        uint256 _parentId
    ) external whenNotPaused {
        require(_articleId < nextArticleId, "Article does not exist");
        // 核心：直接在这里限制长度
        require(
            bytes(_content).length <= MAX_COMMENT_LENGTH,
            "Comment too long"
        );
        require(bytes(_content).length > 0, "Comment empty");

        // 直接 Emit，数据进入区块链历史日志，达成永久存储
        emit CommentAdded(_articleId, _msgSender(), _content, _parentId);
    }

    /**
     * @dev 关注用户
     */
    function follow(address _target, bool _status) external whenNotPaused {
        emit FollowStatusChanged(_msgSender(), _target, _status);
    }

    // =============================================================
    //                          元数据 (关键修复)
    // =============================================================

    /**
     * @dev 重写 uri 函数，使其返回真实可用的 Metadata URL
     * 格式: https://arweave.net/{hash}
     */
    function uri(uint256 _id) public view override returns (string memory) {
        require(_id < nextArticleId, "URI: Non-existent token");
        string memory arweaveHash = articles[_id].arweaveHash;
        return string(abi.encodePacked("https://arweave.net/", arweaveHash));
    }

    // =============================================================
    //                  EIP-712 签名业务 (Meta-Features)
    // =============================================================

    /**
     * @dev 允许通过签名进行关注 (Gasless Follow)
     * 场景：用户 A 签了一个名，由 Relayer 调用此函数帮 A 关注 B
     */
    function permitFollow(
        address _follower,
        address _target,
        bool _status,
        uint256 _deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external whenNotPaused {
        require(block.timestamp <= _deadline, "Signature expired");

        bytes32 structHash = keccak256(
            abi.encode(
                FOLLOW_TYPEHASH,
                _follower,
                _target,
                _status,
                nonces[_follower]++, // 使用 nonce 防重放
                _deadline
            )
        );

        bytes32 hash = _hashTypedDataV4(structHash);
        address signer = ECDSA.recover(hash, v, r, s);

        require(signer == _follower, "Invalid signature");

        // 触发关注事件
        emit FollowStatusChanged(_follower, _target, _status);
    }

    // =============================================================
    //                      资金管理 (Pull Payment)
    // =============================================================

    /**
     * @dev 用户提取自己的收益
     */
    function withdraw() external nonReentrant {
        address payee = _msgSender();
        uint256 payment = pendingWithdrawals[payee];

        require(payment > 0, "No funds to withdraw");

        // Checks-Effects-Interactions 模式
        pendingWithdrawals[payee] = 0;

        (bool success, ) = payable(payee).call{value: payment}("");
        require(success, "Transfer failed");

        emit Withdrawal(payee, payment);
    }

    // allow contract to receive plain ETH (optional but convenient)
    receive() external payable {}

    // =============================================================
    //                      管理功能
    // =============================================================

    function setPlatformFee(
        uint96 _feeBps
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_feeBps <= 5000, "Fee too high"); // Max 50%
        platformFeeBps = _feeBps;
        emit PlatformFeeUpdated(_feeBps);
    }

    function setPlatformTreasury(
        address _treasury
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_treasury != address(0), "Invalid address");
        platformTreasury = _treasury;
        emit TreasuryUpdated(_treasury);
    }

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    // =============================================================
    //                      底层 Override (必须实现)
    // =============================================================

    function _authorizeUpgrade(
        address newImplementation
    ) internal override onlyRole(UPGRADER_ROLE) {}

    // ERC-2771: 上下文覆盖，确保在元交易中获取正确的 msg.sender
    function _msgSender()
        internal
        view
        override(ContextUpgradeable, ERC2771ContextUpgradeable)
        returns (address sender)
    {
        return ERC2771ContextUpgradeable._msgSender();
    }

    function _msgData()
        internal
        view
        override(ContextUpgradeable, ERC2771ContextUpgradeable)
        returns (bytes calldata)
    {
        return ERC2771ContextUpgradeable._msgData();
    }

    // ERC2771ContextUpgradeable 需要 contextSuffixLength
    function _contextSuffixLength()
        internal
        view
        virtual
        override(ContextUpgradeable, ERC2771ContextUpgradeable)
        returns (uint256)
    {
        return ERC2771ContextUpgradeable._contextSuffixLength();
    }

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
     */
    uint256[44] private __gap;
}