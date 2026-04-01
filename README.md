<div align="center">

# SĒAL
### Secure Enclave Agent Layer

**Confidential, verifiable execution infrastructure for AI agents operating on-chain.**

[![License: MIT](https://img.shields.io/badge/License-MIT-black.svg)](LICENSE)
[![Track: AI Agents for Web3](https://img.shields.io/badge/Track-AI%20Agents%20for%20Web3-6366f1.svg)]()
[![Stage: Hackathon](https://img.shields.io/badge/Stage-PL%20Genesis%20March%202026-0f6e56.svg)]()
[![Built with: TEE](https://img.shields.io/badge/Runtime-Trusted%20Execution%20Environment-534ab7.svg)]()

*PL Genesis · March 2026*

</div>

---

## Table of Contents

- [Overview](#overview)
- [The Problem](#the-problem)
- [The Solution](#the-solution)
- [How It Works](#how-it-works)
- [Architecture](#architecture)
- [Features](#features)
- [Integrations](#integrations)
- [Use Cases](#use-cases)
- [Competitive Landscape](#competitive-landscape)
- [Getting Started](#getting-started)
- [Project Structure](#project-structure)
- [Contributing](#contributing)

---

## Overview

AI agents are becoming autonomous economic actors. In 2026, agents already manage on-chain treasuries, execute trades, pay for services, and coordinate with other agents at scale. The infrastructure beneath them has not kept pace.

**SEAL is the commit-attest-execute-deliver layer for AI agents.**

It protects the full decision-action chain — inputs, reasoning, execution, and delivery — not just one step. It gives any system running AI agents a single integration point for verifiable, auditable, private-by-default agent behavior. SEAL is infrastructure, not a product: a primitive that any agent-powered system can adopt regardless of domain.

---

## The Problem

The agentic economy is built on trust-me infrastructure. When an AI agent manages a treasury, executes a trade, or coordinates with another agent, there is currently no standard way to verify any part of that process. Five critical gaps remain unaddressed:

### 1. Poisoned Inputs
There is no standard for proving what data an agent was given before it reasoned. An adversary who controls the data feed can produce arbitrarily bad outcomes from a perfectly sound reasoning process. Correct logic on corrupt inputs is meaningless — and currently undetectable.

### 2. Opacity of Decisions
There is no way to prove what an agent decided before it executed. Any bot can bypass its own reasoning layer entirely and call smart contracts directly, bypassing whatever guardrails were designed into the system. The reasoning and the action are not bound together.

### 3. Execution Drift
Even when reasoning can be verified after the fact, nothing stops a compromised runtime from taking a different action than the one reasoned. The gap between "what the agent decided" and "what the agent did" is currently invisible and exploitable.

### 4. Delivery Risk
Signed transactions pass through external relayers before reaching the network. A malicious or compromised relayer can drop, delay, reorder, or substitute transactions — breaking the accountability chain at the final step, after all other safeguards have passed.

### 5. The Privacy-Accountability Paradox
Any public audit trail leaks proprietary strategy to competitors and adversaries in real time. Builders currently face an impossible choice: accountability (public reasoning) or privacy (no verifiability). There is no existing mechanism that provides both.

> The result: regulators have no standard for verification, builders have no trust primitive to build on, and the entire agentic economy rests on operator promises rather than cryptographic guarantees.

---

## The Solution

SEAL resolves all five gaps simultaneously through a single architectural principle:

**Reason privately. Commit publicly. Reveal selectively.**

The agent reasons inside a Trusted Execution Environment (TEE). A cryptographic commitment to that reasoning goes on-chain before any action is taken. The reasoning itself stays encrypted — but any authorized party (a staker, a regulator, an auditor) can request and verify a full reveal of the input-reason-execute-deliver chain at any time, without that reveal being public.

This architecture delivers:
- **Verifiability** — every decision is cryptographically bound to its inputs and its outcome
- **Privacy** — reasoning is encrypted by default; only authorized parties can decrypt
- **Bypass-proofing** — the smart contract gates execution on a valid prior commitment; no commitment, no execution
- **Delivery integrity** — transaction bytes are committed before submission; any deviation is immediately detectable
- **Economic enforcement** — agents stake to operate; bad actors lose market access and stake simultaneously

---

## How It Works

SEAL enforces a strict six-stage pipeline on every agent action. The pipeline is not advisory — it is enforced at the smart contract level. An agent cannot execute without first committing, and cannot commit without first attesting its inputs.

```
┌─────────────────────────────────────────────────────────────────────┐
│                         SEAL PIPELINE                               │
│                                                                     │
│  External Data                                                      │
│  On-chain State  ──►  [01 ATTEST INPUTS]                           │
│                              │                                      │
│                              ▼                                      │
│                     [02 REASON IN TEE]  ◄── LLM (Claude / Gemini)  │
│                              │                                      │
│                              ▼                                      │
│                    [03 COMMIT + ATTEST]  ──► On-chain merkle root   │
│                              │                                      │
│                              ▼                                      │
│                    [04 EXECUTE IN TEE]  ◄── SEAL contract gate      │
│                              │                                      │
│                              ▼                                      │
│                 [05 GUARANTEED DELIVERY]  ──► Network               │
│                              │                                      │
│                              ▼                                      │
│                   [06 SELECTIVE REVEAL]  ──► Authorized parties     │
│                    (Filecoin + Lit Protocol)                        │
└─────────────────────────────────────────────────────────────────────┘
```

### Stage 01 — Attest Inputs
All on-chain state and external data fed into the agent is hashed before entering the TEE. This hash is included in the attestation bundle — proving not just what the agent decided, but what it was looking at when it decided. Input poisoning attacks are detectable after the fact and attributable.

### Stage 02 — Reason in TEE
The LLM call executes inside a Trusted Execution Environment (AWS Nitro Enclaves or Intel TDX). Reasoning never leaves the enclave in plaintext. Where possible, model inference runs locally inside the TEE. For external model APIs, the call and response are treated as attested input, with the API boundary explicitly included in the attestation.

### Stage 03 — Commit + Attest
A merkle-batched cryptographic hash of the full reasoning blob is committed on-chain alongside a TEE attestation quote and a strict sequence nonce. The nonce enforces that the commitment provably precedes execution — block-level timestamp gaming is not sufficient to reorder them. The on-chain record is permanent and tamper-evident.

### Stage 04 — Execute in TEE
Execution happens inside the same TEE as reasoning, under the same attestation. The SEAL smart contract gates execution on a valid prior commitment — no commitment, no execution. Critically, the action taken is also hashed and included in the attestation, proving not just that the agent reasoned, but that it acted consistently with what it reasoned. A compromised operator cannot inject a different action after the reasoning step.

### Stage 05 — Guaranteed Delivery
The signed transaction is submitted directly from the TEE where possible, eliminating relayer risk entirely. Where an external relayer is required, the exact transaction bytes are committed on-chain before submission. Any deviation between committed bytes and the delivered transaction is immediately detectable and attributable to the relayer.

### Stage 06 — Selective Reveal
Encrypted reasoning and execution blobs are stored permanently on Filecoin / Storacha — content-addressed, verifiable, and persistent. Access control is managed by Lit Protocol, with a multisig fallback for resilience. Authorized parties — stakers, regulators, auditors — can request decryption on-demand and verify the full input-reason-execute-deliver chain against the on-chain commitment. Privacy by default. Transparency on request.

---

## Architecture

SEAL is composed of six integrated layers, each with a distinct responsibility:

```
┌─────────────────────────────────────────────────────────────────────┐
│  SEAL ARCHITECTURE                                                  │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  FRONTEND  ·  Selective Reveal UI (React / Next.js)          │  │
│  │  Stakeholder dashboard · Hash match verification · Audit log │  │
│  └──────────────────────┬───────────────────────────────────────┘  │
│                         │                                           │
│  ┌──────────────────────▼───────────────────────────────────────┐  │
│  │  SMART CONTRACT  ·  SEAL (EVM — Base / Arbitrum)             │  │
│  │  Commit-before-execute · Merkle roots · Attestation quotes   │  │
│  │  Proposal lifecycle · Slash conditions                       │  │
│  └────────────┬─────────────────────────┬────────────────────────┘  │
│               │                         │                           │
│  ┌────────────▼──────────────┐  ┌───────▼────────────────────────┐  │
│  │  TEE RUNTIME              │  │  NEAR STAKING REGISTRY         │  │
│  │  AWS Nitro / Intel TDX   │  │  Credential NFTs               │  │
│  │  LLM call · Attestation  │  │  Runtime hash verification     │  │
│  │  Blob encryption         │  │  Economic enforcement          │  │
│  └────────────┬──────────────┘  └────────────────────────────────┘  │
│               │                                                     │
│  ┌────────────▼──────────────────────────────────────────────────┐  │
│  │  STORAGE + ACCESS CONTROL                                     │  │
│  │  Filecoin / Storacha  ·  AES-256 encrypted blobs             │  │
│  │  Lit Protocol  ·  Decryption key management                  │  │
│  │  Credential vault  ·  Agent API key storage                  │  │
│  └───────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

| Layer | Component | Technology | Responsibility |
|-------|-----------|------------|----------------|
| **Runtime** | TEE agent runtime | AWS Nitro Enclaves / Intel TDX | Hosts the LLM call, reasoning validation, blob encryption, and attestation generation. The trusted core of the system. |
| **Staking** | Runtime verification stake | NEAR Protocol | Agents register by staking a credential NFT backed by their runtime hash. Economic and cryptographic enforcement in one. |
| **Contract** | SEAL smart contract | Solidity (EVM) | Enforces commit-before-execute. Stores merkle-batched commitment roots, validates TEE attestation quotes, manages proposal lifecycle. |
| **Storage** | Encrypted blob store | Filecoin / Storacha | Permanent, content-addressed storage for encrypted reasoning and execution blobs. AES-256 encryption before pinning. |
| **Vault** | Credential vault | Lit Protocol | Stores agent API keys and sensitive credentials. Agents prove tool access without exposing credentials to other agents, operators, or the network. |
| **Reveal** | Selective reveal UI | React / Next.js | Frontend for authorized parties to request decryption, verify on-chain commitment against revealed blob, and inspect TEE attestation. |

---

## Features

### Cryptographic Input Attestation
Every piece of data an agent consumes — on-chain state, oracle feeds, API responses — is hashed and included in the attestation bundle before reasoning begins. The provenance of every input is verifiable. Input poisoning attacks are detectable.

### Confidential Reasoning
All LLM inference executes inside a hardware-level Trusted Execution Environment. Reasoning never appears in plaintext outside the enclave. The operator, the network, and other agents cannot observe the reasoning process in real time.

### Commit-Before-Execute Enforcement
The SEAL smart contract enforces that no agent action can be submitted without a prior cryptographic commitment to the reasoning that produced it. The nonce mechanism makes the ordering tamper-evident at the block level.

### Execution Consistency Proof
The action taken by the agent is hashed and bound to the same attestation as the reasoning. It is provable that the agent acted consistently with what it reasoned — not just that it reasoned before acting. Operators cannot inject substitute actions post-reasoning.

### Verified Delivery
Transaction bytes are committed on-chain before submission to the network. Any substitution, delay, or modification by a relayer is immediately detectable by comparing delivered bytes to the committed hash.

### Selective, Authorized Reveal
Reasoning blobs are encrypted and stored permanently on Filecoin. Lit Protocol manages access conditions — stakers, auditors, and regulators can be granted decryption rights independently, with granular control. Privacy is the default; transparency is opt-in and controlled.

### Economic Stake Enforcement
Agents register with a NEAR-based credential NFT backed by their runtime hash. A compromised or misbehaving agent loses both its market access and its stake simultaneously — cryptographic and economic enforcement are unified, not layered.

### Credential Isolation
Agent API keys and sensitive tool credentials live in the Lit Protocol vault. Agents prove access to tools via cryptographic proof, without the credentials ever being visible to other agents, the operator, or the network.

### Merkle-Batched Commitments
Commitments are merkle-batched before posting on-chain, significantly reducing gas costs for high-frequency agents without sacrificing the tamper-evidence of individual commitment records.

### Domain-Agnostic Integration
SEAL exposes a single integration interface. Any system that runs AI agents adopts SEAL as its trust layer without modifying its own business logic. The pipeline is the primitive; the application is unchanged.

---

## Integrations

### Lit Protocol
**Role:** Decentralized key management and access control for selective reveal. Credential vault for agent API keys.

Lit Protocol manages the encryption keys for all reasoning blobs stored on Filecoin. Access conditions are defined per-deployment — a staker address, a regulator role, an auditor multisig — and enforced cryptographically without a centralized key custodian. A multisig fallback ensures reliability in demo and production contexts. The credential vault integration means agent tool credentials are never exposed in transit or at rest outside the enclave.

```typescript
// Example: define access conditions for a staker reveal
const accessControlConditions = [
  {
    contractAddress: SEAL_CONTRACT_ADDRESS,
    standardContractType: "ERC721",
    method: "isRegisteredStaker",
    parameters: [":userAddress"],
    returnValueTest: { comparator: "=", value: "true" }
  }
];
```

### Filecoin / Storacha
**Role:** Permanent, content-addressed storage for encrypted reasoning blobs and the complete audit trail.

Every reasoning blob, input hash, commitment record, and execution log is pinned to Filecoin via Storacha before the pipeline proceeds. Content addressing means the CID itself is the integrity proof — there is no separate hash to verify. The Filecoin audit log becomes the compliance primitive for regulated deployments: permanent, verifiable, and independent of the operator.

```typescript
// Example: pin an encrypted reasoning blob
const { cid } = await storacha.put([encryptedBlob], {
  name: `seal-reasoning-${commitmentHash}`,
  onStoredChunk: bytes => console.log(`Stored ${bytes} bytes`)
});
// CID is included in the on-chain commitment record
```

### NEAR Protocol
**Role:** Agent registry with runtime-verified staking. Operator credential NFTs backing the bypass-prevention mechanism.

Agents register on NEAR by minting a credential NFT whose metadata includes the runtime hash of their TEE environment. The SEAL smart contract cross-references this registry before accepting attestations. An agent whose runtime hash does not match its registered NFT is rejected at the contract level — not just flagged. If an agent is found to have acted maliciously, its NFT is burned and its stake is slashed in the same transaction.

```typescript
// Example: register an agent with its runtime hash
await nearContract.registerAgent({
  runtimeHash: await tee.getRuntimeHash(),
  operatorAddress: wallet.accountId,
  stake: MIN_STAKE_AMOUNT
});
```

### Flow Blockchain
**Role:** High-throughput micro-settlement for per-task payments in multi-agent workflows.

In multi-agent pipelines, agents pay each other for completed tasks. Flow's fast finality and sub-cent transaction fees make it practical to settle at the per-task level rather than batching. Payments are released only after the SEAL contract confirms a valid commitment for the task — commit-verified release ensures payment is conditional on verified execution.

---

## Use Cases

### DAO Treasury Management
A treasury agent proposes and executes on-chain actions — rebalancing allocations, paying contributors, deploying capital. Under SEAL, every proposal carries a cryptographic proof of the reasoning behind it. Stakers can verify that decisions were made by the agent, not injected by an operator. If token holders suspect misalignment, they can trigger a selective reveal and inspect the full input-reason-execute chain before ratifying or rejecting the next proposal.

### Agent-to-Agent Coordination
In multi-agent pipelines, a hiring agent delegates tasks to worker agents. SEAL lets the hiring agent prove that the worker reasoned before delivering output. If the output is disputed, the hiring agent can trigger a reveal of the worker's reasoning blob and verify it against the on-chain commitment. Workers who submitted fraudulent reasoning — or no reasoning at all — can be slashed. Trust in multi-agent systems is no longer based on reputation alone.

### Regulated Industry Deployments
Finance, healthcare, and legal AI deployments face strict auditability requirements. SEAL's Filecoin audit log provides a permanent, verifiable record of every agent decision — the inputs it considered, the reasoning it followed, the action it took, and the transaction it submitted. Regulators are granted reveal access via Lit Protocol conditions. The audit trail is available without the agent's proprietary reasoning being visible to competitors or the public.

### Autonomous Trading
Trading agents commit a reasoning hash before every trade. The strategy remains confidential in real time — competitors cannot observe the reasoning as it happens. After the fact, regulators or counterparties with appropriate access rights can trigger a reveal and verify that the agent's actions were consistent with its stated reasoning. Front-running the audit trail is prevented by the commit-before-execute nonce mechanism.

### Credential-Proof Workflows
An agent proving access to an API or service does so via the Lit Protocol credential vault — presenting a cryptographic proof of access rather than the credential itself. Other agents in the pipeline, the operator, and the network never see the underlying key. This enables agent-to-agent trust without credential exposure, even across agent boundaries owned by different operators.

---

## Competitive Landscape

SEAL occupies a position no existing solution covers: simultaneously verifiable, private, bypass-proof, and native to AI agent workflows.

|  | Verifiable | Private | Bypass-proof | Agent-native |
|--|:---:|:---:|:---:|:---:|
| Traditional DAO bots | ✗ | — | ✗ | ✗ |
| Public IPFS audit logs | ✓ | ✗ | ✗ | ◑ |
| ZK-only approaches | ✓ | ✓ | ✗ | ✗ |
| TEE-only runtimes | ◑ | ✓ | ✗ | ✗ |
| **SEAL** | **✓** | **✓** | **✓** | **✓** |

**Why ZK alone is insufficient:** Zero-knowledge proofs can verify that reasoning was performed correctly, but they do not prevent an operator from bypassing the reasoning layer and calling a contract directly. The proof only matters if it is required — SEAL enforces this requirement at the smart contract level.

**Why TEE alone is insufficient:** A TEE provides confidential execution but no on-chain accountability. Without the commit-before-execute contract enforcement, an operator can run reasoning in the TEE and then submit a different action. SEAL binds TEE execution to on-chain commitment — neither is meaningful without the other.

---

## Getting Started

> **Note on TEE environment:** Production deployment uses real AWS Nitro Enclaves or Intel TDX. The current build uses a mock attestation signer that generates correctly-structured attestation quotes for development and demo purposes. This is disclosed transparently and does not affect the architectural validity of the system.

### Prerequisites

```bash
node >= 18.0.0
npm >= 9.0.0
# A funded wallet on Ethereum Sepolia (or Arbitrum Sepolia) testnet
# NEAR testnet account
# Lit Protocol API key
# Storacha / web3.storage account
```

### Installation

```bash
git clone https://github.com/your-org/seal
cd seal
npm install
```

### Environment Setup

```bash
cp .env.example .env
```

```env
# Chain
EVM_RPC_URL=https://sepolia.base.org
PRIVATE_KEY=your_deployer_private_key
SEAL_CONTRACT_ADDRESS=

# NEAR
NEAR_NETWORK=testnet
NEAR_ACCOUNT_ID=your.testnet
NEAR_PRIVATE_KEY=

# Lit Protocol (network name only; no API key for SDK encrypt/decrypt)
LIT_NETWORK=nagaDev
# LIT_API_KEY=

# Storacha
STORACHA_TOKEN=

# LLM (inside TEE)
ANTHROPIC_API_KEY=
```

### Deploy the SEAL Contract

```bash
npm run deploy:contract
# Outputs: SEAL_CONTRACT_ADDRESS — paste into .env
```

### Register an Agent

```bash
npm run register:agent
# Stakes a credential NFT on NEAR and links it to the deployed contract
```

### Run the TEE Agent

```bash
npm run agent:start
# Starts the TypeScript agent inside the mock TEE enclave
# Begins listening for treasury proposals
```

### Launch the Reveal UI

```bash
npm run ui:dev
# Opens the stakeholder dashboard at http://localhost:3000
```

---

## Project Structure

```
seal/
│
├── contracts/                  # EVM smart contracts
│   ├── SEAL.sol                # Core commit-before-execute contract
│   ├── AgentRegistry.sol       # NEAR bridge + credential validation
│   └── test/
│
├── tee/                        # TEE agent runtime
│   ├── agent.ts                # Main agent entrypoint
│   ├── attestation.ts          # Attestation bundle generation
│   ├── enclave.ts              # Mock Nitro enclave wrapper
│   ├── llm.ts                  # LLM call handler (Claude / Gemini)
│   └── pipeline.ts             # Six-stage SEAL pipeline
│
├── storage/                    # Storage + access control
│   ├── filecoin.ts             # Storacha pinning client
│   ├── lit.ts                  # Lit Protocol key management
│   └── vault.ts                # Credential vault
│
├── near/                       # NEAR staking registry
│   ├── contract/               # NEAR smart contract (Rust)
│   └── scripts/                # Registration + slash scripts
│
├── ui/                         # Selective reveal frontend
│   ├── app/                    # Next.js app router
│   ├── components/
│   │   ├── CommitmentViewer    # On-chain commitment display
│   │   ├── RevealTrigger       # Authorized decrypt UI
│   │   ├── AttestationInspector# TEE quote viewer
│   │   └── PipelineTrace       # Live agent pipeline visualizer
│   └── lib/
│
├── demo/                       # Hackathon demo scripts
│   ├── treasury.ts             # Treasury agent vignette
│   ├── agent-to-agent.ts       # Multi-agent pipeline vignette
│   └── credential-proof.ts     # Credential proof vignette
│
├── scripts/                    # Deploy + utility scripts
├── .env.example
└── README.md
```

---

## Contributing

SEAL is hackathon-stage infrastructure. If you are building on it or want to extend it:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/your-feature`)
3. Keep PRs focused — one concern per PR
4. Include a brief description of which pipeline stage your change touches
5. Open a pull request

For architectural questions or integration discussions, open an issue with the `architecture` label.

---

<div align="center">

**SĒAL** · Secure Enclave Agent Layer

*One primitive. Every context that needs trust.*

Built at PL Genesis · March 2026

</div>
