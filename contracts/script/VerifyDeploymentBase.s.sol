// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {Script, console} from "forge-std/Script.sol";
import {FundFactory} from "../src/FundFactory.sol";

/// @title VerifyDeploymentBase
/// @notice Post-deployment verification for Base mainnet.
///         Reads all addresses from env and asserts critical invariants.
contract VerifyDeploymentBase is Script {
    function run() external view {
        address factoryProxy = vm.envAddress("FACTORY_PROXY");
        address usdc = vm.envAddress("USDC");
        address treasury = vm.envAddress("TREASURY_ADDRESS");

        FundFactory factory = FundFactory(factoryProxy);

        // Critical invariants
        assert(factory.proposalDelay() == 7200);
        assert(address(factory.usdc()) == usdc);
        assert(factory.protocolTreasury() == treasury);

        console.log("Factory proxy:", factoryProxy);
        console.log("Owner:", factory.owner());
        console.log("Proposal delay:", factory.proposalDelay());
        console.log("USDC:", address(factory.usdc()));
        console.log("Treasury:", factory.protocolTreasury());
        console.log("Protocol fee bps:", factory.protocolFeeBps());

        // Warn if fee is zero — treasury won't collect
        if (factory.protocolFeeBps() == 0) {
            console.log("");
            console.log("WARNING: protocolFeeBps is 0 -- treasury will not receive fees!");
            console.log("Run: cast send FACTORY 'setProtocolFeeBps(uint32)' 100 --rpc-url ... --private-key ...");
        }

        // Warn if treasury is zero address
        if (factory.protocolTreasury() == address(0)) {
            console.log("");
            console.log("CRITICAL: protocolTreasury is address(0) -- finalise will fail or fees are lost!");
            console.log("Run: cast send FACTORY 'setProtocolTreasury(address)' TREASURY --rpc-url ... --private-key ...");
        }

        console.log("Verification passed.");
    }
}
