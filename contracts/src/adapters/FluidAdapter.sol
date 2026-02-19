// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AdapterBase} from "../AdapterBase.sol";
import {IFluidLending} from "../interfaces/IFluidLending.sol";

contract FluidAdapter is AdapterBase {
    using SafeERC20 for IERC20;

    constructor(address _factory) AdapterBase(_factory) {}

    function identifier() external pure override returns (string memory) {
        return "FluidAdapter";
    }

    function supply(address fToken, address token, uint256 amount) external onlyVault {
        address vault = msg.sender;
        _pullTokens(vault, token, amount);

        SafeERC20.forceApprove(IERC20(token), fToken, amount);
        IFluidLending(fToken).deposit(amount, vault);
        SafeERC20.forceApprove(IERC20(token), fToken, 0);
    }

    function withdraw(address fToken, address token, uint256 amount) external onlyVault {
        address vault = msg.sender;

        // Pull fToken shares from vault to adapter
        _pullTokens(vault, fToken, amount);

        // Withdraw underlying — adapter is owner (holds shares), vault is receiver
        IFluidLending(fToken).withdraw(amount, vault, address(this));

        // Revoke any residual approval
        SafeERC20.forceApprove(IERC20(fToken), fToken, 0);

        // Sweep residual fToken shares and underlying back to vault
        _sweepToken(vault, fToken);
        _sweepToken(vault, token);
    }
}
