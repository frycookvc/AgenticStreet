// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

interface IFundFactory {
    function platformLiquidator() external view returns (address);
    function protocolTreasury() external view returns (address);
    function isRegisteredAdapter(address adapter) external view returns (bool);
    function isFund(address vault) external view returns (bool);
    function proposalDelay() external view returns (uint64);
}
