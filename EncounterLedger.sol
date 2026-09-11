// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title EncounterLedger
/// @notice Experimental Proof-of-Encounter accounting for humans and AI agents.
/// @dev Hackathon reference code. It is not an ERC-20 and has not been audited.
contract EncounterLedger {
    enum Status {
        None,
        Proposed,
        Confirmed,
        Cancelled
    }

    enum ActorKind {
        None,
        Human,
        Agent
    }

    struct Encounter {
        address contributor;
        address recipient;
        address witness;
        bytes32 aiDigest;
        bytes32 locationCommitment;
        uint64 proposedAt;
        uint64 confirmedAt;
        uint64 epoch;
        bool recipientConfirmed;
        bool witnessConfirmed;
        Status status;
    }

    struct EpochStats {
        int32 balance;
        uint32 contributions;
        uint32 receipts;
        uint32 uniqueCounterparties;
    }

    uint64 public constant EPOCH_LENGTH = 1 days;
    int32 public constant DAILY_FLOOR = -1;
    uint256 public constant WEIGHT_SCALE = 1e6;

    address public immutable registrar;
    uint256 public confirmedEncounterCount;

    mapping(address => ActorKind) public actorKind;
    mapping(address => uint64) public nonces;
    mapping(bytes32 => Encounter) public encounters;
    mapping(uint64 => mapping(address => EpochStats)) private _epochStats;
    mapping(uint64 => address[]) private _epochParticipants;
    mapping(uint64 => mapping(address => bool)) private _joinedEpoch;
    mapping(uint64 => mapping(address => mapping(address => bool))) private _seenCounterparty;
    mapping(uint64 => mapping(bytes32 => uint32)) public pairEncounterCount;
    mapping(address => uint256) public reputationMicros;

    event ActorRegistrationChanged(address indexed actor, ActorKind kind);
    event EncounterProposed(
        bytes32 indexed encounterId,
        address indexed contributor,
        address indexed recipient,
        address witness,
        bytes32 aiDigest,
        bytes32 locationCommitment,
        uint64 epoch
    );
    event EncounterConfirmation(bytes32 indexed encounterId, address indexed confirmer, bool isWitness);
    event EncounterConfirmed(
        bytes32 indexed encounterId,
        address indexed contributor,
        address indexed recipient,
        address witness,
        int32 contributorBalance,
        int32 recipientBalance,
        uint32 pairRepeat,
        uint64 confirmedAt
    );
    event EncounterCancelled(bytes32 indexed encounterId);

    error OnlyRegistrar();
    error ActorNotRegistered(address actor);
    error HumanWitnessRequired();
    error WitnessMustBeIndependent();
    error SameParticipant();
    error EmptyDigest();
    error EncounterNotProposed();
    error NotRequiredConfirmer();
    error AlreadyConfirmed();
    error OnlyParticipantCanCancel();
    error DailyFloorReached();
    error EncounterExpired();

    constructor(address initialRegistrar) {
        registrar = initialRegistrar == address(0) ? msg.sender : initialRegistrar;
        actorKind[registrar] = ActorKind.Human;
        emit ActorRegistrationChanged(registrar, ActorKind.Human);
    }

    modifier onlyRegistered(address actor) {
        if (actorKind[actor] == ActorKind.None) revert ActorNotRegistered(actor);
        _;
    }

    function currentEpoch() public view returns (uint64) {
        return uint64(block.timestamp / EPOCH_LENGTH);
    }

    function balanceOf(address actor) external view returns (int32) {
        return _epochStats[currentEpoch()][actor].balance;
    }

    function epochStats(uint64 epoch, address actor) external view returns (EpochStats memory) {
        return _epochStats[epoch][actor];
    }

    function participantsForEpoch(uint64 epoch) external view returns (address[] memory) {
        return _epochParticipants[epoch];
    }

    /// @notice Registers either a unique human account or a separately identified AI agent.
    /// @dev Replace this centralized hook with personhood and agent-attestation systems.
    function setActor(address actor, ActorKind kind) external {
        if (msg.sender != registrar) revert OnlyRegistrar();
        actorKind[actor] = kind;
        emit ActorRegistrationChanged(actor, kind);
    }

    /// @notice Proposes an encounter; proposal is the contributor's confirmation.
    /// @param witness Set to address(0) for a human-to-human exchange. If either actor
    ///        is an agent, witness must be a distinct registered human.
    function proposeEncounter(
        address recipient,
        address witness,
        bytes32 aiDigest,
        bytes32 locationCommitment
    ) external onlyRegistered(msg.sender) onlyRegistered(recipient) returns (bytes32 encounterId) {
        if (recipient == msg.sender) revert SameParticipant();
        if (aiDigest == bytes32(0)) revert EmptyDigest();

        bool involvesAgent = actorKind[msg.sender] == ActorKind.Agent || actorKind[recipient] == ActorKind.Agent;
        if (involvesAgent) {
            if (witness == address(0) || actorKind[witness] != ActorKind.Human) {
                revert HumanWitnessRequired();
            }
            if (witness == msg.sender || witness == recipient) revert WitnessMustBeIndependent();
        } else if (witness != address(0)) {
            if (actorKind[witness] != ActorKind.Human) revert HumanWitnessRequired();
            if (witness == msg.sender || witness == recipient) revert WitnessMustBeIndependent();
        }

        uint64 nonce = ++nonces[msg.sender];
        uint64 epoch = currentEpoch();
        encounterId = keccak256(
            abi.encode(block.chainid, address(this), msg.sender, recipient, witness, nonce, aiDigest, epoch)
        );

        encounters[encounterId] = Encounter({
            contributor: msg.sender,
            recipient: recipient,
            witness: witness,
            aiDigest: aiDigest,
            locationCommitment: locationCommitment,
            proposedAt: uint64(block.timestamp),
            confirmedAt: 0,
            epoch: epoch,
            recipientConfirmed: false,
            witnessConfirmed: witness == address(0),
            status: Status.Proposed
        });

        emit EncounterProposed(
            encounterId,
            msg.sender,
            recipient,
            witness,
            aiDigest,
            locationCommitment,
            epoch
        );
    }

    /// @notice Recipient and, when required, witness confirm in separate transactions.
    ///         The encounter finalizes when all required confirmations exist.
    function confirmEncounter(bytes32 encounterId) external {
        Encounter storage encounter = encounters[encounterId];
        if (encounter.status != Status.Proposed) revert EncounterNotProposed();
        if (encounter.epoch != currentEpoch()) revert EncounterExpired();
        if (actorKind[encounter.contributor] == ActorKind.None) {
            revert ActorNotRegistered(encounter.contributor);
        }
        if (actorKind[encounter.recipient] == ActorKind.None) {
            revert ActorNotRegistered(encounter.recipient);
        }

        bool isWitness;
        if (msg.sender == encounter.recipient) {
            if (encounter.recipientConfirmed) revert AlreadyConfirmed();
            encounter.recipientConfirmed = true;
        } else if (msg.sender == encounter.witness && encounter.witness != address(0)) {
            if (encounter.witnessConfirmed) revert AlreadyConfirmed();
            encounter.witnessConfirmed = true;
            isWitness = true;
        } else {
            revert NotRequiredConfirmer();
        }

        if (actorKind[msg.sender] == ActorKind.None) revert ActorNotRegistered(msg.sender);
        emit EncounterConfirmation(encounterId, msg.sender, isWitness);

        if (encounter.recipientConfirmed && encounter.witnessConfirmed) {
            _finalizeEncounter(encounterId, encounter);
        }
    }

    function cancelEncounter(bytes32 encounterId) external {
        Encounter storage encounter = encounters[encounterId];
        if (encounter.status != Status.Proposed) revert EncounterNotProposed();
        if (
            msg.sender != encounter.contributor &&
            msg.sender != encounter.recipient &&
            msg.sender != encounter.witness
        ) revert OnlyParticipantCanCancel();
        encounter.status = Status.Cancelled;
        emit EncounterCancelled(encounterId);
    }

    /// @notice Diminishing payout weight for positive human participants.
    /// @dev weight = sqrt(net positive * unique counterparties / total encounters),
    ///      scaled by 1e6. Repeated pair activity therefore counts less than diverse activity.
    function payoutWeight(uint64 epoch, address actor) external view returns (uint256) {
        if (actorKind[actor] != ActorKind.Human) return 0;
        EpochStats memory stats = _epochStats[epoch][actor];
        if (stats.balance <= 0) return 0;
        uint256 total = uint256(stats.contributions) + uint256(stats.receipts);
        if (total == 0 || stats.uniqueCounterparties == 0) return 0;
        uint256 scaled = uint256(uint32(stats.balance)) * uint256(stats.uniqueCounterparties) * 1e12 / total;
        return _sqrt(scaled);
    }

    function pairKey(address actorA, address actorB) public pure returns (bytes32) {
        return uint160(actorA) < uint160(actorB)
            ? keccak256(abi.encode(actorA, actorB))
            : keccak256(abi.encode(actorB, actorA));
    }

    function _finalizeEncounter(bytes32 encounterId, Encounter storage encounter) private {
        EpochStats storage contributor = _epochStats[encounter.epoch][encounter.contributor];
        EpochStats storage recipient = _epochStats[encounter.epoch][encounter.recipient];
        if (recipient.balance <= DAILY_FLOOR) revert DailyFloorReached();

        _joinEpoch(encounter.epoch, encounter.contributor);
        _joinEpoch(encounter.epoch, encounter.recipient);
        contributor.balance += 1;
        contributor.contributions += 1;
        recipient.balance -= 1;
        recipient.receipts += 1;

        if (!_seenCounterparty[encounter.epoch][encounter.contributor][encounter.recipient]) {
            _seenCounterparty[encounter.epoch][encounter.contributor][encounter.recipient] = true;
            contributor.uniqueCounterparties += 1;
        }
        if (!_seenCounterparty[encounter.epoch][encounter.recipient][encounter.contributor]) {
            _seenCounterparty[encounter.epoch][encounter.recipient][encounter.contributor] = true;
            recipient.uniqueCounterparties += 1;
        }

        bytes32 key = pairKey(encounter.contributor, encounter.recipient);
        uint32 repeat = ++pairEncounterCount[encounter.epoch][key];
        reputationMicros[encounter.contributor] += WEIGHT_SCALE / _sqrt(repeat);

        encounter.status = Status.Confirmed;
        encounter.confirmedAt = uint64(block.timestamp);
        confirmedEncounterCount += 1;
        emit EncounterConfirmed(
            encounterId,
            encounter.contributor,
            encounter.recipient,
            encounter.witness,
            contributor.balance,
            recipient.balance,
            repeat,
            encounter.confirmedAt
        );
    }

    function _joinEpoch(uint64 epoch, address actor) private {
        if (!_joinedEpoch[epoch][actor]) {
            _joinedEpoch[epoch][actor] = true;
            _epochParticipants[epoch].push(actor);
        }
    }

    function _sqrt(uint256 value) private pure returns (uint256 result) {
        if (value == 0) return 0;
        uint256 estimate = (value + 1) / 2;
        result = value;
        while (estimate < result) {
            result = estimate;
            estimate = (value / estimate + estimate) / 2;
        }
    }
}
