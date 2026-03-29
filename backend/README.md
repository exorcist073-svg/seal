# SĒAL Backend - Fluence TEE Runtime

Dev B: TEE Runtime + Attestation using **Fluence** (instead of AWS Nitro)

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Fluence Network                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │ TEE Service │  │ TEE Service │  │ TEE Service │         │
│  │   Node 1    │  │   Node 2    │  │   Node 3    │         │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘         │
└─────────┼────────────────┼────────────────┼───────────────┘
          │                │                │
          └────────────────┴────────────────┘
                           │
                    ┌──────┴──────┐
                    │  Aqua Script │
                    │  Composition │
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
         ┌────┴────┐  ┌────┴────┐  ┌───┴────┐
         │ Stage 1 │  │ Stage 2 │  │Stage 3-4│
         │ Input   │  │ Reason  │  │Commit  │
         │ Hashing │  │ in TEE  │  │Execute │
         └─────────┘  └────┬────┘  └─────────┘
                            │
                       ┌────┴────┐
                       │ Claude  │
                       │   LLM   │
                       └─────────┘
```

## Project Structure

```
backend/
├── src/
│   ├── agent.ts                  # Core SEALFluenceAgent class
│   ├── contract-integration.ts   # Dev A smart contract integration
│   └── vignettes/
│       ├── treasury-agent.ts     # Demo 1: DAO treasury
│       ├── agent-to-agent.ts     # Demo 2: A2A pipeline
│       └── credential-proof.ts   # Demo 3: Lit Protocol creds
├── service/
│   └── tee_service.rs           # Fluence Marine service (Rust/WASM)
├── aqua/
│   └── seal.aqua                # Aqua composition scripts
├── index.ts                     # Main entry + CLI runner
├── package.json
├── tsconfig.json
└── fluence.yaml                 # Fluence deployment config
```

## 6-Stage Pipeline

| Stage | Description | Output |
|-------|-------------|--------|
| 01 | Attest Inputs | `inputHash` (SHA-256) |
| 02 | Reason in TEE | LLM response from Claude |
| 03 | Commit + Attest | `merkleRoot` + `teeQuote` (Nitro format) |
| 04 | Execute in TEE | Transaction data + execution attestation |
| 05 | Guaranteed Delivery | On-chain commitment |
| 06 | Selective Reveal | Lit Protocol decryption (Dev C) |

## Attestation Quote Format

Mock Nitro-style attestation (transparently disclosed for hackathon):

```json
{
  "payload": {
    "module_id": "seal-fluence-tee",
    "timestamp": 1234567890,
    "digest": "SHA384",
    "pcrs": {
      "0": "enclave-image-hash",
      "1": "signing-key-hash",
      "2": "config-hash"
    },
    "enclave_key": "0x...",
    "user_data": "base64(task-data)",
    "nonce": "..."
  },
  "signature": "0x...",
  "format": "aws-nitro-v1-mock"
}
```

## Quick Start

```bash
# Install dependencies
npm install

# Set API key
export ANTHROPIC_API_KEY=your_key_here

# Run all demo vignettes
npm run demo

# Or run individually
npm run demo:treasury
npm run demo:a2a
npm run demo:credential
```

## Integration Points

### Dev A (Smart Contract)
- Submit commitment: `ContractIntegration.submitCommitment()`
- Verify attestation: `ContractIntegration.verifyAttestationOnChain()`
- Contract ABI exported in `SEAL_CONTRACT_ABI`

### Dev C (Storage + Lit)
- Reasoning blobs encrypted before storage
- Lit Protocol conditions for selective reveal
- Credential vault integration

### Dev D (Frontend)
- Live pipeline trace via Aqua script events
- Hash match verification UI
- Reveal trigger with attestation display

## Demo Vignettes

### 1. Treasury Agent
DAO treasury monitors holdings, reasons on rebalancing, commits hash, executes with staker approval.

### 2. Agent-to-Agent
Client agent hires worker, worker reasons in TEE, delivers with attestation, client can slash if fraud.

### 3. Credential Proof
Agent proves API credential access without exposing keys, using Lit Protocol vault + TEE attestation.

## Sponsor Integration

- **Fluence**: Decentralized TEE runtime, attestation generation
- **Claude**: LLM reasoning inside TEE
- **Lit Protocol**: Decryption keys + credential vault (Dev C)
- **Filecoin/Storacha**: Encrypted blob storage (Dev C)
- **NEAR**: Runtime-verified staking (Dev A)

## License

Confidential - PL Genesis March 2026
