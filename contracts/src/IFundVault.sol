// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IFundVault {
    function initialize(
        IERC20 _usdc,
        address _manager,
        address _factory,
        uint32 _managementFeeBps,
        uint32 _performanceFeeBps
    ) external;

    function setRaiseContract(address _raise) external;
    function activate(uint256 usdcReceived, uint64 fundDuration) external;
    function transferToAdapter(address token, uint256 amount) external;
    function adapterCallback(address target, bytes calldata data) external returns (bytes memory);
}
