# Operator dashboard — local contract + backend

End-to-end flow: **deploy SEAL** → **register agent in the UI** → **backend reads the same contract** for the monitor tab.

## 1. Local chain (Anvil)

With [Foundry](https://book.getfoundry.sh/) installed:

```bash
anvil
```

Deploy (separate terminal, from `contracts/`).

**Hardhat** (Node + `npm install` in `contracts/`):

```bash
cd contracts
npx hardhat run scripts/deploy-sepolia.js --network localhost
```

**Foundry**:

```bash
cd contracts
forge script script/Deploy.s.sol:DeploySEAL --rpc-url http://127.0.0.1:8545 --broadcast
```

Copy the **proxy** address from the output.

## 2. Backend (`backend/`)

Create `.env`:

```env
ANTHROPIC_API_KEY=sk-ant-...
RPC_URL=http://127.0.0.1:8545
CONTRACT_ADDRESS=0x...your_proxy...
SIGNER_PRIVATE_KEY=0x...one_of_anvil_private_keys...
# Lit network (no Lit API key needed for sealed-blob encrypt/decrypt in this repo)
LIT_NETWORK=nagaDev
# Optional — Lit Auth Service / payment delegation only (see below)
# LIT_API_KEY=
```

- `SIGNER_PRIVATE_KEY` is required for `POST /api/pipeline-onchain` and other **write** routes. For **read-only** monitor data (`GET /api/agents/...`, `GET /api/chain/stats`), RPC + `CONTRACT_ADDRESS` are enough.

### Lit network and optional API key

- **`LIT_NETWORK`** selects the Lit network module for `createLitClient` (default **`nagaDev`** if unset). Examples: `nagaDev`, `nagaTest`, `nagaMainnet`. **No API key** is required for the SDK encrypt/decrypt paths used here; authentication is **Ethereum signing** via `SIGNER_PRIVATE_KEY` (or an operator key for reveal).
- **`LIT_API_KEY`** is optional. It is only for **`x-api-key`** on Lit **Auth Service** HTTP routes (e.g. payment delegation: `registerPayer`, `delegateUsers`), not for ordinary node encrypt/decrypt.
- **Do you need to add funds?** Not for the API key string itself. You may need **credits or a funded payer wallet** in the [Lit developer dashboard](https://naga.developer.litprotocol.com/) if you enable **sponsored** usage or payment delegation. **Naga dev** often works for basic testing without extra setup; if you see payment or quota errors, check the dashboard and Lit’s payment docs.
- **Storacha** (below) is separate and required for **IPFS / Filecoin-backed** uploads when you want real CIDs on sealed blobs.

### Storacha (Filecoin / IPFS via w3up)

The backend uploads encrypted blobs with **`@web3-storage/w3up-client`** (`storage/filecoin.ts` → `uploadFile`). Content is addressed by **IPFS CID** and served from gateways (e.g. `*.ipfs.w3s.link`).

**Official walkthrough:** [Quickstart for AI](https://docs.storacha.network/ai/quickstart/) — same two pieces Storacha documents: an **agent identity** (private key) and a **delegation** (proof) to your space. Do that flow **once** on your dev machine, then map the outputs into this repo’s env vars.

#### Map Storacha CLI → SEAL env

| Storacha concept | In this repo |
|------------------|--------------|
| Private key from `storacha key create` (line starting **`Mg…`**) | **`STORACHA_PRINCIPAL`** — passed to `Signer.parse()` in `storage/filecoin.ts`. This is the **secret**; not the public `did:key:…` line. |
| Output of `storacha delegation create … <AGENT_DID> --base64` | **`STORACHA_PROOF`** — the base64 **UCAN delegation** that lets the agent write to your space. Use your **agent** DID in the command, not the space DID. |
| (Optional) Long proof string | **`STORACHA_PROOF_FILE`** — path to a one-line file instead of a huge `.env` value. |
| (Optional) Principal in a file | **`STORACHA_PRINCIPAL_FILE`** |

#### Automated setup (this repo)

From **`backend/`**:

```bash
npm run storacha:setup
```

- If **`STORACHA_PRINCIPAL`** is missing, the script **generates** a new agent key (same crypto as `storage/filecoin.ts`) and **appends it to `backend/.env`**.
- If **`STORACHA_PROOF`** is missing, it tries `storacha delegation create … --base64` (global **`storacha`** or **`npx @storacha/cli`**). You must already be logged in (`storacha login`) and have a space; otherwise run the manual commands below.

#### Commands (from the quickstart)

```bash
npm install -g @storacha/cli

# 1) Agent identity — save the Mg… private key and the did:key:… public line
storacha key create

# 2) Space
storacha space create my-seal-space

# 3) Delegate upload caps to your *agent* (replace with your agent did:key from step 1)
storacha delegation create -c space/blob/add -c space/index/add -c filecoin/offer -c upload/add <AGENT_DID> --base64
```

Paste the **`Mg…`** value into **`STORACHA_PRINCIPAL`** and the **`--base64` delegation output** into **`STORACHA_PROOF`** (or a file via **`STORACHA_PROOF_FILE`**). Restart the backend; run a pipeline and confirm `sealBlob` returns a non-empty **`cid`**.

**Trial storage:** The quickstart notes GitHub login for a trial (e.g. **100MB** free) — see [Storacha docs](https://docs.storacha.network/ai/quickstart/). No Ethereum gas is required for the upload path itself.

### Pipeline checklist (what “done” means)

| Stage | What it is | How you know it worked |
|-------|------------|-------------------------|
| **1. Register agent** | On-chain `registerAgent` + stake | Monitor shows **registered**, tasks can attach |
| **2. Commit + execute** | `submitCommitment` then `executeTask` (wallet or backend signer) | Task shows **committed** + **executed** |
| **3. Sealed reasoning** (off-chain) | AES encrypt reasoning → **Storacha** pin → **Lit** wraps AES key for `authorizedAddress` | API response `sealed.cid` non-empty, `encryptedKey` + `iv` set |
| **4. Persist for audit** (optional) | `POST /api/pipeline-prepare` appends to `backend/data/sealed-blobs.json` | File exists with your agent id + task id |

Until **3** succeeds, you do **not** have an IPFS CID or Lit-wrapped key for reveal, even if **2** is on-chain. Run **`npm run test:storage`** from `backend/` to verify Storacha + Lit without the full LLM pipeline. If you see **`Invalid CAR`** / proof errors, **`STORACHA_PROOF`** is usually truncated — paste the **full** `storacha delegation create … --base64` output.

### Redeploying the contract

If you need the newer **on-chain** helpers (`registeredAgentCount`, `getRegisteredAgents`, etc.), deploy a fresh implementation + proxy (or upgrade the proxy) and set **`CONTRACT_ADDRESS`** (backend) and **`NEXT_PUBLIC_SEAL_CONTRACT_ADDRESS`** (frontend) to the new proxy. The **deployer wallet** needs **native gas** on that network (e.g. Sepolia ETH).

```bash
cd backend
npm install
npm start
```

API: `http://localhost:3001` (default).

## 3. Frontend (`frontend/`)

Create `.env.local`:

```env
NEXT_PUBLIC_SEAL_CONTRACT_ADDRESS=0x...same_proxy...
NEXT_PUBLIC_SEAL_API_URL=http://localhost:3001
NEXT_PUBLIC_USE_LOCAL_CHAIN=true
```

```bash
cd frontend
npm install
npm run dev
```

Open the operator dashboard, connect MetaMask to **Localhost 8545** (chain id **31337**), import an Anvil account with ETH, then complete **Register agent** (step 6 submits `registerAgent`).

## 4. Linking backend pipeline to the same agent

The UI derives `agentId` (bytes32) as `keccak256(encodePacked("SEAL_AGENT_V1", operatorAddress, keccak256(runtimeHash)))`, matching `backend/src/agent-id.ts`.

When calling `POST /api/pipeline` or `POST /api/pipeline-onchain`, pass:

- `operatorAddress` — same wallet as registration  
- `runtimeHash` — same string as in the wizard  
- or `agentIdBytes32` explicitly  

so on-chain `submitCommitment` uses the **registered** agent and appends the task to `getAgentTasks(agentId)`.

## 5. Ethereum Sepolia instead of Anvil

Omit `NEXT_PUBLIC_USE_LOCAL_CHAIN` (or set to `false`). Deploy to Sepolia with **Hardhat** (`cd contracts && npm run deploy:sepolia` after `contracts/.env` has `PRIVATE_KEY` + `SEPOLIA_RPC_URL`) or **Foundry** (`forge script ... --rpc-url $SEPOLIA_RPC_URL`). Set `NEXT_PUBLIC_SEAL_CONTRACT_ADDRESS`, `NEXT_PUBLIC_SEPOLIA_RPC_URL` (optional; defaults to a public Sepolia RPC), plus backend `RPC_URL` / `CONTRACT_ADDRESS` to **Ethereum Sepolia** (chain id 11155111), not Base Sepolia.
