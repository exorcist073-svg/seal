import { parseAbi } from "viem";

/** Read-only fragments aligned with `backend/src/contract-integration.ts` */
export const sealAbi = parseAbi([
  "function commitmentCount() view returns (uint256)",
  "function executionCount() view returns (uint256)",
  "function disputeCount() view returns (uint256)",
  "function disputeBond() view returns (uint256)",
  "function disputePeriod() view returns (uint256)",
  "function owner() view returns (address)",
  "function getCommitment(bytes32 taskId) view returns (bool committed, bool executed, bytes32 merkleRoot, uint256 nonce, uint256 timestamp, address submitter, bytes32 executionHash)",
]);
