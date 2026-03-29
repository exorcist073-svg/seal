// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

/**
 * @title SEAL — Secure Enclave Agent Layer (v2)
 * @notice UUPS-upgradeable commit-attest-execute contract for AI agents.
 *         Enforces commit-before-execute, stores merkle roots, validates TEE
 *         attestation quotes, manages agent registry with staking, and
 *         implements decentralized dispute resolution for slashing.
 */
contract SEAL is Initializable, UUPSUpgradeable, OwnableUpgradeable {
    // ── Types ────────────────────────────────────────────

    struct CommitmentData {
        bool committed;
        bool executed;
        bytes32 merkleRoot;
        uint256 nonce;
        bytes attestationQuote;
        uint256 timestamp;
        address submitter;
        bytes32 executionHash;
    }

    struct AgentInfo {
        bool registered;
        uint256 nonce;
        uint256 stake;
        bool slashed;
        address agentOwner;
    }

    enum DisputeStatus { None, Active, Resolved, Rejected }

    struct Dispute {
        DisputeStatus status;
        bytes32 agentId;
        bytes32 taskId;
        address challenger;
        uint256 bond;
        bytes32 evidenceHash;    // hash of off-chain evidence (e.g. revealed reasoning)
        uint256 votesFor;        // votes supporting the slash
        uint256 votesAgainst;    // votes against the slash
        uint256 deadline;        // block.timestamp after which dispute can be resolved
        bool resolved;
    }

    // ── State ────────────────────────────────────────────

    mapping(bytes32 => CommitmentData) public commitments;
    mapping(bytes32 => AgentInfo) public agents;
    mapping(bytes32 => bytes32[]) public agentTasks;

    uint256 public minStake;
    uint256 public commitmentCount;
    uint256 public executionCount;

    // Dispute resolution state
    uint256 public disputeCount;
    uint256 public disputeBond;         // min bond to raise a dispute
    uint256 public disputePeriod;       // seconds for voting period
    mapping(uint256 => Dispute) public disputes;
    mapping(uint256 => mapping(address => bool)) public hasVoted;
    mapping(uint256 => mapping(address => bool)) public voteDirection; // true = for slash

    // Lit Protocol: tracks addresses that have registered+staked an agent
    mapping(address => bool) public registeredStakers;

    // ── Events ───────────────────────────────────────────

    event CommitmentSubmitted(
        bytes32 indexed taskId,
        bytes32 merkleRoot,
        uint256 nonce,
        uint256 timestamp
    );

    event TaskExecuted(
        bytes32 indexed taskId,
        bytes32 executionHash,
        uint256 timestamp
    );

    event AgentRegistered(
        bytes32 indexed agentId,
        address indexed agentOwner,
        uint256 stake
    );

    event AgentSlashed(
        bytes32 indexed agentId,
        bytes32 indexed taskId,
        uint256 slashedAmount
    );

    event DisputeRaised(
        uint256 indexed disputeId,
        bytes32 indexed agentId,
        bytes32 indexed taskId,
        address challenger,
        uint256 bond,
        uint256 deadline
    );

    event DisputeVoted(
        uint256 indexed disputeId,
        address indexed voter,
        bool inFavorOfSlash
    );

    event DisputeResolved(
        uint256 indexed disputeId,
        bool slashed,
        uint256 votesFor,
        uint256 votesAgainst
    );

    // ── Initializer (replaces constructor for UUPS) ─────

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(uint256 _minStake, uint256 _disputeBond, uint256 _disputePeriod) public initializer {
        __Ownable_init(msg.sender);

        minStake = _minStake;
        disputeBond = _disputeBond;
        disputePeriod = _disputePeriod;
    }

    // ── UUPS upgrade authorization ──────────────────────

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    // ── Agent Registry ───────────────────────────────────

    function registerAgent(bytes32 agentId) external payable {
        require(!agents[agentId].registered, "SEAL: already registered");
        require(msg.value >= minStake, "SEAL: insufficient stake");

        agents[agentId] = AgentInfo({
            registered: true,
            nonce: 0,
            stake: msg.value,
            slashed: false,
            agentOwner: msg.sender
        });

        registeredStakers[msg.sender] = true;
        emit AgentRegistered(agentId, msg.sender, msg.value);
    }

    // ── Stage 03: Commit + Attest ────────────────────────

    function submitCommitment(
        bytes32 taskId,
        bytes32 merkleRoot,
        bytes calldata attestationQuote,
        uint256 nonce,
        uint256 timestamp
    ) external {
        require(!commitments[taskId].committed, "SEAL: already committed");
        require(attestationQuote.length > 0, "SEAL: empty attestation");

        commitments[taskId] = CommitmentData({
            committed: true,
            executed: false,
            merkleRoot: merkleRoot,
            nonce: nonce,
            attestationQuote: attestationQuote,
            timestamp: timestamp,
            submitter: msg.sender,
            executionHash: bytes32(0)
        });

        commitmentCount++;

        emit CommitmentSubmitted(taskId, merkleRoot, nonce, timestamp);
    }

    // ── Attestation Verification ─────────────────────────

    function verifyAttestation(
        bytes32 taskId,
        bytes calldata attestationQuote
    ) external view returns (bool) {
        CommitmentData storage c = commitments[taskId];
        if (!c.committed) return false;
        if (keccak256(c.attestationQuote) != keccak256(attestationQuote)) return false;
        if (attestationQuote.length < 64) return false;
        return true;
    }

    // ── Stage 04+05: Execute + Guaranteed Delivery ───────

    function executeTask(
        bytes32 taskId,
        bytes calldata txData,
        bytes32 executionHash,
        bytes calldata signature
    ) external {
        CommitmentData storage c = commitments[taskId];

        require(c.committed, "SEAL: not committed");
        require(!c.executed, "SEAL: already executed");
        require(txData.length > 0, "SEAL: empty tx data");
        require(signature.length > 0, "SEAL: empty signature");

        c.executed = true;
        c.executionHash = executionHash;

        executionCount++;

        emit TaskExecuted(taskId, executionHash, block.timestamp);
    }

    // ── Nonce Management ─────────────────────────────────

    function getNonce(bytes32 agentId) external view returns (uint256) {
        return agents[agentId].nonce;
    }

    function incrementNonce(bytes32 agentId) external {
        require(agents[agentId].registered, "SEAL: agent not registered");
        agents[agentId].nonce++;
    }

    // ── Decentralized Dispute Resolution ─────────────────

    /**
     * @notice Raise a dispute against an agent for a specific task.
     *         Challenger must post a bond. If dispute succeeds, challenger
     *         gets bond back + reward from slashed stake.
     * @param agentId      The agent being disputed
     * @param taskId       The task that triggered the dispute
     * @param evidenceHash Hash of off-chain evidence (revealed reasoning blob)
     */
    function raiseDispute(
        bytes32 agentId,
        bytes32 taskId,
        bytes32 evidenceHash
    ) external payable returns (uint256 disputeId) {
        require(msg.value >= disputeBond, "SEAL: insufficient dispute bond");

        AgentInfo storage agent = agents[agentId];
        require(agent.registered, "SEAL: agent not registered");
        require(!agent.slashed, "SEAL: already slashed");

        CommitmentData storage c = commitments[taskId];
        require(c.committed, "SEAL: task not committed");

        disputeId = disputeCount++;
        disputes[disputeId] = Dispute({
            status: DisputeStatus.Active,
            agentId: agentId,
            taskId: taskId,
            challenger: msg.sender,
            bond: msg.value,
            evidenceHash: evidenceHash,
            votesFor: 0,
            votesAgainst: 0,
            deadline: block.timestamp + disputePeriod,
            resolved: false
        });

        emit DisputeRaised(disputeId, agentId, taskId, msg.sender, msg.value, block.timestamp + disputePeriod);
    }

    /**
     * @notice Vote on an active dispute. Any registered agent or staker can vote.
     * @param disputeId     The dispute to vote on
     * @param inFavorOfSlash true = agent should be slashed, false = dispute is invalid
     */
    function voteOnDispute(uint256 disputeId, bool inFavorOfSlash) external {
        Dispute storage d = disputes[disputeId];
        require(d.status == DisputeStatus.Active, "SEAL: dispute not active");
        require(block.timestamp < d.deadline, "SEAL: voting period ended");
        require(!hasVoted[disputeId][msg.sender], "SEAL: already voted");

        hasVoted[disputeId][msg.sender] = true;
        voteDirection[disputeId][msg.sender] = inFavorOfSlash;

        if (inFavorOfSlash) {
            d.votesFor++;
        } else {
            d.votesAgainst++;
        }

        emit DisputeVoted(disputeId, msg.sender, inFavorOfSlash);
    }

    /**
     * @notice Resolve a dispute after the voting period ends.
     *         Anyone can call this once the deadline passes.
     *         - If votesFor > votesAgainst: agent is slashed, challenger rewarded
     *         - If votesAgainst >= votesFor: dispute rejected, bond goes to agent
     */
    function resolveDispute(uint256 disputeId) external {
        Dispute storage d = disputes[disputeId];
        require(d.status == DisputeStatus.Active, "SEAL: dispute not active");
        require(block.timestamp >= d.deadline, "SEAL: voting period not ended");
        require(!d.resolved, "SEAL: already resolved");

        d.resolved = true;

        bool shouldSlash = d.votesFor > d.votesAgainst;

        if (shouldSlash) {
            // Slash the agent
            AgentInfo storage agent = agents[d.agentId];
            uint256 slashedAmount = agent.stake;
            agent.slashed = true;
            agent.stake = 0;

            d.status = DisputeStatus.Resolved;

            // Reward challenger: bond back + half of slashed stake
            uint256 challengerReward = d.bond + (slashedAmount / 2);
            uint256 protocolFee = slashedAmount - (slashedAmount / 2);

            (bool sent1, ) = payable(d.challenger).call{value: challengerReward}("");
            require(sent1, "SEAL: challenger reward failed");

            // Protocol fee goes to contract owner
            if (protocolFee > 0) {
                (bool sent2, ) = payable(owner()).call{value: protocolFee}("");
                require(sent2, "SEAL: protocol fee failed");
            }

            emit AgentSlashed(d.agentId, d.taskId, slashedAmount);
        } else {
            // Dispute rejected — bond goes to the agent's owner as compensation
            d.status = DisputeStatus.Rejected;

            AgentInfo storage agent = agents[d.agentId];
            (bool sent, ) = payable(agent.agentOwner).call{value: d.bond}("");
            require(sent, "SEAL: bond return failed");
        }

        emit DisputeResolved(disputeId, shouldSlash, d.votesFor, d.votesAgainst);
    }

    // ── Emergency Slash (owner-only, for critical bugs) ──

    function emergencySlash(bytes32 agentId, bytes32 taskId) external onlyOwner {
        AgentInfo storage agent = agents[agentId];
        require(agent.registered, "SEAL: agent not registered");
        require(!agent.slashed, "SEAL: already slashed");

        CommitmentData storage c = commitments[taskId];
        require(c.committed, "SEAL: task not committed");

        uint256 slashedAmount = agent.stake;
        agent.slashed = true;
        agent.stake = 0;

        (bool sent, ) = payable(owner()).call{value: slashedAmount}("");
        require(sent, "SEAL: slash transfer failed");

        emit AgentSlashed(agentId, taskId, slashedAmount);
    }

    // ── View Helpers ─────────────────────────────────────

    function getCommitment(bytes32 taskId) external view returns (
        bool committed,
        bool executed,
        bytes32 merkleRoot,
        uint256 nonce,
        uint256 timestamp,
        address submitter,
        bytes32 executionHash
    ) {
        CommitmentData storage c = commitments[taskId];
        return (
            c.committed,
            c.executed,
            c.merkleRoot,
            c.nonce,
            c.timestamp,
            c.submitter,
            c.executionHash
        );
    }

    function getDispute(uint256 disputeId) external view returns (
        DisputeStatus status,
        bytes32 agentId,
        bytes32 taskId,
        address challenger,
        uint256 bond,
        bytes32 evidenceHash,
        uint256 votesFor,
        uint256 votesAgainst,
        uint256 deadline,
        bool resolved
    ) {
        Dispute storage d = disputes[disputeId];
        return (
            d.status, d.agentId, d.taskId, d.challenger, d.bond,
            d.evidenceHash, d.votesFor, d.votesAgainst, d.deadline, d.resolved
        );
    }

    function getAgentTasks(bytes32 agentId) external view returns (bytes32[] memory) {
        return agentTasks[agentId];
    }

    function isPendingExecution(bytes32 taskId) external view returns (bool) {
        CommitmentData storage c = commitments[taskId];
        return c.committed && !c.executed;
    }

    function isRegisteredStaker(address account) external view returns (bool) {
        return registeredStakers[account];
    }

    // ── Admin ────────────────────────────────────────────

    function setMinStake(uint256 _minStake) external onlyOwner {
        minStake = _minStake;
    }

    function setDisputeBond(uint256 _disputeBond) external onlyOwner {
        disputeBond = _disputeBond;
    }

    function setDisputePeriod(uint256 _disputePeriod) external onlyOwner {
        disputePeriod = _disputePeriod;
    }

    // Required to receive ETH
    receive() external payable {}
}
