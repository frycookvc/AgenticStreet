// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {AdapterBase} from "../AdapterBase.sol";
import {IMorpho, MarketParams} from "../interfaces/IMorpho.sol";
import {IFundVault} from "../IFundVault.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract MorphoAdapter is AdapterBase {
    using SafeERC20 for IERC20;

    address public immutable MORPHO;

    function identifier() external pure override returns (string memory) {
        return "MorphoAdapter";
    }

    constructor(address _factory, address _morpho) AdapterBase(_factory) {
        require(_morpho != address(0), "MorphoAdapter: zero morpho");
        MORPHO = _morpho;
    }

    function _authorizeAdapter(address vault, bool authorized) internal {
        IFundVault(vault).adapterCallback(
            MORPHO,
            abi.encodeCall(IMorpho.setAuthorization, (address(this), authorized))
        );
    }

    function supply(MarketParams calldata params, uint256 amount) external onlyVault {
        address vault = msg.sender;
        _pullTokens(vault, params.loanToken, amount);

        IERC20(params.loanToken).forceApprove(MORPHO, amount);
        IMorpho(MORPHO).supply(params, amount, 0, vault, "");
        IERC20(params.loanToken).forceApprove(MORPHO, 0);
    }

    function withdraw(MarketParams calldata params, uint256 amount) external onlyVault {
        address vault = msg.sender;

        _authorizeAdapter(vault, true);
        IMorpho(MORPHO).withdraw(params, amount, 0, vault, vault);
        _authorizeAdapter(vault, false);
    }

    function borrow(MarketParams calldata params, uint256 amount) external onlyVault {
        address vault = msg.sender;

        _authorizeAdapter(vault, true);
        IMorpho(MORPHO).borrow(params, amount, 0, vault, vault);
        _authorizeAdapter(vault, false);
    }

    function repay(MarketParams calldata params, uint256 amount) external onlyVault {
        address vault = msg.sender;
        _pullTokens(vault, params.loanToken, amount);

        IERC20(params.loanToken).forceApprove(MORPHO, amount);
        IMorpho(MORPHO).repay(params, amount, 0, vault, "");
        IERC20(params.loanToken).forceApprove(MORPHO, 0);

        _sweepToken(vault, params.loanToken);
    }

    function supplyCollateral(MarketParams calldata params, uint256 amount) external onlyVault {
        address vault = msg.sender;
        _pullTokens(vault, params.collateralToken, amount);

        IERC20(params.collateralToken).forceApprove(MORPHO, amount);
        IMorpho(MORPHO).supplyCollateral(params, amount, vault, "");
        IERC20(params.collateralToken).forceApprove(MORPHO, 0);
    }

    function withdrawCollateral(MarketParams calldata params, uint256 amount) external onlyVault {
        address vault = msg.sender;

        _authorizeAdapter(vault, true);
        IMorpho(MORPHO).withdrawCollateral(params, amount, vault, vault);
        _authorizeAdapter(vault, false);
    }
}
