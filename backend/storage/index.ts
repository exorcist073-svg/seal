export { pinBlob, logAuditEntry, verifyCid } from "./filecoin.js";
export { encryptBlob, encryptBlobKey, decryptBlobKey, decryptBlob } from "./lit.js";
export { storeCredential, getCredential } from "./vault.js";
export type { PinResult, AuditEntry, AuditEvent } from "./filecoin.js";
export type { EncryptedKey } from "./lit.js";
export type { VaultEntry } from "./vault.js";

// full pipeline for swarnim : encrypting blob -> pin to filecoin -> then encrypt using lit
export async function sealBlob(
  reasoningBlob: string,
  commitmentHash: string,
  authorizedAddress: string = ""
): Promise<{
  cid: string;
  url: string;
  encryptedKey: import("./lit.js").EncryptedKey;
  iv: string;
}> {
  const { pinBlob } = await import("./filecoin.js");
  const { encryptBlob, encryptBlobKey } = await import("./lit.js");
  const { encrypted, key, iv } = encryptBlob(reasoningBlob);
  const [pinResult, encryptedKey] = await Promise.all([
    pinBlob(encrypted, commitmentHash),
    encryptBlobKey(key, authorizedAddress),
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

  // Try multiple IPFS gateways with timeout
  const gateways = [
    `https://${cid}.ipfs.w3s.link`,
    `https://ipfs.io/ipfs/${cid}`,
    `https://dweb.link/ipfs/${cid}`,
  ];
  let lastErr: Error | null = null;
  for (const url of gateways) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) { clearTimeout(timeout); lastErr = new Error(`${url}: ${res.statusText}`); continue; }
      const bytes = Buffer.from(await res.arrayBuffer());
      clearTimeout(timeout);
      console.log(`[revealBlob] Fetched ${bytes.length} bytes from ${url}`);
      return decryptBlob(bytes, key, Buffer.from(iv, "hex"));
    } catch (e: any) {
      console.error(`[revealBlob] Gateway ${url} failed:`, e.message);
      lastErr = e;
    }
  }
  throw new Error(`Failed to fetch blob from all gateways: ${lastErr?.message}`);
}
