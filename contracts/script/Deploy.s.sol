// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Script, console} from "forge-std/Script.sol";
import {SessionKeyManager} from "../src/SessionKeyManager.sol";
import {BlogPaymaster} from "../src/BlogPaymaster.sol";
import {BlogHub} from "../src/BlogHub.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

/**
 * @title DeployScript
 * @dev 部署所有 DBlog 合约的脚本
 * 
 * 使用方法:
 * 1. 本地测试: forge script script/Deploy.s.sol --fork-url http://localhost:8545 --broadcast --tc DeployScript
 * 2. Optimism Sepolia: forge script script/Deploy.s.sol --rpc-url $OP_SEPOLIA_RPC --broadcast --verify --tc DeployScript
 * 3. Optimism Mainnet: forge script script/Deploy.s.sol --rpc-url $OP_MAINNET_RPC --broadcast --verify --tc DeployScript
 * 
 * 环境变量:
 * - PRIVATE_KEY: 部署者私钥
 * - ENTRY_POINT: ERC-4337 EntryPoint 地址 (可选，默认使用 Optimism 官方地址)
 * - TREASURY: 平台国库地址 (可选，默认使用部署者地址)
 */
contract DeployScript is Script {
    // Optimism 官方 EntryPoint v0.7 地址
    address public constant OPTIMISM_ENTRYPOINT = 0x0000000071727De22E5E9d8BAf0edAc6f37da032;
    
    // 部署的合约地址
    SessionKeyManager public sessionKeyManager;
    BlogPaymaster public paymaster;
    BlogHub public blogHubImpl;
    BlogHub public blogHub;
    address public blogHubProxy;

    function run() external {
        // 获取部署者私钥
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        
        // 获取配置
        address entryPoint = vm.envOr("ENTRY_POINT", OPTIMISM_ENTRYPOINT);
        address treasury = vm.envOr("TREASURY", deployer);

        console.log("=== DBlog Deployment ===");
        console.log("Deployer:", deployer);
        console.log("EntryPoint:", entryPoint);
        console.log("Treasury:", treasury);
        console.log("");

        vm.startBroadcast(deployerPrivateKey);

        // 1. 部署 SessionKeyManager
        sessionKeyManager = new SessionKeyManager();
        console.log("SessionKeyManager deployed at:", address(sessionKeyManager));

        // 2. 部署 BlogPaymaster
        paymaster = new BlogPaymaster(entryPoint, deployer);
        console.log("BlogPaymaster deployed at:", address(paymaster));

        // 3. 部署 BlogHub (使用 UUPS 代理模式)
        blogHubImpl = new BlogHub();
        console.log("BlogHub Implementation deployed at:", address(blogHubImpl));

        bytes memory initData = abi.encodeWithSelector(
            BlogHub.initialize.selector,
            deployer,
            treasury
        );
        ERC1967Proxy proxy = new ERC1967Proxy(address(blogHubImpl), initData);
        blogHubProxy = address(proxy);
        blogHub = BlogHub(payable(blogHubProxy));
        console.log("BlogHub Proxy deployed at:", blogHubProxy);

        // 4. 配置合约关联
        paymaster.setSessionKeyManager(address(sessionKeyManager));
        console.log("Paymaster SessionKeyManager set");

        blogHub.setSessionKeyManager(address(sessionKeyManager));
        console.log("BlogHub SessionKeyManager set");

        vm.stopBroadcast();

        // 输出部署摘要
        console.log("");
        console.log("=== Deployment Summary ===");
        console.log("SessionKeyManager:", address(sessionKeyManager));
        console.log("BlogPaymaster:", address(paymaster));
        console.log("BlogHub Implementation:", address(blogHubImpl));
        console.log("BlogHub Proxy:", blogHubProxy);
        console.log("");
        console.log("=== Next Steps ===");
        console.log("1. Deposit ETH to Paymaster for gas sponsorship");
        console.log("2. Add stake to Paymaster via addStake()");
        console.log("3. Configure platform fee and treasury if needed");
    }
}

/**
 * @title DeploySessionKeyManager
 * @dev 单独部署 SessionKeyManager
 */
contract DeploySessionKeyManager is Script {
    function run() external returns (SessionKeyManager) {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        
        vm.startBroadcast(deployerPrivateKey);
        SessionKeyManager manager = new SessionKeyManager();
        vm.stopBroadcast();

        console.log("SessionKeyManager deployed at:", address(manager));
        return manager;
    }
}

/**
 * @title DeployBlogPaymaster
 * @dev 单独部署 BlogPaymaster
 */
contract DeployBlogPaymaster is Script {
    address public constant OPTIMISM_ENTRYPOINT = 0x0000000071727De22E5E9d8BAf0edAc6f37da032;

    function run() external returns (BlogPaymaster) {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        address entryPoint = vm.envOr("ENTRY_POINT", OPTIMISM_ENTRYPOINT);
        
        vm.startBroadcast(deployerPrivateKey);
        BlogPaymaster pm = new BlogPaymaster(entryPoint, deployer);
        vm.stopBroadcast();

        console.log("BlogPaymaster deployed at:", address(pm));
        return pm;
    }
}

/**
 * @title DeployBlogHub
 * @dev 单独部署 BlogHub
 */
contract DeployBlogHub is Script {
    function run() external returns (address) {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        address treasury = vm.envOr("TREASURY", deployer);
        
        vm.startBroadcast(deployerPrivateKey);
        
        BlogHub impl = new BlogHub();
        console.log("BlogHub Implementation:", address(impl));

        bytes memory initData = abi.encodeWithSelector(
            BlogHub.initialize.selector,
            deployer,
            treasury
        );
        ERC1967Proxy proxy = new ERC1967Proxy(address(impl), initData);
        
        vm.stopBroadcast();

        console.log("BlogHub Proxy deployed at:", address(proxy));
        return address(proxy);
    }
}

/**
 * @title UpgradeBlogHub
 * @dev 升级 BlogHub 合约
 */
contract UpgradeBlogHub is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address proxyAddress = vm.envAddress("BLOG_HUB_PROXY");
        
        vm.startBroadcast(deployerPrivateKey);
        
        // 部署新的实现
        BlogHub newImpl = new BlogHub();
        console.log("New BlogHub Implementation:", address(newImpl));

        // 升级代理
        BlogHub proxy = BlogHub(payable(proxyAddress));
        proxy.upgradeToAndCall(address(newImpl), "");
        
        vm.stopBroadcast();

        console.log("BlogHub upgraded successfully");
    }
}

/**
 * @title ConfigurePaymaster
 * @dev 配置 Paymaster (存款、添加 stake)
 */
contract ConfigurePaymaster is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address paymasterAddress = vm.envAddress("PAYMASTER");
        uint256 depositAmount = vm.envOr("DEPOSIT_AMOUNT", uint256(0.1 ether));
        uint256 stakeAmount = vm.envOr("STAKE_AMOUNT", uint256(0.1 ether));
        uint32 unstakeDelay = uint32(vm.envOr("UNSTAKE_DELAY", uint256(1 days)));
        
        BlogPaymaster pm = BlogPaymaster(payable(paymasterAddress));
        
        vm.startBroadcast(deployerPrivateKey);
        
        // 向 EntryPoint 存款
        pm.depositToEntryPoint{value: depositAmount}();
        console.log("Deposited to EntryPoint:", depositAmount);

        // 添加 stake
        pm.addStake{value: stakeAmount}(unstakeDelay);
        console.log("Added stake:", stakeAmount);
        console.log("Unstake delay:", unstakeDelay, "seconds");
        
        vm.stopBroadcast();

        // 显示当前状态
        (uint256 deposit, bool staked, uint112 stake, uint32 delay, uint48 withdrawTime) = pm.getDepositInfo();
        console.log("");
        console.log("=== Paymaster Status ===");
        console.log("EntryPoint Deposit:", deposit);
        console.log("Staked:", staked);
        console.log("Stake Amount:", stake);
        console.log("Unstake Delay:", delay);
        console.log("Withdraw Time:", withdrawTime);
    }
}
