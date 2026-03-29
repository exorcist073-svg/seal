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
 * SEAL Contract ABI — matches deployed contract on Base Sepolia
 * Address: 0x09c1Fb86E0E78861cfa85A026c12e042087DE08e
 */
export const SEAL_CONTRACT_ABI = [
  // Events
  "event CommitmentSubmitted(bytes32 indexed taskId, bytes32 merkleRoot, uint256 nonce, uint256 timestamp)",
  "event TaskExecuted(bytes32 indexed taskId, bytes32 executionHash, uint256 timestamp)",
  "event AttestationVerified(bytes32 indexed taskId, bool valid)",
  "event AgentRegistered(bytes32 indexed agentId, address indexed owner, uint256 stake)",
  "event AgentSlashed(bytes32 indexed agentId, bytes32 indexed taskId, uint256 slashedAmount)",

  // Agent registry
  "function registerAgent(bytes32 agentId) payable",
  "function agents(bytes32 agentId) view returns (bool registered, uint256 nonce, uint256 stake, bool slashed, address owner)",

  // Commit-attest-execute
  "function submitCommitment(bytes32 taskId, bytes32 merkleRoot, bytes calldata attestationQuote, uint256 nonce, uint256 timestamp)",
  "function verifyAttestation(bytes32 taskId, bytes calldata attestationQuote) view returns (bool)",
  "function executeTask(bytes32 taskId, bytes calldata txData, bytes32 executionHash, bytes calldata signature)",

  // State queries
  "function commitments(bytes32 taskId) view returns (bool committed, bool executed, bytes32 merkleRoot, uint256 nonce, bytes attestationQuote, uint256 timestamp, address submitter, bytes32 executionHash)",
  "function getCommitment(bytes32 taskId) view returns (bool committed, bool executed, bytes32 merkleRoot, uint256 nonce, uint256 timestamp, address submitter, bytes32 executionHash)",
  "function getNonce(bytes32 agentId) view returns (uint256)",
  "function isPendingExecution(bytes32 taskId) view returns (bool)",
  "function incrementNonce(bytes32 agentId)",

  // Admin
  "function slashAgent(bytes32 agentId, bytes32 taskId)",
  "function owner() view returns (address)",
  "function commitmentCount() view returns (uint256)",
  "function executionCount() view returns (uint256)"
];

export default ContractIntegration;
