// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AdapterBase} from "../AdapterBase.sol";
import {IAavePool} from "../interfaces/IAavePool.sol";
import {IFundVault} from "../IFundVault.sol";
import {IVariableDebtToken} from "../interfaces/IVariableDebtToken.sol";

contract AaveV3Adapter is AdapterBase {
    using SafeERC20 for IERC20;

    address public immutable POOL;

    constructor(address _factory, address _pool) AdapterBase(_factory) {
        require(_pool != address(0));
        POOL = _pool;
    }

    function identifier() external pure override returns (string memory) {
        return "AaveV3Adapter";
    }

    function supply(address token, uint256 amount) external onlyVault {
        address vault = msg.sender;
        _pullTokens(vault, token, amount);

        SafeERC20.forceApprove(IERC20(token), POOL, amount);
        IAavePool(POOL).supply(token, amount, vault, 0);
        SafeERC20.forceApprove(IERC20(token), POOL, 0);
    }

    function withdraw(address token, uint256 amount) external onlyVault {
        address vault = msg.sender;

        address aToken = IAavePool(POOL).getReserveData(token).aTokenAddress;
        _pullTokens(vault, aToken, amount);

        SafeERC20.forceApprove(IERC20(aToken), POOL, amount);
        IAavePool(POOL).withdraw(token, amount, vault);
        SafeERC20.forceApprove(IERC20(aToken), POOL, 0);

        _sweepToken(vault, token);
    }

    function borrow(address token, uint256 amount, uint256 interestRateMode) external onlyVault {
        address vault = msg.sender;
        address debtToken = IAavePool(POOL).getReserveData(token).variableDebtTokenAddress;

        // Vault approves delegation via adapterCallback
        IFundVault(vault).adapterCallback(
            debtToken,
            abi.encodeCall(IVariableDebtToken.approveDelegation, (address(this), amount))
        );

        IAavePool(POOL).borrow(token, amount, interestRateMode, 0, vault);
        _sweepToken(vault, token);

        // Revoke delegation
        IFundVault(vault).adapterCallback(
            debtToken,
            abi.encodeCall(IVariableDebtToken.approveDelegation, (address(this), 0))
        );
    }

    function repay(address token, uint256 amount, uint256 interestRateMode) external onlyVault {
        address vault = msg.sender;

        _pullTokens(vault, token, amount);

        SafeERC20.forceApprove(IERC20(token), POOL, amount);
        IAavePool(POOL).repay(token, amount, interestRateMode, vault);
        SafeERC20.forceApprove(IERC20(token), POOL, 0);

        _sweepToken(vault, token);
    }
}
