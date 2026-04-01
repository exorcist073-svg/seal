import fs from "node:fs";
import * as Client from "@web3-storage/w3up-client";
import { StoreMemory } from "@web3-storage/w3up-client/stores/memory";
import * as Proof from "@web3-storage/w3up-client/proof";
import { Signer } from "@web3-storage/w3up-client/principal/ed25519";

export type AuditEvent = "task" | "commit" | "execute" | "reveal" | "slash";

export interface AuditEntry {
  event: AuditEvent;
  agentId: string;
  commitmentHash: string;
  timestamp: number;
  metadata: Record<string, unknown>;
}
export interface PinResult {
  cid: string;
  size: number;
  url: string;
}

let storacha: Client.Client | null = null;

/** Read one-line secret from env or from a UTF-8 file path (for long UCAN proofs). */
function readEnvOrFile(value: string | undefined, filePath: string | undefined): string | undefined {
  const direct = value?.trim();
  if (direct) return direct;
  const p = filePath?.trim();
  if (!p) return undefined;
  if (!fs.existsSync(p)) return undefined;
  return fs.readFileSync(p, "utf8").trim();
}

/** True when sealed uploads can run (Storacha / w3up agent + space delegation). */
export function hasStorachaCredentials(): boolean {
  const key = readEnvOrFile(process.env.STORACHA_PRINCIPAL, process.env.STORACHA_PRINCIPAL_FILE);
  const proof = readEnvOrFile(process.env.STORACHA_PROOF, process.env.STORACHA_PROOF_FILE);
  return Boolean(key && proof);
}

async function getStoracha(): Promise<Client.Client> {
  if (storacha) return storacha;
  const key = readEnvOrFile(process.env.STORACHA_PRINCIPAL, process.env.STORACHA_PRINCIPAL_FILE);
  const proof = readEnvOrFile(process.env.STORACHA_PROOF, process.env.STORACHA_PROOF_FILE);

  if (!key || !proof) {
    throw new Error(
      "Set STORACHA_PRINCIPAL + STORACHA_PROOF (or STORACHA_*_FILE paths). See docs/operator-local.md — Storacha."
    );
  }

  const principal = Signer.parse(key);
  const client = await Client.create({ principal, store: new StoreMemory() });
  const space = await client.addSpace(await Proof.parse(proof));
  await client.setCurrentSpace(space.did());
  storacha = client;
  return storacha;
}

export async function pinBlob(
  blob: Uint8Array,
  hash: string
): Promise<PinResult> {
  const client = await getStoracha();
  const file = new File([new Uint8Array(blob)], `reasoning-${hash}.bin`, {
    type: "application/octet-stream",
  });
  const cid = (await client.uploadFile(file)).toString();
  return { cid, size: blob.byteLength, url: `https://${cid}.ipfs.w3s.link` };
}

export async function logAuditEntry(entry: AuditEntry): Promise<PinResult> {
  const client = await getStoracha();
  const bytes = new TextEncoder().encode(JSON.stringify(entry, null, 2));
  const file = new File(
    [bytes],
    `audit-${entry.event}-${entry.commitmentHash}-${entry.timestamp}.json`,
    { type: "application/json" }
  );
  const cid = (await client.uploadFile(file)).toString();
  return { cid, size: bytes.byteLength, url: `https://${cid}.ipfs.w3s.link` };
}

export async function verifyCid(cid: string, blob: Uint8Array): Promise<boolean> {
  const { CID } = await import("multiformats/cid");
  const { sha256 } = await import("multiformats/hashes/sha2");
  const derived = CID.create(1, 0x55, await sha256.digest(blob));
  return derived.toString() === cid;
}
