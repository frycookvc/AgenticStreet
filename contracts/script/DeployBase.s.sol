// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {Script, console} from "forge-std/Script.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {FundFactory} from "../src/FundFactory.sol";
import {FundRaise} from "../src/FundRaise.sol";
import {FundVault} from "../src/FundVault.sol";

/// @title DeployBase
/// @notice Deploys FundFactory behind an ERC1967Proxy on Base mainnet.
///         All addresses read from environment variables.
contract DeployBase is Script {
    uint64 constant PROPOSAL_DELAY = 7200; // 2 hours — production security parameter

    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY_MAIN");
        address deployer = vm.addr(deployerKey);
        address usdc = vm.envAddress("USDC");
        address treasury = vm.envAddress("TREASURY_ADDRESS");
        address platformLiquidator = vm.envAddress("PLATFORM_LIQUIDATOR_ADDRESS");

        console.log("Deployer:", deployer);
        console.log("USDC:", usdc);
        console.log("Treasury:", treasury);
        console.log("Platform Liquidator:", platformLiquidator);

        vm.startBroadcast(deployerKey);

        // 1. Deploy implementation contracts (clone sources)
        FundRaise raiseImpl = new FundRaise();
        console.log("FundRaise implementation:", address(raiseImpl));

        FundVault vaultImpl = new FundVault();
        console.log("FundVault implementation:", address(vaultImpl));

        // 2. Deploy FundFactory implementation
        FundFactory implementation = new FundFactory();
        console.log("FundFactory implementation:", address(implementation));

        // 3. Deploy proxy with initialize calldata
        bytes memory initData = abi.encodeCall(
            FundFactory.initialize,
            (usdc, treasury, platformLiquidator, PROPOSAL_DELAY, address(raiseImpl), address(vaultImpl))
        );
        ERC1967Proxy proxy = new ERC1967Proxy(address(implementation), initData);
        console.log("FundFactory proxy:", address(proxy));

        vm.stopBroadcast();

        // 4. Verify state through the proxy
        FundFactory factory = FundFactory(address(proxy));

        assert(factory.owner() == deployer);
        assert(factory.proposalDelay() == PROPOSAL_DELAY);
        assert(address(factory.usdc()) == usdc);

        console.log("Assertions passed. Deployment complete.");
    }
}
