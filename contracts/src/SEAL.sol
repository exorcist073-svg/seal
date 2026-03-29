// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title SEAL — Secure Enclave Agent Layer
 * @notice Commit-attest-execute contract for AI agents operating on-chain.
 *         Enforces that reasoning commitment provably precedes execution,
 *         stores merkle-batched commitment roots, validates TEE attestation
 *         quotes, and manages agent lifecycle including slashing.
 */
contract SEAL {
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
        address owner;
    }

    // ── State ────────────────────────────────────────────

    mapping(bytes32 => CommitmentData) public commitments;
    mapping(bytes32 => AgentInfo) public agents;
    mapping(bytes32 => bytes32[]) public agentTasks; // agentId => taskIds

    address public owner;
    uint256 public minStake;
    uint256 public commitmentCount;
    uint256 public executionCount;

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

    event AttestationVerified(
        bytes32 indexed taskId,
        bool valid
    );

    event AgentRegistered(
        bytes32 indexed agentId,
        address indexed owner,
        uint256 stake
    );

    event AgentSlashed(
        bytes32 indexed agentId,
        bytes32 indexed taskId,
        uint256 slashedAmount
    );

    // ── Modifiers ────────────────────────────────────────

    modifier onlyOwner() {
        require(msg.sender == owner, "SEAL: not owner");
        _;
    }

    // ── Constructor ──────────────────────────────────────

    constructor(uint256 _minStake) {
        owner = msg.sender;
        minStake = _minStake;
    }

    // ── Agent Registry ───────────────────────────────────

    /**
     * @notice Register an agent by staking. Agent ID is derived off-chain
     *         (e.g. keccak256 of the agent's enclave public key).
     */
    function registerAgent(bytes32 agentId) external payable {
        require(!agents[agentId].registered, "SEAL: already registered");
        require(msg.value >= minStake, "SEAL: insufficient stake");

        agents[agentId] = AgentInfo({
            registered: true,
            nonce: 0,
            stake: msg.value,
            slashed: false,
            owner: msg.sender
        });

        emit AgentRegistered(agentId, msg.sender, msg.value);
    }

    // ── Stage 03: Commit + Attest ────────────────────────

    /**
     * @notice Submit a commitment from the TEE runtime.
     *         Must be called BEFORE executeTask (commit-before-execute).
     * @param taskId     Unique task identifier
     * @param merkleRoot Merkle root of [inputHash, reasoningHash, executionHash, signature]
     * @param attestationQuote Raw TEE attestation quote bytes (Nitro-compat format)
     * @param nonce      Strict sequence nonce for this agent
     * @param timestamp  TEE-generated timestamp
     */
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

    /**
     * @notice Verify a TEE attestation quote for a committed task.
     *         For the hackathon mock, we verify structural validity:
     *         - Quote exists and is non-empty
     *         - Task is committed
     *         In production, this would verify the COSE_Sign1 signature
     *         against AWS Nitro / Intel TDX root certificates.
     */
    function verifyAttestation(
        bytes32 taskId,
        bytes calldata attestationQuote
    ) external view returns (bool) {
        CommitmentData storage c = commitments[taskId];

        // Must be committed
        if (!c.committed) return false;

        // Quote must match what was submitted
        if (keccak256(c.attestationQuote) != keccak256(attestationQuote)) return false;

        // Structural check: quote must have minimum length (base64-encoded JSON)
        if (attestationQuote.length < 64) return false;

        return true;
    }

    // ── Stage 04+05: Execute + Guaranteed Delivery ───────

    /**
     * @notice Execute a task after commitment is on-chain.
     *         Enforces commit-before-execute ordering.
     * @param taskId         Must match a previously committed task
     * @param txData         Serialized transaction data from TEE
     * @param executionHash  SHA-256 hash of the execution output
     * @param signature      TEE enclave signature over the execution
     */
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

    /**
     * @notice Get the current nonce for an agent.
     *         Used by the backend to set the next commitment nonce.
     */
    function getNonce(bytes32 agentId) external view returns (uint256) {
        return agents[agentId].nonce;
    }

    /**
     * @notice Increment nonce after successful commitment.
     */
    function incrementNonce(bytes32 agentId) external {
        require(agents[agentId].registered, "SEAL: agent not registered");
        agents[agentId].nonce++;
    }

    // ── Slashing ─────────────────────────────────────────

    /**
     * @notice Slash an agent if selective reveal proves fraudulent reasoning.
     *         Can be called by contract owner (in production: by a governance vote
     *         or an on-chain fraud proof).
     * @param agentId The agent to slash
     * @param taskId  The task that triggered the slash
     */
    function slashAgent(bytes32 agentId, bytes32 taskId) external onlyOwner {
        AgentInfo storage agent = agents[agentId];
        require(agent.registered, "SEAL: agent not registered");
        require(!agent.slashed, "SEAL: already slashed");

        CommitmentData storage c = commitments[taskId];
        require(c.committed, "SEAL: task not committed");

        uint256 slashedAmount = agent.stake;
        agent.slashed = true;
        agent.stake = 0;

        // Transfer slashed stake to contract owner (in production: to a slash pool)
        (bool sent, ) = payable(owner).call{value: slashedAmount}("");
        require(sent, "SEAL: slash transfer failed");

        emit AgentSlashed(agentId, taskId, slashedAmount);
    }

    // ── View Helpers ─────────────────────────────────────

    /**
     * @notice Get full commitment data for a task.
     */
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

    /**
     * @notice Get agent tasks list.
     */
    function getAgentTasks(bytes32 agentId) external view returns (bytes32[] memory) {
        return agentTasks[agentId];
    }

    /**
     * @notice Check if a commitment exists and hasn't been executed yet.
     */
    function isPendingExecution(bytes32 taskId) external view returns (bool) {
        CommitmentData storage c = commitments[taskId];
        return c.committed && !c.executed;
    }

    // ── Admin ────────────────────────────────────────────

    function setMinStake(uint256 _minStake) external onlyOwner {
        minStake = _minStake;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "SEAL: zero address");
        owner = newOwner;
    }
}
