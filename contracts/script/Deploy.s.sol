// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Script, console} from "forge-std/Script.sol";
import {SessionKeyManager} from "../src/SessionKeyManager.sol";
import {BlogPaymaster} from "../src/BlogPaymaster.sol";
import {BlogHub} from "../src/BlogHub.sol";
import {
    ERC1967Proxy
} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

/**
 * @title DeployBase
 * @dev 部署脚本的基础合约，包含共享的常量、配置和辅助函数
 */
abstract contract DeployBase is Script {
    address public constant ERC4337_ENTRYPOINT_V07 =
        0x0000000071727De22E5E9d8BAf0edAc6f37da032; // 在多个EVM链上地址都相同，主网测试网也相同
    bytes32 public constant DEFAULT_SALT = keccak256("AmberInk.v1");

    struct DeployConfig {
        uint256 privateKey;
        address deployer;
        address entryPoint;
        address treasury;
        bytes32 salt;
    }

    function _loadConfig() internal view returns (DeployConfig memory cfg) {
        cfg.privateKey = vm.envUint("PRIVATE_KEY");
        cfg.deployer = vm.addr(cfg.privateKey);
        cfg.entryPoint = vm.envOr("ENTRY_POINT", ERC4337_ENTRYPOINT_V07);
        cfg.treasury = vm.envOr("TREASURY", cfg.deployer);
        cfg.salt = vm.envOr("DEPLOY_SALT", DEFAULT_SALT);
    }

    function _blogHubInitData(
        address owner,
        address treasury
    ) internal pure returns (bytes memory) {
        return
            abi.encodeWithSelector(
                BlogHub.initialize.selector,
                owner,
                treasury
            );
    }

    function _logSalt(bytes32 salt) internal pure {
        console.log("Salt:", vm.toString(salt));
    }
}

/**
 * @title DeployScript
 * @dev 部署所有 dapp 合约的脚本（使用 CREATE2 确定性部署）
 *
 * 使用方法:
 * forge script script/Deploy.s.sol --rpc-url $ETH_RPC --broadcast --tc DeployScript
 *
 * 环境变量:
 * - PRIVATE_KEY: 部署者私钥
 * - ENTRY_POINT: ERC-4337 EntryPoint 地址 (可选，默认使用 Optimism 官方地址)
 * - TREASURY: 平台国库地址 (可选，默认使用部署者地址)
 * - DEPLOY_SALT: 部署 salt (可选，默认使用预定义 salt)
 *
 * 注意：使用 CREATE2 确定性部署，相同的 salt + 相同的字节码 = 相同的地址
 * 确保在所有链上使用相同的部署者地址和相同的构造函数参数
 */
contract DeployScript is DeployBase {
    SessionKeyManager public sessionKeyManager;
    BlogPaymaster public paymaster;
    BlogHub public blogHubImpl;
    BlogHub public blogHub;
    address public blogHubProxy;

    function run() external {
        DeployConfig memory cfg = _loadConfig();

        console.log("=== dapp Deployment (CREATE2) ===");
        console.log("Deployer:", cfg.deployer);
        console.log("EntryPoint:", cfg.entryPoint);
        console.log("Treasury:", cfg.treasury);
        _logSalt(cfg.salt);
        console.log("");

        vm.startBroadcast(cfg.privateKey);

        sessionKeyManager = new SessionKeyManager{salt: cfg.salt}();
        console.log(
            "SessionKeyManager deployed at:",
            address(sessionKeyManager)
        );

        paymaster = new BlogPaymaster{salt: cfg.salt}(
            cfg.entryPoint,
            cfg.deployer
        );
        console.log("BlogPaymaster deployed at:", address(paymaster));

        blogHubImpl = new BlogHub{salt: cfg.salt}();
        console.log(
            "BlogHub Implementation deployed at:",
            address(blogHubImpl)
        );

        ERC1967Proxy proxy = new ERC1967Proxy{salt: cfg.salt}(
            address(blogHubImpl),
            _blogHubInitData(cfg.deployer, cfg.treasury)
        );
        blogHubProxy = address(proxy);
        blogHub = BlogHub(payable(blogHubProxy));
        console.log("BlogHub Proxy deployed at:", blogHubProxy);

        paymaster.setSessionKeyManager(address(sessionKeyManager));
        blogHub.setSessionKeyManager(address(sessionKeyManager));
        console.log("SessionKeyManager configured for Paymaster and BlogHub");

        vm.stopBroadcast();

        console.log("");
        console.log("=== Deployment Summary ===");
        console.log("SessionKeyManager:", address(sessionKeyManager));
        console.log("BlogPaymaster:", address(paymaster));
        console.log("BlogHub Implementation:", address(blogHubImpl));
        console.log("BlogHub Proxy:", blogHubProxy);
        console.log("");
        console.log(
            "Next: 1) Deposit ETH to Paymaster 2) addStake() 3) Configure fees"
        );
    }
}

/// @dev 单独部署 SessionKeyManager (使用 CREATE2)
contract DeploySessionKeyManager is DeployBase {
    function run() external returns (SessionKeyManager) {
        DeployConfig memory cfg = _loadConfig();
        vm.startBroadcast(cfg.privateKey);
        SessionKeyManager manager = new SessionKeyManager{salt: cfg.salt}();
        vm.stopBroadcast();
        console.log("SessionKeyManager deployed at:", address(manager));
        _logSalt(cfg.salt);
        return manager;
    }
}

/// @dev 单独部署 BlogPaymaster (使用 CREATE2)
contract DeployBlogPaymaster is DeployBase {
    function run() external returns (BlogPaymaster) {
        DeployConfig memory cfg = _loadConfig();
        vm.startBroadcast(cfg.privateKey);
        BlogPaymaster pm = new BlogPaymaster{salt: cfg.salt}(
            cfg.entryPoint,
            cfg.deployer
        );
        vm.stopBroadcast();
        console.log("BlogPaymaster deployed at:", address(pm));
        _logSalt(cfg.salt);
        return pm;
    }
}

/// @dev 单独部署 BlogHub (使用 CREATE2)
contract DeployBlogHub is DeployBase {
    function run() external returns (address) {
        DeployConfig memory cfg = _loadConfig();
        vm.startBroadcast(cfg.privateKey);
        BlogHub impl = new BlogHub{salt: cfg.salt}();
        console.log("BlogHub Implementation:", address(impl));
        ERC1967Proxy proxy = new ERC1967Proxy{salt: cfg.salt}(
            address(impl),
            _blogHubInitData(cfg.deployer, cfg.treasury)
        );
        vm.stopBroadcast();
        console.log("BlogHub Proxy deployed at:", address(proxy));
        _logSalt(cfg.salt);
        return address(proxy);
    }
}

/// @dev 升级 BlogHub 合约 (不使用 CREATE2，每次升级是新版本)
contract UpgradeBlogHub is DeployBase {
    function run() external {
        DeployConfig memory cfg = _loadConfig();
        address proxyAddress = vm.envAddress("BLOG_HUB_PROXY");

        vm.startBroadcast(cfg.privateKey);
        // 升级不使用 CREATE2，因为每次升级都是新版本，不需要确定性地址
        BlogHub newImpl = new BlogHub();
        BlogHub(payable(proxyAddress)).upgradeToAndCall(address(newImpl), "");
        vm.stopBroadcast();

        console.log("New BlogHub Implementation:", address(newImpl));
        console.log("BlogHub upgraded successfully");
    }
}

/// @dev 配置 Paymaster (存款、添加 stake)
contract ConfigurePaymaster is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        BlogPaymaster pm = BlogPaymaster(payable(vm.envAddress("PAYMASTER")));
        uint256 depositAmt = vm.envOr("DEPOSIT_AMOUNT", uint256(0.1 ether));
        uint256 stakeAmt = vm.envOr("STAKE_AMOUNT", uint256(0.1 ether));
        uint32 unstakeDelay = uint32(
            vm.envOr("UNSTAKE_DELAY", uint256(1 days))
        );

        vm.startBroadcast(pk);
        pm.depositToEntryPoint{value: depositAmt}();
        pm.addStake{value: stakeAmt}(unstakeDelay);
        vm.stopBroadcast();

        console.log("Deposited:", depositAmt);
        console.log("Staked:", stakeAmt);
        console.log("Delay:", unstakeDelay);
        (
            uint256 dep,
            bool staked,
            uint112 stake,
            uint32 delay,
            uint48 withdrawTime
        ) = pm.getDepositInfo();
        console.log("=== Paymaster Status ===");
        console.log("Deposit:", dep);
        console.log("Staked:", staked);
        console.log("Stake:", stake);
        console.log("Delay:", delay);
        console.log("WithdrawTime:", withdrawTime);
    }
}
