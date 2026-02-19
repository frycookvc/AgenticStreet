// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

interface IProtocolAdapter {
    function factory() external view returns (address);
    function identifier() external pure returns (string memory);
}
