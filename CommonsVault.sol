// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20Payout {
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

interface IUsdPriceOracle {
    function latestPriceUsd8() external view returns (uint256);
}

interface IEncounterWeights {
    function currentEpoch() external view returns (uint64);
    function payoutWeight(uint64 epoch, address actor) external view returns (uint256);
    function participantsForEpoch(uint64 epoch) external view returns (address[] memory);
}

/// @title CommonsVault
/// @notice Experimental protected ETH commons with claimable payout-token surplus.
/// @dev Unaudited hackathon reference. The HTML demo is the authoritative simulation.
contract CommonsVault {
    uint256 public constant BPS = 10_000;
    uint256 public constant APPRECIATION_SHARE_BPS = 2_500;
    uint256 public constant AI_SHARE_BPS = 6_000;
    uint256 public constant HUMAN_SHARE_BPS = 2_500;
    uint256 public constant COMMONS_SHARE_BPS = 1_000;
    uint256 public constant PROTOCOL_SHARE_BPS = 500;

    address public immutable admin;
    IERC20Payout public immutable payoutToken;
    IUsdPriceOracle public immutable priceOracle;
    IEncounterWeights public immutable encounterLedger;
    uint256 public immutable payoutScale;

    address public marketOperator;
    address public protocolTreasury;

    /// @notice Sum of donation values when deposited, scaled to 18 decimals.
    uint256 public protectedFloorUsd18;
    /// @notice Non-decreasing book value. No claim or payout reduces this number.
    uint256 public perpetualCommonsDebtUsd18;
    /// @notice Highest gross reserve value already processed for appreciation.
    uint256 public highWaterMarkUsd18;
    uint256 public cumulativeHarvestedUsd18;

    uint256 public unallocatedPayoutUnits;
    uint256 public committedClaimUnits;
    uint256 public commonsConversionUnits;
    uint256 public protocolReserveUnits;

    mapping(address => uint256) public donorReputationWei;
    mapping(address => uint256) public claimable;
    mapping(uint64 => bool) public epochFinalized;
    mapping(bytes32 => bool) public settledAgentJob;

    uint256 private _locked = 1;

    event DonationRecorded(
        address indexed donor,
        uint256 ethAmount,
        uint256 depositPriceUsd8,
        uint256 protectedValueUsd18
    );
    event RevenueFunded(address indexed funder, uint256 payoutUnits);
    event AppreciationHarvested(
        address indexed swapper,
        uint256 ethAmount,
        uint256 payoutUnitsReceived,
        uint256 grossReservePeakUsd18
    );
    event EpochFinalized(uint64 indexed epoch, uint256 payoutUnits, uint256 totalWeight);
    event ClaimCreated(uint64 indexed epoch, address indexed claimant, uint256 payoutUnits, uint256 weight);
    event Claimed(address indexed claimant, uint256 payoutUnits);
    event AgentJobSettled(
        bytes32 indexed jobId,
        address indexed payer,
        address indexed aiPayee,
        address humanPayee,
        uint256 grossPayoutUnits
    );
    event CommonsRevenueConverted(uint256 payoutUnits, uint256 ethReceived);
    event ProtocolReserveWithdrawn(address indexed treasury, uint256 payoutUnits);
    event MarketOperatorChanged(address indexed operator);
    event ProtocolTreasuryChanged(address indexed treasury);

    error OnlyAdmin();
    error OnlyMarketOperator();
    error ZeroAddress();
    error ZeroAmount();
    error InvalidDecimals();
    error InvalidPrice();
    error TransferFailed();
    error EthTransferFailed();
    error ProtectedFloorWouldBreak();
    error HarvestExceedsAvailableGain();
    error EpochStillOpen();
    error EpochAlreadyFinalized();
    error NothingToClaim();
    error JobAlreadySettled();
    error AiBountyBelowComputeFloor();
    error InsufficientEthForConversion();
    error ReentrantCall();

    constructor(
        address payoutTokenAddress,
        uint8 payoutTokenDecimals,
        address oracleAddress,
        address ledgerAddress,
        address initialMarketOperator,
        address initialProtocolTreasury
    ) payable {
        if (payoutTokenAddress == address(0) || oracleAddress == address(0) || ledgerAddress == address(0)) {
            revert ZeroAddress();
        }
        if (payoutTokenDecimals > 18) revert InvalidDecimals();
        admin = msg.sender;
        payoutToken = IERC20Payout(payoutTokenAddress);
        priceOracle = IUsdPriceOracle(oracleAddress);
        encounterLedger = IEncounterWeights(ledgerAddress);
        payoutScale = 10 ** uint256(payoutTokenDecimals);
        marketOperator = initialMarketOperator == address(0) ? msg.sender : initialMarketOperator;
        protocolTreasury = initialProtocolTreasury == address(0) ? msg.sender : initialProtocolTreasury;
        if (msg.value > 0) _recordDonation(msg.sender, msg.value);
    }

    modifier onlyAdmin() {
        if (msg.sender != admin) revert OnlyAdmin();
        _;
    }

    modifier onlyMarketOperator() {
        if (msg.sender != marketOperator) revert OnlyMarketOperator();
        _;
    }

    modifier nonReentrant() {
        if (_locked != 1) revert ReentrantCall();
        _locked = 2;
        _;
        _locked = 1;
    }

    receive() external payable {
        _recordDonation(msg.sender, msg.value);
    }

    /// @notice Donates ETH permanently. A donor receives recognition, not withdrawal rights.
    function donate() external payable {
        _recordDonation(msg.sender, msg.value);
    }

    function reserveValueUsd18() public view returns (uint256) {
        return _ethValueUsd18(address(this).balance, _price());
    }

    function reserveBufferUsd18() public view returns (uint256) {
        uint256 value = reserveValueUsd18();
        return value > protectedFloorUsd18 ? value - protectedFloorUsd18 : 0;
    }

    /// @notice Fixed 25% reference implementation. The browser also demonstrates
    ///         a more conservative logarithmic alternative for economic testing.
    function previewAppreciationHarvestUsd18() public view returns (uint256) {
        uint256 value = reserveValueUsd18();
        if (value <= highWaterMarkUsd18 || value <= protectedFloorUsd18) return 0;
        uint256 gain = value - highWaterMarkUsd18;
        uint256 proposed = gain * APPRECIATION_SHARE_BPS / BPS;
        uint256 buffer = value - protectedFloorUsd18;
        return proposed < buffer ? proposed : buffer;
    }

    /// @notice Atomic OTC-style exchange: the swapper supplies payout tokens and
    ///         receives only ETH appreciation allowed by the protected-floor rule.
    function harvestAppreciation(uint256 ethAmount) external nonReentrant returns (uint256 payoutUnits) {
        if (ethAmount == 0) revert ZeroAmount();
        uint256 price = _price();
        uint256 grossPeak = _ethValueUsd18(address(this).balance, price);
        uint256 harvestUsd18 = _ethValueUsd18(ethAmount, price);
        if (harvestUsd18 > previewAppreciationHarvestUsd18()) revert HarvestExceedsAvailableGain();
        uint256 valueAfter = _ethValueUsd18(address(this).balance - ethAmount, price);
        if (valueAfter < protectedFloorUsd18) revert ProtectedFloorWouldBreak();

        payoutUnits = _ceilDiv(harvestUsd18 * payoutScale, 1e18);
        _safeTransferFrom(msg.sender, address(this), payoutUnits);
        unallocatedPayoutUnits += payoutUnits;
        highWaterMarkUsd18 = grossPeak > highWaterMarkUsd18 ? grossPeak : highWaterMarkUsd18;
        cumulativeHarvestedUsd18 += harvestUsd18;

        (bool sent, ) = payable(msg.sender).call{value: ethAmount}("");
        if (!sent) revert EthTransferFailed();
        emit AppreciationHarvested(msg.sender, ethAmount, payoutUnits, grossPeak);
    }

    /// @notice Adds staking, agent or other external payout-token revenue.
    function fundRevenue(uint256 payoutUnits) external nonReentrant {
        if (payoutUnits == 0) revert ZeroAmount();
        _safeTransferFrom(msg.sender, address(this), payoutUnits);
        unallocatedPayoutUnits += payoutUnits;
        emit RevenueFunded(msg.sender, payoutUnits);
    }

    /// @notice Finalizes a completed UTC epoch. Anybody may call and pay the gas.
    /// @dev Claims remain pull-based, so each claimant initiates their own payout.
    function finalizeEpoch(uint64 epoch) external nonReentrant {
        if (epoch >= encounterLedger.currentEpoch()) revert EpochStillOpen();
        if (epochFinalized[epoch]) revert EpochAlreadyFinalized();
        epochFinalized[epoch] = true;

        address[] memory participants = encounterLedger.participantsForEpoch(epoch);
        uint256[] memory weights = new uint256[](participants.length);
        uint256 totalWeight;
        for (uint256 i = 0; i < participants.length; i++) {
            uint256 weight = encounterLedger.payoutWeight(epoch, participants[i]);
            weights[i] = weight;
            totalWeight += weight;
        }

        uint256 pool = unallocatedPayoutUnits;
        if (pool == 0 || totalWeight == 0) {
            emit EpochFinalized(epoch, 0, totalWeight);
            return;
        }

        unallocatedPayoutUnits = 0;
        uint256 allocated;
        for (uint256 i = 0; i < participants.length; i++) {
            if (weights[i] == 0) continue;
            uint256 share = pool * weights[i] / totalWeight;
            if (share == 0) continue;
            claimable[participants[i]] += share;
            allocated += share;
            emit ClaimCreated(epoch, participants[i], share, weights[i]);
        }
        committedClaimUnits += allocated;
        unallocatedPayoutUnits = pool - allocated;
        emit EpochFinalized(epoch, allocated, totalWeight);
    }

    function claim() external nonReentrant {
        uint256 amount = claimable[msg.sender];
        if (amount == 0) revert NothingToClaim();
        claimable[msg.sender] = 0;
        committedClaimUnits -= amount;
        _safeTransfer(msg.sender, amount);
        emit Claimed(msg.sender, amount);
    }

    /// @notice Requester-funded agent settlement. No ETH is withdrawn from the Commons.
    /// @dev The bid must be high enough for the hard-coded 60% AI share to cover
    ///      the declared compute floor. Ten percent awaits conversion into donated ETH.
    function settleAgentJob(
        bytes32 jobId,
        address aiPayee,
        address humanPayee,
        uint256 grossPayoutUnits,
        uint256 aiComputeFloorUnits
    ) external nonReentrant {
        if (settledAgentJob[jobId]) revert JobAlreadySettled();
        if (aiPayee == address(0) || humanPayee == address(0)) revert ZeroAddress();
        if (grossPayoutUnits == 0) revert ZeroAmount();

        uint256 aiShare = grossPayoutUnits * AI_SHARE_BPS / BPS;
        if (aiShare < aiComputeFloorUnits) revert AiBountyBelowComputeFloor();
        uint256 humanShare = grossPayoutUnits * HUMAN_SHARE_BPS / BPS;
        uint256 commonsShare = grossPayoutUnits * COMMONS_SHARE_BPS / BPS;
        uint256 protocolShare = grossPayoutUnits - aiShare - humanShare - commonsShare;

        settledAgentJob[jobId] = true;
        _safeTransferFrom(msg.sender, address(this), grossPayoutUnits);
        claimable[aiPayee] += aiShare;
        claimable[humanPayee] += humanShare;
        committedClaimUnits += aiShare + humanShare;
        commonsConversionUnits += commonsShare;
        protocolReserveUnits += protocolShare;
        emit AgentJobSettled(jobId, msg.sender, aiPayee, humanPayee, grossPayoutUnits);
    }

    /// @notice Market operator swaps the ring-fenced 10% agent share for ETH.
    ///         The payout tokens leave while at least equal oracle-valued ETH enters.
    function convertCommonsRevenueToEth(uint256 payoutUnits) external payable onlyMarketOperator nonReentrant {
        if (payoutUnits == 0 || payoutUnits > commonsConversionUnits) revert ZeroAmount();
        uint256 usd18 = payoutUnits * 1e18 / payoutScale;
        uint256 requiredEth = _ceilDiv(usd18 * 1e8, _price());
        if (msg.value < requiredEth) revert InsufficientEthForConversion();
        commonsConversionUnits -= payoutUnits;
        _safeTransfer(msg.sender, payoutUnits);
        _recordDonation(address(this), msg.value);
        emit CommonsRevenueConverted(payoutUnits, msg.value);
    }

    function withdrawProtocolReserve(uint256 payoutUnits) external onlyAdmin nonReentrant {
        if (payoutUnits == 0 || payoutUnits > protocolReserveUnits) revert ZeroAmount();
        protocolReserveUnits -= payoutUnits;
        _safeTransfer(protocolTreasury, payoutUnits);
        emit ProtocolReserveWithdrawn(protocolTreasury, payoutUnits);
    }

    function minimumViableGrossBid(uint256 aiComputeFloorUnits) external pure returns (uint256) {
        return _ceilDiv(aiComputeFloorUnits * BPS, AI_SHARE_BPS);
    }

    function setMarketOperator(address operator) external onlyAdmin {
        if (operator == address(0)) revert ZeroAddress();
        marketOperator = operator;
        emit MarketOperatorChanged(operator);
    }

    function setProtocolTreasury(address treasury) external onlyAdmin {
        if (treasury == address(0)) revert ZeroAddress();
        protocolTreasury = treasury;
        emit ProtocolTreasuryChanged(treasury);
    }

    function accountedPayoutUnits() external view returns (uint256) {
        return unallocatedPayoutUnits + committedClaimUnits + commonsConversionUnits + protocolReserveUnits;
    }

    function _recordDonation(address donor, uint256 amount) private {
        if (amount == 0) revert ZeroAmount();
        uint256 price = _price();
        uint256 valueUsd18 = _ethValueUsd18(amount, price);
        protectedFloorUsd18 += valueUsd18;
        perpetualCommonsDebtUsd18 += valueUsd18;
        highWaterMarkUsd18 += valueUsd18;
        donorReputationWei[donor] += amount;
        emit DonationRecorded(donor, amount, price, valueUsd18);
    }

    function _price() private view returns (uint256 price) {
        price = priceOracle.latestPriceUsd8();
        if (price == 0) revert InvalidPrice();
    }

    function _ethValueUsd18(uint256 weiAmount, uint256 priceUsd8) private pure returns (uint256) {
        return weiAmount * priceUsd8 / 1e8;
    }

    function _safeTransfer(address to, uint256 amount) private {
        if (!payoutToken.transfer(to, amount)) revert TransferFailed();
    }

    function _safeTransferFrom(address from, address to, uint256 amount) private {
        if (!payoutToken.transferFrom(from, to, amount)) revert TransferFailed();
    }

    function _ceilDiv(uint256 numerator, uint256 denominator) private pure returns (uint256) {
        return numerator == 0 ? 0 : (numerator - 1) / denominator + 1;
    }
}
