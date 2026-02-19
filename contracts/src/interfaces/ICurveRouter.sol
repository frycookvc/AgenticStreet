// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

interface ICurveRouter {
    function exchange(
        address[11] calldata route,
        uint256[5][5] calldata swapParams,
        uint256 amount,
        uint256 expected,
        address[5] calldata pools,
        address receiver
    ) external returns (uint256);
}
