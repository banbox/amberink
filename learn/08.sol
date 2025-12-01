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
 * @title BlogHub V2 Optimized
 * @dev 针对 Gas 优化并增强安全性的去中心化博客合约。
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

    // --- Custom Errors (Gas Saving) ---
    error InvalidLength();
    error InvalidScore();
    error ContentRequiredForScore();
    error ArticleNotFound();
    error RoyaltyTooHigh();
    error FeeTooHigh();
    error InvalidAddress();
    error SignatureExpired();
    error InvalidSignature();
    error NoFundsToWithdraw();
    error TransferFailed();
    error SpamProtection(); // 新增：防垃圾评论

    // --- Constants ---
    uint256 public constant MAX_COMMENT_LENGTH = 1024;
    // 设置最低评论/评价金额（防 Spam），例如 0.0001 ETH (以 wei 为单位)
    // 如果希望完全免费评论但要防 spam，需结合白名单或链下 PoW，此处采用金额门槛最简单
    uint256 public constant MIN_ACTION_VALUE = 0; 
    
    uint8 public constant SCORE_NEUTRAL = 0;
    uint8 public constant SCORE_LIKE = 1;
    uint8 public constant SCORE_DISLIKE = 2;

    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    // EIP-712 TypeHash
    bytes32 private constant FOLLOW_TYPEHASH =
        keccak256("Follow(address follower,address target,bool status,uint256 nonce,uint256 deadline)");

    // --- Structs ---
    struct Article {
        string arweaveHash;
        address author;
        uint64 categoryId; // 优化：压缩存储
        uint64 timestamp;  // 优化：压缩存储
    }

    // --- State Variables ---
    uint256 public nextArticleId;
    uint96 public platformFeeBps;
    address public platformTreasury;

    mapping(address => uint256) public pendingWithdrawals;
    mapping(uint256 => Article) public articles;
    mapping(address => uint256) public nonces;

    // --- Events ---
    event ArticlePublished(
        uint256 indexed articleId,
        address indexed author,
        uint256 indexed categoryId,
        string arweaveId,
        uint256 timestamp
    );

    event ArticleEvaluated(
        uint256 indexed articleId,
        address indexed user,
        uint8 score,
        uint256 amountPaid,
        uint256 timestamp
    );

    event CommentAdded(
        uint256 indexed articleId,
        address indexed commenter,
        string content,
        uint256 parentCommentId,
        uint8 score
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

    function initialize(
        address _trustedForwarder,
        address _initialOwner,
        address _treasury
    ) public initializer {
        if (_treasury == address(0)) revert InvalidAddress();
        if (_initialOwner == address(0)) revert InvalidAddress();

        __ERC1155_init("");
        __ERC2981_init();
        __AccessControl_init();
        __Pausable_init();
        __ReentrancyGuard_init();
        __UUPS_init();
        __ERC2771Context_init(_trustedForwarder);
        __Multicall_init();
        __EIP712_init("BlogHub", "1");

        _grantRole(DEFAULT_ADMIN_ROLE, _initialOwner);
        _grantRole(UPGRADER_ROLE, _initialOwner);
        _grantRole(PAUSER_ROLE, _initialOwner);

        platformTreasury = _treasury;
        platformFeeBps = 250; // 2.5%
        _setDefaultRoyalty(_initialOwner, 500); // 5%
        nextArticleId = 1;
    }

    // =============================================================
    //                          Core Logic
    // =============================================================

    function publish(
        string calldata _arweaveId,
        uint64 _categoryId, // 匹配 struct
        uint96 _royaltyBps
    ) external whenNotPaused returns (uint256) {
        if (_royaltyBps > 10000) revert RoyaltyTooHigh();

        address author = _msgSender();
        uint256 newId = nextArticleId++;

        articles[newId] = Article({
            arweaveHash: _arweaveId,
            author: author,
            categoryId: _categoryId,
            timestamp: uint64(block.timestamp)
        });

        // Mint Initial NFT to author
        _mint(author, newId, 1, "");

        // Set Royalty
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
     * @dev 评价文章 (打赏 + 评论)
     */
    function evaluate(
        uint256 _articleId,
        uint8 _score,
        string calldata _content,
        address _referrer,
        uint256 _parentCommentId
    ) external payable nonReentrant whenNotPaused {
        if (_articleId >= nextArticleId) revert ArticleNotFound();
        if (_score > 2) revert InvalidScore();
        
        uint256 contentLength = bytes(_content).length;
        if (contentLength > MAX_COMMENT_LENGTH) revert InvalidLength();

        // 逻辑修正：如果只评分不说话，允许 content 为空。
        // 但如果 content 为空且 score 为 neutral (0)，这通常是无意义操作，除非纯为了 mint 凭证
        if (contentLength == 0 && _score == SCORE_NEUTRAL && msg.value == 0) {
            revert ContentRequiredForScore();
        }

        // --- 防 Spam 检查 ---
        // 如果没有付费，且内容不为空，可能有被刷屏的风险。
        // 建议：要么付费，要么通过 ERC2771 使得 Forwarder 承担 Gas (Relayer 会做限流)。
        // 这里添加一个简单的逻辑：如果有内容，必须 amountPaid > 0 或者 msg.sender 持有某种资格(略)。
        // 为了简化，这里仅依赖 Gas 成本，但如果是在低 Gas 链，建议开启下方检查:
        // if (contentLength > 0 && msg.value < MIN_ACTION_VALUE) revert SpamProtection();

        address sender = _msgSender();
        Article memory article = articles[_articleId];
        uint256 amountPaid = msg.value;

        // --- 资金处理 ---
        if (amountPaid > 0) {
            // 1. 铸造凭证给打赏者
            _mint(sender, _articleId, 1, "");

            // 2. 资金分配
            if (_score == SCORE_DISLIKE) {
                // 不喜欢的评价，资金归国库
                pendingWithdrawals[platformTreasury] += amountPaid;
            } else {
                // 处理推荐人
                if (_referrer == sender || _referrer == article.author) {
                    _referrer = address(0);
                }

                uint256 platformShare = (amountPaid * platformFeeBps) / 10000;
                // 固定推荐费率 10%
                uint256 referralShare = (_referrer != address(0)) 
                    ? (amountPaid * 1000) / 10000 
                    : 0;
                
                // 剩余归作者
                uint256 authorShare = amountPaid - platformShare - referralShare;

                if (platformShare > 0) {
                    pendingWithdrawals[platformTreasury] += platformShare;
                }
                if (referralShare > 0) {
                    pendingWithdrawals[_referrer] += referralShare;
                    emit ReferralPaid(_referrer, referralShare);
                }
                if (authorShare > 0) {
                    pendingWithdrawals[article.author] += authorShare;
                }
            }
            
            emit ArticleEvaluated(
                _articleId,
                sender,
                _score,
                amountPaid,
                block.timestamp
            );
        } else {
            // 免费评价不触发 Evaluated 事件，只触发 Comment 事件，或者两者分离？
            // 为了 Subgraph 索引方便，建议依然触发，但 amount 为 0
             emit ArticleEvaluated(
                _articleId,
                sender,
                _score,
                0,
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

    function follow(address _target, bool _status) external whenNotPaused {
        emit FollowStatusChanged(_msgSender(), _target, _status);
    }

    // =============================================================
    //                          Metadata
    // =============================================================

    function uri(uint256 _id) public view override returns (string memory) {
        if (_id >= nextArticleId) revert ArticleNotFound();
        return string(abi.encodePacked("https://arweave.net/", articles[_id].arweaveHash));
    }

    // =============================================================
    //                        EIP-712 / Meta
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
        if (block.timestamp > _deadline) revert SignatureExpired();

        // 优化：使用 unchecked 递增 nonce，节省 Gas (极难溢出)
        uint256 currentNonce;
        unchecked {
            currentNonce = nonces[_follower]++;
        }

        bytes32 structHash = keccak256(
            abi.encode(
                FOLLOW_TYPEHASH,
                _follower,
                _target,
                _status,
                currentNonce,
                _deadline
            )
        );

        bytes32 hash = _hashTypedDataV4(structHash);
        address signer = ECDSA.recover(hash, v, r, s);

        if (signer != _follower) revert InvalidSignature();

        emit FollowStatusChanged(_follower, _target, _status);
    }

    // =============================================================
    //                        Treasury
    // =============================================================

    function withdraw() external nonReentrant {
        address payee = _msgSender();
        uint256 payment = pendingWithdrawals[payee];

        if (payment == 0) revert NoFundsToWithdraw();

        pendingWithdrawals[payee] = 0;

        (bool success, ) = payable(payee).call{value: payment}("");
        if (!success) revert TransferFailed();

        emit Withdrawal(payee, payment);
    }

    receive() external payable {}

    // =============================================================
    //                        Admin
    // =============================================================

    function setPlatformFee(uint96 _feeBps) external onlyRole(DEFAULT_ADMIN_ROLE) {
        // 安全检查：确保平台费 + 潜在的推荐费(10%) 不会超过 100%
        // 这里限制平台费最高 50%
        if (_feeBps > 5000) revert FeeTooHigh();
        platformFeeBps = _feeBps;
        emit PlatformFeeUpdated(_feeBps);
    }

    function setPlatformTreasury(address _treasury) external onlyRole(DEFAULT_ADMIN_ROLE) {
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

    // =============================================================
    //                        Overrides
    // =============================================================

    function _authorizeUpgrade(address newImplementation) internal override onlyRole(UPGRADER_ROLE) {}

    function _msgSender() internal view override(ContextUpgradeable, ERC2771ContextUpgradeable) returns (address sender) {
        return ERC2771ContextUpgradeable._msgSender();
    }

    function _msgData() internal view override(ContextUpgradeable, ERC2771ContextUpgradeable) returns (bytes calldata) {
        return ERC2771ContextUpgradeable._msgData();
    }

    function _contextSuffixLength() internal view virtual override(ContextUpgradeable, ERC2771ContextUpgradeable) returns (uint256) {
        return ERC2771ContextUpgradeable._contextSuffixLength();
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC1155Upgradeable, ERC2981Upgradeable, AccessControlUpgradeable) returns (bool) {
        return super.supportsInterface(interfaceId);
    }

    /**
     * @dev Gap for future upgrades.
     */
    uint256[44] private __gap;
}