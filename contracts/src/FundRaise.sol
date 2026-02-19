// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Initializable} from "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import {IFundRaise} from "./IFundRaise.sol";
import {IFundVault} from "./IFundVault.sol";
import {IFundFactory} from "./IFundFactory.sol";

// ──────────────────────────────────────────────
//  Custom errors
// ──────────────────────────────────────────────
error DepositWindowClosed();
error FundAlreadyFinalised();
error FundCancelledError();
error MinRaiseNotMet();
error RaiseNotComplete();
error NotManager();
error ExceedsMaxRaise();
error DepositTooSmall();
error RefundBlocked();

contract FundRaise is IFundRaise, Initializable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ──────────────────────────────────────────
    //  Events
    // ──────────────────────────────────────────
    event Deposit(address indexed depositor, uint256 amount);
    event FundCancelled();
    event Refund(address indexed depositor, uint256 amount);
    event FundFinalised(uint256 totalDeposited, uint256 platformFee, uint256 totalShares);

    // ──────────────────────────────────────────
    //  State (set once in initialize, effectively immutable)
    // ──────────────────────────────────────────
    IERC20 public usdc;
    address public vault;
    address public manager;
    address public factory;
    uint64 public depositStart;
    uint64 public depositEnd;
    uint256 public minRaise;
    uint256 public maxRaise;
    uint32 public protocolFeeBps;
    uint32 public managementFeeBps;
    uint32 public performanceFeeBps;
    uint64 public fundDuration;

    // ──────────────────────────────────────────
    //  Mutable state
    // ──────────────────────────────────────────
    string public metadataURI;
    bool public finalised;
    bool public cancelled;
    uint256 public totalDeposited;

    mapping(address => uint256) public deposits;
    mapping(address => uint256) public shareBalance;
    uint256 public totalShares;

    address[] internal _depositors;
    mapping(address => bool) internal _isDepositor;

    // ──────────────────────────────────────────
    //  Constructor (implementation only)
    // ──────────────────────────────────────────

    constructor() {
        _disableInitializers();
    }

    // ──────────────────────────────────────────
    //  Initializer (called on each clone)
    // ──────────────────────────────────────────

    function initialize(RaiseParams memory p) external initializer {
        usdc = p.usdc;
        vault = p.vault;
        manager = p.manager;
        factory = p.factory;
        depositStart = p.depositStart;
        depositEnd = p.depositEnd;
        minRaise = p.minRaise;
        maxRaise = p.maxRaise;
        protocolFeeBps = p.protocolFeeBps;
        managementFeeBps = p.managementFeeBps;
        performanceFeeBps = p.performanceFeeBps;
        fundDuration = p.fundDuration;
        metadataURI = p.metadataURI;
    }

    // ──────────────────────────────────────────
    //  deposit
    // ──────────────────────────────────────────

    function deposit(uint256 amount) external nonReentrant {
        if (amount < 1e6) revert DepositTooSmall();
        if (block.timestamp < depositStart || block.timestamp > depositEnd) {
            revert DepositWindowClosed();
        }
        if (finalised) revert FundAlreadyFinalised();
        if (cancelled) revert FundCancelledError();
        if (totalDeposited + amount > maxRaise) revert ExceedsMaxRaise();

        usdc.safeTransferFrom(msg.sender, address(this), amount);

        deposits[msg.sender] += amount;
        totalDeposited += amount;

        if (!_isDepositor[msg.sender]) {
            _isDepositor[msg.sender] = true;
            _depositors.push(msg.sender);
        }

        emit Deposit(msg.sender, amount);
    }

    // ──────────────────────────────────────────
    //  cancelFund
    // ──────────────────────────────────────────

    function cancelFund() external {
        if (msg.sender != manager) revert NotManager();
        if (finalised) revert FundAlreadyFinalised();
        if (cancelled) revert FundCancelledError();

        cancelled = true;
        emit FundCancelled();
    }

    // ──────────────────────────────────────────
    //  refund
    // ──────────────────────────────────────────

    function refund() external nonReentrant {
        bool isCancelled = cancelled;
        bool isFailedRaise = block.timestamp > depositEnd && totalDeposited < minRaise;
        bool isOpenRaise = !finalised && totalDeposited < maxRaise && block.timestamp <= depositEnd;

        if (!isCancelled && !isFailedRaise && !isOpenRaise)
            revert RefundBlocked();

        uint256 amount = deposits[msg.sender];
        if (amount == 0) revert RefundBlocked();

        // Checks-effects-interactions
        deposits[msg.sender] = 0;
        totalDeposited -= amount;

        usdc.safeTransfer(msg.sender, amount);

        emit Refund(msg.sender, amount);
    }

    // ──────────────────────────────────────────
    //  finalise
    // ──────────────────────────────────────────

    function finalise() external nonReentrant {
        if (cancelled) revert FundCancelledError();
        if (finalised) revert FundAlreadyFinalised();
        if (totalDeposited < minRaise) revert MinRaiseNotMet();
        if (block.timestamp <= depositEnd && totalDeposited < maxRaise) {
            revert RaiseNotComplete();
        }

        finalised = true;

        // Calculate and transfer protocol fee
        uint256 platformFee = totalDeposited * protocolFeeBps / 10_000;
        uint256 remainder = totalDeposited - platformFee;

        if (platformFee > 0) {
            address treasuryAddr = IFundFactory(factory).protocolTreasury();
            usdc.safeTransfer(treasuryAddr, platformFee);
        }

        // Transfer remainder to vault
        usdc.safeTransfer(vault, remainder);

        // Mint shares 1:1 with deposits (pre-fee amount)
        uint256 len = _depositors.length;
        for (uint256 i; i < len; ++i) {
            address depositor = _depositors[i];
            shareBalance[depositor] = deposits[depositor];
        }
        totalShares = totalDeposited;

        // Activate the vault
        IFundVault(vault).activate(remainder, fundDuration);

        emit FundFinalised(totalDeposited, platformFee, totalShares);
    }
}
