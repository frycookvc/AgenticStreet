// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

interface IVariableDebtToken {
    function approveDelegation(address delegatee, uint256 amount) external;
    function borrowAllowance(address fromUser, address toUser) external view returns (uint256);
}
