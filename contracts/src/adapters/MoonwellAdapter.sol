// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AdapterBase} from "../AdapterBase.sol";
import {IMoonwell, IMoonwellComptroller} from "../interfaces/IMoonwell.sol";
import {IFundVault} from "../IFundVault.sol";

contract MoonwellAdapter is AdapterBase {
    using SafeERC20 for IERC20;

    error MintFailed();
    error RedeemFailed();
    error BorrowFailed();
    error RepayFailed();

    constructor(address _factory) AdapterBase(_factory) {}

    function identifier() external pure override returns (string memory) {
        return "MoonwellAdapter";
    }

    function supply(address mToken, address token, uint256 amount) external onlyVault {
        address vault = msg.sender;
        _pullTokens(vault, token, amount);

        SafeERC20.forceApprove(IERC20(token), mToken, amount);
        uint256 err = IMoonwell(mToken).mint(amount);
        if (err != 0) revert MintFailed();
        SafeERC20.forceApprove(IERC20(token), mToken, 0);

        _sweepToken(vault, mToken);
    }

    function withdraw(address mToken, uint256 amount) external onlyVault {
        address vault = msg.sender;
        _pullTokens(vault, mToken, amount);

        uint256 err = IMoonwell(mToken).redeem(amount);
        if (err != 0) revert RedeemFailed();

        address underlying = IMoonwell(mToken).underlying();
        _sweepToken(vault, underlying);
    }

    function borrow(address comptroller, address mToken, uint256 amount) external onlyVault {
        address vault = msg.sender;

        // Enter market — vault is msg.sender to comptroller
        address[] memory markets = new address[](1);
        markets[0] = mToken;
        IFundVault(vault).adapterCallback(
            comptroller,
            abi.encodeCall(IMoonwellComptroller.enterMarkets, (markets))
        );

        // Borrow — vault is msg.sender to mToken (vault entered market, vault borrows)
        IFundVault(vault).adapterCallback(
            mToken,
            abi.encodeCall(IMoonwell.borrow, (amount))
        );

        // Borrowed tokens land in vault. Defensive sweep for adapter dust.
        address underlying = IMoonwell(mToken).underlying();
        _sweepToken(vault, underlying);
    }

    function repay(address mToken, address token, uint256 amount) external onlyVault {
        address vault = msg.sender;
        _pullTokens(vault, token, amount);

        SafeERC20.forceApprove(IERC20(token), mToken, amount);
        uint256 err = IMoonwell(mToken).repayBorrowBehalf(vault, amount);
        if (err != 0) revert RepayFailed();
        SafeERC20.forceApprove(IERC20(token), mToken, 0);

        _sweepToken(vault, token);
    }
}
