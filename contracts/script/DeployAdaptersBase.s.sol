// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {Script, console} from "forge-std/Script.sol";
import {FundFactory} from "../src/FundFactory.sol";
import {UniswapV3Adapter} from "../src/adapters/UniswapV3Adapter.sol";
import {AaveV3Adapter} from "../src/adapters/AaveV3Adapter.sol";
import {AerodromeAdapter} from "../src/adapters/AerodromeAdapter.sol";
import {MorphoAdapter} from "../src/adapters/MorphoAdapter.sol";
import {CurveAdapter} from "../src/adapters/CurveAdapter.sol";
import {AnzenAdapter} from "../src/adapters/AnzenAdapter.sol";
import {CompoundV3Adapter} from "../src/adapters/CompoundV3Adapter.sol";
import {MoonwellAdapter} from "../src/adapters/MoonwellAdapter.sol";
import {FluidAdapter} from "../src/adapters/FluidAdapter.sol";

/// @title DeployAdaptersBase
/// @notice Deploys all 9 adapters on Base mainnet and registers them on the factory.
///         Run AFTER DeployBase — requires FACTORY_PROXY env var.
///         Split into two internal functions to avoid stack-too-deep.
contract DeployAdaptersBase is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY_MAIN");
        address factoryProxy = vm.envAddress("FACTORY_PROXY");
        console.log("Factory proxy:", factoryProxy);

        vm.startBroadcast(deployerKey);
        _deployDexAndLending(factoryProxy);
        _deployRemaining(factoryProxy);
        vm.stopBroadcast();

        console.log("All 9 adapters deployed and registered.");
    }

    function _deployDexAndLending(address factoryProxy) internal {
        FundFactory factory = FundFactory(factoryProxy);

        UniswapV3Adapter uniswap = new UniswapV3Adapter(factoryProxy, vm.envAddress("UNISWAP_V3_ROUTER"));
        factory.registerAdapter(address(uniswap));
        console.log("UniswapV3Adapter:", address(uniswap));

        AaveV3Adapter aave = new AaveV3Adapter(factoryProxy, vm.envAddress("AAVE_V3_POOL"));
        factory.registerAdapter(address(aave));
        console.log("AaveV3Adapter:", address(aave));

        AerodromeAdapter aerodrome = new AerodromeAdapter(
            factoryProxy, vm.envAddress("AERODROME_ROUTER"), vm.envAddress("AERODROME_POOL_FACTORY")
        );
        factory.registerAdapter(address(aerodrome));
        console.log("AerodromeAdapter:", address(aerodrome));

        MorphoAdapter morpho = new MorphoAdapter(factoryProxy, vm.envAddress("MORPHO_BLUE"));
        factory.registerAdapter(address(morpho));
        console.log("MorphoAdapter:", address(morpho));

        CurveAdapter curve = new CurveAdapter(factoryProxy, vm.envAddress("CURVE_ROUTER"));
        factory.registerAdapter(address(curve));
        console.log("CurveAdapter:", address(curve));
    }

    function _deployRemaining(address factoryProxy) internal {
        FundFactory factory = FundFactory(factoryProxy);

        AnzenAdapter anzen = new AnzenAdapter(
            factoryProxy, vm.envAddress("ANZEN_VAULT"), vm.envAddress("ANZEN_USDZ"), vm.envAddress("ANZEN_SUSDZ")
        );
        factory.registerAdapter(address(anzen));
        console.log("AnzenAdapter:", address(anzen));

        CompoundV3Adapter compound = new CompoundV3Adapter(factoryProxy);
        factory.registerAdapter(address(compound));
        console.log("CompoundV3Adapter:", address(compound));

        MoonwellAdapter moonwell = new MoonwellAdapter(factoryProxy);
        factory.registerAdapter(address(moonwell));
        console.log("MoonwellAdapter:", address(moonwell));

        FluidAdapter fluid = new FluidAdapter(factoryProxy);
        factory.registerAdapter(address(fluid));
        console.log("FluidAdapter:", address(fluid));
    }
}
