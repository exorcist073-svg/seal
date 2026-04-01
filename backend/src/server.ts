import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { ethers } from 'ethers';
import SEALFluenceAgent, { TEEInput } from './agent.js';
import { ContractIntegration, SEAL_CONTRACT_ABI } from './contract-integration.js';
import { TreasuryAgentDemo } from './vignettes/treasury-agent.js';
import { AgentToAgentDemo } from './vignettes/agent-to-agent.js';
import { CredentialProofDemo } from './vignettes/credential-proof.js';
import { sealBlob, revealBlob, verifyCid, logAuditEntry } from '../storage/index.js';
import { computeAgentIdBytes32 } from './agent-id.js';
import type { Address } from 'viem';
import { appendSealedBlob, sealedForAgent } from './sealed-blobs.js';
import { readAuditRequests, writeAuditRequests } from './audit-requests-store.js';
import type { AuditRequestRecord } from './audit/audit-types.js';
import { buildAuditRequestMessage, buildDenyMessage, buildRevealSubmitMessage } from './audit/audit-types.js';

const app = express();
app.use(cors());
app.use(express.json());

const PORT = parseInt(process.env.PORT || '3001', 10);
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const RPC_URL = process.env.RPC_URL || '';
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS || '';
const SIGNER_PRIVATE_KEY = process.env.SIGNER_PRIVATE_KEY || '';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const ALLOW_NO_LLM = process.env.ALLOW_NO_LLM === '1' || process.env.ALLOW_NO_LLM === 'true';
/** Lets the server boot for chain/health routes when no real LLM key is set (pipeline will fail until keys are added). */
const LLM_ANTHROPIC = ANTHROPIC_API_KEY || (ALLOW_NO_LLM ? 'sk-ant-dev-placeholder' : '');
const LLM_GEMINI = GEMINI_API_KEY || '';

// On-chain: reader (RPC + address) — write needs signer too
let provider: ethers.JsonRpcProvider | null = null;
let signer: ethers.Wallet | null = null;
let sealContract: ethers.Contract | null = null;
let sealContractReader: ethers.Contract | null = null;

if (RPC_URL && CONTRACT_ADDRESS && !CONTRACT_ADDRESS.startsWith('0x000000000000')) {
  provider = new ethers.JsonRpcProvider(RPC_URL);
  sealContractReader = new ethers.Contract(CONTRACT_ADDRESS, SEAL_CONTRACT_ABI, provider);
  if (SIGNER_PRIVATE_KEY) {
    signer = new ethers.Wallet(SIGNER_PRIVATE_KEY, provider);
    sealContract = new ethers.Contract(CONTRACT_ADDRESS, SEAL_CONTRACT_ABI, signer);
    console.log(`On-chain: SEAL at ${CONTRACT_ADDRESS} (read + write)`);
  } else {
    console.log(`On-chain: SEAL at ${CONTRACT_ADDRESS} (read-only; set SIGNER_PRIVATE_KEY for writes)`);
  }
} else {
  console.log('On-chain: not configured (set CONTRACT_ADDRESS + RPC_URL in .env)');
}

function resolveAgentIdBytes(body: {
  agentIdBytes32?: string;
  operatorAddress?: string;
  runtimeHash?: string;
}): `0x${string}` | null {
  const raw = body.agentIdBytes32?.trim();
  if (raw && /^0x[a-fA-F0-9]{64}$/.test(raw)) {
    return raw as `0x${string}`;
  }
  if (body.operatorAddress && body.runtimeHash !== undefined) {
    return computeAgentIdBytes32(body.operatorAddress as Address, String(body.runtimeHash));
  }
  return null;
}

if (
  !ALLOW_NO_LLM &&
  (!ANTHROPIC_API_KEY || ANTHROPIC_API_KEY.startsWith('sk-ant-xxx')) &&
  !GEMINI_API_KEY
) {
  console.error('ERROR: Set ANTHROPIC_API_KEY or GEMINI_API_KEY in .env (or ALLOW_NO_LLM=1 for chain-only dev)');
  process.exit(1);
}
if (ALLOW_NO_LLM && !ANTHROPIC_API_KEY && !GEMINI_API_KEY) {
  console.warn('ALLOW_NO_LLM: pipeline / LLM routes will fail until you set ANTHROPIC_API_KEY or GEMINI_API_KEY');
}
console.log(
  `LLM: ${ANTHROPIC_API_KEY ? 'Claude (primary)' : ALLOW_NO_LLM ? 'placeholder (set real key)' : 'none'} ${GEMINI_API_KEY ? '+ Gemini (fallback)' : ''}`
);

// ── Health ───────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'seal-fluence-tee', timestamp: Date.now() });
});

// ── Stage 01: Hash inputs ────────────────────────────────
app.post('/api/hash-inputs', (req, res) => {
  try {
    const agent = new SEALFluenceAgent('api-agent', LLM_ANTHROPIC, LLM_GEMINI);
    const input: TEEInput = req.body;
    const hash = agent.hashInputs(input);
    res.json({ inputHash: hash });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ── Full pipeline: reason → commit → execute ─────────────
app.post('/api/pipeline', async (req, res) => {
  try {
    const { input, systemPrompt, authorizedAddress, operatorAddress, runtimeHash, agentIdBytes32 } = req.body as {
      input: TEEInput;
      systemPrompt: string;
      authorizedAddress: string;
      operatorAddress?: string;
      runtimeHash?: string;
      agentIdBytes32?: string;
    };
    const agent = new SEALFluenceAgent(input.agentId, LLM_ANTHROPIC, LLM_GEMINI);

    // Stage 01+02: Attest inputs + Reason in TEE
    const reasoning = await agent.reasonInTEE(input, systemPrompt);

    // Stage 03: Commit + Attest
    const { attestation, commitment } = await agent.commitAndAttest(input, reasoning);

    // Seal blob (encrypt, pin to filecoin and encrypt key via Lit) — graceful
    let sealed: { cid: string; url: string; encryptedKey: any; iv: string } | null = null;
    try {
      sealed = await sealBlob(reasoning.reasoningBlob, commitment.merkleRoot, authorizedAddress);
      if (sealed?.cid) {
        await logAuditEntry({
          event: 'commit',
          agentId: input.agentId,
          commitmentHash: commitment.merkleRoot,
          timestamp: Date.now(),
          metadata: { cid: sealed.cid, taskId: input.taskId }
        });
      }
    } catch (storageErr: any) {
      console.warn('Storage layer unavailable (Lit/Storacha):', storageErr.message);
    }

    // Stage 03b: Submit commitment on-chain (if configured + agent id)
    let onChainTx: { txHash: string; blockNumber: number } | null = null;
    const agentIdResolved = resolveAgentIdBytes({ agentIdBytes32, operatorAddress, runtimeHash });
    if (sealContract && agentIdResolved) {
      try {
        const taskIdBytes = ethers.id(input.taskId);
        const merkleRootBytes = ethers.id(commitment.merkleRoot);
        const quoteBytes = ethers.toUtf8Bytes(attestation.teeQuote);

        const tx = await sealContract.submitCommitment(
          taskIdBytes,
          merkleRootBytes,
          quoteBytes,
          commitment.nonce,
          commitment.timestamp,
          agentIdResolved
        );
        const receipt = await tx.wait();
        onChainTx = {
          txHash: receipt.hash,
          blockNumber: receipt.blockNumber
        };
        console.log(`On-chain: commitment submitted for ${input.taskId}, tx: ${receipt.hash}`);
      } catch (chainErr: any) {
        console.warn('On-chain submission failed:', chainErr.message);
      }
    }

    // Stage 04: Execute in TEE
    const { txData, executionAttestation } = await agent.executeInTEE(input, reasoning, attestation);

    res.json({
      inputHash: reasoning.inputHash,
      reasoningHash: attestation.reasoningHash,
      commitment,
      onChain: onChainTx,
      sealed: sealed ? { cid: sealed.cid, url: sealed.url, encryptedKey: sealed.encryptedKey, iv: sealed.iv } : null,
      execution: { txData, executionHash: executionAttestation.executionHash },
      attestationQuote: attestation.teeQuote,
      signature: attestation.signature
    });
  } catch (err: any) {
    console.error('Pipeline error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── Demo vignettes ───────────────────────────────────────
app.post('/api/demo/treasury', async (_req, res) => {
  try {
    const demo = new TreasuryAgentDemo('treasury-demo', LLM_ANTHROPIC, LLM_GEMINI);
    const result = await demo.runDemo(
      '0xDAO123',
      { ETH: 45, USDC: 55 },
      { ethPrice: 3200, usdcPrice: 1, volatility: 0.15, gasPrice: 20 }
    );
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/demo/agent-to-agent', async (_req, res) => {
  try {
    const demo = new AgentToAgentDemo('client-001', 'worker-001', LLM_ANTHROPIC, LLM_GEMINI);
    const result = await demo.runDemo('Analyze market trends for Q1 2026', '0.5 ETH');
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/demo/credential-proof', async (_req, res) => {
  try {
    const demo = new CredentialProofDemo('cred-001', LLM_ANTHROPIC, LLM_GEMINI);
    const { authorizedAddress } = _req.body as { authorizedAddress: string };
    const result = await demo.runDemo('openai-api', 'gpt-4-access', authorizedAddress);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── On-chain: Submit commitment ──────────────────────────
app.post('/api/chain/submit-commitment', async (req, res) => {
  if (!sealContract) return res.status(503).json({ error: 'On-chain not configured' });
  try {
    const { taskId, merkleRoot, attestationQuote, nonce, timestamp, agentId } = req.body;
    if (!agentId || !/^0x[a-fA-F0-9]{64}$/.test(String(agentId).trim())) {
      return res.status(400).json({ error: 'agentId (bytes32 hex) is required' });
    }
    const taskIdBytes = ethers.id(taskId);
    const merkleRootBytes = ethers.id(merkleRoot);
    const quoteBytes = ethers.toUtf8Bytes(attestationQuote);
    const agentIdBytes = String(agentId).trim() as `0x${string}`;

    const tx = await sealContract.submitCommitment(
      taskIdBytes, merkleRootBytes, quoteBytes, nonce, timestamp, agentIdBytes
    );
    const receipt = await tx.wait();
    res.json({
      txHash: receipt.hash,
      blockNumber: receipt.blockNumber,
      taskId: taskIdBytes,
      merkleRoot: merkleRootBytes
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── On-chain: Get commitment status ─────────────────────
app.get('/api/chain/commitment/:taskId', async (req, res) => {
  if (!sealContractReader) return res.status(503).json({ error: 'On-chain not configured' });
  try {
    const taskIdBytes = ethers.id(req.params.taskId);
    const result = await sealContractReader.getCommitment(taskIdBytes);
    res.json({
      committed: Boolean(result[0]),
      executed: Boolean(result[1]),
      merkleRoot: String(result[2]),
      nonce: Number(result[3]),
      timestamp: Number(result[4]),
      submitter: String(result[5]),
      executionHash: String(result[6]),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── On-chain: Contract stats ─────────────────────────────
app.get('/api/chain/stats', async (_req, res) => {
  if (!sealContractReader) return res.status(503).json({ error: 'On-chain not configured' });
  try {
    const [commitmentCount, executionCount, disputeCount, disputeBond, disputePeriod, owner] = await Promise.all([
      sealContractReader.commitmentCount(),
      sealContractReader.executionCount(),
      sealContractReader.disputeCount(),
      sealContractReader.disputeBond(),
      sealContractReader.disputePeriod(),
      sealContractReader.owner()
    ]);
    res.json({
      contractAddress: CONTRACT_ADDRESS,
      chain: 'sepolia',
      commitmentCount: Number(commitmentCount),
      executionCount: Number(executionCount),
      disputeCount: Number(disputeCount),
      disputeBond: ethers.formatEther(disputeBond),
      disputePeriod: Number(disputePeriod),
      owner
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Agent summary (for operator dashboard) ───────────────
app.get('/api/agents/:agentIdHex', async (req, res) => {
  if (!sealContractReader) return res.status(503).json({ error: 'On-chain not configured' });
  try {
    let raw = req.params.agentIdHex.trim();
    if (!raw.startsWith("0x")) raw = `0x${raw}`;
    if (!/^0x[a-fA-F0-9]{64}$/.test(raw)) {
      return res.status(400).json({ error: "agentId must be 32-byte hex (0x + 64 chars)" });
    }
    const agentIdBytes = raw as `0x${string}`;
    const row = await sealContractReader.agents(agentIdBytes);
    const registered = Boolean(row[0]);
    const nonce = row[1];
    const stake = row[2];
    const slashed = Boolean(row[3]);
    const agentOwner = String(row[4]);

    const taskIdList: string[] = (await sealContractReader.getAgentTasks(agentIdBytes)).map((t: unknown) =>
      String(t)
    );
    const tasks: Array<{
      taskId: string;
      committed: boolean;
      executed: boolean;
      merkleRoot: string;
      nonce: number;
      timestamp: number;
      submitter: string;
      executionHash: string;
    }> = [];

    for (const tid of taskIdList) {
      const c = await sealContractReader.getCommitment(tid);
      tasks.push({
        taskId: tid,
        committed: Boolean(c[0]),
        executed: Boolean(c[1]),
        merkleRoot: String(c[2]),
        nonce: Number(c[3]),
        timestamp: Number(c[4]),
        submitter: String(c[5]),
        executionHash: String(c[6]),
      });
    }

    res.json({
      agentId: agentIdBytes,
      registered,
      nonce: Number(nonce),
      stakeWei: stake.toString(),
      stakeEth: ethers.formatEther(stake),
      slashed,
      agentOwner,
      tasks,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Registered agents (on-chain enumeration) ─────────────
app.get('/api/chain/registered-agents', async (_req, res) => {
  if (!sealContractReader) return res.status(503).json({ error: 'On-chain not configured' });
  try {
    let agents: string[] = [];
    try {
      const arr = await sealContractReader.getRegisteredAgents();
      agents = Array.isArray(arr) ? arr.map((id: unknown) => String(id)) : [];
    } catch {
      const count = await sealContractReader.registeredAgentCount();
      const n = Number(count);
      for (let i = 0; i < n; i++) {
        const id = await sealContractReader.registeredAgentAt(i);
        agents.push(String(id));
      }
    }
    res.json({ agents, count: agents.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Audit requests (auditor → operator; persisted under backend/data/) ───
app.post('/api/audit-requests', async (req, res) => {
  try {
    const { agentIdBytes32, auditorAddress, message, signature, scope, note } = req.body as {
      agentIdBytes32?: string;
      auditorAddress?: string;
      message?: string;
      signature?: string;
      scope?: string;
      note?: string;
    };
    let raw = agentIdBytes32?.trim();
    if (!raw || !/^0x[a-fA-F0-9]{64}$/.test(raw)) {
      return res.status(400).json({ error: 'agentIdBytes32 (0x + 64 hex) is required' });
    }
    if (!raw.startsWith('0x')) raw = `0x${raw}`;
    if (!auditorAddress || !ethers.isAddress(auditorAddress)) {
      return res.status(400).json({ error: 'valid auditorAddress is required' });
    }
    if (!message || !signature) {
      return res.status(400).json({ error: 'message and signature are required' });
    }
    const sc = scope === 'reveal_all' || scope === undefined ? 'reveal_all' : null;
    if (!sc) return res.status(400).json({ error: 'scope must be reveal_all' });

    const expected = buildAuditRequestMessage(raw, ethers.getAddress(auditorAddress));
    if (message !== expected) {
      return res.status(400).json({ error: 'message does not match canonical audit request format' });
    }

    let recovered: string;
    try {
      recovered = ethers.verifyMessage(message, signature);
    } catch {
      return res.status(400).json({ error: 'invalid signature' });
    }
    if (recovered.toLowerCase() !== auditorAddress.toLowerCase()) {
      return res.status(400).json({ error: 'signature does not match auditor address' });
    }

    if (sealContractReader) {
      const row = await sealContractReader.agents(raw as `0x${string}`);
      if (!row[0]) {
        return res.status(400).json({ error: 'agent is not registered on-chain' });
      }
    }

    const id = `req-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const row: AuditRequestRecord = {
      id,
      createdAt: new Date().toISOString(),
      agentIdBytes32: raw,
      auditorAddress: ethers.getAddress(auditorAddress),
      scope: 'reveal_all',
      message,
      signature,
      status: 'pending',
      ...(note?.trim() ? { note: note.trim().slice(0, 2000) } : {}),
    };
    const list = readAuditRequests();
    list.unshift(row);
    writeAuditRequests(list);
    res.json({ request: row });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/audit-requests', async (req, res) => {
  try {
    const operator = req.query.operator as string | undefined;
    const auditor = req.query.auditor as string | undefined;
    let list = readAuditRequests();

    if (operator && ethers.isAddress(operator)) {
      const op = operator.toLowerCase();
      const filtered: AuditRequestRecord[] = [];
      for (const r of list) {
        if (!sealContractReader) continue;
        const row = await sealContractReader.agents(r.agentIdBytes32 as `0x${string}`);
        const owner = String(row[4]).toLowerCase();
        if (owner === op) filtered.push(r);
      }
      list = filtered;
    } else if (auditor && ethers.isAddress(auditor)) {
      const au = auditor.toLowerCase();
      list = list.filter((r) => r.auditorAddress.toLowerCase() === au);
    }

    res.json({ requests: list });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/audit-requests/:id/reveal', async (req, res) => {
  try {
    const { operatorPrivateKey } = req.body as { operatorPrivateKey?: string };
    if (!operatorPrivateKey?.trim()) {
      return res.status(400).json({
        error:
          'operatorPrivateKey is required — decrypts the Lit-wrapped AES key (same wallet that sealed the blob). Use only on trusted networks; prefer client-side Lit in production.',
      });
    }
    const wallet = new ethers.Wallet(operatorPrivateKey.trim());
    const id = req.params.id;
    const list = readAuditRequests();
    const idx = list.findIndex((r) => r.id === id);
    if (idx === -1) return res.status(404).json({ error: 'request not found' });
    const reqRow = list[idx];
    if (reqRow.status !== 'pending') {
      return res.status(400).json({ error: `request is ${reqRow.status}` });
    }
    if (!sealContractReader) return res.status(503).json({ error: 'On-chain not configured' });

    const agentRow = await sealContractReader.agents(reqRow.agentIdBytes32 as `0x${string}`);
    const agentOwner = String(agentRow[4]);
    if (wallet.address.toLowerCase() !== agentOwner.toLowerCase()) {
      return res.status(403).json({ error: 'private key does not match on-chain agent owner' });
    }

    const blobs = sealedForAgent(reqRow.agentIdBytes32);
    if (blobs.length === 0) {
      return res.status(400).json({
        error:
          'No sealed reasoning stored for this agent. Run the dashboard pipeline once so the backend persists CID + encrypted keys.',
      });
    }

    const parts: string[] = [];
    for (const b of blobs) {
      const pt = await revealBlob(b.cid, b.encryptedKey, b.iv, operatorPrivateKey.trim());
      parts.push(`--- task: ${b.taskId} ---\n${pt}`);
    }
    const plaintext = parts.join('\n\n');

    list[idx] = {
      ...reqRow,
      status: 'revealed',
      revealedPlaintext: plaintext,
      revealedAt: new Date().toISOString(),
    };
    writeAuditRequests(list);

    await logAuditEntry({
      event: 'reveal',
      agentId: reqRow.agentIdBytes32,
      commitmentHash: reqRow.id,
      timestamp: Date.now(),
      metadata: { auditor: reqRow.auditorAddress, auditRequestId: id },
    });

    res.json({ ok: true, request: list[idx] });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** Sealed blob refs for client-side Lit decrypt (same rows as server-side reveal). */
app.get('/api/audit-requests/:id/sealed-blobs', async (req, res) => {
  try {
    const operator = req.query.operator as string | undefined;
    if (!operator?.trim() || !ethers.isAddress(operator)) {
      return res.status(400).json({ error: 'operator query param must be a valid address' });
    }
    const id = req.params.id;
    const list = readAuditRequests();
    const reqRow = list.find((r) => r.id === id);
    if (!reqRow) return res.status(404).json({ error: 'request not found' });
    if (reqRow.status !== 'pending') {
      return res.status(400).json({ error: `request is ${reqRow.status}` });
    }
    if (!sealContractReader) return res.status(503).json({ error: 'On-chain not configured' });

    const agentRow = await sealContractReader.agents(reqRow.agentIdBytes32 as `0x${string}`);
    const agentOwner = String(agentRow[4]);
    if (operator.toLowerCase() !== agentOwner.toLowerCase()) {
      return res.status(403).json({ error: 'operator must be the on-chain agent owner' });
    }

    const blobs = sealedForAgent(reqRow.agentIdBytes32);
    res.json({ blobs });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** Persist reveal after client-side decrypt; signature binds owner to plaintext hash. */
app.post('/api/audit-requests/:id/reveal-submit', async (req, res) => {
  try {
    const { plaintext, signature } = req.body as { plaintext?: string; signature?: string };
    if (typeof plaintext !== 'string' || !signature?.trim()) {
      return res.status(400).json({ error: 'plaintext and signature are required' });
    }
    const id = req.params.id;
    const list = readAuditRequests();
    const idx = list.findIndex((r) => r.id === id);
    if (idx === -1) return res.status(404).json({ error: 'request not found' });
    const reqRow = list[idx];
    if (reqRow.status !== 'pending') {
      return res.status(400).json({ error: `request is ${reqRow.status}` });
    }
    if (!sealContractReader) return res.status(503).json({ error: 'On-chain not configured' });

    const agentRow = await sealContractReader.agents(reqRow.agentIdBytes32 as `0x${string}`);
    const agentOwner = String(agentRow[4]);

    const plaintextKeccak256 = ethers.keccak256(ethers.toUtf8Bytes(plaintext));
    const msg = buildRevealSubmitMessage(
      id,
      reqRow.agentIdBytes32,
      reqRow.auditorAddress,
      plaintextKeccak256,
    );
    let recovered: string;
    try {
      recovered = ethers.verifyMessage(msg, signature);
    } catch {
      return res.status(400).json({ error: 'invalid signature' });
    }
    if (recovered.toLowerCase() !== agentOwner.toLowerCase()) {
      return res.status(403).json({ error: 'signature must be from agent owner' });
    }

    list[idx] = {
      ...reqRow,
      status: 'revealed',
      revealedPlaintext: plaintext,
      revealedAt: new Date().toISOString(),
    };
    writeAuditRequests(list);

    await logAuditEntry({
      event: 'reveal',
      agentId: reqRow.agentIdBytes32,
      commitmentHash: reqRow.id,
      timestamp: Date.now(),
      metadata: { auditor: reqRow.auditorAddress, auditRequestId: id, via: 'wallet-submit' },
    });

    res.json({ ok: true, request: list[idx] });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/audit-requests/:id/deny', async (req, res) => {
  try {
    const { signature } = req.body as { signature?: string };
    if (!signature) return res.status(400).json({ error: 'signature is required' });
    const id = req.params.id;
    const list = readAuditRequests();
    const idx = list.findIndex((r) => r.id === id);
    if (idx === -1) return res.status(404).json({ error: 'request not found' });
    const reqRow = list[idx];
    if (reqRow.status !== 'pending') {
      return res.status(400).json({ error: `request is ${reqRow.status}` });
    }
    if (!sealContractReader) return res.status(503).json({ error: 'On-chain not configured' });

    const agentRow = await sealContractReader.agents(reqRow.agentIdBytes32 as `0x${string}`);
    const agentOwner = String(agentRow[4]);
    const msg = buildDenyMessage(id, reqRow.agentIdBytes32);
    let recovered: string;
    try {
      recovered = ethers.verifyMessage(msg, signature);
    } catch {
      return res.status(400).json({ error: 'invalid signature' });
    }
    if (recovered.toLowerCase() !== agentOwner.toLowerCase()) {
      return res.status(403).json({ error: 'signature must be from agent owner' });
    }

    list[idx] = {
      ...reqRow,
      status: 'denied',
      denyAt: new Date().toISOString(),
    };
    writeAuditRequests(list);
    res.json({ ok: true, request: list[idx] });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Pipeline: LLM + attestation only; client signs txs with MetaMask ─────
app.post('/api/pipeline-prepare', async (req, res) => {
  try {
    const { input, systemPrompt, authorizedAddress, operatorAddress, runtimeHash, agentIdBytes32 } = req.body as {
      input: TEEInput;
      systemPrompt: string;
      authorizedAddress: string;
      operatorAddress?: string;
      runtimeHash?: string;
      agentIdBytes32?: string;
    };
    const agentIdResolved = resolveAgentIdBytes({ agentIdBytes32, operatorAddress, runtimeHash });
    if (!agentIdResolved) {
      return res.status(400).json({
        error: 'Provide agentIdBytes32 or (operatorAddress + runtimeHash) matching registerAgent',
      });
    }
    const agent = new SEALFluenceAgent(input.agentId, LLM_ANTHROPIC, LLM_GEMINI);

    const reasoning = await agent.reasonInTEE(input, systemPrompt);
    const { attestation, commitment } = await agent.commitAndAttest(input, reasoning);

    let sealed: { cid: string; url: string; encryptedKey: any; iv: string } | null = null;
    try {
      sealed = await sealBlob(reasoning.reasoningBlob, commitment.merkleRoot, authorizedAddress);
      if (sealed?.cid) {
        await logAuditEntry({
          event: 'commit',
          agentId: input.agentId,
          commitmentHash: commitment.merkleRoot,
          timestamp: Date.now(),
          metadata: { cid: sealed.cid, taskId: input.taskId },
        });
        appendSealedBlob({
          agentIdBytes32: agentIdResolved,
          taskId: String(commitment.taskId),
          cid: sealed.cid,
          encryptedKey: sealed.encryptedKey,
          iv: sealed.iv,
          createdAt: new Date().toISOString(),
        });
      }
    } catch (storageErr: any) {
      console.warn('Storage layer unavailable (Lit/Storacha):', storageErr.message);
    }

    const taskIdBytes = ethers.id(commitment.taskId);
    const merkleRootBytes = ethers.id(commitment.merkleRoot);
    const quoteBytes = ethers.toUtf8Bytes(commitment.attestationQuote);

    const { txData, executionAttestation } = await agent.executeInTEE(input, reasoning, attestation);

    const execHashBytes = ethers.id(executionAttestation.executionHash);
    const txDataBytes = ethers.toUtf8Bytes(JSON.stringify(txData));
    const sigBytes = ethers.toUtf8Bytes(executionAttestation.signature);

    res.json({
      inputHash: reasoning.inputHash,
      reasoningHash: attestation.reasoningHash,
      commitment,
      sealed: sealed?.cid
        ? { cid: sealed.cid, url: sealed.url, encryptedKey: sealed.encryptedKey, iv: sealed.iv }
        : null,
      execution: { txData, executionHash: executionAttestation.executionHash },
      attestationQuote: attestation.teeQuote,
      signature: attestation.signature,
      onChainPrepared: {
        agentId: agentIdResolved,
        submitCommitment: {
          taskId: taskIdBytes,
          merkleRoot: merkleRootBytes,
          attestationQuote: ethers.hexlify(quoteBytes),
          nonce: commitment.nonce,
          timestamp: commitment.timestamp,
        },
        executeTask: {
          taskId: taskIdBytes,
          txData: ethers.hexlify(txDataBytes),
          executionHash: execHashBytes,
          signature: ethers.hexlify(sigBytes),
        },
      },
      contractAddress: CONTRACT_ADDRESS,
      chain: 'sepolia',
    });
  } catch (err: any) {
    console.error('Pipeline prepare error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── Full pipeline + on-chain commit ──────────────────────
app.post('/api/pipeline-onchain', async (req, res) => {
  if (!sealContract) return res.status(503).json({ error: 'On-chain not configured' });
  try {
    const { input, systemPrompt, authorizedAddress, operatorAddress, runtimeHash, agentIdBytes32 } = req.body as {
      input: TEEInput;
      systemPrompt: string;
      authorizedAddress: string;
      operatorAddress?: string;
      runtimeHash?: string;
      agentIdBytes32?: string;
    };
    const agentIdResolved = resolveAgentIdBytes({ agentIdBytes32, operatorAddress, runtimeHash });
    if (!agentIdResolved) {
      return res.status(400).json({
        error: 'Provide agentIdBytes32 or (operatorAddress + runtimeHash) matching registerAgent',
      });
    }
    const agent = new SEALFluenceAgent(input.agentId, LLM_ANTHROPIC, LLM_GEMINI);

    // Stage 01+02: Attest inputs + Reason in TEE
    const reasoning = await agent.reasonInTEE(input, systemPrompt);

    // Stage 03: Commit + Attest
    const { attestation, commitment } = await agent.commitAndAttest(input, reasoning);

    // Seal blob (encrypt, pin to filecoin and encrypt key via Lit) — graceful
    let sealed: { cid: string; url: string; encryptedKey: any; iv: string } | null = null;
    try {
      sealed = await sealBlob(reasoning.reasoningBlob, commitment.merkleRoot, authorizedAddress);
      if (sealed?.cid) {
        await logAuditEntry({
          event: 'commit',
          agentId: input.agentId,
          commitmentHash: commitment.merkleRoot,
          timestamp: Date.now(),
          metadata: { cid: sealed.cid, taskId: input.taskId }
        });
      }
    } catch (storageErr: any) {
      console.warn('Storage layer unavailable (Lit/Storacha):', storageErr.message);
    }

    // Stage 03b: Submit commitment ON-CHAIN
    const taskIdBytes = ethers.id(commitment.taskId);
    const merkleRootBytes = ethers.id(commitment.merkleRoot);
    const quoteBytes = ethers.toUtf8Bytes(commitment.attestationQuote);

    const tx = await sealContract.submitCommitment(
      taskIdBytes,
      merkleRootBytes,
      quoteBytes,
      commitment.nonce,
      commitment.timestamp,
      agentIdResolved
    );
    const receipt = await tx.wait();

    // Stage 04: Execute in TEE
    const { txData, executionAttestation } = await agent.executeInTEE(input, reasoning, attestation);

    // Stage 04b: Submit execution ON-CHAIN (closes the loop)
    const execHashBytes = ethers.id(executionAttestation.executionHash);
    const txDataBytes = ethers.toUtf8Bytes(JSON.stringify(txData));
    const sigBytes = ethers.toUtf8Bytes(executionAttestation.signature);

    const execTx = await sealContract.executeTask(
      taskIdBytes, txDataBytes, execHashBytes, sigBytes
    );
    const execReceipt = await execTx.wait();

    res.json({
      inputHash: reasoning.inputHash,
      reasoningHash: attestation.reasoningHash,
      commitment,
      onChain: {
        commitTxHash: receipt.hash,
        commitBlock: receipt.blockNumber,
        executeTxHash: execReceipt.hash,
        executeBlock: execReceipt.blockNumber,
        contractAddress: CONTRACT_ADDRESS,
        chain: 'sepolia'
      },
      sealed: sealed ? { cid: sealed.cid, url: sealed.url, encryptedKey: sealed.encryptedKey, iv: sealed.iv } : null,
      execution: { txData, executionHash: executionAttestation.executionHash },
      attestationQuote: attestation.teeQuote,
      signature: attestation.signature
    });
  } catch (err: any) {
    console.error('Pipeline+onchain error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── On-chain: Execute task ──────────────────────────────
app.post('/api/chain/execute-task', async (req, res) => {
  if (!sealContract) return res.status(503).json({ error: 'On-chain not configured' });
  try {
    const { taskId, txData, executionHash, signature } = req.body;
    const taskIdBytes = ethers.id(taskId);
    const execHashBytes = ethers.id(executionHash);
    const txDataBytes = ethers.toUtf8Bytes(JSON.stringify(txData));
    const sigBytes = ethers.toUtf8Bytes(signature);

    const tx = await sealContract.executeTask(taskIdBytes, txDataBytes, execHashBytes, sigBytes);
    const receipt = await tx.wait();
    res.json({ txHash: receipt.hash, blockNumber: receipt.blockNumber });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── On-chain: Dispute resolution ────────────────────────
app.post('/api/chain/dispute/raise', async (req, res) => {
  if (!sealContract) return res.status(503).json({ error: 'On-chain not configured' });
  try {
    const { agentId, taskId, evidenceHash, bondEth } = req.body;
    const agentIdBytes = ethers.id(agentId);
    const taskIdBytes = ethers.id(taskId);
    const evidenceHashBytes = ethers.id(evidenceHash);
    const bondWei = ethers.parseEther(bondEth || '0.005');

    const tx = await sealContract.raiseDispute(agentIdBytes, taskIdBytes, evidenceHashBytes, { value: bondWei });
    const receipt = await tx.wait();
    // Parse disputeId from event
    const event = receipt.logs.find((l: any) => l.fragment?.name === 'DisputeRaised');
    const disputeId = event ? Number(event.args[0]) : null;
    res.json({ txHash: receipt.hash, blockNumber: receipt.blockNumber, disputeId });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/chain/dispute/vote', async (req, res) => {
  if (!sealContract) return res.status(503).json({ error: 'On-chain not configured' });
  try {
    const { disputeId, inFavorOfSlash } = req.body;
    const tx = await sealContract.voteOnDispute(disputeId, inFavorOfSlash);
    const receipt = await tx.wait();
    res.json({ txHash: receipt.hash, blockNumber: receipt.blockNumber });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/chain/dispute/resolve', async (req, res) => {
  if (!sealContract) return res.status(503).json({ error: 'On-chain not configured' });
  try {
    const { disputeId } = req.body;
    const tx = await sealContract.resolveDispute(disputeId);
    const receipt = await tx.wait();
    res.json({ txHash: receipt.hash, blockNumber: receipt.blockNumber });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/chain/dispute/:disputeId', async (req, res) => {
  if (!sealContractReader) return res.status(503).json({ error: 'On-chain not configured' });
  try {
    const result = await sealContractReader.getDispute(Number(req.params.disputeId));
    const statusNames = ['None', 'Active', 'Resolved', 'Rejected'];
    res.json({
      status: statusNames[Number(result.status)] || 'Unknown',
      agentId: result.agentId,
      taskId: result.taskId,
      challenger: result.challenger,
      bond: ethers.formatEther(result.bond),
      evidenceHash: result.evidenceHash,
      votesFor: Number(result.votesFor),
      votesAgainst: Number(result.votesAgainst),
      deadline: Number(result.deadline),
      resolved: result.resolved
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Selective reveal: requesterPk must be the sealed blob owner's key — Lit decrypt signs a SIWE payload from that address.
app.post('/api/reveal', async (req, res) => {
  try {
    const { cid, encryptedKey, iv, requesterPk } = req.body;
    console.log('[/api/reveal] Received:', { cid, encryptedKey, iv, requesterPk: requesterPk ? '[redacted]' : undefined });
    if (!cid || !encryptedKey || !iv || !requesterPk) {
      return res.status(400).json({ error: 'cid, encryptedKey, iv, requesterPk are required', received: Object.keys(req.body) });
    }
    const [plaintext, cidValid] = await Promise.all([
      revealBlob(cid, encryptedKey, iv, requesterPk),
      verifyCid(cid, Buffer.from([])) // full verify happens client side with raw bytes
    ]);

    await logAuditEntry({
      event: 'reveal',
      agentId: 'reveal-requester',
      commitmentHash: cid,
      timestamp: Date.now(),
      metadata: { cid }
    });
    res.json({ plaintext, cid });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Verify attestation quote ─────────────────────────────
app.post('/api/verify-attestation', (req, res) => {
  try {
    const { attestationQuote } = req.body;
    const decoded = JSON.parse(Buffer.from(attestationQuote, 'base64').toString());
    const isValidFormat = decoded.format === 'aws-nitro-v1-mock'
      && decoded.payload?.pcrs
      && decoded.payload?.user_data
      && decoded.signature;
    res.json({
      valid: isValidFormat,
      format: decoded.format,
      moduleId: decoded.payload?.module_id,
      pcrs: decoded.payload?.pcrs,
      timestamp: decoded.payload?.timestamp
    });
  } catch (err: any) {
    res.status(400).json({ error: 'Invalid attestation quote', details: err.message });
  }
});

// ── Start ────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🦭 SĒAL Fluence TEE Runtime`);
  console.log(`   Server running on http://localhost:${PORT}`);
  console.log(`   Health: http://localhost:${PORT}/health`);
  console.log(`   Endpoints:`);
  console.log(`     POST /api/hash-inputs`);
  console.log(`     POST /api/pipeline`);
  console.log(`     POST /api/pipeline-onchain`);
  console.log(`     POST /api/demo/treasury`);
  console.log(`     POST /api/demo/agent-to-agent`);
  console.log(`     POST /api/demo/credential-proof`);
  console.log(`     POST /api/verify-attestation`);
  console.log(`     POST /api/reveal`);
  console.log(`     POST /api/chain/submit-commitment`);
  console.log(`     POST /api/chain/execute-task`);
  console.log(`     GET  /api/chain/commitment/:taskId`);
  console.log(`     GET  /api/chain/stats`);
  console.log(`     POST /api/chain/dispute/raise`);
  console.log(`     POST /api/chain/dispute/vote`);
  console.log(`     POST /api/chain/dispute/resolve`);
  console.log(`     GET  /api/chain/dispute/:disputeId`);
  console.log(`     GET  /api/chain/registered-agents`);
  console.log(`     POST /api/audit-requests`);
  console.log(`     GET  /api/audit-requests`);
  console.log(`     GET  /api/audit-requests/:id/sealed-blobs`);
  console.log(`     POST /api/audit-requests/:id/reveal`);
  console.log(`     POST /api/audit-requests/:id/reveal-submit`);
  console.log(`     POST /api/audit-requests/:id/deny`);
  console.log(`     GET  /api/agents/:agentIdHex\n`);
});

export default app;
