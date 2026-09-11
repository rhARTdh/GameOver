// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title GameOverEncounter
/// @notice Records two-wallet encounters with daily, non-transferable positions.
/// @dev Experimental Sepolia MVP. This is not a token, payment contract, or audited software.
contract GameOverEncounter {
    enum Status {
        None,
        Proposed,
        Confirmed
    }

    struct Encounter {
        address provider;
        address beneficiary;
        bytes32 statementDigest;
        uint64 proposedAt;
        uint64 confirmedAt;
        uint64 epoch;
        Status status;
    }

    uint64 public constant EPOCH_LENGTH = 1 days;
    int32 public constant DAILY_RECEIVE_FLOOR = -1;

    uint256 public confirmedEncounterCount;

    mapping(bytes32 => Encounter) public encounters;
    mapping(address => uint256) public lifetimeProvided;
    mapping(address => uint256) public lifetimeReceived;

    mapping(address => int32) private _dailyPosition;
    mapping(address => uint64) private _positionEpoch;

    event EncounterProposed(
        bytes32 indexed encounterId,
        address indexed provider,
        address indexed beneficiary,
        bytes32 statementDigest,
        uint64 epoch,
        uint64 proposedAt
    );

    event EncounterConfirmed(
        bytes32 indexed encounterId,
        address indexed provider,
        address indexed beneficiary,
        int32 providerPosition,
        int32 beneficiaryPosition,
        uint64 epoch,
        uint64 confirmedAt
    );

    error EmptyEncounterId();
    error EmptyStatementDigest();
    error InvalidBeneficiary();
    error SameParticipant();
    error EncounterAlreadyExists();
    error EncounterNotProposed();
    error OnlyBeneficiaryCanConfirm();
    error EncounterExpired();
    error DailyReceiveLimitReached();

    /// @notice UTC day number since the Unix epoch.
    function currentEpoch() public view returns (uint64) {
        return uint64(block.timestamp / EPOCH_LENGTH);
    }

    /// @notice Timestamp of the next UTC midnight boundary.
    function nextResetAt() external view returns (uint64) {
        return (currentEpoch() + 1) * EPOCH_LENGTH;
    }

    /// @notice Current daily position. Stale stored values read as zero automatically.
    function balanceOf(address actor) public view returns (int32) {
        if (_positionEpoch[actor] != currentEpoch()) return 0;
        return _dailyPosition[actor];
    }

    /// @notice Whether an actor may receive another encounter in the current UTC day.
    function canReceive(address actor) external view returns (bool) {
        return balanceOf(actor) > DAILY_RECEIVE_FLOOR;
    }

    /// @notice Provider proposes an encounter. This transaction is the provider's confirmation.
    function proposeEncounter(
        bytes32 encounterId,
        address beneficiary,
        bytes32 statementDigest
    ) external {
        if (encounterId == bytes32(0)) revert EmptyEncounterId();
        if (statementDigest == bytes32(0)) revert EmptyStatementDigest();
        if (beneficiary == address(0)) revert InvalidBeneficiary();
        if (beneficiary == msg.sender) revert SameParticipant();
        if (encounters[encounterId].status != Status.None) {
            revert EncounterAlreadyExists();
        }

        uint64 epoch = currentEpoch();
        uint64 proposedAt = uint64(block.timestamp);

        encounters[encounterId] = Encounter({
            provider: msg.sender,
            beneficiary: beneficiary,
            statementDigest: statementDigest,
            proposedAt: proposedAt,
            confirmedAt: 0,
            epoch: epoch,
            status: Status.Proposed
        });

        emit EncounterProposed(
            encounterId,
            msg.sender,
            beneficiary,
            statementDigest,
            epoch,
            proposedAt
        );
    }

    /// @notice Beneficiary confirms the exact digest proposed during the same UTC day.
    function confirmEncounter(bytes32 encounterId) external {
        Encounter storage encounter = encounters[encounterId];
        if (encounter.status != Status.Proposed) revert EncounterNotProposed();
        if (msg.sender != encounter.beneficiary) revert OnlyBeneficiaryCanConfirm();
        if (encounter.epoch != currentEpoch()) revert EncounterExpired();

        _syncPosition(encounter.provider);
        _syncPosition(encounter.beneficiary);

        if (_dailyPosition[encounter.beneficiary] <= DAILY_RECEIVE_FLOOR) {
            revert DailyReceiveLimitReached();
        }

        _dailyPosition[encounter.provider] += 1;
        _dailyPosition[encounter.beneficiary] -= 1;
        lifetimeProvided[encounter.provider] += 1;
        lifetimeReceived[encounter.beneficiary] += 1;
        confirmedEncounterCount += 1;

        encounter.confirmedAt = uint64(block.timestamp);
        encounter.status = Status.Confirmed;

        emit EncounterConfirmed(
            encounterId,
            encounter.provider,
            encounter.beneficiary,
            _dailyPosition[encounter.provider],
            _dailyPosition[encounter.beneficiary],
            encounter.epoch,
            encounter.confirmedAt
        );
    }

    function _syncPosition(address actor) private {
        uint64 epoch = currentEpoch();
        if (_positionEpoch[actor] != epoch) {
            _positionEpoch[actor] = epoch;
            _dailyPosition[actor] = 0;
        }
    }
}
