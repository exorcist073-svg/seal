export { pinBlob, logAuditEntry, verifyCid } from "./filecoin.js";
export { encryptBlob, encryptBlobKey, decryptBlobKey, decryptBlob } from "./lit.js";
export { storeCredential, getCredential } from "./vault.js";
export type { PinResult, AuditEntry, AuditEvent } from "./filecoin.js";
export type { EncryptedKey } from "./lit.js";
export type { VaultEntry } from "./vault.js";

// full pipeline for swarnim : encrypting blob -> pin to filecoin -> then encrypt using lit
export async function sealBlob(
  reasoningBlob: string,
  commitmentHash: string
): Promise<{
  cid: string;
  url: string;
  encryptedKey: import("./lit.js").EncryptedKey;
  iv: string;
}> {
  const { pinBlob } = await import("./filecoin.js");
  const { encryptBlob, encryptBlobKey } = await import("./lit.js");
  const { ethers } = await import("ethers");
  const ownerAddress = new ethers.Wallet(process.env.SIGNER_PRIVATE_KEY!).address;
  const { encrypted, key, iv } = encryptBlob(reasoningBlob);
  const [pinResult, encryptedKey] = await Promise.all([
    pinBlob(encrypted, commitmentHash),
    encryptBlobKey(key, ownerAddress),
  ]);

  return {
    cid: pinResult.cid,
    url: pinResult.url,
    encryptedKey,
    iv: iv.toString("hex"),
  };
}

// full flow for front side: decrypt key via lit -> fetches blob -> decrypt
export async function revealBlob(
  cid: string,
  encryptedKey: import("./lit.js").EncryptedKey,
  iv: string,
  requesterPk: string
): Promise<string> {
  const { decryptBlobKey, decryptBlob } = await import("./lit.js");
  const key = await decryptBlobKey(encryptedKey, requesterPk);
  const res = await fetch(`https://${cid}.ipfs.w3s.link`);
  if (!res.ok) throw new Error(`Failed to fetch blob: ${res.statusText}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  return decryptBlob(bytes, key, Buffer.from(iv, "hex"));
}
