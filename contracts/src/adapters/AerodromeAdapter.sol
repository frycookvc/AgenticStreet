// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AdapterBase} from "../AdapterBase.sol";
import {IAerodromeRouter} from "../interfaces/IAerodromeRouter.sol";

contract AerodromeAdapter is AdapterBase {
    using SafeERC20 for IERC20;

    address public immutable ROUTER;
    address public immutable POOL_FACTORY;

    constructor(
        address _factory,
        address _router,
        address _poolFactory
    ) AdapterBase(_factory) {
        require(_router != address(0));
        require(_poolFactory != address(0));
        ROUTER = _router;
        POOL_FACTORY = _poolFactory;
    }

    function identifier() external pure override returns (string memory) {
        return "AerodromeAdapter";
    }

    function swap(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOutMin,
        bool stable
    ) external onlyVault returns (uint256 amountOut) {
        address vault = msg.sender;
        _pullTokens(vault, tokenIn, amountIn);

        IAerodromeRouter.Route[] memory routes = new IAerodromeRouter.Route[](1);
        routes[0] = IAerodromeRouter.Route({
            from: tokenIn,
            to: tokenOut,
            stable: stable,
            factory: POOL_FACTORY
        });

        bytes memory ret = _approveAndCall(
            tokenIn, amountIn, ROUTER,
            abi.encodeCall(IAerodromeRouter.swapExactTokensForTokens, (
                amountIn, amountOutMin, routes,
                vault,  // HARDCODED: output to vault
                block.timestamp
            ))
        );

        uint256[] memory amounts = abi.decode(ret, (uint256[]));
        amountOut = amounts[amounts.length - 1];
        _sweepToken(vault, tokenIn);
        _sweepToken(vault, tokenOut);
    }

    function addLiquidity(
        address tokenA,
        address tokenB,
        bool stable,
        uint256 amountADesired,
        uint256 amountBDesired,
        uint256 amountAMin,
        uint256 amountBMin
    ) external onlyVault returns (uint256 amountA, uint256 amountB, uint256 liquidity) {
        address vault = msg.sender;

        _pullTokens(vault, tokenA, amountADesired);
        _pullTokens(vault, tokenB, amountBDesired);

        SafeERC20.forceApprove(IERC20(tokenA), ROUTER, amountADesired);
        SafeERC20.forceApprove(IERC20(tokenB), ROUTER, amountBDesired);

        (amountA, amountB, liquidity) = IAerodromeRouter(ROUTER).addLiquidity(
            tokenA, tokenB, stable,
            amountADesired, amountBDesired,
            amountAMin, amountBMin,
            vault,  // HARDCODED: LP tokens go to vault
            block.timestamp
        );

        // Revoke approvals
        SafeERC20.forceApprove(IERC20(tokenA), ROUTER, 0);
        SafeERC20.forceApprove(IERC20(tokenB), ROUTER, 0);

        // Sweep unspent tokens
        _sweepToken(vault, tokenA);
        _sweepToken(vault, tokenB);
    }

    function removeLiquidity(
        address tokenA,
        address tokenB,
        bool stable,
        uint256 liquidity,
        uint256 amountAMin,
        uint256 amountBMin
    ) external onlyVault returns (uint256 amountA, uint256 amountB) {
        address vault = msg.sender;

        // Get the LP token address
        address pool = IAerodromeRouter(ROUTER).poolFor(tokenA, tokenB, stable, POOL_FACTORY);
        _pullTokens(vault, pool, liquidity);

        // Approve router to spend LP tokens
        SafeERC20.forceApprove(IERC20(pool), ROUTER, liquidity);

        (amountA, amountB) = IAerodromeRouter(ROUTER).removeLiquidity(
            tokenA, tokenB, stable,
            liquidity,
            amountAMin, amountBMin,
            vault,  // HARDCODED: both output tokens go to vault
            block.timestamp
        );

        SafeERC20.forceApprove(IERC20(pool), ROUTER, 0);

        // Sweep both output tokens + any residual LP tokens
        _sweepToken(vault, tokenA);
        _sweepToken(vault, tokenB);
        _sweepToken(vault, pool);
    }
}
