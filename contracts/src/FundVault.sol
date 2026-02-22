// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Initializable} from "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import {IFundVault} from "./IFundVault.sol";
import {IFundRaise} from "./IFundRaise.sol";
import {IFundFactory} from "./IFundFactory.sol";

// ──────────────────────────────────────────────
//  Custom errors
// ──────────────────────────────────────────────
error NotManager();
error NotActivated();
error FundFrozen();
error FundWindingDown();
error InvalidTarget();
error TransferBlocked();
error DrawdownLimitExceeded();
error ProposalNotReady();
error VetoWindowClosed();
error ProposalAlreadyExecuted();
error ProposalCancelled();
error ProposalExecutionFailed();
error AlreadyVetoed();
error AlreadyFreezeVoted();
error InsufficientShares();
error WithdrawNotClaimable();
error OnlyFactory();
error AlreadySet();
error OnlyRaise();
error AlreadyActivated();
error ProposalsExist();
error InvalidAdapter();
error NotExecutingProposal();
error NotCurrentAdapter();
error CallFailed();
error FundNotFrozen();

contract FundVault is IFundVault, Initializable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ──────────────────────────────────────────
    //  Types
    // ──────────────────────────────────────────

    struct Proposal {
        address target;
        bytes calldata_;
        uint256 value;
        uint64 proposedAt;
        uint64 executableAt;
        bool executed;
        bool cancelled;
        bool isAdapterProposal;
    }

    struct WithdrawRequest {
        uint256 shares;
        uint64 claimableAt;
    }

    // ──────────────────────────────────────────
    //  Events
    // ──────────────────────────────────────────

    event FundActivated(uint256 usdcReceived);
    event ProposalCreated(
        uint256 indexed id,
        address indexed target,
        bytes data,
        uint256 value,
        uint64 executableAt
    );
    event ProposalExecuted(
        uint256 indexed id,
        address indexed target,
        bool success,
        bytes returnData
    );
    event DrawdownUpdated(
        uint256 cumulativeDrawn,
        uint256 allowance,
        uint256 elapsedIntervals
    );
    event VetoCast(uint256 indexed id, address indexed voter, uint256 shares);
    event ProposalVetoed(uint256 indexed id);
    event ManagementFeeClaimed(
        address indexed manager,
        uint256 fee,
        uint256 deployedCapital,
        uint256 timeElapsed
    );
    event FundWindDown(uint256 balance, uint256 profit, uint256 carry);
    event WithdrawRequested(
        address indexed lp,
        uint256 shares,
        uint64 claimableAt
    );
    event WithdrawClaimed(
        address indexed lp,
        uint256 shares,
        uint256 usdcOwed
    );
    event FreezeVoteCast(address indexed voter, uint256 shares);
    event FundFrozenEvent(address oldManager, address newManager);
    event FundCancelledPreExecution();
    event TokenTransferredToAdapter(address indexed adapter, address indexed token, uint256 amount);
    event AdapterCallbackExecuted(address indexed adapter, address indexed target, bytes data);
    event ResidualClaimed(address indexed lp, uint256 shares, uint256 payout);

    // ──────────────────────────────────────────
    //  State (set once in initialize, effectively immutable)
    // ──────────────────────────────────────────

    IERC20 public usdc;
    address public factory;
    uint32 public managementFeeBps;
    uint32 public performanceFeeBps;

    // ──────────────────────────────────────────
    //  Mutable state
    // ──────────────────────────────────────────

    address public manager; // mutable — freeze can replace

    // Set by factory
    address public raiseContract;

    // Terms (set in activate)
    uint64 public lockupEnd;
    uint64 public redemptionDelay;
    uint64 public fundDuration;
    uint64 public fundStartTime;

    // Drawdown
    uint256 public cumulativeDrawn;
    uint256 public drawdownIntervalSeconds;

    // State
    bool public activated;
    uint256 public initialDeposits;
    uint256 public totalManagementFeesClaimed;
    uint64 public lastManagementFeeClaim;
    bool public fundFrozen;
    bool public fundWindingDown;

    // Proposals
    uint256 public proposalCount;
    mapping(uint256 => Proposal) public proposals;
    mapping(uint256 => mapping(address => bool)) public hasVetoed;
    mapping(uint256 => uint256) public vetoSharesTotal;

    // Freeze
    mapping(address => bool) public hasFreezeVoted;
    uint256 public freezeVoteShares;

    // Withdrawals
    mapping(address => WithdrawRequest) public withdrawRequests;
    uint256 public totalSharesBurned;
    mapping(address => uint256) public sharesBurnedByUser;

    // Residual claims
    mapping(address => uint256) public residualClaimed;
    uint256 public totalResidualPaid;

    // Adapter execution guard — non-zero address means execution in progress
    address private _currentAdapter;

    // ──────────────────────────────────────────
    //  Constructor (implementation only)
    // ──────────────────────────────────────────

    constructor() {
        _disableInitializers();
    }

    // ──────────────────────────────────────────
    //  Initializer (called on each clone)
    // ──────────────────────────────────────────

    function initialize(
        IERC20 _usdc,
        address _manager,
        address _factory,
        uint32 _managementFeeBps,
        uint32 _performanceFeeBps
    ) external initializer {
        usdc = _usdc;
        manager = _manager;
        factory = _factory;
        managementFeeBps = _managementFeeBps;
        performanceFeeBps = _performanceFeeBps;
    }

    // ──────────────────────────────────────────
    //  setRaiseContract
    // ──────────────────────────────────────────

    function setRaiseContract(address _raise) external {
        if (msg.sender != factory) revert OnlyFactory();
        if (raiseContract != address(0)) revert AlreadySet();
        raiseContract = _raise;
    }

    // ──────────────────────────────────────────
    //  activate
    // ──────────────────────────────────────────

    function activate(uint256 usdcReceived, uint64 _fundDuration) external {
        if (msg.sender != raiseContract) revert OnlyRaise();
        if (activated) revert AlreadyActivated();

        activated = true;
        initialDeposits = usdcReceived;
        fundDuration = _fundDuration;
        fundStartTime = uint64(block.timestamp);
        drawdownIntervalSeconds = _fundDuration / 10;
        lastManagementFeeClaim = uint64(block.timestamp);
        lockupEnd = uint64(block.timestamp) + _fundDuration;
        redemptionDelay = 3 days;

        emit FundActivated(usdcReceived);
    }

    // ──────────────────────────────────────────
    //  transferToAdapter
    // ──────────────────────────────────────────

    function transferToAdapter(address token, uint256 amount) external {
        if (_currentAdapter == address(0)) revert NotExecutingProposal();
        if (msg.sender != _currentAdapter) revert NotCurrentAdapter();
        IERC20(token).safeTransfer(msg.sender, amount);
        emit TokenTransferredToAdapter(msg.sender, token, amount);
    }

    // ──────────────────────────────────────────
    //  adapterCallback
    // ──────────────────────────────────────────

    function adapterCallback(address target, bytes calldata data) external returns (bytes memory) {
        if (_currentAdapter == address(0)) revert NotExecutingProposal();
        if (msg.sender != _currentAdapter) revert NotCurrentAdapter();
        if (target.code.length == 0) revert InvalidTarget();
        if (target == address(this)) revert InvalidTarget();
        if (data.length >= 4) {
            bytes4 sel = bytes4(data[:4]);
            if (sel == 0xa9059cbb || sel == 0x23b872dd || sel == 0x095ea7b3 || sel == 0x39509351)
                revert TransferBlocked();
        }
        (bool ok, bytes memory ret) = target.call(data);
        if (!ok) revert CallFailed();
        emit AdapterCallbackExecuted(msg.sender, target, data);
        return ret;
    }

    // ──────────────────────────────────────────
    //  proposeExecution
    // ──────────────────────────────────────────

    function proposeExecution(
        address target,
        bytes calldata data,
        uint256 value
    ) external returns (uint256 proposalId) {
        address _liquidator = IFundFactory(factory).platformLiquidator();
        bool isManager = msg.sender == manager;
        bool isLiquidatorDuringWindDown = fundWindingDown && msg.sender == _liquidator;

        if (!isManager && !isLiquidatorDuringWindDown) revert NotManager();
        if (!activated) revert NotActivated();
        if (fundWindingDown && !isLiquidatorDuringWindDown) revert FundWindingDown();

        // Guard: target must be a contract
        if (target.code.length == 0) revert InvalidTarget();

        bool _isAdapter = IFundFactory(factory).isRegisteredAdapter(target);
        uint64 delay;

        if (_isAdapter) {
            // Adapter path: instant execution (delay=0), strict selector guards
            delay = 0;

            if (data.length >= 4) {
                bytes4 selector = bytes4(data[:4]);

                // Block transfer/transferFrom on adapter path
                if (selector == 0xa9059cbb || selector == 0x23b872dd) {
                    revert TransferBlocked();
                }

                // approve — only to registered adapters
                if (selector == 0x095ea7b3) {
                    (address spender,) = abi.decode(data[4:], (address, uint256));
                    if (!IFundFactory(factory).isRegisteredAdapter(spender)) {
                        revert TransferBlocked();
                    }
                }

                // increaseAllowance — only to registered adapters
                if (selector == 0x39509351) {
                    (address spender,) = abi.decode(data[4:], (address, uint256));
                    if (!IFundFactory(factory).isRegisteredAdapter(spender)) {
                        revert TransferBlocked();
                    }
                }

                // decreaseAllowance — only to registered adapters
                if (selector == 0xa457c2d7) {
                    (address spender,) = abi.decode(data[4:], (address, uint256));
                    if (!IFundFactory(factory).isRegisteredAdapter(spender)) {
                        revert TransferBlocked();
                    }
                }
            }
        } else {
            // Raw call path: delayed execution, LP veto window applies
            delay = IFundFactory(factory).proposalDelay();

            if (data.length >= 4) {
                bytes4 selector = bytes4(data[:4]);

                // Block transfer/transferFrom on raw path
                if (selector == 0xa9059cbb || selector == 0x23b872dd) {
                    revert TransferBlocked();
                }

                // approve is ALLOWED on raw path — veto window protects LPs
            }
        }

        proposalId = proposalCount++;
        proposals[proposalId] = Proposal({
            target: target,
            calldata_: data,
            value: value,
            proposedAt: uint64(block.timestamp),
            executableAt: uint64(block.timestamp) + delay,
            executed: false,
            cancelled: false,
            isAdapterProposal: _isAdapter
        });

        emit ProposalCreated(
            proposalId,
            target,
            data,
            value,
            proposals[proposalId].executableAt
        );
    }

    // ──────────────────────────────────────────
    //  executeProposal
    // ──────────────────────────────────────────

    function executeProposal(uint256 proposalId) external nonReentrant {
        Proposal storage p = proposals[proposalId];

        if (block.timestamp < p.executableAt) revert ProposalNotReady();
        if (p.executed) revert ProposalAlreadyExecuted();
        if (p.cancelled) revert ProposalCancelled();

        // CEI: mark executed before external call
        p.executed = true;

        uint256 usdcBefore = usdc.balanceOf(address(this));

        bool success;
        bytes memory returnData;

        if (p.isAdapterProposal) {
            // Adapter path: re-check registration, set adapter context
            if (!IFundFactory(factory).isRegisteredAdapter(p.target)) revert InvalidAdapter();

            _currentAdapter = p.target;

            (success, returnData) = p.target.call{value: p.value}(p.calldata_);
            if (!success) revert ProposalExecutionFailed();

            _currentAdapter = address(0);
        } else {
            // Raw call path: no adapter context, target must still have code
            if (p.target.code.length == 0) revert InvalidTarget();

            (success, returnData) = p.target.call{value: p.value}(p.calldata_);
            if (!success) revert ProposalExecutionFailed();
        }

        uint256 usdcAfter = usdc.balanceOf(address(this));

        // Track drawdown if USDC left the vault
        if (usdcAfter < usdcBefore) {
            cumulativeDrawn += (usdcBefore - usdcAfter);
        }

        // Drawdown limit: 50% at activation, 100% after first interval
        uint256 elapsed = block.timestamp - fundStartTime;
        uint256 allowance;
        if (elapsed >= drawdownIntervalSeconds) {
            allowance = initialDeposits;
        } else {
            allowance = initialDeposits / 2;
        }

        if (cumulativeDrawn > allowance) revert DrawdownLimitExceeded();

        emit ProposalExecuted(proposalId, p.target, success, returnData);
        emit DrawdownUpdated(cumulativeDrawn, allowance, elapsed >= drawdownIntervalSeconds ? 1 : 0);
    }

    // ──────────────────────────────────────────
    //  vetoExecution
    // ──────────────────────────────────────────

    function vetoExecution(uint256 proposalId) external {
        uint256 shares = IFundRaise(raiseContract).shareBalance(msg.sender);
        if (shares == 0) revert InsufficientShares();

        Proposal storage p = proposals[proposalId];
        if (hasVetoed[proposalId][msg.sender]) revert AlreadyVetoed();
        if (p.executed) revert ProposalAlreadyExecuted();
        if (p.cancelled) revert ProposalCancelled();
        if (block.timestamp >= p.executableAt) revert VetoWindowClosed(); // can only veto before execution window

        hasVetoed[proposalId][msg.sender] = true;
        vetoSharesTotal[proposalId] += shares;

        uint256 totalShares = IFundRaise(raiseContract).totalShares();
        if (vetoSharesTotal[proposalId] >= (totalShares * 3300) / 10000) {
            p.cancelled = true;
            emit ProposalVetoed(proposalId);
        }

        emit VetoCast(proposalId, msg.sender, shares);
    }

    // ──────────────────────────────────────────
    //  claimManagementFee
    // ──────────────────────────────────────────

    function claimManagementFee() external nonReentrant {
        if (msg.sender != manager) revert NotManager();
        if (!activated) revert NotActivated();
        if (fundWindingDown) revert FundWindingDown();

        uint256 balance = usdc.balanceOf(address(this));
        uint256 deployedCapital;
        if (balance >= initialDeposits) {
            deployedCapital = 0;
        } else {
            deployedCapital = initialDeposits - balance;
        }

        uint256 timeElapsed = block.timestamp - lastManagementFeeClaim;
        uint256 fee = (deployedCapital * managementFeeBps * timeElapsed) / (10000 * 365 days);

        lastManagementFeeClaim = uint64(block.timestamp);
        totalManagementFeesClaimed += fee;

        if (fee > 0) {
            usdc.safeTransfer(manager, fee);
        }

        emit ManagementFeeClaimed(manager, fee, deployedCapital, timeElapsed);
    }

    // ──────────────────────────────────────────
    //  windDownFund
    // ──────────────────────────────────────────

    function windDownFund() external nonReentrant {
        if (msg.sender != manager) revert NotManager();
        if (!activated) revert NotActivated();
        if (fundWindingDown) revert FundWindingDown();

        fundWindingDown = true;

        // Cancel all pending proposals
        for (uint256 i; i < proposalCount; ++i) {
            if (!proposals[i].executed && !proposals[i].cancelled) {
                proposals[i].cancelled = true;
            }
        }

        // Calculate carry
        uint256 adjustedBase = totalManagementFeesClaimed >= initialDeposits
            ? 0
            : initialDeposits - totalManagementFeesClaimed;
        uint256 balance = usdc.balanceOf(address(this));
        uint256 profit = balance > adjustedBase ? balance - adjustedBase : 0;
        uint256 carry = (profit * performanceFeeBps) / 10000;

        if (carry > 0) {
            usdc.safeTransfer(manager, carry);
        }

        emit FundWindDown(balance, profit, carry);
    }

    // ──────────────────────────────────────────
    //  requestWithdraw
    // ──────────────────────────────────────────

    function requestWithdraw(uint256 shares) external {
        if (!fundWindingDown && block.timestamp <= lockupEnd) revert WithdrawNotClaimable();
        if (shares == 0) revert InsufficientShares();

        uint256 currentShares = IFundRaise(raiseContract).shareBalance(msg.sender);
        uint256 effectiveShares = currentShares - sharesBurnedByUser[msg.sender];
        uint256 alreadyRequested = withdrawRequests[msg.sender].shares;
        if (shares + alreadyRequested > effectiveShares) revert InsufficientShares();

        uint64 claimableAt = fundWindingDown
            ? uint64(block.timestamp)
            : uint64(block.timestamp) + redemptionDelay;

        withdrawRequests[msg.sender] = WithdrawRequest({
            shares: shares + alreadyRequested,
            claimableAt: claimableAt
        });

        emit WithdrawRequested(msg.sender, shares, claimableAt);
    }

    // ──────────────────────────────────────────
    //  claimWithdraw
    // ──────────────────────────────────────────

    function claimWithdraw() external nonReentrant {
        WithdrawRequest storage req = withdrawRequests[msg.sender];
        if (req.shares == 0) revert InsufficientShares();
        if (block.timestamp < req.claimableAt) revert WithdrawNotClaimable();

        uint256 shares = req.shares;

        // CEI: zero out before transfer
        delete withdrawRequests[msg.sender];

        uint256 remainingShares = IFundRaise(raiseContract).totalShares() - totalSharesBurned;
        if (remainingShares == 0) revert InsufficientShares();
        uint256 usdcOwed = (shares * usdc.balanceOf(address(this))) / remainingShares;

        totalSharesBurned += shares;
        sharesBurnedByUser[msg.sender] += shares;

        usdc.safeTransfer(msg.sender, usdcOwed);

        emit WithdrawClaimed(msg.sender, shares, usdcOwed);
    }

    // ──────────────────────────────────────────
    //  claimResidual
    // ──────────────────────────────────────────

    function claimResidual() external nonReentrant {
        if (!fundWindingDown) revert WithdrawNotClaimable();
        if (!fundFrozen) revert FundNotFrozen();

        uint256 totalShares = IFundRaise(raiseContract).totalShares();
        if (totalSharesBurned < totalShares) revert WithdrawNotClaimable();

        uint256 myShares = sharesBurnedByUser[msg.sender];
        if (myShares == 0) revert InsufficientShares();

        uint256 totalResidualEver = usdc.balanceOf(address(this)) + totalResidualPaid;
        uint256 myCumulativeEntitlement = (myShares * totalResidualEver) / totalSharesBurned;

        if (myCumulativeEntitlement <= residualClaimed[msg.sender]) revert InsufficientShares();
        uint256 payout = myCumulativeEntitlement - residualClaimed[msg.sender];

        uint256 available = usdc.balanceOf(address(this));
        if (payout > available) payout = available;

        residualClaimed[msg.sender] = residualClaimed[msg.sender] + payout;
        totalResidualPaid += payout;

        usdc.safeTransfer(msg.sender, payout);

        emit ResidualClaimed(msg.sender, myShares, payout);
    }

    // ──────────────────────────────────────────
    //  voteFreeze
    // ──────────────────────────────────────────

    function voteFreeze() external {
        uint256 shares = IFundRaise(raiseContract).shareBalance(msg.sender);
        if (shares == 0) revert InsufficientShares();
        if (hasFreezeVoted[msg.sender]) revert AlreadyFreezeVoted();
        if (fundFrozen) revert FundFrozen();

        hasFreezeVoted[msg.sender] = true;
        freezeVoteShares += shares;

        uint256 totalShares = IFundRaise(raiseContract).totalShares();

        emit FreezeVoteCast(msg.sender, shares);

        if (freezeVoteShares >= (totalShares * 6600) / 10000) {
            fundFrozen = true;

            // Cancel all pending proposals
            for (uint256 i; i < proposalCount; ++i) {
                if (!proposals[i].executed && !proposals[i].cancelled) {
                    proposals[i].cancelled = true;
                }
            }

            address oldManager = manager;
            manager = IFundFactory(factory).platformLiquidator();

            emit FundFrozenEvent(oldManager, manager);
        }
    }

    // ──────────────────────────────────────────
    //  cancelFundBeforeExecution
    // ──────────────────────────────────────────

    function cancelFundBeforeExecution() external {
        if (msg.sender != manager) revert NotManager();
        if (!activated) revert NotActivated();
        if (proposalCount != 0) revert ProposalsExist();
        fundWindingDown = true;

        emit FundCancelledPreExecution();
    }

    // ──────────────────────────────────────────
    //  receive
    // ──────────────────────────────────────────

    receive() external payable {}
}
