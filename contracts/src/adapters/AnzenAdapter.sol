// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AdapterBase} from "../AdapterBase.sol";
import {IAnzen} from "../interfaces/IAnzen.sol";

contract AnzenAdapter is AdapterBase {
    using SafeERC20 for IERC20;

    address public immutable ANZEN_VAULT;
    address public immutable USDZ;
    address public immutable SUSDZ;

    constructor(
        address _factory,
        address _anzenVault,
        address _usdz,
        address _susdz
    ) AdapterBase(_factory) {
        require(_anzenVault != address(0));
        require(_usdz != address(0));
        require(_susdz != address(0));
        ANZEN_VAULT = _anzenVault;
        USDZ = _usdz;
        SUSDZ = _susdz;
    }

    function identifier() external pure override returns (string memory) {
        return "AnzenAdapter";
    }

    /// @notice Deposit underlying asset into Anzen vault, USDz shares sent to vault.
    function deposit(uint256 amount) external onlyVault {
        address vault = msg.sender;
        address asset = IAnzen(ANZEN_VAULT).asset();

        _pullTokens(vault, asset, amount);

        SafeERC20.forceApprove(IERC20(asset), ANZEN_VAULT, amount);
        IAnzen(ANZEN_VAULT).deposit(amount, vault);
        SafeERC20.forceApprove(IERC20(asset), ANZEN_VAULT, 0);
    }

    /// @notice Withdraw underlying asset from Anzen vault. Pull USDz from vault, adapter redeems, underlying sent to vault.
    function withdraw(uint256 amount) external onlyVault {
        address vault = msg.sender;

        _pullTokens(vault, USDZ, amount);

        SafeERC20.forceApprove(IERC20(USDZ), ANZEN_VAULT, amount);
        IAnzen(ANZEN_VAULT).withdraw(amount, vault, address(this));
        SafeERC20.forceApprove(IERC20(USDZ), ANZEN_VAULT, 0);

        _sweepToken(vault, USDZ);
    }

    /// @notice Stake USDz into sUSDz vault. Pull USDz from vault, sUSDz shares sent to vault.
    function stake(uint256 amount) external onlyVault {
        address vault = msg.sender;

        _pullTokens(vault, USDZ, amount);

        SafeERC20.forceApprove(IERC20(USDZ), SUSDZ, amount);
        IAnzen(SUSDZ).deposit(amount, vault);
        SafeERC20.forceApprove(IERC20(USDZ), SUSDZ, 0);
    }

    /// @notice Unstake sUSDz back to USDz. Pull sUSDz from vault, adapter redeems, USDz sent to vault.
    function unstake(uint256 amount) external onlyVault {
        address vault = msg.sender;

        _pullTokens(vault, SUSDZ, amount);

        SafeERC20.forceApprove(IERC20(SUSDZ), SUSDZ, amount);
        IAnzen(SUSDZ).withdraw(amount, vault, address(this));
        SafeERC20.forceApprove(IERC20(SUSDZ), SUSDZ, 0);

        _sweepToken(vault, SUSDZ);
    }
}
