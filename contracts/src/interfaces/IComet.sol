// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

interface IComet {
    function supply(address asset, uint256 amount) external;
    function supplyTo(address dst, address asset, uint256 amount) external;
    function withdraw(address asset, uint256 amount) external;
    function withdrawTo(address to, address asset, uint256 amount) external;
    function withdrawFrom(address src, address to, address asset, uint256 amount) external;
    function allow(address manager, bool isAllowed) external;
    function balanceOf(address account) external view returns (uint256);
    function collateralBalanceOf(address account, address asset) external view returns (uint256);
}
