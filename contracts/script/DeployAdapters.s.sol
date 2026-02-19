// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {Script, console} from "forge-std/Script.sol";
import {FundFactory} from "../src/FundFactory.sol";
import {AaveV3Adapter} from "../src/adapters/AaveV3Adapter.sol";
import {UniswapV3Adapter} from "../src/adapters/UniswapV3Adapter.sol";

/// @title DeployAdapters
/// @notice Deploys AaveV3 and UniswapV3 adapters, then registers them on the factory.
///         Run AFTER DeployBaseSepolia — requires FACTORY_PROXY env var.
contract DeployAdapters is Script {
    // ── Base Sepolia protocol addresses ──────────────────────────
    address constant AAVE_V3_POOL = 0x8bAB6d1b75f19e9eD9fCe8b9BD338844fF79aE27;
    address constant UNISWAP_V3_ROUTER = 0x94cC0AaC535CCDB3C01d6787D6413C739ae12bc4;

    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY_MAIN");
        address factoryProxy = vm.envAddress("FACTORY_PROXY");
        address deployer = vm.addr(deployerKey);

        console.log("Deployer:", deployer);
        console.log("Factory proxy:", factoryProxy);

        vm.startBroadcast(deployerKey);

        // 1. Deploy adapters
        AaveV3Adapter aave = new AaveV3Adapter(factoryProxy, AAVE_V3_POOL);
        console.log("AaveV3Adapter:", address(aave));

        UniswapV3Adapter uniswap = new UniswapV3Adapter(factoryProxy, UNISWAP_V3_ROUTER);
        console.log("UniswapV3Adapter:", address(uniswap));

        // 2. Register on factory
        FundFactory factory = FundFactory(factoryProxy);
        factory.registerAdapter(address(aave));
        console.log("AaveV3Adapter registered");

        factory.registerAdapter(address(uniswap));
        console.log("UniswapV3Adapter registered");

        vm.stopBroadcast();

        // 3. Verify
        assert(factory.isRegisteredAdapter(address(aave)));
        assert(factory.isRegisteredAdapter(address(uniswap)));

        console.log("Assertions passed. Adapters deployed and registered.");
    }
}
