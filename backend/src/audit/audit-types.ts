export type AuditRequestScope = 'reveal_all';

export type AuditRequestRecord = {
  id: string;
  createdAt: string;
  agentIdBytes32: string;
  auditorAddress: string;
  scope: AuditRequestScope;
  message: string;
  signature: string;
  status: 'pending' | 'revealed' | 'denied';
  /** Optional note (not part of the signed message) */
  note?: string;
  revealedPlaintext?: string;
  revealedAt?: string;
  denyAt?: string;
};

export function buildAuditRequestMessage(agentIdBytes32: string, auditorAddress: string): string {
  return [
    'SEAL — Audit request',
    '',
    `agentId: ${agentIdBytes32}`,
    'scope: reveal_all',
    `auditor: ${auditorAddress}`,
    '',
    'I request an audit and consent to disclose this signed request to the operator.',
  ].join('\n');
}

export function buildDenyMessage(requestId: string, agentIdBytes32: string): string {
  return `SEAL deny audit request ${requestId} for agent ${agentIdBytes32}`;
}

/** EIP-191 message binding owner consent to a specific plaintext (via keccak256 commitment). */
export function buildRevealSubmitMessage(
  requestId: string,
  agentIdBytes32: string,
  auditorAddress: string,
  plaintextKeccak256: string,
): string {
  return [
    'SEAL — Submit audit reveal',
    '',
    `requestId: ${requestId}`,
    `agentId: ${agentIdBytes32}`,
    `auditor: ${auditorAddress}`,
    `plaintextKeccak256: ${plaintextKeccak256}`,
  ].join('\n');
}
