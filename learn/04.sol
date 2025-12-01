// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

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

    // EIP-712 TypeHash 定义
    // 用于链下签名关注： "Follow(address follower,address target,bool status,uint256 nonce,uint256 deadline)"
    bytes32 private constant FOLLOW_TYPEHASH = 
        keccak256("Follow(address follower,address target,bool status,uint256 nonce,uint256 deadline)");

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
        string contentHash,
        uint256 parentCommentId
    );

    event FollowStatusChanged(
        address indexed follower,
        address indexed target,
        bool isFollowing
    );

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

        // 2. 设置独立的 ERC2981 版税 (归作者所有)
        // 确保费率不超过 10000 (100%)
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
     * 用户支付 Native Token (ETH/Matic/BNB)
     */
    function collect(uint256 _articleId) external payable nonReentrant whenNotPaused {
        uint256 amountPaid = msg.value;
        require(amountPaid > 0, "Free collection not supported yet");

        address collector = _msgSender();
        
        // 简单的逻辑：所有权暂时归平台铸造给用户，或者这是 "Edition" 模式
        // 这里假设是无限量 Mint 的纪念版 (Edition)
        _mint(collector, _articleId, 1, "");

        // 资金分配逻辑
        // 1. 计算平台费
        uint256 platformShare = (amountPaid * platformFeeBps) / 10000;
        // 2. 作者所得
        uint256 authorShare = amountPaid - platformShare;

        // 获取该文章版税接收者（通常是作者）
        (address author, ) = royaltyInfo(_articleId, amountPaid);
        
        // 3. 写入 Pull Payment 账本 (不直接转账)
        if (platformShare > 0) {
            pendingWithdrawals[platformTreasury] += platformShare;
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
        string calldata _contentHash,
        uint256 _parentId
    ) external whenNotPaused {
        emit CommentAdded(_articleId, _msgSender(), _contentHash, _parentId);
    }

    /**
     * @dev 关注用户
     */
    function follow(address _target, bool _status) external whenNotPaused {
        emit FollowStatusChanged(_msgSender(), _target, _status);
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

    // =============================================================
    //                      管理功能
    // =============================================================

    function setPlatformFee(uint96 _feeBps) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_feeBps <= 5000, "Fee too high"); // Max 50%
        platformFeeBps = _feeBps;
        emit PlatformFeeUpdated(_feeBps);
    }

    function setPlatformTreasury(address _treasury) external onlyRole(DEFAULT_ADMIN_ROLE) {
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

    function _authorizeUpgrade(address newImplementation)
        internal
        override
        onlyRole(UPGRADER_ROLE)
    {}

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
    function _contextSuffixLength() internal view virtual override(ContextUpgradeable, ERC2771ContextUpgradeable) returns (uint256) {
        return ERC2771ContextUpgradeable._contextSuffixLength();
    }

    // 解决多重继承导致的 supportsInterface 冲突
    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC1155Upgradeable, ERC2981Upgradeable, AccessControlUpgradeable)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }

    /**
     * @dev 这个 gap 是为了将来升级合约添加新状态变量时，不破坏存储布局。
     * 这是一个最佳实践。
     */
    uint256[45] private __gap;
}