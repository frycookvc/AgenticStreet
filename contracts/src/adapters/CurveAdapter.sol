// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AdapterBase} from "../AdapterBase.sol";
import {ICurveRouter} from "../interfaces/ICurveRouter.sol";

contract CurveAdapter is AdapterBase {
    using SafeERC20 for IERC20;

    address public immutable ROUTER;

    constructor(address _factory, address _router) AdapterBase(_factory) {
        require(_router != address(0), "CurveAdapter: zero router");
        ROUTER = _router;
    }

    function identifier() external pure override returns (string memory) {
        return "curve";
    }

    function exchange(
        address[11] calldata route,
        uint256[5][5] calldata swapParams,
        address tokenIn,
        uint256 amountIn,
        uint256 minOut,
        address[5] calldata pools
    ) external onlyVault returns (uint256 amountOut) {
        address vault = msg.sender;

        _pullTokens(vault, tokenIn, amountIn);

        IERC20(tokenIn).forceApprove(ROUTER, amountIn);
        amountOut = ICurveRouter(ROUTER).exchange(route, swapParams, amountIn, minOut, pools, vault);
        IERC20(tokenIn).forceApprove(ROUTER, 0);

        _sweepToken(vault, tokenIn);
    }
}
