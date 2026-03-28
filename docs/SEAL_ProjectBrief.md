# SĒAL — Secure Enclave Agent Layer

> Confidential, verifiable execution infrastructure for AI agents operating on-chain.

**Track:** AI Agents for Web3
**Type:** Protocol / Infrastructure
**Stage:** Hackathon Build — PL Genesis March 2026
**Sponsors:** Lit Protocol · Filecoin / Storacha · NEAR · Flow

---

## The Problem

AI agents are becoming autonomous economic actors — managing on-chain treasuries, executing trades, paying for services, and coordinating with other agents. The infrastructure beneath them has a critical gap across five dimensions:

- **Poisoned inputs** — no standard for proving what data an agent was given before reasoning. Tamper the inputs, and correct reasoning on top of them is meaningless.
- **Opacity** — no way to prove what an agent decided before it executed. A bot can bypass logic entirely and call contracts directly.
- **Execution drift** — even if reasoning is verified, nothing stops a compromised runtime from acting differently from what it reasoned. Decision and action are not tied together.
- **Delivery risk** — signed transactions pass through external relayers before reaching the network. A relayer can drop, delay, or substitute — breaking the accountability chain at the last step.
- **Publicity** — any public audit trail leaks strategy to competitors. Accountability and privacy appear fundamentally at odds.

The result: the entire agentic economy is built on trust-me infrastructure. SEAL closes all five gaps simultaneously.

---

## The Solution

SEAL is the **commit-attest-execute layer** for AI agents. It separates what gets committed on-chain from what gets revealed and to whom — solving accountability and privacy at the same time.

The core principle: the agent reasons inside a confidential enclave. A cryptographic commitment goes on-chain before execution. The reasoning stays private — but any authorized party can request a verified reveal.

SEAL is designed as **infrastructure, not a product**. Any system that runs AI agents — a marketplace, a DAO, a trading desk, a hiring pipeline, a medical decision system — can use SEAL as the trust layer underneath. One primitive, every context.

---

## How It Works

Every agent action follows a strict six-stage pipeline enforced by the SEAL smart contract:

| Stage | What happens |
|-------|-------------|
| **01 Attest inputs** | All on-chain state and external data is hashed before entering the TEE. Proves not just what the agent decided, but what it was looking at. |
| **02 Reason in TEE** | The LLM call executes inside a Trusted Execution Environment (AWS Nitro Enclaves / Intel TDX). Reasoning never leaves the enclave in plaintext. |
| **03 Commit + Attest** | A merkle-batched hash of the full reasoning blob is committed on-chain alongside a TEE attestation quote and a strict sequence nonce. The nonce enforces that commitment provably precedes execution. |
| **04 Execute in TEE** | Execution happens inside the same TEE as reasoning. The action taken is hashed and included in the attestation — proving the agent acted consistently with what it reasoned. |
| **05 Guaranteed delivery** | The signed transaction is submitted directly from the TEE where possible. Where an external relayer is required, exact transaction bytes are committed on-chain before submission — any deviation is immediately detectable. |
| **06 Selective reveal** | Encrypted reasoning and execution blobs live on Filecoin / Storacha. Access control via Lit Protocol allows stakers, regulators, or auditors to decrypt on-demand and verify the full input-reason-execute chain. Privacy by default, transparency on request. |

---

## Architecture

| Layer | Component | Role |
|-------|-----------|------|
| Runtime | TEE agent runtime | TypeScript agent inside AWS Nitro Enclave. Handles LLM call, reasoning validation, blob encryption, and attestation generation. |
| Staking | Runtime verification stake | Agents register by staking a NEAR-based credential NFT backed by their runtime hash. Bad actors lose market access and stake simultaneously. |
| Contract | SEAL smart contract (EVM) | Solidity contract on Base or Arbitrum enforcing commit-before-execute. Stores merkle-batched commitment roots, validates attestation quotes, manages proposal lifecycle. |
| Storage | Encrypted IPFS layer | Full reasoning blobs encrypted AES-256 before pinning to Filecoin / Storacha. Content-addressed, permanent, and verifiable. Decryption keys managed via Lit Protocol. |
| Vault | Credential vault | Agent API keys and sensitive credentials stored in Lit Protocol. Agents prove tool access without exposing credentials to other agents, operators, or the network. |
| Reveal | Selective reveal UI | Frontend allowing authorized parties to request decryption, verify on-chain commitment matches the revealed blob, and confirm TEE attestation. |

---

## Use Cases

SEAL is domain-agnostic. Any system running AI agents gains verifiable reasoning with a single integration:

- **DAO treasury management** — a treasury agent proposes and executes on-chain actions. Stakers can verify every decision was reasoned, and trigger a selective reveal if they suspect misalignment.
- **Agent-to-agent coordination** — in multi-agent pipelines, a client agent can prove a worker agent reasoned before delivering output, and slash the worker's stake if the reveal shows fraudulent reasoning.
- **Regulated industries** — finance, healthcare, and legal AI deployments require auditable decision trails. SEAL's Filecoin audit log becomes the compliance primitive — without exposing proprietary strategy.
- **Autonomous trading** — trading agents commit reasoning hashes before every trade. Post-hoc investigation by regulators or counterparties is possible without revealing the trading strategy in real time.

---

## Sponsor Integrations

| Sponsor | How SEAL uses it |
|---------|-----------------|
| **Lit Protocol** | Decentralized key management for selective reveal access control. Credential vault for encrypted agent API keys. Multisig fallback ensures demo reliability. |
| **Filecoin / Storacha** | Permanent, content-addressed storage for encrypted reasoning blobs and the complete audit trail — tasks, commits, reveals, payment records. |
| **NEAR Protocol** | Agent registry with runtime-verified staking. Operator credential NFTs that back the bypass-prevention enforcement mechanism. |
| **Flow** | High-throughput micro-settlement for per-task payments in multi-agent workflows — fast finality, sub-cent fees, commit-verified release. |

---

## Competitive Positioning

|  | Verifiable | Private | Bypass-proof | Agent-native |
|--|:---:|:---:|:---:|:---:|
| Traditional DAO bots | ✗ | — | ✗ | ✗ |
| Public IPFS audit logs | ✓ | ✗ | ✗ | ~ |
| ZK-only approaches | ✓ | ✓ | ✗ | ✗ |
| **SEAL** | **✓** | **✓** | **✓** | **✓** |

---

## The One-Minute Pitch

**The problem:** AI agents are about to control trillions in on-chain value. Right now there is no standard for proving what an agent was given, what it decided, that it acted consistently with that decision, and that the action was delivered unmodified — while keeping all of that confidential from competitors and still auditable by regulators.

**The solution:** SEAL is the attest-commit-execute-deliver layer for AI agents. Inputs are hashed before entry, reasoning happens inside a confidential TEE, execution is bound to the same attestation, delivery is committed before submission, and any authorized party can request a verified reveal of the full chain — without exposing it publicly.

**The demo:** A live AI treasury agent — watch it ingest attested inputs, reason inside the TEE, commit on-chain, execute, and deliver. Then trigger a selective reveal as an authorized staker and verify the complete input-reason-execute-deliver chain. The same infrastructure also powers an agent-to-agent task pipeline and a credential-proof scenario. One primitive. Every context that needs trust.

---

*Note on TEE: production deployment uses real AWS Nitro Enclaves or Intel TDX. The hackathon demo uses a mock attestation signer that generates correctly-structured attestation quotes. This is disclosed transparently and does not affect the architectural validity of the system.*
