// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IEntryPoint, PackedUserOperation} from "./interfaces/IEntryPoint.sol";
import {IPaymaster} from "./interfaces/IPaymaster.sol";
import {ISessionKeyManager} from "./interfaces/ISessionKeyManager.sol";
import {ITokenPriceOracle} from "./interfaces/ITokenPriceFeed.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title BlogTokenPaymaster
 * @dev ERC-4337 Token Paymaster 合约，支持用户使用 ERC-20 代币支付 Gas
 * 
 * 核心功能：
 * 1. 用户可以使用 USDT、USDC 等 ERC-20 代币支付 Gas 费用
 * 2. 通过价格预言机获取代币/ETH 汇率
 * 3. 支持 Session Key 模式
 * 4. 完全去中心化，无需信任第三方
 * 
 * 使用场景：
 * - 用户 A 只有 USDC，没有 ETH
 * - 用户 A 授权 TokenPaymaster 使用其 USDC
 * - 用户 A 发送 UserOperation，指定此 Paymaster 和 USDC 作为支付代币
 * - Paymaster 从用户 A 扣除等值 USDC，代为支付 ETH Gas
 * 
 * paymasterAndData 格式：
 * [paymaster (20)][mode (1)][token (20)][maxTokenCost (32)][...modeSpecificData]
 * 
 * mode = 0: 普通模式
 *   [...][sender 即为 token owner]
 * 
 * mode = 1: Session Key 模式
 *   [...][owner (20)][sessionKey (20)][deadline (32)][signature (65)]
 */
contract BlogTokenPaymaster is IPaymaster, EIP712, ReentrancyGuard, Ownable {
    using ECDSA for bytes32;
    using SafeERC20 for IERC20;

    // --- 错误定义 ---
    error InsufficientTokenBalance();
    error InsufficientTokenAllowance();
    error InvalidEntryPoint();
    error InvalidToken();
    error TokenNotSupported();
    error TransferFailed();
    error ZeroAmount();
    error ZeroAddress();
    error OnlyEntryPoint();
    error PaymasterDepositTooLow();
    error InvalidSessionKey();
    error SessionKeyExpired();
    error InvalidSignature();
    error SignatureExpired();
    error PriceOracleNotSet();
    error TokenCostTooHigh();
    error InvalidPaymasterData();
    error SwapFailed();

    // --- 事件定义 ---
    event TokenDeposited(address indexed account, address indexed token, uint256 amount);
    event TokenWithdrawn(address indexed account, address indexed token, uint256 amount);
    event TokenGasPaid(
        address indexed payer,
        address indexed token,
        uint256 tokenAmount,
        uint256 ethCost,
        bytes32 userOpHash
    );
    event SessionKeyTokenGasPaid(
        address indexed owner,
        address indexed sessionKey,
        address indexed token,
        uint256 tokenAmount,
        uint256 ethCost,
        bytes32 userOpHash
    );
    event TokenSupportUpdated(address indexed token, bool supported);
    event PriceOracleUpdated(address indexed newOracle);
    event SessionKeyManagerUpdated(address indexed newManager);
    event EntryPointDeposited(uint256 amount);
    event EntryPointWithdrawn(address indexed to, uint256 amount);
    event TokensSwappedToEth(address indexed token, uint256 tokenAmount, uint256 ethReceived);
    event PriceMarkupUpdated(uint256 newMarkup);

    // --- 状态变量 ---
    
    /// @notice ERC-4337 EntryPoint 合约地址
    IEntryPoint public immutable entryPoint;

    /// @notice 价格预言机合约
    ITokenPriceOracle public priceOracle;

    /// @notice Session Key 管理器合约
    ISessionKeyManager public sessionKeyManager;

    /// @notice 支持的代币列表
    mapping(address => bool) public supportedTokens;

    /// @notice 用户在 Paymaster 中的代币余额: tokenBalanceOf[user][token] = amount
    mapping(address => mapping(address => uint256)) public tokenBalanceOf;

    /// @notice 价格加成（basis points，用于覆盖价格波动风险）
    /// 例如：300 = 3%，即用户需要多支付 3% 的代币
    uint256 public priceMarkupBps;

    /// @notice 最低 EntryPoint 存款要求
    uint256 public constant MIN_ENTRYPOINT_DEPOSIT = 0.01 ether;

    /// @notice 最大价格加成 (10%)
    uint256 public constant MAX_PRICE_MARKUP_BPS = 1000;

    // Session Key UserOp 验证的 TypeHash
    bytes32 private constant SESSION_KEY_TOKEN_USEROP_TYPEHASH = keccak256(
        "SessionKeyTokenUserOp(address owner,address sessionKey,address token,bytes32 userOpHash,uint256 nonce,uint256 deadline)"
    );

    /// @notice Session Key 的 nonce（用于防重放）
    mapping(address => mapping(address => uint256)) public sessionKeyNonces;

    // --- 修饰符 ---
    modifier onlyEntryPoint() {
        if (msg.sender != address(entryPoint)) revert OnlyEntryPoint();
        _;
    }

    // --- 构造函数 ---
    constructor(
        address _entryPoint,
        address _priceOracle,
        address _owner
    ) EIP712("BlogTokenPaymaster", "1") Ownable(_owner) {
        if (_entryPoint == address(0)) revert ZeroAddress();
        entryPoint = IEntryPoint(_entryPoint);
        
        if (_priceOracle != address(0)) {
            priceOracle = ITokenPriceOracle(_priceOracle);
        }
        
        // 默认 3% 价格加成
        priceMarkupBps = 300;
    }

    // =============================================================
    //                      代币管理
    // =============================================================

    /**
     * @notice 存入代币到自己的账户
     * @param token 代币地址
     * @param amount 存入数量
     */
    function depositToken(address token, uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        if (!supportedTokens[token]) revert TokenNotSupported();
        
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        tokenBalanceOf[msg.sender][token] += amount;
        
        emit TokenDeposited(msg.sender, token, amount);
    }

    /**
     * @notice 为指定账户存入代币
     * @param account 目标账户地址
     * @param token 代币地址
     * @param amount 存入数量
     */
    function depositTokenTo(address account, address token, uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        if (account == address(0)) revert ZeroAddress();
        if (!supportedTokens[token]) revert TokenNotSupported();
        
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        tokenBalanceOf[account][token] += amount;
        
        emit TokenDeposited(account, token, amount);
    }

    /**
     * @notice 提取代币
     * @param token 代币地址
     * @param amount 提取数量
     */
    function withdrawToken(address token, uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        if (tokenBalanceOf[msg.sender][token] < amount) revert InsufficientTokenBalance();
        
        tokenBalanceOf[msg.sender][token] -= amount;
        IERC20(token).safeTransfer(msg.sender, amount);
        
        emit TokenWithdrawn(msg.sender, token, amount);
    }

    /**
     * @notice 提取全部代币
     * @param token 代币地址
     */
    function withdrawAllToken(address token) external nonReentrant {
        uint256 amount = tokenBalanceOf[msg.sender][token];
        if (amount == 0) revert ZeroAmount();
        
        tokenBalanceOf[msg.sender][token] = 0;
        IERC20(token).safeTransfer(msg.sender, amount);
        
        emit TokenWithdrawn(msg.sender, token, amount);
    }

    // =============================================================
    //                      ERC-4337 Paymaster 接口
    // =============================================================

    /**
     * @notice 验证是否为此 UserOperation 付款
     * @dev paymasterAndData 格式：
     *      [paymaster (20)][mode (1)][token (20)][maxTokenCost (32)][...modeSpecificData]
     *      
     *      mode = 0: 普通模式，从 userOp.sender 扣除代币
     *      mode = 1: Session Key 模式，需要额外的签名验证
     */
    function validatePaymasterUserOp(
        PackedUserOperation calldata userOp,
        bytes32 userOpHash,
        uint256 maxCost
    ) external override onlyEntryPoint returns (bytes memory context, uint256 validationData) {
        // 最小长度检查: paymaster(20) + mode(1) + token(20) + maxTokenCost(32) = 73
        if (userOp.paymasterAndData.length < 73) revert InvalidPaymasterData();
        
        uint8 mode = uint8(userOp.paymasterAndData[20]);
        address token = address(bytes20(userOp.paymasterAndData[21:41]));
        uint256 maxTokenCost = uint256(bytes32(userOp.paymasterAndData[41:73]));
        
        // 验证代币
        if (!supportedTokens[token]) revert TokenNotSupported();
        if (address(priceOracle) == address(0)) revert PriceOracleNotSet();
        
        // 计算所需代币数量（包含价格加成）
        uint256 requiredTokenAmount = _calculateTokenCost(token, maxCost);
        if (requiredTokenAmount > maxTokenCost) revert TokenCostTooHigh();
        
        if (mode == 0) {
            return _validateNormalTokenMode(userOp, userOpHash, token, requiredTokenAmount);
        } else if (mode == 1) {
            return _validateSessionKeyTokenMode(userOp, userOpHash, token, requiredTokenAmount);
        } else {
            revert InvalidPaymasterData();
        }
    }

    /**
     * @dev 普通代币模式验证
     * 从 userOp.sender 扣除代币
     */
    function _validateNormalTokenMode(
        PackedUserOperation calldata userOp,
        bytes32 userOpHash,
        address token,
        uint256 requiredTokenAmount
    ) internal returns (bytes memory context, uint256 validationData) {
        address sender = userOp.sender;
        
        // 检查用户代币余额
        if (tokenBalanceOf[sender][token] < requiredTokenAmount) {
            revert InsufficientTokenBalance();
        }
        
        // 预扣代币
        tokenBalanceOf[sender][token] -= requiredTokenAmount;
        
        // context: [mode (1)][token (20)][payer (20)][tokenAmount (32)][userOpHash (32)]
        context = abi.encode(uint8(0), token, sender, requiredTokenAmount, userOpHash);
        validationData = 0;
    }

    /**
     * @dev Session Key 代币模式验证
     * paymasterAndData 额外数据: [owner (20)][sessionKey (20)][deadline (32)][signature (65)]
     * 总长度: 73 + 20 + 20 + 32 + 65 = 210
     */
    function _validateSessionKeyTokenMode(
        PackedUserOperation calldata userOp,
        bytes32 userOpHash,
        address token,
        uint256 requiredTokenAmount
    ) internal returns (bytes memory context, uint256 validationData) {
        // 长度检查
        if (userOp.paymasterAndData.length < 210) revert InvalidPaymasterData();
        
        // 解析数据
        address owner = address(bytes20(userOp.paymasterAndData[73:93]));
        address sessionKey = address(bytes20(userOp.paymasterAndData[93:113]));
        uint256 deadline = uint256(bytes32(userOp.paymasterAndData[113:145]));
        bytes memory signature = userOp.paymasterAndData[145:210];
        
        // 检查过期时间
        if (block.timestamp > deadline) revert SignatureExpired();
        
        // 验证 Session Key 签名
        uint256 currentNonce = sessionKeyNonces[owner][sessionKey]++;
        bytes32 structHash = keccak256(
            abi.encode(
                SESSION_KEY_TOKEN_USEROP_TYPEHASH,
                owner,
                sessionKey,
                token,
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
            (address target, bytes4 selector) = _extractTargetAndSelector(userOp.callData);
            
            bool isValid = sessionKeyManager.validateSessionKey(
                owner,
                sessionKey,
                target,
                selector,
                0
            );
            
            if (!isValid) revert InvalidSessionKey();
        }
        
        // 检查 owner 的代币余额
        if (tokenBalanceOf[owner][token] < requiredTokenAmount) {
            revert InsufficientTokenBalance();
        }
        
        // 预扣代币
        tokenBalanceOf[owner][token] -= requiredTokenAmount;
        
        // context: [mode (1)][token (20)][owner (20)][sessionKey (20)][tokenAmount (32)][userOpHash (32)]
        context = abi.encode(uint8(1), token, owner, sessionKey, requiredTokenAmount, userOpHash);
        validationData = 0;
    }

    /**
     * @dev 从 callData 中提取目标合约地址和函数选择器
     */
    function _extractTargetAndSelector(bytes calldata callData) internal pure returns (address target, bytes4 selector) {
        if (callData.length < 4) {
            return (address(0), bytes4(0));
        }
        
        selector = bytes4(callData[:4]);
        
        // 检查是否是 execute 函数 (0xb61d27f6)
        if (selector == bytes4(0xb61d27f6) && callData.length >= 100) {
            target = address(uint160(uint256(bytes32(callData[4:36]))));
            uint256 funcOffset = uint256(bytes32(callData[68:100]));
            uint256 funcStart = 4 + funcOffset;
            if (callData.length >= funcStart + 36) {
                selector = bytes4(callData[funcStart + 32:funcStart + 36]);
            }
        } else {
            target = address(0);
        }
    }

    /**
     * @notice 操作执行后的回调，处理退款
     */
    function postOp(
        PostOpMode opMode,
        bytes calldata context,
        uint256 actualGasCost,
        uint256 /* actualUserOpFeePerGas */
    ) external override onlyEntryPoint {
        uint8 mode = abi.decode(context, (uint8));
        
        if (mode == 0) {
            _postOpNormalTokenMode(opMode, context, actualGasCost);
        } else {
            _postOpSessionKeyTokenMode(opMode, context, actualGasCost);
        }
    }

    /**
     * @dev 普通代币模式的 postOp 处理
     */
    function _postOpNormalTokenMode(
        PostOpMode opMode,
        bytes calldata context,
        uint256 actualGasCost
    ) internal {
        (, address token, address payer, uint256 preChargedTokenAmount, bytes32 userOpHash) = 
            abi.decode(context, (uint8, address, address, uint256, bytes32));
        
        // 计算实际消耗的代币数量
        uint256 actualTokenCost = _calculateTokenCost(token, actualGasCost);
        
        if (opMode == PostOpMode.opReverted) {
            // 操作回滚，全额退款
            tokenBalanceOf[payer][token] += preChargedTokenAmount;
        } else {
            // 退还多余的代币
            if (preChargedTokenAmount > actualTokenCost) {
                uint256 refund = preChargedTokenAmount - actualTokenCost;
                tokenBalanceOf[payer][token] += refund;
            }
            
            emit TokenGasPaid(payer, token, actualTokenCost, actualGasCost, userOpHash);
        }
    }

    /**
     * @dev Session Key 代币模式的 postOp 处理
     */
    function _postOpSessionKeyTokenMode(
        PostOpMode opMode,
        bytes calldata context,
        uint256 actualGasCost
    ) internal {
        (, address token, address owner, address sessionKey, uint256 preChargedTokenAmount, bytes32 userOpHash) = 
            abi.decode(context, (uint8, address, address, address, uint256, bytes32));
        
        uint256 actualTokenCost = _calculateTokenCost(token, actualGasCost);
        
        if (opMode == PostOpMode.opReverted) {
            // 操作回滚，全额退款
            tokenBalanceOf[owner][token] += preChargedTokenAmount;
        } else {
            // 退还多余的代币
            if (preChargedTokenAmount > actualTokenCost) {
                uint256 refund = preChargedTokenAmount - actualTokenCost;
                tokenBalanceOf[owner][token] += refund;
            }
            
            emit SessionKeyTokenGasPaid(owner, sessionKey, token, actualTokenCost, actualGasCost, userOpHash);
        }
    }

    /**
     * @dev 计算指定 ETH 数量所需的代币数量（包含价格加成）
     * @param token 代币地址
     * @param ethAmount ETH 数量（wei）
     * @return tokenAmount 所需代币数量
     */
    function _calculateTokenCost(address token, uint256 ethAmount) internal view returns (uint256) {
        uint256 baseTokenAmount = priceOracle.getTokenAmountForEth(token, ethAmount);
        // 添加价格加成
        uint256 markup = (baseTokenAmount * priceMarkupBps) / 10000;
        return baseTokenAmount + markup;
    }

    // =============================================================
    //                      EntryPoint 存款管理
    // =============================================================

    /**
     * @notice 向 EntryPoint 存款（Paymaster 需要在 EntryPoint 有 ETH 存款才能工作）
     * @dev 这些 ETH 用于实际支付 Gas，代币收入需要定期兑换为 ETH 补充
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
     * @notice 向 EntryPoint 添加 stake
     * @param unstakeDelaySec 解锁延迟时间（秒）
     */
    function addStake(uint32 unstakeDelaySec) external payable onlyOwner {
        entryPoint.addStake{value: msg.value}(unstakeDelaySec);
    }

    /**
     * @notice 解锁 stake
     */
    function unlockStake() external onlyOwner {
        entryPoint.unlockStake();
    }

    /**
     * @notice 提取 stake
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
    //                      管理功能
    // =============================================================

    /**
     * @notice 添加支持的代币
     * @param token 代币地址
     */
    function addSupportedToken(address token) external onlyOwner {
        if (token == address(0)) revert ZeroAddress();
        supportedTokens[token] = true;
        emit TokenSupportUpdated(token, true);
    }

    /**
     * @notice 移除支持的代币
     * @param token 代币地址
     */
    function removeSupportedToken(address token) external onlyOwner {
        supportedTokens[token] = false;
        emit TokenSupportUpdated(token, false);
    }

    /**
     * @notice 设置价格预言机
     * @param _priceOracle 价格预言机合约地址
     */
    function setPriceOracle(address _priceOracle) external onlyOwner {
        if (_priceOracle == address(0)) revert ZeroAddress();
        priceOracle = ITokenPriceOracle(_priceOracle);
        emit PriceOracleUpdated(_priceOracle);
    }

    /**
     * @notice 设置 Session Key 管理器
     * @param _sessionKeyManager Session Key 管理器合约地址
     */
    function setSessionKeyManager(address _sessionKeyManager) external onlyOwner {
        sessionKeyManager = ISessionKeyManager(_sessionKeyManager);
        emit SessionKeyManagerUpdated(_sessionKeyManager);
    }

    /**
     * @notice 设置价格加成
     * @param _priceMarkupBps 价格加成（basis points）
     */
    function setPriceMarkup(uint256 _priceMarkupBps) external onlyOwner {
        if (_priceMarkupBps > MAX_PRICE_MARKUP_BPS) revert TokenCostTooHigh();
        priceMarkupBps = _priceMarkupBps;
        emit PriceMarkupUpdated(_priceMarkupBps);
    }

    /**
     * @notice 提取合约中积累的代币（用于兑换为 ETH）
     * @param token 代币地址
     * @param to 接收地址
     * @param amount 提取数量
     */
    function withdrawAccumulatedTokens(
        address token,
        address to,
        uint256 amount
    ) external onlyOwner {
        if (to == address(0)) revert ZeroAddress();
        IERC20(token).safeTransfer(to, amount);
    }

    // =============================================================
    //                      视图函数
    // =============================================================

    /**
     * @notice 获取用户的代币余额
     * @param user 用户地址
     * @param token 代币地址
     */
    function getTokenBalance(address user, address token) external view returns (uint256) {
        return tokenBalanceOf[user][token];
    }

    /**
     * @notice 预估指定 ETH 数量所需的代币数量
     * @param token 代币地址
     * @param ethAmount ETH 数量（wei）
     */
    function estimateTokenCost(address token, uint256 ethAmount) external view returns (uint256) {
        if (!supportedTokens[token]) revert TokenNotSupported();
        if (address(priceOracle) == address(0)) revert PriceOracleNotSet();
        return _calculateTokenCost(token, ethAmount);
    }

    /**
     * @notice 检查用户是否有足够的代币支付指定的 Gas 费用
     * @param user 用户地址
     * @param token 代币地址
     * @param ethAmount 预估的 ETH Gas 费用
     */
    function canPayWithToken(
        address user,
        address token,
        uint256 ethAmount
    ) external view returns (bool) {
        if (!supportedTokens[token]) return false;
        if (address(priceOracle) == address(0)) return false;
        
        uint256 requiredTokenAmount = _calculateTokenCost(token, ethAmount);
        return tokenBalanceOf[user][token] >= requiredTokenAmount;
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
     * @notice 获取 Session Key Token UserOp 的 TypeHash
     */
    function SESSION_KEY_TOKEN_TYPEHASH() external pure returns (bytes32) {
        return SESSION_KEY_TOKEN_USEROP_TYPEHASH;
    }

    // 允许合约接收 ETH（用于 DEX 兑换等场景）
    receive() external payable {}
}
