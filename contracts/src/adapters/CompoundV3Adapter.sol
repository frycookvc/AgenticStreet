// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AdapterBase} from "../AdapterBase.sol";
import {IComet} from "../interfaces/IComet.sol";
import {IFundVault} from "../IFundVault.sol";

contract CompoundV3Adapter is AdapterBase {
    using SafeERC20 for IERC20;

    constructor(address _factory) AdapterBase(_factory) {}

    function identifier() external pure override returns (string memory) {
        return "CompoundV3";
    }

    function supply(address comet, address token, uint256 amount) external onlyVault {
        address vault = msg.sender;
        _pullTokens(vault, token, amount);
        SafeERC20.forceApprove(IERC20(token), comet, amount);
        IComet(comet).supplyTo(vault, token, amount);
        SafeERC20.forceApprove(IERC20(token), comet, 0);
        _sweepToken(vault, token);
    }

    function withdraw(address comet, address token, uint256 amount) external onlyVault {
        address vault = msg.sender;

        // Vault allows adapter as Comet manager
        IFundVault(vault).adapterCallback(
            comet,
            abi.encodeCall(IComet.allow, (address(this), true))
        );

        // Withdraw from vault's balance to vault
        IComet(comet).withdrawFrom(vault, vault, token, amount);

        // Revoke permission
        IFundVault(vault).adapterCallback(
            comet,
            abi.encodeCall(IComet.allow, (address(this), false))
        );
    }
}
