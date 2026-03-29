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

async function getStoracha(): Promise<Client.Client> {
  if (storacha) return storacha;
  const key = process.env.STORACHA_PRINCIPAL;
  const proof = process.env.STORACHA_PROOF;

  if (!key || !proof) {
    throw new Error("STORACHA_PRINCIPAL and STORACHA_PROOF are required");
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
  const file = new File([blob.buffer as ArrayBuffer], `reasoning-${hash}.bin`, {
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
