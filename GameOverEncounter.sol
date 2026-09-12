// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title GameOverEncounter v4
/// @notice A Sepolia-only Proof-of-Encounter ledger with daily contribution
///         scoring, a permanent Genesis reserve and pull-based test payouts.
/// @dev Experimental and unaudited. The ETH/USD input is deliberately a
///      deployer-controlled simulation for this testnet iteration.
contract GameOverEncounter {
    uint256 public constant SEPOLIA_CHAIN_ID = 11_155_111;

    enum Status {
        None,
        Invited,
        Confirmed,
        Declined,
        Cancelled,
        Expired
    }

    struct Encounter {
        address contributor;
        address receiver;
        bytes32 statementDigest;
        uint64 proposedAt;
        uint64 confirmedAt;
        uint64 epoch;
        Status status;
    }

    struct Settlement {
        bool finalized;
        bool released;
        uint256 closePrice;
        uint256 pool;
        uint256 totalWeight;
        uint256 remaining;
        uint256 claimedWallets;
    }

    uint64 public constant EPOCH_LENGTH = 1 days;
    uint256 public constant GENESIS_TARGET = 0.01 ether;
    uint256 public constant WEIGHT_SCALE = 1e9;
    uint8 public constant PRICE_DECIMALS = 8;
    uint256 public constant INITIAL_HIGH_WATER_MARK = 3_000 * 1e8;

    address public immutable demoOperator;
    uint64 public immutable genesisEpoch;

    uint64 public nextEpochToFinalize;
    uint256 public permanentPrincipal;
    uint256 public totalAllocatedUnclaimed;
    uint256 public totalReservedBudgets;
    uint256 public commonsDebt;
    uint256 public confirmedEncounterCount;
    uint256 public highWaterMark = INITIAL_HIGH_WATER_MARK;

    mapping(bytes32 => Encounter) public encounters;
    mapping(address => uint256) public lifetimeContributed;
    mapping(address => uint256) public lifetimeReceived;

    mapping(uint64 => mapping(address => uint256)) public eligibleContributions;
    mapping(uint64 => mapping(address => uint256)) public contributionWeight;
    mapping(uint64 => uint256) public epochTotalWeight;
    mapping(uint64 => uint256) public epochContributorCount;
    mapping(uint64 => mapping(bytes32 => bool)) public pairCredited;
    mapping(address => uint64[]) private _contributorEpochs;

    mapping(uint64 => uint256) public epochBudget;
    mapping(uint64 => uint256) public mockEpochClosePrice;
    mapping(uint64 => Settlement) public settlements;
    mapping(uint64 => mapping(address => bool)) public payoutClaimed;

    uint256 private _claimLock = 1;

    event EncounterInvited(
        bytes32 indexed encounterId,
        address indexed contributor,
        address indexed receiver,
        bytes32 statementDigest,
        uint64 epoch,
        uint64 proposedAt
    );
    event EncounterConfirmed(
        bytes32 indexed encounterId,
        address indexed contributor,
        address indexed receiver,
        uint64 epoch,
        uint64 confirmedAt
    );
    event EncounterDeclined(bytes32 indexed encounterId, address indexed receiver);
    event EncounterCancelled(bytes32 indexed encounterId, address indexed contributor);
    event ContributionCredited(
        bytes32 indexed encounterId,
        address indexed contributor,
        address indexed receiver,
        uint64 epoch,
        uint256 dailyContributions,
        uint256 scaledWeight
    );
    event GenesisContributed(address indexed contributor, uint256 amount, uint256 permanentPrincipal);
    event PayoutPoolSeeded(address indexed funder, uint256 amount, uint256 availablePool);
    event EpochBudgetSet(uint64 indexed epoch, uint256 previousBudget, uint256 newBudget);
    event MockEpochCloseSet(uint64 indexed epoch, uint256 ethUsdPrice);
    event EpochFinalized(
        uint64 indexed epoch,
        bool released,
        uint256 closePrice,
        uint256 highWaterMark,
        uint256 pool,
        uint256 totalWeight
    );
    event PayoutClaimed(uint64 indexed epoch, address indexed contributor, uint256 amount);
    event RoundingDustReturned(uint64 indexed epoch, uint256 amount);

    error EmptyEncounterId();
    error SepoliaOnly(uint256 chainId);
    error EmptyStatementDigest();
    error InvalidReceiver();
    error SameParticipant();
    error EncounterAlreadyExists();
    error EncounterNotInvited();
    error OnlyContributorCanCancel();
    error OnlyReceiverCanRespond();
    error EncounterExpired();
    error PairAlreadyCredited();
    error EmptyDeposit();
    error UseNamedDepositFunction();
    error OnlyDemoOperator();
    error EpochAlreadyClosed();
    error EpochStillOpen();
    error EpochAlreadyFinalized();
    error EpochOutOfOrder(uint64 expected, uint64 received);
    error MissingMockClosePrice();
    error BudgetExceedsAvailablePool();
    error SettlementNotReleased();
    error NothingToClaim();
    error AlreadyClaimed();
    error EthTransferFailed();
    error ReentrantClaim();
    error MulDivOverflow();
    error IndexOutOfBounds();

    modifier onlyDemoOperator() {
        if (msg.sender != demoOperator) revert OnlyDemoOperator();
        _;
    }

    modifier nonReentrant() {
        if (_claimLock != 1) revert ReentrantClaim();
        _claimLock = 2;
        _;
        _claimLock = 1;
    }

    /// @notice The deployer controls only the explicitly simulated price and
    ///         epoch-budget inputs. The deployer cannot withdraw contract ETH.
    constructor() payable {
        if (block.chainid != SEPOLIA_CHAIN_ID) revert SepoliaOnly(block.chainid);
        demoOperator = msg.sender;
        genesisEpoch = currentEpoch();
        nextEpochToFinalize = genesisEpoch;
        if (msg.value > 0) {
            permanentPrincipal = msg.value;
            emit GenesisContributed(msg.sender, msg.value, msg.value);
        }
    }

    receive() external payable {
        revert UseNamedDepositFunction();
    }

    /// @notice UTC day number since the Unix epoch.
    function currentEpoch() public view returns (uint64) {
        return uint64(block.timestamp / EPOCH_LENGTH);
    }

    /// @notice Timestamp of the next Protocol Sunrise at 00:00 UTC.
    function nextSunriseAt() external view returns (uint64) {
        return (currentEpoch() + 1) * EPOCH_LENGTH;
    }

    /// @notice Today's payout-bearing contribution count for a wallet.
    function dailyContributions(address actor) external view returns (uint256) {
        return eligibleContributions[currentEpoch()][actor];
    }

    /// @notice Today's scaled square-root weight for a wallet.
    function dailyWeight(address actor) external view returns (uint256) {
        return contributionWeight[currentEpoch()][actor];
    }

    /// @notice Returns Expired for an unconfirmed invite from an earlier epoch.
    function encounterStatus(bytes32 encounterId) public view returns (Status) {
        Encounter storage encounter = encounters[encounterId];
        if (encounter.status == Status.Invited && encounter.epoch < currentEpoch()) {
            return Status.Expired;
        }
        return encounter.status;
    }

    /// @notice Contributor creates a one-directional, pre-addressed invite.
    /// @dev This transaction is the contributor's on-chain confirmation.
    function proposeEncounter(
        bytes32 encounterId,
        address receiver,
        bytes32 statementDigest
    ) external {
        if (encounterId == bytes32(0)) revert EmptyEncounterId();
        if (statementDigest == bytes32(0)) revert EmptyStatementDigest();
        if (receiver == address(0)) revert InvalidReceiver();
        if (receiver == msg.sender) revert SameParticipant();
        if (encounters[encounterId].status != Status.None) revert EncounterAlreadyExists();

        uint64 epoch = currentEpoch();
        if (pairCredited[epoch][_pairKey(msg.sender, receiver)]) revert PairAlreadyCredited();

        uint64 proposedAt = uint64(block.timestamp);
        encounters[encounterId] = Encounter({
            contributor: msg.sender,
            receiver: receiver,
            statementDigest: statementDigest,
            proposedAt: proposedAt,
            confirmedAt: 0,
            epoch: epoch,
            status: Status.Invited
        });

        emit EncounterInvited(
            encounterId,
            msg.sender,
            receiver,
            statementDigest,
            epoch,
            proposedAt
        );
    }

    /// @notice The named receiver confirms the same digest before Protocol Sunrise.
    function confirmEncounter(bytes32 encounterId) external {
        Encounter storage encounter = encounters[encounterId];
        if (encounter.status != Status.Invited) revert EncounterNotInvited();
        if (msg.sender != encounter.receiver) revert OnlyReceiverCanRespond();
        if (encounter.epoch != currentEpoch()) revert EncounterExpired();

        bytes32 pairKey = _pairKey(encounter.contributor, encounter.receiver);
        if (pairCredited[encounter.epoch][pairKey]) revert PairAlreadyCredited();
        pairCredited[encounter.epoch][pairKey] = true;

        uint256 previousCount = eligibleContributions[encounter.epoch][encounter.contributor];
        uint256 previousWeight = contributionWeight[encounter.epoch][encounter.contributor];
        uint256 newCount = previousCount + 1;
        uint256 newWeight = _scaledSqrt(newCount);

        eligibleContributions[encounter.epoch][encounter.contributor] = newCount;
        contributionWeight[encounter.epoch][encounter.contributor] = newWeight;
        epochTotalWeight[encounter.epoch] += newWeight - previousWeight;

        if (previousCount == 0) {
            epochContributorCount[encounter.epoch] += 1;
            _contributorEpochs[encounter.contributor].push(encounter.epoch);
        }

        lifetimeContributed[encounter.contributor] += 1;
        lifetimeReceived[encounter.receiver] += 1;
        commonsDebt += 1;
        confirmedEncounterCount += 1;

        encounter.confirmedAt = uint64(block.timestamp);
        encounter.status = Status.Confirmed;

        emit EncounterConfirmed(
            encounterId,
            encounter.contributor,
            encounter.receiver,
            encounter.epoch,
            encounter.confirmedAt
        );
        emit ContributionCredited(
            encounterId,
            encounter.contributor,
            encounter.receiver,
            encounter.epoch,
            newCount,
            newWeight
        );
    }

    /// @notice Contributor cancels an active invite before confirmation.
    function cancelEncounter(bytes32 encounterId) external {
        Encounter storage encounter = encounters[encounterId];
        if (encounter.status != Status.Invited) revert EncounterNotInvited();
        if (msg.sender != encounter.contributor) revert OnlyContributorCanCancel();
        if (encounter.epoch != currentEpoch()) revert EncounterExpired();
        encounter.status = Status.Cancelled;
        emit EncounterCancelled(encounterId, msg.sender);
    }

    /// @notice Receiver declines an active invite before Protocol Sunrise.
    function declineEncounter(bytes32 encounterId) external {
        Encounter storage encounter = encounters[encounterId];
        if (encounter.status != Status.Invited) revert EncounterNotInvited();
        if (msg.sender != encounter.receiver) revert OnlyReceiverCanRespond();
        if (encounter.epoch != currentEpoch()) revert EncounterExpired();
        encounter.status = Status.Declined;
        emit EncounterDeclined(encounterId, msg.sender);
    }

    /// @notice Permanently adds Sepolia ETH to the non-withdrawable Genesis reserve.
    /// @dev This earns no contribution point and can never fund an allocation.
    function contributeToGenesis() external payable {
        if (msg.value == 0) revert EmptyDeposit();
        permanentPrincipal += msg.value;
        emit GenesisContributed(msg.sender, msg.value, permanentPrincipal);
        _assertAccountingInvariant();
    }

    /// @notice Adds spendable Sepolia test ETH to the separate payout pool.
    /// @dev This is not a Genesis contribution and earns no contribution point.
    function seedPayoutPool() external payable {
        if (msg.value == 0) revert EmptyDeposit();
        emit PayoutPoolSeeded(msg.sender, msg.value, availablePool());
        _assertAccountingInvariant();
    }

    /// @notice ETH not protected as permanent principal, reserved budgets or claims.
    function availablePool() public view returns (uint256) {
        uint256 protectedBalance = permanentPrincipal + totalAllocatedUnclaimed + totalReservedBudgets;
        uint256 balance = address(this).balance;
        return balance > protectedBalance ? balance - protectedBalance : 0;
    }

    function accountingInvariantHolds() external view returns (bool) {
        return address(this).balance >= permanentPrincipal + totalAllocatedUnclaimed + totalReservedBudgets;
    }

    /// @notice Earmarks an already funded test-ETH budget before its epoch closes.
    function setEpochBudget(uint64 epoch, uint256 amount) external onlyDemoOperator {
        if (epoch < currentEpoch()) revert EpochAlreadyClosed();
        if (settlements[epoch].finalized) revert EpochAlreadyFinalized();

        uint256 previousBudget = epochBudget[epoch];
        uint256 maximum = availablePool() + previousBudget;
        if (amount > maximum) revert BudgetExceedsAvailablePool();

        totalReservedBudgets = totalReservedBudgets - previousBudget + amount;
        epochBudget[epoch] = amount;
        emit EpochBudgetSet(epoch, previousBudget, amount);
        _assertAccountingInvariant();
    }

    /// @notice Supplies the explicitly simulated ETH/USD close for a finished epoch.
    function setMockEpochClosePrice(uint64 epoch, uint256 ethUsdPrice)
        external
        onlyDemoOperator
    {
        if (epoch >= currentEpoch()) revert EpochStillOpen();
        if (settlements[epoch].finalized) revert EpochAlreadyFinalized();
        if (ethUsdPrice == 0) revert MissingMockClosePrice();
        mockEpochClosePrice[epoch] = ethUsdPrice;
        emit MockEpochCloseSet(epoch, ethUsdPrice);
    }

    /// @notice Anyone may finalize a finished epoch once the simulated close exists.
    /// @dev The whole pre-set epoch budget is released only at a new high-water mark.
    function finalizeEpoch(uint64 epoch) external {
        if (epoch >= currentEpoch()) revert EpochStillOpen();
        if (epoch != nextEpochToFinalize) {
            revert EpochOutOfOrder(nextEpochToFinalize, epoch);
        }

        Settlement storage settlement = settlements[epoch];
        if (settlement.finalized) revert EpochAlreadyFinalized();

        uint256 closePrice = mockEpochClosePrice[epoch];
        if (closePrice == 0) revert MissingMockClosePrice();

        uint256 budget = epochBudget[epoch];
        uint256 totalWeight = epochTotalWeight[epoch];
        totalReservedBudgets -= budget;
        epochBudget[epoch] = 0;

        bool appreciated = closePrice > highWaterMark;
        if (appreciated) highWaterMark = closePrice;

        bool released = appreciated && totalWeight > 0 && budget > 0;
        uint256 releasedPool;
        if (released) {
            releasedPool = budget;
            totalAllocatedUnclaimed += budget;
        }

        settlement.finalized = true;
        settlement.released = released;
        settlement.closePrice = closePrice;
        settlement.pool = releasedPool;
        settlement.totalWeight = totalWeight;
        settlement.remaining = releasedPool;
        nextEpochToFinalize = epoch + 1;

        emit EpochFinalized(
            epoch,
            released,
            closePrice,
            highWaterMark,
            releasedPool,
            totalWeight
        );
        _assertAccountingInvariant();
    }

    /// @notice Full, unclaimed allocation for one contributor and epoch.
    function claimable(uint64 epoch, address contributor) public view returns (uint256) {
        Settlement storage settlement = settlements[epoch];
        if (!settlement.finalized || !settlement.released || payoutClaimed[epoch][contributor]) {
            return 0;
        }
        uint256 userWeight = contributionWeight[epoch][contributor];
        if (userWeight == 0 || settlement.totalWeight == 0) return 0;
        return _mulDiv(settlement.pool, userWeight, settlement.totalWeight);
    }

    /// @notice Pulls the caller's complete allocation for one epoch.
    function claim(uint64 epoch) external nonReentrant {
        Settlement storage settlement = settlements[epoch];
        if (!settlement.finalized || !settlement.released) revert SettlementNotReleased();
        if (payoutClaimed[epoch][msg.sender]) revert AlreadyClaimed();
        if (contributionWeight[epoch][msg.sender] == 0) revert NothingToClaim();

        uint256 amount = _mulDiv(
            settlement.pool,
            contributionWeight[epoch][msg.sender],
            settlement.totalWeight
        );

        payoutClaimed[epoch][msg.sender] = true;
        settlement.claimedWallets += 1;
        settlement.remaining -= amount;
        totalAllocatedUnclaimed -= amount;

        uint256 dust;
        if (settlement.claimedWallets == epochContributorCount[epoch]) {
            dust = settlement.remaining;
            settlement.remaining = 0;
            totalAllocatedUnclaimed -= dust;
            if (dust > 0) emit RoundingDustReturned(epoch, dust);
        }

        emit PayoutClaimed(epoch, msg.sender, amount);
        if (amount > 0) {
            (bool sent, ) = payable(msg.sender).call{value: amount}("");
            if (!sent) revert EthTransferFailed();
        }
        _assertAccountingInvariant();
    }

    function contributorEpochCount(address contributor) external view returns (uint256) {
        return _contributorEpochs[contributor].length;
    }

    function contributorEpochAt(address contributor, uint256 index) external view returns (uint64) {
        if (index >= _contributorEpochs[contributor].length) revert IndexOutOfBounds();
        return _contributorEpochs[contributor][index];
    }

    function _pairKey(address contributor, address receiver) private pure returns (bytes32) {
        return keccak256(abi.encode(contributor, receiver));
    }

    function _scaledSqrt(uint256 count) private pure returns (uint256) {
        return _sqrt(count * WEIGHT_SCALE * WEIGHT_SCALE);
    }

    function _sqrt(uint256 value) private pure returns (uint256 result) {
        if (value == 0) return 0;
        result = 1 << (_log2(value) >> 1);
        unchecked {
            result = (result + value / result) >> 1;
            result = (result + value / result) >> 1;
            result = (result + value / result) >> 1;
            result = (result + value / result) >> 1;
            result = (result + value / result) >> 1;
            result = (result + value / result) >> 1;
            result = (result + value / result) >> 1;
            uint256 roundedDown = value / result;
            return result < roundedDown ? result : roundedDown;
        }
    }

    function _log2(uint256 value) private pure returns (uint256 result) {
        unchecked {
            if (value >> 128 > 0) { value >>= 128; result += 128; }
            if (value >> 64 > 0) { value >>= 64; result += 64; }
            if (value >> 32 > 0) { value >>= 32; result += 32; }
            if (value >> 16 > 0) { value >>= 16; result += 16; }
            if (value >> 8 > 0) { value >>= 8; result += 8; }
            if (value >> 4 > 0) { value >>= 4; result += 4; }
            if (value >> 2 > 0) { value >>= 2; result += 2; }
            if (value >> 1 > 0) result += 1;
        }
    }

    /// @dev Full-precision x*y/denominator, rounded down.
    function _mulDiv(uint256 x, uint256 y, uint256 denominator)
        private
        pure
        returns (uint256 result)
    {
        unchecked {
            uint256 productLow;
            uint256 productHigh;
            assembly ("memory-safe") {
                let mm := mulmod(x, y, not(0))
                productLow := mul(x, y)
                productHigh := sub(sub(mm, productLow), lt(mm, productLow))
            }

            if (productHigh == 0) return productLow / denominator;
            if (denominator <= productHigh) revert MulDivOverflow();

            uint256 remainder;
            assembly ("memory-safe") {
                remainder := mulmod(x, y, denominator)
                productHigh := sub(productHigh, gt(remainder, productLow))
                productLow := sub(productLow, remainder)
            }

            uint256 twos = denominator & (0 - denominator);
            assembly ("memory-safe") {
                denominator := div(denominator, twos)
                productLow := div(productLow, twos)
                twos := add(div(sub(0, twos), twos), 1)
            }
            productLow |= productHigh * twos;

            uint256 inverse = (3 * denominator) ^ 2;
            inverse *= 2 - denominator * inverse;
            inverse *= 2 - denominator * inverse;
            inverse *= 2 - denominator * inverse;
            inverse *= 2 - denominator * inverse;
            inverse *= 2 - denominator * inverse;
            inverse *= 2 - denominator * inverse;
            result = productLow * inverse;
        }
    }

    function _assertAccountingInvariant() private view {
        assert(
            address(this).balance >=
                permanentPrincipal + totalAllocatedUnclaimed + totalReservedBudgets
        );
    }
}
