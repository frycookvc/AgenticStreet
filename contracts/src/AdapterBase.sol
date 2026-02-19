// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IProtocolAdapter} from "./IProtocolAdapter.sol";
import {IFundFactory} from "./IFundFactory.sol";
import {IFundVault} from "./IFundVault.sol";

abstract contract AdapterBase is IProtocolAdapter {
    using SafeERC20 for IERC20;

    address public immutable FACTORY;

    error InvalidVault();
    error CallFailed();

    constructor(address _factory) {
        require(_factory != address(0));
        FACTORY = _factory;
    }

    modifier onlyVault() {
        if (!IFundFactory(FACTORY).isFund(msg.sender)) revert InvalidVault();
        _;
    }

    function factory() external view override returns (address) {
        return FACTORY;
    }

    function identifier() external pure virtual override returns (string memory);

    function _pullTokens(address _vault, address _token, uint256 _amount) internal {
        IFundVault(_vault).transferToAdapter(_token, _amount);
    }

    function _approveAndCall(
        address _token,
        uint256 _amount,
        address _target,
        bytes memory _calldata
    ) internal returns (bytes memory) {
        SafeERC20.forceApprove(IERC20(_token), _target, _amount);
        (bool success, bytes memory ret) = _target.call(_calldata);
        if (!success) revert CallFailed();
        SafeERC20.forceApprove(IERC20(_token), _target, 0);
        return ret;
    }

    function _sweepToken(address _vault, address _token) internal {
        uint256 bal = IERC20(_token).balanceOf(address(this));
        if (bal > 0) IERC20(_token).safeTransfer(_vault, bal);
    }
}
