// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {Script, console} from "forge-std/Script.sol";
import {FundFactory} from "../src/FundFactory.sol";
import {AdapterBase} from "../src/AdapterBase.sol";

/// @title VerifyDeploymentBase
/// @notice Post-deployment verification for Base mainnet.
///         Reads all addresses from env and asserts critical invariants.
contract VerifyDeploymentBase is Script {
    function run() external view {
        address factoryProxy = vm.envAddress("FACTORY_PROXY");
        address usdc = vm.envAddress("USDC");
        address treasury = vm.envAddress("TREASURY_ADDRESS");

        FundFactory factory = FundFactory(factoryProxy);

        // Core invariants
        assert(factory.proposalDelay() == 7200);
        assert(address(factory.usdc()) == usdc);
        assert(factory.protocolTreasury() == treasury);

        console.log("Factory proxy:", factoryProxy);
        console.log("Owner:", factory.owner());
        console.log("Proposal delay:", factory.proposalDelay());
        console.log("USDC:", address(factory.usdc()));
        console.log("Treasury:", factory.protocolTreasury());
        console.log("Protocol fee bps:", factory.protocolFeeBps());

        // Fee verification
        if (factory.protocolFeeBps() == 100) {
            console.log("Protocol fee: 1% (correct)");
        } else {
            console.log("WARNING: protocolFeeBps is not 100!");
        }

        // Adapter verification
        _verifyAdapters(factory, factoryProxy);

        console.log("Verification passed.");
    }

    function _verifyAdapters(FundFactory factory, address factoryProxy) internal view {
        string[9] memory names = [
            "UniswapV3Adapter",
            "AaveV3Adapter",
            "AerodromeAdapter",
            "MorphoAdapter",
            "CurveAdapter",
            "AnzenAdapter",
            "CompoundV3Adapter",
            "MoonwellAdapter",
            "FluidAdapter"
        ];
        string[9] memory envKeys = [
            "UNISWAP_V3_ADAPTER",
            "AAVE_V3_ADAPTER",
            "AERODROME_ADAPTER",
            "MORPHO_ADAPTER",
            "CURVE_ADAPTER",
            "ANZEN_ADAPTER",
            "COMPOUND_V3_ADAPTER",
            "MOONWELL_ADAPTER",
            "FLUID_ADAPTER"
        ];

        for (uint256 i; i < 9; i++) {
            address adapterAddr = vm.envAddress(envKeys[i]);
            bool registered = factory.isRegisteredAdapter(adapterAddr);
            assert(registered);
            assert(AdapterBase(adapterAddr).factory() == factoryProxy);
            console.log(names[i], adapterAddr, "registered:", registered);
        }
    }
}
