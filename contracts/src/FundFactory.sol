// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {UUPSUpgradeable} from "@openzeppelin/contracts/proxy/utils/UUPSUpgradeable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {Initializable} from "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IFundRaise} from "./IFundRaise.sol";
import {IFundVault} from "./IFundVault.sol";
import {IProtocolAdapter} from "./IProtocolAdapter.sol";

// ──────────────────────────────────────────────
//  Custom errors
// ──────────────────────────────────────────────
error InvalidDuration();
error FeeExceedsCap();
error FundSizeExceedsCap();
error FactoryPaused();
error ZeroAddress();
error LengthMismatch();
error InvalidMinRaise();
error MinRaiseExceedsMaxRaise();
error InvalidDepositWindow();
error AdapterAlreadyRegistered();
error NoCode();

contract FundFactory is Initializable, UUPSUpgradeable, OwnableUpgradeable {
    // ──────────────────────────────────────────
    //  Types
    // ──────────────────────────────────────────
    struct CreateFundParams {
        uint256 minRaise;
        uint256 maxRaise;
        uint32 managementFeeBps;
        uint32 performanceFeeBps;
        uint64 fundDuration;
        uint64 depositWindow;
        string metadataURI;
    }

    // ──────────────────────────────────────────
    //  Events
    // ──────────────────────────────────────────
    event FundCreated(
        address indexed raise,
        address indexed vault,
        address indexed manager,
        uint256 maxRaise,
        uint64 fundDuration
    );
    event ProtocolFeeBpsUpdated(uint32 oldValue, uint32 newValue);
    event ProtocolTreasuryUpdated(address oldValue, address newValue);
    event MaxManagementFeeBpsUpdated(uint32 oldValue, uint32 newValue);
    event MaxPerformanceFeeBpsUpdated(uint32 oldValue, uint32 newValue);
    event MaxFundSizeUpdated(uint256 oldValue, uint256 newValue);
    event ProposalDelayUpdated(uint64 oldValue, uint64 newValue);
    event PlatformLiquidatorUpdated(address oldValue, address newValue);
    event RaiseImplementationUpdated(address oldValue, address newValue);
    event VaultImplementationUpdated(address oldValue, address newValue);
    event AdapterRegistered(address indexed adapter, string identifier);
    event AdapterRemoved(address indexed adapter);
    event WhitelistedDelayUpdated(uint64 oldValue, uint64 newValue);

    // ──────────────────────────────────────────
    //  State
    // ──────────────────────────────────────────
    address public protocolTreasury;
    uint32 public protocolFeeBps;
    uint32 public defaultMaxManagementFeeBps;
    uint32 public defaultMaxPerformanceFeeBps;
    uint256 public maxFundSize;
    uint64[] public allowedDurations;
    uint64 public proposalDelay;
    address public platformLiquidator;
    bool public paused;

    mapping(address => uint32) public managerFeeOverrides;

    address[] public allFunds;
    mapping(address => bool) public isFund;

    IERC20 public usdc;

    address public raiseImplementation;
    address public vaultImplementation;

    mapping(address => bool) public registeredAdapters;
    uint64 public whitelistedDelay;

    address[] public adapterList;

    // ──────────────────────────────────────────
    //  Initializer
    // ──────────────────────────────────────────

    constructor() {
        _disableInitializers();
    }

    function initialize(
        address _usdc,
        address _treasury,
        address _platformLiquidator,
        uint64 _proposalDelay,
        address _raiseImplementation,
        address _vaultImplementation
    ) external initializer {
        __Ownable_init(msg.sender);
        __UUPSUpgradeable_init();

        if (_usdc == address(0)) revert ZeroAddress();
        if (_treasury == address(0)) revert ZeroAddress();
        if (_platformLiquidator == address(0)) revert ZeroAddress();
        if (_raiseImplementation == address(0)) revert ZeroAddress();
        if (_vaultImplementation == address(0)) revert ZeroAddress();
        usdc = IERC20(_usdc);
        protocolTreasury = _treasury;
        platformLiquidator = _platformLiquidator;
        proposalDelay = _proposalDelay;
        raiseImplementation = _raiseImplementation;
        vaultImplementation = _vaultImplementation;

        // Defaults
        protocolFeeBps = 0;
        defaultMaxManagementFeeBps = 500; // 5%
        defaultMaxPerformanceFeeBps = 2000; // 20%
        maxFundSize = 100_000e6;

        whitelistedDelay = 120; // 2 minutes

        allowedDurations.push(30 days);
        allowedDurations.push(60 days);
        allowedDurations.push(90 days);
    }

    // ──────────────────────────────────────────
    //  Core: createFund
    // ──────────────────────────────────────────

    function createFund(CreateFundParams calldata params)
        external
        returns (address raise, address vault)
    {
        if (paused) revert FactoryPaused();

        // 1. Validate duration
        if (!_isAllowedDuration(params.fundDuration)) revert InvalidDuration();

        // 2. Validate raise bounds
        if (params.minRaise == 0) revert InvalidMinRaise();
        if (params.minRaise > params.maxRaise) revert MinRaiseExceedsMaxRaise();
        if (params.maxRaise > maxFundSize) revert FundSizeExceedsCap();

        // 3. Validate deposit window
        if (params.depositWindow == 0) revert InvalidDepositWindow();

        // 4. Validate management fee
        uint32 effectiveMgmtCap = managerFeeOverrides[msg.sender];
        if (effectiveMgmtCap == 0) {
            effectiveMgmtCap = defaultMaxManagementFeeBps;
        }
        if (params.managementFeeBps > effectiveMgmtCap) revert FeeExceedsCap();

        // 5. Validate performance fee
        if (params.performanceFeeBps > defaultMaxPerformanceFeeBps) revert FeeExceedsCap();

        // 6. Clone vault (does not know raise address yet)
        vault = Clones.clone(vaultImplementation);
        IFundVault(vault).initialize(
            usdc,
            msg.sender,
            address(this),
            params.managementFeeBps,
            params.performanceFeeBps
        );

        // 7. Clone raise (knows vault address)
        raise = Clones.clone(raiseImplementation);
        IFundRaise(raise).initialize(
            IFundRaise.RaiseParams({
                usdc: usdc,
                vault: vault,
                manager: msg.sender,
                factory: address(this),
                depositStart: uint64(block.timestamp),
                depositEnd: uint64(block.timestamp) + params.depositWindow,
                minRaise: params.minRaise,
                maxRaise: params.maxRaise,
                protocolFeeBps: protocolFeeBps,
                managementFeeBps: params.managementFeeBps,
                performanceFeeBps: params.performanceFeeBps,
                fundDuration: params.fundDuration,
                metadataURI: params.metadataURI
            })
        );

        // 8. Link vault -> raise
        IFundVault(vault).setRaiseContract(raise);

        // 9. Track
        isFund[vault] = true;
        allFunds.push(vault);

        emit FundCreated(raise, vault, msg.sender, params.maxRaise, params.fundDuration);
    }

    // ──────────────────────────────────────────
    //  Admin setters (onlyOwner)
    // ──────────────────────────────────────────

    function setProtocolFeeBps(uint32 _bps) external onlyOwner {
        uint32 old = protocolFeeBps;
        protocolFeeBps = _bps;
        emit ProtocolFeeBpsUpdated(old, _bps);
    }

    function setProtocolTreasury(address _treasury) external onlyOwner {
        if (_treasury == address(0)) revert ZeroAddress();
        address old = protocolTreasury;
        protocolTreasury = _treasury;
        emit ProtocolTreasuryUpdated(old, _treasury);
    }

    function setDefaultMaxManagementFeeBps(uint32 _bps) external onlyOwner {
        uint32 old = defaultMaxManagementFeeBps;
        defaultMaxManagementFeeBps = _bps;
        emit MaxManagementFeeBpsUpdated(old, _bps);
    }

    function setDefaultMaxPerformanceFeeBps(uint32 _bps) external onlyOwner {
        uint32 old = defaultMaxPerformanceFeeBps;
        defaultMaxPerformanceFeeBps = _bps;
        emit MaxPerformanceFeeBpsUpdated(old, _bps);
    }

    function setMaxFundSize(uint256 _size) external onlyOwner {
        uint256 old = maxFundSize;
        maxFundSize = _size;
        emit MaxFundSizeUpdated(old, _size);
    }

    function setAllowedDurations(uint64[] calldata _durations) external onlyOwner {
        delete allowedDurations;
        for (uint256 i; i < _durations.length; ++i) {
            allowedDurations.push(_durations[i]);
        }
    }

    function setProposalDelay(uint64 _delay) external onlyOwner {
        uint64 old = proposalDelay;
        proposalDelay = _delay;
        emit ProposalDelayUpdated(old, _delay);
    }

    function setPlatformLiquidator(address _liquidator) external onlyOwner {
        if (_liquidator == address(0)) revert ZeroAddress();
        address old = platformLiquidator;
        platformLiquidator = _liquidator;
        emit PlatformLiquidatorUpdated(old, _liquidator);
    }

    function setManagerFeeOverride(address _manager, uint32 _bps) external onlyOwner {
        managerFeeOverrides[_manager] = _bps;
    }

    function setRaiseImplementation(address _impl) external onlyOwner {
        if (_impl == address(0)) revert ZeroAddress();
        if (_impl.code.length == 0) revert ZeroAddress();
        address old = raiseImplementation;
        raiseImplementation = _impl;
        emit RaiseImplementationUpdated(old, _impl);
    }

    function setVaultImplementation(address _impl) external onlyOwner {
        if (_impl == address(0)) revert ZeroAddress();
        if (_impl.code.length == 0) revert ZeroAddress();
        address old = vaultImplementation;
        vaultImplementation = _impl;
        emit VaultImplementationUpdated(old, _impl);
    }

    function registerAdapter(address _adapter) external onlyOwner {
        if (_adapter == address(0)) revert ZeroAddress();
        if (_adapter.code.length == 0) revert NoCode();
        if (registeredAdapters[_adapter]) revert AdapterAlreadyRegistered();
        if (IProtocolAdapter(_adapter).factory() != address(this)) revert ZeroAddress();
        registeredAdapters[_adapter] = true;
        adapterList.push(_adapter);
        emit AdapterRegistered(_adapter, IProtocolAdapter(_adapter).identifier());
    }

    function removeAdapter(address _adapter) external onlyOwner {
        registeredAdapters[_adapter] = false;
        emit AdapterRemoved(_adapter);
    }

    function isRegisteredAdapter(address _adapter) external view returns (bool) {
        return registeredAdapters[_adapter];
    }

    function getAdapterList() external view returns (address[] memory) {
        return adapterList;
    }

    // whitelistedDelay state variable kept in storage for UUPS layout compatibility
    // but setter removed — adapter proposals now use delay=0, raw calls use proposalDelay

    function pause() external onlyOwner {
        paused = true;
    }

    function unpause() external onlyOwner {
        paused = false;
    }

    // ──────────────────────────────────────────
    //  View helpers
    // ──────────────────────────────────────────

    function allFundsLength() external view returns (uint256) {
        return allFunds.length;
    }

    function getAllowedDurations() external view returns (uint64[] memory) {
        return allowedDurations;
    }

    // ──────────────────────────────────────────
    //  Internals
    // ──────────────────────────────────────────

    function _isAllowedDuration(uint64 duration) internal view returns (bool) {
        for (uint256 i; i < allowedDurations.length; ++i) {
            if (allowedDurations[i] == duration) return true;
        }
        return false;
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}

    // solhint-disable-next-line func-name-mixedcase
    function __UUPSUpgradeable_init() internal onlyInitializing {}
}
