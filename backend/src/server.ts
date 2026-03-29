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

const app = express();
app.use(cors());
app.use(express.json());

const PORT = parseInt(process.env.PORT || '3001', 10);
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const RPC_URL = process.env.RPC_URL || '';
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS || '';
const SIGNER_PRIVATE_KEY = process.env.SIGNER_PRIVATE_KEY || '';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

// On-chain integration (available if contract is configured)
let provider: ethers.JsonRpcProvider | null = null;
let signer: ethers.Wallet | null = null;
let sealContract: ethers.Contract | null = null;

if (RPC_URL && CONTRACT_ADDRESS && SIGNER_PRIVATE_KEY && !CONTRACT_ADDRESS.startsWith('0x000000000000')) {
  provider = new ethers.JsonRpcProvider(RPC_URL);
  signer = new ethers.Wallet(SIGNER_PRIVATE_KEY, provider);
  sealContract = new ethers.Contract(CONTRACT_ADDRESS, SEAL_CONTRACT_ABI, signer);
  console.log(`On-chain: SEAL contract at ${CONTRACT_ADDRESS}`);
} else {
  console.log('On-chain: not configured (set CONTRACT_ADDRESS in .env)');
}

if ((!ANTHROPIC_API_KEY || ANTHROPIC_API_KEY.startsWith('sk-ant-xxx')) && !GEMINI_API_KEY) {
  console.error('ERROR: Set ANTHROPIC_API_KEY or GEMINI_API_KEY in .env');
  process.exit(1);
}
console.log(`LLM: ${ANTHROPIC_API_KEY ? 'Claude (primary)' : 'none'} ${GEMINI_API_KEY ? '+ Gemini (fallback)' : ''}`);

// ── Health ───────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'seal-fluence-tee', timestamp: Date.now() });
});

// ── Stage 01: Hash inputs ────────────────────────────────
app.post('/api/hash-inputs', (req, res) => {
  try {
    const agent = new SEALFluenceAgent('api-agent', ANTHROPIC_API_KEY, GEMINI_API_KEY);
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
    const { input, systemPrompt } = req.body as { input: TEEInput; systemPrompt: string };
    const agent = new SEALFluenceAgent(input.agentId, ANTHROPIC_API_KEY, GEMINI_API_KEY);

    // Stage 01+02: Attest inputs + Reason in TEE
    const reasoning = await agent.reasonInTEE(input, systemPrompt);

    // Stage 03: Commit + Attest
    const { attestation, commitment } = await agent.commitAndAttest(input, reasoning);

    // Seal blob (encrypt, pin to filecoin and encrypt key via Lit)
    const sealed = await sealBlob(reasoning.reasoningBlob, commitment.merkleRoot);
    await logAuditEntry({
      event: 'commit',
      agentId: input.agentId,
      commitmentHash: commitment.merkleRoot,
      timestamp: Date.now(),
      metadata: { cid: sealed.cid, taskId: input.taskId }
    });

    // Stage 04: Execute in TEE
    const { txData, executionAttestation } = await agent.executeInTEE(input, reasoning, attestation);

    res.json({
      inputHash: reasoning.inputHash,
      reasoningHash: attestation.reasoningHash,
      commitment,
      sealed: { cid: sealed.cid, url: sealed.url, encryptedKey: sealed.encryptedKey, iv: sealed.iv },
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
    const demo = new TreasuryAgentDemo('treasury-demo', ANTHROPIC_API_KEY, GEMINI_API_KEY);
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
    const demo = new AgentToAgentDemo('client-001', 'worker-001', ANTHROPIC_API_KEY, GEMINI_API_KEY);
    const result = await demo.runDemo('Analyze market trends for Q1 2026', '0.5 ETH');
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/demo/credential-proof', async (_req, res) => {
  try {
    const demo = new CredentialProofDemo('cred-001', ANTHROPIC_API_KEY, GEMINI_API_KEY);
    const result = await demo.runDemo('openai-api', 'gpt-4-access');
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── On-chain: Submit commitment ──────────────────────────
app.post('/api/chain/submit-commitment', async (req, res) => {
  if (!sealContract) return res.status(503).json({ error: 'On-chain not configured' });
  try {
    const { taskId, merkleRoot, attestationQuote, nonce, timestamp } = req.body;
    const taskIdBytes = ethers.id(taskId);
    const merkleRootBytes = ethers.id(merkleRoot);
    const quoteBytes = ethers.toUtf8Bytes(attestationQuote);

    const tx = await sealContract.submitCommitment(
      taskIdBytes, merkleRootBytes, quoteBytes, nonce, timestamp
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
  if (!sealContract) return res.status(503).json({ error: 'On-chain not configured' });
  try {
    const taskIdBytes = ethers.id(req.params.taskId);
    const result = await sealContract.getCommitment(taskIdBytes);
    res.json({
      committed: result.committed,
      executed: result.executed,
      merkleRoot: result.merkleRoot,
      nonce: Number(result.nonce),
      timestamp: Number(result.timestamp),
      submitter: result.submitter,
      executionHash: result.executionHash
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── On-chain: Contract stats ─────────────────────────────
app.get('/api/chain/stats', async (_req, res) => {
  if (!sealContract) return res.status(503).json({ error: 'On-chain not configured' });
  try {
    const [commitmentCount, executionCount, disputeCount, disputeBond, disputePeriod, owner] = await Promise.all([
      sealContract.commitmentCount(),
      sealContract.executionCount(),
      sealContract.disputeCount(),
      sealContract.disputeBond(),
      sealContract.disputePeriod(),
      sealContract.owner()
    ]);
    res.json({
      contractAddress: CONTRACT_ADDRESS,
      chain: 'base-sepolia',
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

// ── Full pipeline + on-chain commit ──────────────────────
app.post('/api/pipeline-onchain', async (req, res) => {
  if (!sealContract) return res.status(503).json({ error: 'On-chain not configured' });
  try {
    const { input, systemPrompt } = req.body as { input: TEEInput; systemPrompt: string };
    const agent = new SEALFluenceAgent(input.agentId, ANTHROPIC_API_KEY, GEMINI_API_KEY);

    // Stage 01+02: Attest inputs + Reason in TEE
    const reasoning = await agent.reasonInTEE(input, systemPrompt);

    // Stage 03: Commit + Attest
    const { attestation, commitment } = await agent.commitAndAttest(input, reasoning);

    // Stage 03b: Submit commitment ON-CHAIN
    const taskIdBytes = ethers.id(commitment.taskId);
    const merkleRootBytes = ethers.id(commitment.merkleRoot);
    const quoteBytes = ethers.toUtf8Bytes(commitment.attestationQuote);

    const tx = await sealContract.submitCommitment(
      taskIdBytes, merkleRootBytes, quoteBytes, commitment.nonce, commitment.timestamp
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
        chain: 'base-sepolia'
      },
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
  if (!sealContract) return res.status(503).json({ error: 'On-chain not configured' });
  try {
    const result = await sealContract.getDispute(Number(req.params.disputeId));
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

// Selective reveal, call this from the reveal ui with the requester's private key
app.post('/api/reveal', async (req, res) => {
  try {
    const { cid, encryptedKey, iv, requesterPk } = req.body;
    if (!cid || !encryptedKey || !iv || !requesterPk) {
      return res.status(400).json({ error: 'cid, encryptedKey, iv, requesterPk are required' });
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
  console.log(`     GET  /api/chain/dispute/:disputeId\n`);
});

export default app;
