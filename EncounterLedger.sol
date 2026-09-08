// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title EncounterLedger
/// @notice A hackathon prototype for recording mutually confirmed human encounters.
/// @dev This is experimental software, not an ERC-20 token and not production-audited.
///
/// Economic idea:
/// - Every verified human begins each UTC day at a zero encounter balance.
/// - Receiving value moves the recipient to -1 and the contributor to +1.
/// - A person already at -1 must contribute before receiving again that day.
/// - At the next "sunrise" (UTC epoch), effective balances return to zero.
/// - The future is therefore an endlessly renewing rule, not a vault of infinite coins.
/// - Encounter receipts remain permanently queryable even when balances expire.
contract EncounterLedger {
    enum Status {
        None,
        Proposed,
        Confirmed,
        Cancelled
    }

    struct Encounter {
        address contributor;
        address recipient;
        bytes32 aiDigest;
        bytes32 locationCommitment;
        uint64 proposedAt;
        uint64 confirmedAt;
        uint64 epoch;
        Status status;
    }

    uint64 public constant EPOCH_LENGTH = 1 days;
    int32 public constant DAILY_FLOOR = -1;

    address public immutable humanVerifier;
    uint256 public confirmedEncounterCount;

    mapping(address => bool) public verifiedHuman;
    mapping(address => uint64) public nonces;
    mapping(bytes32 => Encounter) public encounters;

    // These balances are lazily reset. balanceOf() returns zero after an epoch change
    // even before the next transaction writes the reset to storage.
    mapping(address => int32) private _balance;
    mapping(address => uint64) private _balanceEpoch;

    event HumanVerificationChanged(address indexed person, bool verified);

    event EncounterProposed(
        bytes32 indexed encounterId,
        address indexed contributor,
        address indexed recipient,
        bytes32 aiDigest,
        bytes32 locationCommitment,
        uint64 epoch
    );

    event EncounterConfirmed(
        bytes32 indexed encounterId,
        address indexed contributor,
        address indexed recipient,
        int32 contributorBalance,
        int32 recipientBalance,
        uint64 confirmedAt
    );

    event EncounterCancelled(bytes32 indexed encounterId);

    error OnlyHumanVerifier();
    error HumanNotVerified(address person);
    error SameParticipant();
    error EmptyDigest();
    error EncounterNotProposed();
    error OnlyRecipientCanConfirm();
    error OnlyParticipantCanCancel();
    error DailyFloorReached();
    error EncounterExpired();

    constructor(address verifier) {
        humanVerifier = verifier == address(0) ? msg.sender : verifier;
        verifiedHuman[humanVerifier] = true;
        emit HumanVerificationChanged(humanVerifier, true);
    }

    modifier onlyVerified(address person) {
        if (!verifiedHuman[person]) revert HumanNotVerified(person);
        _;
    }

    function currentEpoch() public view returns (uint64) {
        return uint64(block.timestamp / EPOCH_LENGTH);
    }

    /// @notice The spendable encounter balance for the current epoch.
    /// @dev Stale stored balances are presented as zero, implementing daily decay.
    function balanceOf(address person) public view returns (int32) {
        if (_balanceEpoch[person] != currentEpoch()) return 0;
        return _balance[person];
    }

    /// @notice Hackathon-only human verification hook.
    /// @dev Replace this centralized allowlist with the chosen proof-of-personhood
    ///      or attestation system before any real deployment.
    function setVerifiedHuman(address person, bool verified) external {
        if (msg.sender != humanVerifier) revert OnlyHumanVerifier();
        verifiedHuman[person] = verified;
        emit HumanVerificationChanged(person, verified);
    }

    /// @notice The contributor proposes a structured encounter and supplies the
    ///         AI/evidence digest plus a privacy-preserving location commitment.
    /// @dev This transaction is the contributor's on-chain confirmation.
    function proposeEncounter(
        address recipient,
        bytes32 aiDigest,
        bytes32 locationCommitment
    ) external onlyVerified(msg.sender) onlyVerified(recipient) returns (bytes32 encounterId) {
        if (recipient == msg.sender) revert SameParticipant();
        if (aiDigest == bytes32(0)) revert EmptyDigest();

        uint64 nonce = ++nonces[msg.sender];
        uint64 epoch = currentEpoch();

        encounterId = keccak256(
            abi.encode(
                block.chainid,
                address(this),
                msg.sender,
                recipient,
                nonce,
                aiDigest,
                epoch
            )
        );

        encounters[encounterId] = Encounter({
            contributor: msg.sender,
            recipient: recipient,
            aiDigest: aiDigest,
            locationCommitment: locationCommitment,
            proposedAt: uint64(block.timestamp),
            confirmedAt: 0,
            epoch: epoch,
            status: Status.Proposed
        });

        emit EncounterProposed(
            encounterId,
            msg.sender,
            recipient,
            aiDigest,
            locationCommitment,
            epoch
        );
    }

    /// @notice The recipient confirms the encounter. Only now does the daily
    ///         mutual-credit movement occur and the final receipt become permanent.
    function confirmEncounter(bytes32 encounterId) external {
        Encounter storage encounter = encounters[encounterId];
        if (encounter.status != Status.Proposed) revert EncounterNotProposed();
        if (msg.sender != encounter.recipient) revert OnlyRecipientCanConfirm();
        if (encounter.epoch != currentEpoch()) revert EncounterExpired();
        if (!verifiedHuman[msg.sender]) revert HumanNotVerified(msg.sender);
        if (!verifiedHuman[encounter.contributor]) {
            revert HumanNotVerified(encounter.contributor);
        }

        _syncBalance(encounter.contributor);
        _syncBalance(encounter.recipient);

        // Starting at zero, the recipient can receive once and move to -1.
        // To receive again before sunrise, they must first contribute and move up.
        if (_balance[encounter.recipient] <= DAILY_FLOOR) {
            revert DailyFloorReached();
        }

        _balance[encounter.contributor] += 1;
        _balance[encounter.recipient] -= 1;

        encounter.status = Status.Confirmed;
        encounter.confirmedAt = uint64(block.timestamp);
        confirmedEncounterCount += 1;

        emit EncounterConfirmed(
            encounterId,
            encounter.contributor,
            encounter.recipient,
            _balance[encounter.contributor],
            _balance[encounter.recipient],
            encounter.confirmedAt
        );
    }

    function cancelEncounter(bytes32 encounterId) external {
        Encounter storage encounter = encounters[encounterId];
        if (encounter.status != Status.Proposed) revert EncounterNotProposed();
        if (msg.sender != encounter.contributor && msg.sender != encounter.recipient) {
            revert OnlyParticipantCanCancel();
        }

        encounter.status = Status.Cancelled;
        emit EncounterCancelled(encounterId);
    }

    function _syncBalance(address person) private {
        uint64 epoch = currentEpoch();
        if (_balanceEpoch[person] != epoch) {
            _balanceEpoch[person] = epoch;
            _balance[person] = 0;
        }
    }
}
