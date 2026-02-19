// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

interface IMoonwell {
    function mint(uint256 mintAmount) external returns (uint256);
    function redeem(uint256 redeemTokens) external returns (uint256);
    function borrow(uint256 borrowAmount) external returns (uint256);
    function repayBorrow(uint256 repayAmount) external returns (uint256);
    function underlying() external view returns (address);
    function balanceOf(address owner) external view returns (uint256);
}

interface IMoonwellComptroller {
    function enterMarkets(address[] calldata mTokens) external returns (uint256[] memory);
}
