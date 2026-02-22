// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {Script, console} from "forge-std/Script.sol";
import {FundFactory} from "../src/FundFactory.sol";

/// @title ConfigureBase
/// @notice Post-deployment configuration: sets protocolFeeBps on the factory.
///         Run AFTER DeployBase + DeployAdaptersBase.
contract ConfigureBase is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY_MAIN");
        address factoryProxy = vm.envAddress("FACTORY_PROXY");

        FundFactory factory = FundFactory(factoryProxy);

        console.log("Factory proxy:", factoryProxy);
        console.log("Current protocolFeeBps:", factory.protocolFeeBps());

        vm.startBroadcast(deployerKey);
        factory.setProtocolFeeBps(100);
        vm.stopBroadcast();

        assert(factory.protocolFeeBps() == 100);
        console.log("protocolFeeBps set to 100 (1%).");
    }
}
