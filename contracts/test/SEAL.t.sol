// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {SEAL} from "../src/SEAL.sol";

contract SEALTest is Test {
    SEAL public seal;
    address public deployer;
    address public agent1Owner;
    address public agent2Owner;

    bytes32 constant AGENT_1 = keccak256("agent-treasury-001");
    bytes32 constant AGENT_2 = keccak256("agent-worker-001");
    bytes32 constant TASK_1 = keccak256("task-001");
    bytes32 constant TASK_2 = keccak256("task-002");

    function setUp() public {
        deployer = address(this);
        agent1Owner = makeAddr("agent1Owner");
        agent2Owner = makeAddr("agent2Owner");

        seal = new SEAL(0.01 ether);

        // Fund agent owners
        vm.deal(agent1Owner, 10 ether);
        vm.deal(agent2Owner, 10 ether);
    }

    // ── Agent Registration ───────────────────────────────

    function test_RegisterAgent() public {
        vm.prank(agent1Owner);
        seal.registerAgent{value: 0.01 ether}(AGENT_1);

        (bool registered, uint256 nonce, uint256 stake, bool slashed, address owner) = seal.agents(AGENT_1);
        assertTrue(registered);
        assertEq(nonce, 0);
        assertEq(stake, 0.01 ether);
        assertFalse(slashed);
        assertEq(owner, agent1Owner);
    }

    function test_RevertDoubleRegister() public {
        vm.prank(agent1Owner);
        seal.registerAgent{value: 0.01 ether}(AGENT_1);

        vm.prank(agent1Owner);
        vm.expectRevert("SEAL: already registered");
        seal.registerAgent{value: 0.01 ether}(AGENT_1);
    }

    function test_RevertInsufficientStake() public {
        vm.prank(agent1Owner);
        vm.expectRevert("SEAL: insufficient stake");
        seal.registerAgent{value: 0.001 ether}(AGENT_1);
    }

    // ── Commit Flow ──────────────────────────────────────

    function test_SubmitCommitment() public {
        bytes32 merkleRoot = keccak256("merkle-root-data");
        bytes memory attestationQuote = _mockAttestationQuote();

        seal.submitCommitment(TASK_1, merkleRoot, attestationQuote, 1, block.timestamp);

        (bool committed, bool executed, bytes32 storedRoot, , , uint256 timestamp, , ) = seal.commitments(TASK_1);
        assertTrue(committed);
        assertFalse(executed);
        assertEq(storedRoot, merkleRoot);
        assertGt(timestamp, 0);
        assertEq(seal.commitmentCount(), 1);
    }

    function test_RevertDoubleCommit() public {
        bytes32 merkleRoot = keccak256("merkle-root-data");
        bytes memory quote = _mockAttestationQuote();

        seal.submitCommitment(TASK_1, merkleRoot, quote, 1, block.timestamp);

        vm.expectRevert("SEAL: already committed");
        seal.submitCommitment(TASK_1, merkleRoot, quote, 2, block.timestamp);
    }

    function test_RevertEmptyAttestation() public {
        bytes32 merkleRoot = keccak256("merkle-root-data");

        vm.expectRevert("SEAL: empty attestation");
        seal.submitCommitment(TASK_1, merkleRoot, "", 1, block.timestamp);
    }

    // ── Attestation Verification ─────────────────────────

    function test_VerifyAttestation() public {
        bytes32 merkleRoot = keccak256("merkle-root-data");
        bytes memory quote = _mockAttestationQuote();

        seal.submitCommitment(TASK_1, merkleRoot, quote, 1, block.timestamp);

        bool valid = seal.verifyAttestation(TASK_1, quote);
        assertTrue(valid);
    }

    function test_VerifyAttestationFailsWrongQuote() public {
        bytes32 merkleRoot = keccak256("merkle-root-data");
        bytes memory quote = _mockAttestationQuote();

        seal.submitCommitment(TASK_1, merkleRoot, quote, 1, block.timestamp);

        bytes memory wrongQuote = abi.encodePacked("wrong-attestation-data-that-is-long-enough-for-minimum-check-64bytes");
        bool valid = seal.verifyAttestation(TASK_1, wrongQuote);
        assertFalse(valid);
    }

    function test_VerifyAttestationFailsNotCommitted() public {
        bytes memory quote = _mockAttestationQuote();
        bool valid = seal.verifyAttestation(TASK_1, quote);
        assertFalse(valid);
    }

    // ── Execute Flow ─────────────────────────────────────

    function test_ExecuteAfterCommit() public {
        bytes32 merkleRoot = keccak256("merkle-root-data");
        bytes memory quote = _mockAttestationQuote();

        seal.submitCommitment(TASK_1, merkleRoot, quote, 1, block.timestamp);

        bytes memory txData = abi.encode("transfer", address(0x1), 100);
        bytes32 execHash = keccak256(txData);
        bytes memory sig = abi.encodePacked(keccak256("mock-signature"));

        seal.executeTask(TASK_1, txData, execHash, sig);

        (bool committed, bool executed, , , , , , ) = seal.commitments(TASK_1);
        assertTrue(committed);
        assertTrue(executed);
        assertEq(seal.executionCount(), 1);
    }

    function test_RevertExecuteWithoutCommit() public {
        bytes memory txData = abi.encode("transfer", address(0x1), 100);
        bytes32 execHash = keccak256(txData);
        bytes memory sig = abi.encodePacked(keccak256("mock-signature"));

        vm.expectRevert("SEAL: not committed");
        seal.executeTask(TASK_1, txData, execHash, sig);
    }

    function test_RevertDoubleExecute() public {
        bytes32 merkleRoot = keccak256("merkle-root-data");
        bytes memory quote = _mockAttestationQuote();

        seal.submitCommitment(TASK_1, merkleRoot, quote, 1, block.timestamp);

        bytes memory txData = abi.encode("transfer", address(0x1), 100);
        bytes32 execHash = keccak256(txData);
        bytes memory sig = abi.encodePacked(keccak256("mock-signature"));

        seal.executeTask(TASK_1, txData, execHash, sig);

        vm.expectRevert("SEAL: already executed");
        seal.executeTask(TASK_1, txData, execHash, sig);
    }

    // ── Full Pipeline: Commit → Verify → Execute ────────

    function test_FullPipeline() public {
        // Register agent
        vm.prank(agent1Owner);
        seal.registerAgent{value: 0.05 ether}(AGENT_1);

        // Submit commitment
        bytes32 merkleRoot = keccak256("full-pipeline-merkle");
        bytes memory quote = _mockAttestationQuote();
        seal.submitCommitment(TASK_1, merkleRoot, quote, 1, block.timestamp);

        // Verify attestation
        bool valid = seal.verifyAttestation(TASK_1, quote);
        assertTrue(valid);

        // Execute
        bytes memory txData = abi.encode("rebalance", address(0xDA0), 1000);
        bytes32 execHash = keccak256(txData);
        bytes memory sig = abi.encodePacked(keccak256("enclave-sig"));
        seal.executeTask(TASK_1, txData, execHash, sig);

        // Verify final state
        (bool committed, bool executed, bytes32 root, , uint256 ts, , bytes32 storedExecHash) = seal.getCommitment(TASK_1);
        assertTrue(committed);
        assertTrue(executed);
        assertEq(root, merkleRoot);
        assertEq(storedExecHash, execHash);
        assertGt(ts, 0);
    }

    // ── Slashing ─────────────────────────────────────────

    function test_SlashAgent() public {
        // Register agent
        vm.prank(agent1Owner);
        seal.registerAgent{value: 1 ether}(AGENT_1);

        // Commit a task
        bytes32 merkleRoot = keccak256("fraudulent-reasoning");
        bytes memory quote = _mockAttestationQuote();
        seal.submitCommitment(TASK_1, merkleRoot, quote, 1, block.timestamp);

        // Owner slashes
        uint256 ownerBalanceBefore = deployer.balance;
        seal.slashAgent(AGENT_1, TASK_1);

        (bool registered, , uint256 stake, bool slashed, ) = seal.agents(AGENT_1);
        assertTrue(registered);
        assertTrue(slashed);
        assertEq(stake, 0);
        assertEq(deployer.balance, ownerBalanceBefore + 1 ether);
    }

    function test_RevertSlashNonOwner() public {
        vm.prank(agent1Owner);
        seal.registerAgent{value: 1 ether}(AGENT_1);

        bytes memory quote = _mockAttestationQuote();
        seal.submitCommitment(TASK_1, keccak256("data"), quote, 1, block.timestamp);

        vm.prank(agent2Owner);
        vm.expectRevert("SEAL: not owner");
        seal.slashAgent(AGENT_1, TASK_1);
    }

    function test_RevertDoubleSlash() public {
        vm.prank(agent1Owner);
        seal.registerAgent{value: 1 ether}(AGENT_1);

        bytes memory quote = _mockAttestationQuote();
        seal.submitCommitment(TASK_1, keccak256("data"), quote, 1, block.timestamp);

        seal.slashAgent(AGENT_1, TASK_1);

        vm.expectRevert("SEAL: already slashed");
        seal.slashAgent(AGENT_1, TASK_1);
    }

    // ── View Helpers ─────────────────────────────────────

    function test_IsPendingExecution() public {
        bytes memory quote = _mockAttestationQuote();
        seal.submitCommitment(TASK_1, keccak256("data"), quote, 1, block.timestamp);

        assertTrue(seal.isPendingExecution(TASK_1));

        bytes memory txData = abi.encode("exec");
        seal.executeTask(TASK_1, txData, keccak256(txData), abi.encodePacked(keccak256("sig")));

        assertFalse(seal.isPendingExecution(TASK_1));
    }

    // ── Helpers ──────────────────────────────────────────

    function _mockAttestationQuote() internal pure returns (bytes memory) {
        // Simulates a Nitro-compat base64-encoded attestation (>64 bytes)
        return abi.encodePacked(
            '{"format":"aws-nitro-v1-mock","payload":{"module_id":"seal-fluence-tee",',
            '"pcrs":{"0":"mock-pcr0"},"user_data":"mock"},"signature":"0xdead"}'
        );
    }

    // Allow contract to receive ETH (for slash payouts)
    receive() external payable {}
}
