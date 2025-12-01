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
 * @title BlogHub V2 (修改版)
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

    // 记录每篇文章的创建者（用于分配收益 & 验证文章是否存在）
    mapping(uint256 => address) public creatorOf;

    // EIP-712 TypeHash 定义
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

    function initialize(
        address _trustedForwarder,
        address _initialOwner,
        address _treasury
    ) public initializer {
        __ERC1155_init(""); // URI 由前端或 uri() 覆盖
        __ERC2981_init();
        __AccessControl_init();
        __Pausable_init();
        __ReentrancyGuard_init();
        __UUPS_init();
        __ERC2771Context_init(_trustedForwarder);
        __Multicall_init();
        __EIP712_init("BlogHub", "1");

        // 权限设置
        _grantRole(DEFAULT_ADMIN_ROLE, _initialOwner);
        _grantRole(UPGRADER_ROLE, _initialOwner);
        _grantRole(PAUSER_ROLE, _initialOwner);

        // 默认参数
        platformTreasury = _treasury;
        platformFeeBps = 250; // 2.5%
        _setDefaultRoyalty(_initialOwner, 500); // 默认 5%
        nextArticleId = 1; // 从 1 开始 ID（避免 id=0 的歧义）
    }

    // =============================================================
    //                      核心业务逻辑
    // =============================================================

    function publish(
        string calldata _arweaveId,
        uint256 _categoryId,
        uint96 _royaltyBps
    ) external whenNotPaused returns (uint256) {
        address author = _msgSender();
        uint256 newId = nextArticleId++;

        // 1. 铸造主 NFT（原件，supply = 1）
        _mint(author, newId, 1, "");

        // 记录创建者（用于后续收益分配 / 验证）
        creatorOf[newId] = author;

        // 2. 设置独立的 ERC2981 版税 (归作者或指定接收者)
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
        require(amountPaid > 0, "Free collection not supported yet");

        address collector = _msgSender();

        // 验证文章存在
        address creator = creatorOf[_articleId];
        require(creator != address(0), "Article not found");

        // 发行 edition 给 collector（edition 模式）
        _mint(collector, _articleId, 1, "");

        // 计算分配
        uint256 platformShare = (amountPaid * platformFeeBps) / 10000;

        // 使用 royaltyInfo 获取 royaltyReceiver 与 royaltyAmount（ERC2981）
        (address royaltyReceiver, uint256 royaltyAmount) = royaltyInfo(_articleId, amountPaid);

        // 防止溢出/逻辑异常
        require(platformShare + royaltyAmount <= amountPaid, "Invalid fee configuration");

        uint256 sellerShare = amountPaid - platformShare - royaltyAmount;

        // 写入 Pull Payment 账本
        if (platformShare > 0) {
            pendingWithdrawals[platformTreasury] += platformShare;
        }
        if (royaltyAmount > 0 && royaltyReceiver != address(0)) {
            pendingWithdrawals[royaltyReceiver] += royaltyAmount;
        }
        if (sellerShare > 0) {
            pendingWithdrawals[creator] += sellerShare;
        }

        emit ArticleCollected(_articleId, collector, _articleId, 1, amountPaid);
    }

    function comment(
        uint256 _articleId,
        string calldata _contentHash,
        uint256 _parentId
    ) external whenNotPaused {
        emit CommentAdded(_articleId, _msgSender(), _contentHash, _parentId);
    }

    function follow(address _target, bool _status) external whenNotPaused {
        emit FollowStatusChanged(_msgSender(), _target, _status);
    }

    // =============================================================
    //                  EIP-712 签名业务 (Meta-Features)
    // =============================================================

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
                nonces[_follower]++, // post-increment，签名中使用当前 nonce
                _deadline
            )
        );

        bytes32 hash = _hashTypedDataV4(structHash);
        address signer = ECDSA.recover(hash, v, r, s);

        require(signer == _follower, "Invalid signature");

        emit FollowStatusChanged(_follower, _target, _status);
    }

    // =============================================================
    //                      资金管理 (Pull Payment)
    // =============================================================

    function withdraw() external nonReentrant {
        address payee = _msgSender();
        uint256 payment = pendingWithdrawals[payee];

        require(payment > 0, "No funds to withdraw");

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

    function _contextSuffixLength()
        internal
        view
        virtual
        override(ContextUpgradeable, ERC2771ContextUpgradeable)
        returns (uint256)
    {
        return ERC2771ContextUpgradeable._contextSuffixLength();
    }

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

    uint256[44] private __gap; // 调整 gap 长度以适配新增的 storage（creatorOf）
}
