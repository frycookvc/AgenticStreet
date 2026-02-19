// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IFundRaise {
    struct RaiseParams {
        IERC20 usdc;
        address vault;
        address manager;
        address factory;
        uint64 depositStart;
        uint64 depositEnd;
        uint256 minRaise;
        uint256 maxRaise;
        uint32 protocolFeeBps;
        uint32 managementFeeBps;
        uint32 performanceFeeBps;
        uint64 fundDuration;
        string metadataURI;
    }

    function initialize(RaiseParams memory p) external;
    function shareBalance(address) external view returns (uint256);
    function totalShares() external view returns (uint256);
}
