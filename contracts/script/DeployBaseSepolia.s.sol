// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {Script, console} from "forge-std/Script.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {FundFactory} from "../src/FundFactory.sol";
import {FundRaise} from "../src/FundRaise.sol";
import {FundVault} from "../src/FundVault.sol";

/// @title DeployBaseSepolia
/// @notice Deploys FundFactory behind an ERC1967Proxy on Base Sepolia.
contract DeployBaseSepolia is Script {
    // ── Testnet addresses (hardcoded) ────────────────────────────
    address constant USDC = 0x036CbD53842c5426634e7929541eC2318f3dCF7e;
    address constant TREASURY = 0x28cD88399415ac8E2d5ac9E028d32556bC3aF8b6;
    address constant PLATFORM_LIQUIDATOR = 0x28cD88399415ac8E2d5ac9E028d32556bC3aF8b6;
    uint64 constant PROPOSAL_DELAY = 300; // 5 minutes

    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY_MAIN");
        address deployer = vm.addr(deployerKey);

        console.log("Deployer:", deployer);

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
            (USDC, TREASURY, PLATFORM_LIQUIDATOR, PROPOSAL_DELAY, address(raiseImpl), address(vaultImpl))
        );
        ERC1967Proxy proxy = new ERC1967Proxy(address(implementation), initData);
        console.log("FundFactory proxy:", address(proxy));

        vm.stopBroadcast();

        // 3. Verify state through the proxy
        FundFactory factory = FundFactory(address(proxy));

        assert(factory.owner() == deployer);
        assert(factory.proposalDelay() == PROPOSAL_DELAY);
        assert(address(factory.usdc()) == USDC);

        console.log("Assertions passed. Deployment complete.");
    }
}
