import SEALFluenceAgent, { TEEInput, TEEAttestation, Commitment } from './agent.js';
import { ethers } from 'ethers';

/**
 * Integration layer for Dev A's SEAL Smart Contract
 * Handles on-chain commitment submission and attestation validation
 */
export class ContractIntegration {
  private agent: SEALFluenceAgent;
  private provider: ethers.Provider;
  private contract: ethers.Contract;
  private signer: ethers.Signer;

  constructor(
    agent: SEALFluenceAgent,
    rpcUrl: string,
    contractAddress: string,
    contractAbi: any,
    privateKey: string
  ) {
    this.agent = agent;
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
    this.signer = new ethers.Wallet(privateKey, this.provider);
    this.contract = new ethers.Contract(contractAddress, contractAbi, this.signer);
  }

  /**
   * Submit commitment to SEAL contract (Stage 03 output)
   * This is the critical handoff from TEE to chain
   */
  async submitCommitment(commitment: Commitment): Promise<ethers.TransactionResponse> {
    // Call SEAL contract's commit function
    const tx = await this.contract.submitCommitment(
      commitment.taskId,
      commitment.merkleRoot,
      commitment.attestationQuote,
      commitment.nonce,
      commitment.timestamp
    );
    return tx;
  }

  /**
   * Verify attestation quote on-chain
   * Dev A's contract validates the TEE quote
   */
  async verifyAttestationOnChain(attestation: TEEAttestation): Promise<boolean> {
    const isValid = await this.contract.verifyAttestation(
      attestation.taskId,
      attestation.teeQuote
    );
    return isValid;
  }

  /**
   * Execute after commitment is on-chain
   * Stage 05: Guaranteed delivery via contract
   */
  async executeAfterCommitment(
    taskId: string,
    txData: any,
    executionAttestation: TEEAttestation
  ): Promise<ethers.TransactionResponse> {
    // Submit execution proof to contract
    const tx = await this.contract.executeTask(
      taskId,
      txData,
      executionAttestation.executionHash,
      executionAttestation.signature
    );
    return tx;
  }

  /**
   * Get commitment status from contract
   */
  async getCommitmentStatus(taskId: string): Promise<{
    committed: boolean;
    executed: boolean;
    merkleRoot: string;
    timestamp: number;
  }> {
    const status = await this.contract.commitments(taskId);
    return {
      committed: status.committed,
      executed: status.executed,
      merkleRoot: status.merkleRoot,
      timestamp: status.timestamp
    };
  }
}

/**
 * SEAL v2 Contract ABI — UUPS proxy on Base Sepolia
 * Proxy: 0x9af9C6fe2a845354EcC3bDCe1af9c427Fb42Ed70
 */
export const SEAL_CONTRACT_ABI = [
  // Events
  "event CommitmentSubmitted(bytes32 indexed taskId, bytes32 merkleRoot, uint256 nonce, uint256 timestamp)",
  "event TaskExecuted(bytes32 indexed taskId, bytes32 executionHash, uint256 timestamp)",
  "event AgentRegistered(bytes32 indexed agentId, address indexed agentOwner, uint256 stake)",
  "event AgentSlashed(bytes32 indexed agentId, bytes32 indexed taskId, uint256 slashedAmount)",
  "event DisputeRaised(uint256 indexed disputeId, bytes32 indexed agentId, bytes32 indexed taskId, address challenger, uint256 bond, uint256 deadline)",
  "event DisputeVoted(uint256 indexed disputeId, address indexed voter, bool inFavorOfSlash)",
  "event DisputeResolved(uint256 indexed disputeId, bool slashed, uint256 votesFor, uint256 votesAgainst)",

  // Agent registry
  "function registerAgent(bytes32 agentId) payable",
  "function agents(bytes32 agentId) view returns (bool registered, uint256 nonce, uint256 stake, bool slashed, address agentOwner)",

  // Commit-attest-execute
  "function submitCommitment(bytes32 taskId, bytes32 merkleRoot, bytes calldata attestationQuote, uint256 nonce, uint256 timestamp)",
  "function verifyAttestation(bytes32 taskId, bytes calldata attestationQuote) view returns (bool)",
  "function executeTask(bytes32 taskId, bytes calldata txData, bytes32 executionHash, bytes calldata signature)",

  // State queries
  "function commitments(bytes32 taskId) view returns (bool committed, bool executed, bytes32 merkleRoot, uint256 nonce, bytes attestationQuote, uint256 timestamp, address submitter, bytes32 executionHash)",
  "function getCommitment(bytes32 taskId) view returns (bool committed, bool executed, bytes32 merkleRoot, uint256 nonce, uint256 timestamp, address submitter, bytes32 executionHash)",
  "function getNonce(bytes32 agentId) view returns (uint256)",
  "function isPendingExecution(bytes32 taskId) view returns (bool)",
  "function isRegisteredStaker(address account) view returns (bool)",
  "function incrementNonce(bytes32 agentId)",

  // Dispute resolution
  "function raiseDispute(bytes32 agentId, bytes32 taskId, bytes32 evidenceHash) payable returns (uint256 disputeId)",
  "function voteOnDispute(uint256 disputeId, bool inFavorOfSlash)",
  "function resolveDispute(uint256 disputeId)",
  "function getDispute(uint256 disputeId) view returns (uint8 status, bytes32 agentId, bytes32 taskId, address challenger, uint256 bond, bytes32 evidenceHash, uint256 votesFor, uint256 votesAgainst, uint256 deadline, bool resolved)",
  "function disputeCount() view returns (uint256)",
  "function disputeBond() view returns (uint256)",
  "function disputePeriod() view returns (uint256)",

  // Admin
  "function emergencySlash(bytes32 agentId, bytes32 taskId)",
  "function owner() view returns (address)",
  "function commitmentCount() view returns (uint256)",
  "function executionCount() view returns (uint256)",
  "function minStake() view returns (uint256)"
];

export default ContractIntegration;
