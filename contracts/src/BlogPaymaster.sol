// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IEntryPoint, PackedUserOperation} from "./interfaces/IEntryPoint.sol";
import {IPaymaster} from "./interfaces/IPaymaster.sol";
import {ISessionKeyManager} from "./interfaces/ISessionKeyManager.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {CallDataParser} from "./libraries/CallDataParser.sol";

/**
 * @title BlogPaymaster
 * @dev ERC-4337 Paymaster 合约，支持：
 * 1. 资金池：用户可存入资金，记录 balanceOf[user]
 * 2. 授权代付：用户可授权他人使用自己的余额支付 gas，allowance[owner][spender]
 * 3. 完全去中心化：无需信任第三方 Relayer
 * 
 * 使用场景：
 * - 用户 A (项目方) 存入资金到 Paymaster
 * - 用户 A 授权用户 B (用户) 使用其余额
 * - 用户 B 发送 UserOperation 时，指定此 Paymaster
 * - Paymaster 验证授权并从 A 的余额中扣除 gas 费用
 * 
 * Session Key 支持：
 * - 用户可以使用 Session Key 签名 UserOperation
 * - Paymaster 验证 Session Key 的有效性和权限
 * - 实现完全无感的 Web2 体验
 */
contract BlogPaymaster is IPaymaster, EIP712, ReentrancyGuard, Ownable {
    using ECDSA for bytes32;

    // --- 错误定义 ---
    error InsufficientBalance();
    error InsufficientAllowance();
    error InvalidEntryPoint();
    error InvalidSponsor();
    error TransferFailed();
    error ZeroAmount();
    error ZeroAddress();
    error OnlyEntryPoint();
    error PaymasterDepositTooLow();
    error InvalidSessionKey();
    error SessionKeyExpired();
    error InvalidSignature();
    error SignatureExpired();

    // --- 事件定义 ---
    event Deposited(address indexed account, uint256 amount);
    event Withdrawn(address indexed account, uint256 amount);
    event ApprovalSet(address indexed owner, address indexed spender, uint256 amount);
    event GasPaid(
        address indexed sponsor,
        address indexed spender,
        uint256 amount,
        bytes32 userOpHash
    );
    event EntryPointDeposited(uint256 amount);
    event EntryPointWithdrawn(address indexed to, uint256 amount);
    event SessionKeyManagerUpdated(address indexed newManager);
    event SessionKeyGasPaid(
        address indexed owner,
        address indexed sessionKey,
        address indexed sponsor,
        uint256 amount,
        bytes32 userOpHash
    );

    // --- 状态变量 ---
    
    /// @notice ERC-4337 EntryPoint 合约地址
    IEntryPoint public immutable entryPoint;

    /// @notice 用户在 Paymaster 中的余额
    mapping(address => uint256) public balanceOf;

    /// @notice 授权额度：allowance[owner][spender] = amount
    mapping(address => mapping(address => uint256)) public allowance;

    /// @notice 最低 EntryPoint 存款要求（用于支付 gas）
    uint256 public constant MIN_ENTRYPOINT_DEPOSIT = 0.01 ether;

    /// @notice Session Key 管理器合约
    ISessionKeyManager public sessionKeyManager;

    // Session Key UserOp 验证的 TypeHash
    bytes32 private constant SESSION_KEY_USEROP_TYPEHASH = keccak256(
        "SessionKeyUserOp(address owner,address sessionKey,bytes32 userOpHash,uint256 nonce,uint256 deadline)"
    );

    /// @notice Session Key 的 nonce（用于防重放）
    mapping(address => mapping(address => uint256)) public sessionKeyNonces;

    // --- 修饰符 ---
    modifier onlyEntryPoint() {
        if (msg.sender != address(entryPoint)) revert OnlyEntryPoint();
        _;
    }

    // --- 构造函数 ---
    constructor(address _entryPoint, address _owner) EIP712("BlogPaymaster", "1") Ownable(_owner) {
        if (_entryPoint == address(0)) revert ZeroAddress();
        entryPoint = IEntryPoint(_entryPoint);
    }

    // =============================================================
    //                      资金管理
    // =============================================================

    function _deposit(address account, uint256 amount) internal {
        if (amount == 0) revert ZeroAmount();
        if (account == address(0)) revert ZeroAddress();
        balanceOf[account] += amount;
        emit Deposited(account, amount);
    }

    /**
     * @notice 存入资金到自己的账户
     */
    function deposit() external payable nonReentrant {
        _deposit(msg.sender, msg.value);
    }

    /**
     * @notice 为指定账户存入资金（可为他人充值）
     */
    function depositTo(address account) external payable nonReentrant {
        _deposit(account, msg.value);
    }

    function _withdraw(address account, uint256 amount) internal {
        if (amount == 0) revert ZeroAmount();
        if (balanceOf[account] < amount) revert InsufficientBalance();
        balanceOf[account] -= amount;
        (bool success, ) = payable(account).call{value: amount}("");
        if (!success) revert TransferFailed();
        emit Withdrawn(account, amount);
    }

    /**
     * @notice 提取自己的资金
     */
    function withdraw(uint256 amount) external nonReentrant {
        _withdraw(msg.sender, amount);
    }

    /**
     * @notice 提取全部资金
     */
    function withdrawAll() external nonReentrant {
        _withdraw(msg.sender, balanceOf[msg.sender]);
    }

    // =============================================================
    //                      授权管理
    // =============================================================

    /**
     * @notice 授权他人使用自己的余额支付 gas
     * @param spender 被授权人地址
     * @param amount 授权额度（设为 type(uint256).max 表示无限授权）
     */
    function approve(address spender, uint256 amount) external {
        if (spender == address(0)) revert ZeroAddress();
        allowance[msg.sender][spender] = amount;
        emit ApprovalSet(msg.sender, spender, amount);
    }

    /**
     * @notice 增加授权额度
     * @param spender 被授权人地址
     * @param addedValue 增加的额度
     */
    function increaseAllowance(address spender, uint256 addedValue) external {
        if (spender == address(0)) revert ZeroAddress();
        allowance[msg.sender][spender] += addedValue;
        emit ApprovalSet(msg.sender, spender, allowance[msg.sender][spender]);
    }

    /**
     * @notice 减少授权额度
     * @param spender 被授权人地址
     * @param subtractedValue 减少的额度
     */
    function decreaseAllowance(address spender, uint256 subtractedValue) external {
        if (spender == address(0)) revert ZeroAddress();
        uint256 currentAllowance = allowance[msg.sender][spender];
        uint256 newAllowance = currentAllowance < subtractedValue ? 0 : currentAllowance - subtractedValue;
        allowance[msg.sender][spender] = newAllowance;
        emit ApprovalSet(msg.sender, spender, newAllowance);
    }

    // =============================================================
    //                      ERC-4337 Paymaster 接口
    // =============================================================

    /**
     * @dev 检查并扣除 sponsor 余额和授权
     */
    function _chargeSponsorship(address sponsor, address spender, uint256 maxCost) internal {
        if (sponsor == address(0)) revert InvalidSponsor();
        if (balanceOf[sponsor] < maxCost) revert InsufficientBalance();
        if (sponsor != spender) {
            uint256 currentAllowance = allowance[sponsor][spender];
            if (currentAllowance < maxCost) revert InsufficientAllowance();
            if (currentAllowance != type(uint256).max) {
                allowance[sponsor][spender] = currentAllowance - maxCost;
            }
        }
        balanceOf[sponsor] -= maxCost;
    }

    /**
     * @notice 验证是否为此 UserOperation 付款
     * @dev paymasterAndData 格式有两种：
     *      1. 普通模式: [paymaster (20)][mode=0 (1)][sponsor (20)]
     *      2. Session Key 模式: [paymaster (20)][mode=1 (1)][owner (20)][sessionKey (20)][sponsor (20)][deadline (32)][signature (65)]
     *      
     *      mode: 0 = 普通授权模式, 1 = Session Key 模式
     */
    function validatePaymasterUserOp(
        PackedUserOperation calldata userOp,
        bytes32 userOpHash,
        uint256 maxCost
    ) external override onlyEntryPoint returns (bytes memory context, uint256 validationData) {
        // 最小长度检查: paymaster(20) + mode(1) + sponsor(20) = 41
        if (userOp.paymasterAndData.length < 41) revert InvalidSponsor();
        
        uint8 mode = uint8(userOp.paymasterAndData[20]);
        
        if (mode == 0) {
            // 普通授权模式
            return _validateNormalMode(userOp, userOpHash, maxCost);
        } else if (mode == 1) {
            // Session Key 模式
            return _validateSessionKeyMode(userOp, userOpHash, maxCost);
        } else {
            revert InvalidSponsor();
        }
    }

    /**
     * @dev 普通授权模式验证
     * paymasterAndData: [paymaster (20)][mode=0 (1)][sponsor (20)]
     */
    function _validateNormalMode(
        PackedUserOperation calldata userOp,
        bytes32 userOpHash,
        uint256 maxCost
    ) internal returns (bytes memory context, uint256 validationData) {
        address sponsor = address(bytes20(userOp.paymasterAndData[21:41]));
        address sender = userOp.sender;
        _chargeSponsorship(sponsor, sender, maxCost);
        context = abi.encode(uint8(0), sponsor, sender, maxCost, userOpHash);
        validationData = 0;
    }

    /**
     * @dev Session Key 模式验证
     * paymasterAndData: [paymaster (20)][mode=1 (1)][owner (20)][sessionKey (20)][sponsor (20)][deadline (32)][signature (65)]
     * 总长度: 20 + 1 + 20 + 20 + 20 + 32 + 65 = 178
     */
    function _validateSessionKeyMode(
        PackedUserOperation calldata userOp,
        bytes32 userOpHash,
        uint256 maxCost
    ) internal returns (bytes memory context, uint256 validationData) {
        // 长度检查
        if (userOp.paymasterAndData.length < 178) revert InvalidSessionKey();
        
        // 解析数据
        address owner = address(bytes20(userOp.paymasterAndData[21:41]));
        address sessionKey = address(bytes20(userOp.paymasterAndData[41:61]));
        address sponsor = address(bytes20(userOp.paymasterAndData[61:81]));
        uint256 deadline = uint256(bytes32(userOp.paymasterAndData[81:113]));
        bytes memory signature = userOp.paymasterAndData[113:178];
        
        // 检查过期时间
        if (block.timestamp > deadline) revert SignatureExpired();
        
        // 验证 Session Key 签名
        uint256 currentNonce = sessionKeyNonces[owner][sessionKey]++;
        bytes32 structHash = keccak256(
            abi.encode(
                SESSION_KEY_USEROP_TYPEHASH,
                owner,
                sessionKey,
                userOpHash,
                currentNonce,
                deadline
            )
        );
        
        bytes32 hash = _hashTypedDataV4(structHash);
        address signer = ECDSA.recover(hash, signature);
        
        if (signer != sessionKey) revert InvalidSignature();
        
        // 验证 Session Key 在 SessionKeyManager 中的有效性
        if (address(sessionKeyManager) != address(0)) {
            // 从 userOp.callData 中提取目标合约和函数选择器
            // callData 格式: execute(address dest, uint256 value, bytes calldata func)
            // 或者直接调用目标合约
            (address target, bytes4 selector) = CallDataParser.extractTargetAndSelector(userOp.callData);
            
            bool isValid = sessionKeyManager.validateSessionKey(
                owner,
                sessionKey,
                target,
                selector,
                0 // value 在这里不验证，由目标合约验证
            );
            
            if (!isValid) revert InvalidSessionKey();
        }
        
        _chargeSponsorship(sponsor, owner, maxCost);
        context = abi.encode(uint8(1), sponsor, owner, sessionKey, maxCost, userOpHash);
        validationData = 0;
    }

    /**
     * @notice 操作执行后的回调，处理退款
     * @dev 根据 context 中的 mode 区分普通模式和 Session Key 模式
     */
    function postOp(
        PostOpMode opMode,
        bytes calldata context,
        uint256 actualGasCost,
        uint256 /* actualUserOpFeePerGas */
    ) external override onlyEntryPoint {
        // 解析 mode
        uint8 mode = abi.decode(context, (uint8));
        
        if (mode == 0) {
            _postOpNormalMode(opMode, context, actualGasCost);
        } else {
            _postOpSessionKeyMode(opMode, context, actualGasCost);
        }
    }

    /**
     * @dev 处理退款和授权额度恢复的通用逻辑
     */
    function _processRefund(
        address sponsor,
        address spender,
        uint256 refundAmount
    ) internal {
        if (refundAmount > 0) {
            balanceOf[sponsor] += refundAmount;
            if (sponsor != spender && allowance[sponsor][spender] != type(uint256).max) {
                allowance[sponsor][spender] += refundAmount;
            }
        }
    }

    /**
     * @dev 普通模式的 postOp 处理
     */
    function _postOpNormalMode(
        PostOpMode opMode,
        bytes calldata context,
        uint256 actualGasCost
    ) internal {
        (, address sponsor, address sender, uint256 maxCost, bytes32 userOpHash) = 
            abi.decode(context, (uint8, address, address, uint256, bytes32));
        
        if (opMode == PostOpMode.opReverted) {
            _processRefund(sponsor, sender, maxCost);
        } else {
            _processRefund(sponsor, sender, maxCost - actualGasCost);
            emit GasPaid(sponsor, sender, actualGasCost, userOpHash);
        }
    }

    /**
     * @dev Session Key 模式的 postOp 处理
     */
    function _postOpSessionKeyMode(
        PostOpMode opMode,
        bytes calldata context,
        uint256 actualGasCost
    ) internal {
        (, address sponsor, address owner, address sessionKey, uint256 maxCost, bytes32 userOpHash) = 
            abi.decode(context, (uint8, address, address, address, uint256, bytes32));
        
        if (opMode == PostOpMode.opReverted) {
            _processRefund(sponsor, owner, maxCost);
        } else {
            _processRefund(sponsor, owner, maxCost - actualGasCost);
            emit SessionKeyGasPaid(owner, sessionKey, sponsor, actualGasCost, userOpHash);
        }
    }

    // =============================================================
    //                      EntryPoint 存款管理
    // =============================================================

    /**
     * @notice 向 EntryPoint 存款（Paymaster 需要在 EntryPoint 有存款才能工作）
     */
    function depositToEntryPoint() external payable onlyOwner {
        entryPoint.depositTo{value: msg.value}(address(this));
        emit EntryPointDeposited(msg.value);
    }

    /**
     * @notice 从 EntryPoint 提款
     * @param amount 提款金额
     */
    function withdrawFromEntryPoint(uint256 amount) external onlyOwner {
        entryPoint.withdrawTo(payable(owner()), amount);
        emit EntryPointWithdrawn(owner(), amount);
    }

    /**
     * @notice 获取 Paymaster 在 EntryPoint 的存款余额
     */
    function getEntryPointDeposit() external view returns (uint256) {
        return entryPoint.balanceOf(address(this));
    }

    /**
     * @notice 向 EntryPoint 添加 stake（Paymaster 必须有 stake 才能工作）
     * @param unstakeDelaySec 解锁延迟时间（秒），建议至少 1 天
     */
    function addStake(uint32 unstakeDelaySec) external payable onlyOwner {
        entryPoint.addStake{value: msg.value}(unstakeDelaySec);
    }

    /**
     * @notice 解锁 stake（需要等待 unstakeDelaySec 后才能提取）
     */
    function unlockStake() external onlyOwner {
        entryPoint.unlockStake();
    }

    /**
     * @notice 提取 stake（需要先 unlockStake 并等待延迟时间）
     */
    function withdrawStake() external onlyOwner {
        entryPoint.withdrawStake(payable(owner()));
    }

    /**
     * @notice 获取 Paymaster 在 EntryPoint 的完整存款信息
     */
    function getDepositInfo() external view returns (
        uint256 depositAmount,
        bool staked,
        uint112 stake,
        uint32 unstakeDelaySec,
        uint48 withdrawTime
    ) {
        return entryPoint.getDepositInfo(address(this));
    }

    // =============================================================
    //                      视图函数
    // =============================================================

    /**
     * @notice 检查是否可以为指定的 sponsor-spender 对支付指定金额
     * @param sponsor 资金赞助人
     * @param spender 实际操作人
     * @param amount 所需金额
     */
    function canSponsor(
        address sponsor,
        address spender,
        uint256 amount
    ) external view returns (bool) {
        if (balanceOf[sponsor] < amount) return false;
        if (sponsor != spender) {
            if (allowance[sponsor][spender] < amount) return false;
        }
        return true;
    }

    /**
     * @notice 获取用户的可用余额和授权信息
     * @param user 用户地址
     * @param spender 被授权人地址
     */
    function getUserInfo(
        address user,
        address spender
    ) external view returns (uint256 balance, uint256 allowanceAmount) {
        balance = balanceOf[user];
        allowanceAmount = allowance[user][spender];
    }

    /**
     * @notice 获取 Session Key 的 nonce
     * @param owner 主账户地址
     * @param sessionKey Session Key 地址
     */
    function getSessionKeyNonce(
        address owner,
        address sessionKey
    ) external view returns (uint256) {
        return sessionKeyNonces[owner][sessionKey];
    }

    /**
     * @notice 获取 EIP-712 域分隔符
     */
    function DOMAIN_SEPARATOR() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    /**
     * @notice 获取 Session Key UserOp 的 TypeHash
     */
    function SESSION_KEY_TYPEHASH() external pure returns (bytes32) {
        return SESSION_KEY_USEROP_TYPEHASH;
    }

    // =============================================================
    //                      Session Key 管理
    // =============================================================

    /**
     * @notice 设置 Session Key 管理器地址
     * @param _sessionKeyManager Session Key 管理器合约地址
     */
    function setSessionKeyManager(address _sessionKeyManager) external onlyOwner {
        sessionKeyManager = ISessionKeyManager(_sessionKeyManager);
        emit SessionKeyManagerUpdated(_sessionKeyManager);
    }

    /**
     * @notice 检查 Session Key 是否可以执行操作
     * @param owner 主账户地址
     * @param sessionKey Session Key 地址
     * @param target 目标合约地址
     * @param selector 函数选择器
     * @param sponsor 资金赞助人地址
     * @param maxCost 最大 gas 成本
     */
    function canExecuteWithSessionKey(
        address owner,
        address sessionKey,
        address target,
        bytes4 selector,
        address sponsor,
        uint256 maxCost
    ) external view returns (bool) {
        // 检查 Session Key 有效性
        if (address(sessionKeyManager) != address(0)) {
            bool isValid = sessionKeyManager.validateSessionKey(
                owner,
                sessionKey,
                target,
                selector,
                0
            );
            if (!isValid) return false;
        }
        
        // 检查 sponsor 余额
        if (balanceOf[sponsor] < maxCost) return false;
        
        // 如果 sponsor 不是 owner，检查授权
        if (sponsor != owner) {
            if (allowance[sponsor][owner] < maxCost) return false;
        }
        
        return true;
    }

    receive() external payable {
        _deposit(msg.sender, msg.value);
    }
}
