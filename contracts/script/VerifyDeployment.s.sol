// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {Script, console} from "forge-std/Script.sol";
import {FundFactory} from "../src/FundFactory.sol";

/// @title VerifyDeployment
/// @notice Read-only post-deploy verification for FundFactory on Base Sepolia.
///         Asserts all factory state matches expected values. No broadcast.
contract VerifyDeployment is Script {
    // ── Deployed addresses ──────────────────────────────────────
    address constant PROXY = 0x5e4EA61A4cC865b4ebDdDE788be5692cD0d05D60;
    address constant RAISE_IMPL = 0xb3858CCa530A4aC34a5f3B732F2470fF5A5b1103;
    address constant VAULT_IMPL = 0x86c323e243975F043B56ea18Ce28ae8243D5eD69;

    // ── Expected values ─────────────────────────────────────────
    address constant EXPECTED_OWNER = 0x28cD88399415ac8E2d5ac9E028d32556bC3aF8b6;
    address constant EXPECTED_TREASURY = 0x28cD88399415ac8E2d5ac9E028d32556bC3aF8b6;
    address constant EXPECTED_USDC = 0x036CbD53842c5426634e7929541eC2318f3dCF7e;

    function run() external view {
        FundFactory factory = FundFactory(PROXY);

        // 1. owner
        address owner = factory.owner();
        require(owner != address(0), "CRITICAL: owner is address(0) -- initialize() was never called on proxy!");
        require(owner == EXPECTED_OWNER, "FAIL: owner mismatch");
        console.log("[PASS] 1. owner() ==", owner);

        // 2. protocolTreasury
        address treasury = factory.protocolTreasury();
        require(treasury == EXPECTED_TREASURY, "FAIL: protocolTreasury mismatch");
        console.log("[PASS] 2. protocolTreasury() ==", treasury);

        // 3. protocolFeeBps
        uint32 feeBps = factory.protocolFeeBps();
        console.log("       3. protocolFeeBps() ==", uint256(feeBps));
        if (feeBps == 0) {
            console.log("[WARN] 3. protocolFeeBps is 0 -- treasury will not receive fees! Call setProtocolFeeBps().");
        } else {
            console.log("[PASS] 3. protocolFeeBps() ==", uint256(feeBps));
        }

        // 4. proposalDelay
        uint64 delay = factory.proposalDelay();
        require(delay == 300, "FAIL: proposalDelay != 300");
        console.log("[PASS] 4. proposalDelay() ==", uint256(delay));

        // 5. platformLiquidator
        address liquidator = factory.platformLiquidator();
        require(liquidator == EXPECTED_OWNER, "FAIL: platformLiquidator mismatch");
        console.log("[PASS] 5. platformLiquidator() ==", liquidator);

        // 6. maxFundSize
        uint256 maxSize = factory.maxFundSize();
        require(maxSize == 100_000e6, "FAIL: maxFundSize != 100_000e6");
        console.log("[PASS] 6. maxFundSize() ==", maxSize);

        // 7. allowedDurations
        uint64[] memory durations = factory.getAllowedDurations();
        require(durations.length == 3, "FAIL: allowedDurations length != 3");
        require(durations[0] == 30 days, "FAIL: durations[0] != 30 days");
        require(durations[1] == 60 days, "FAIL: durations[1] != 60 days");
        require(durations[2] == 90 days, "FAIL: durations[2] != 90 days");
        console.log("[PASS] 7. allowedDurations length ==", durations.length);
        console.log("         durations[0] ==", uint256(durations[0]));
        console.log("         durations[1] ==", uint256(durations[1]));
        console.log("         durations[2] ==", uint256(durations[2]));

        // 8. usdc
        address usdc = address(factory.usdc());
        require(usdc == EXPECTED_USDC, "FAIL: usdc mismatch");
        console.log("[PASS] 8. usdc() ==", usdc);

        // 9. paused
        bool isPaused = factory.paused();
        require(!isPaused, "FAIL: paused == true");
        console.log("[PASS] 9. paused() == false");

        // 10. raiseImplementation
        address raiseImpl = factory.raiseImplementation();
        require(raiseImpl == RAISE_IMPL, "FAIL: raiseImplementation mismatch");
        console.log("[PASS] 10. raiseImplementation() ==", raiseImpl);

        // 11. vaultImplementation
        address vaultImpl = factory.vaultImplementation();
        require(vaultImpl == VAULT_IMPL, "FAIL: vaultImplementation mismatch");
        console.log("[PASS] 11. vaultImplementation() ==", vaultImpl);

        console.log("");
        console.log("============================================");
        console.log("  ALL 11 CHECKS PASSED - Deployment verified");
        console.log("============================================");
    }
}
