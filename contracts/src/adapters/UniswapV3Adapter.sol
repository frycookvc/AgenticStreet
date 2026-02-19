// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {AdapterBase} from "../AdapterBase.sol";
import {ISwapRouter} from "../interfaces/ISwapRouter.sol";

contract UniswapV3Adapter is AdapterBase {
    address public immutable SWAP_ROUTER;

    constructor(address _factory, address _swapRouter) AdapterBase(_factory) {
        require(_swapRouter != address(0));
        SWAP_ROUTER = _swapRouter;
    }

    function identifier() external pure override returns (string memory) {
        return "UniswapV3Adapter";
    }

    function swapExactInputSingle(
        address tokenIn,
        address tokenOut,
        uint24 fee,
        uint256 amountIn,
        uint256 amountOutMin
    ) external onlyVault returns (uint256 amountOut) {
        address vault = msg.sender;
        _pullTokens(vault, tokenIn, amountIn);

        bytes memory ret = _approveAndCall(
            tokenIn, amountIn, SWAP_ROUTER,
            abi.encodeCall(ISwapRouter.exactInputSingle, (
                ISwapRouter.ExactInputSingleParams({
                    tokenIn: tokenIn,
                    tokenOut: tokenOut,
                    fee: fee,
                    recipient: vault,  // HARDCODED: output to vault
                    amountIn: amountIn,
                    amountOutMinimum: amountOutMin,
                    sqrtPriceLimitX96: 0
                })
            ))
        );
        amountOut = abi.decode(ret, (uint256));
        _sweepToken(vault, tokenIn);   // return unspent
        _sweepToken(vault, tokenOut);  // catch residual
    }

    // Path format: abi.encodePacked(tokenIn, fee1, tokenMid, fee2, tokenOut)
    function swapExactInput(
        bytes calldata path,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOutMin
    ) external onlyVault returns (uint256 amountOut) {
        address vault = msg.sender;
        _pullTokens(vault, tokenIn, amountIn);

        bytes memory ret = _approveAndCall(
            tokenIn, amountIn, SWAP_ROUTER,
            abi.encodeCall(ISwapRouter.exactInput, (
                ISwapRouter.ExactInputParams({
                    path: path,
                    recipient: vault,  // HARDCODED: output to vault
                    amountIn: amountIn,
                    amountOutMinimum: amountOutMin
                })
            ))
        );
        amountOut = abi.decode(ret, (uint256));
        _sweepToken(vault, tokenIn);
        _sweepToken(vault, tokenOut);
    }
}
