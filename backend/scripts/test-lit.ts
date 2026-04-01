/**
 * Lit-only smoke test: Naga handshake + `lit.encrypt` / `lit.decrypt` round-trip on the DEK.
 *
 * Usage (from backend/): npm run test:lit
 * Requires: SIGNER_PRIVATE_KEY, LIT_NETWORK optional (default nagaDev via lit-network.ts)
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { randomBytes } from "crypto";
import { ethers } from "ethers";
import { encryptBlobKey, decryptBlobKey } from "../storage/lit.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

async function main() {
  console.log("=== Lit (Naga) smoke test ===\n");

  const pk = process.env.SIGNER_PRIVATE_KEY?.trim();
  if (!pk) {
    console.error("SIGNER_PRIVATE_KEY is required.");
    process.exit(1);
  }
  const pkHex = pk.startsWith("0x") ? pk : `0x${pk}`;
  const wallet = new ethers.Wallet(pkHex);
  console.log("Signer address:", wallet.address);
  if (process.env.LIT_NETWORK) {
    console.log("LIT_NETWORK:", process.env.LIT_NETWORK);
  }

  const dek = randomBytes(32);
  console.log("\n1) lit.encrypt (DEK wrapped for ACC / :userAddress)…");

  let encryptedKey: Awaited<ReturnType<typeof encryptBlobKey>>;
  try {
    encryptedKey = await encryptBlobKey(dek, wallet.address);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("FAIL — encrypt:", msg);
    process.exit(1);
  }

  const encOk =
    Boolean(encryptedKey.ciphertext?.trim()) && Boolean(encryptedKey.dataToEncryptHash?.trim());
  if (!encOk) {
    console.error("FAIL — empty ciphertext or dataToEncryptHash");
    process.exit(1);
  }

  console.log("   OK — ciphertext length:", encryptedKey.ciphertext.length);
  console.log("   OK — dataToEncryptHash (prefix):", encryptedKey.dataToEncryptHash.slice(0, 24) + "…");

  console.log("\n2) lit.decrypt round-trip (same key)…");
  try {
    const out = await decryptBlobKey(encryptedKey, pkHex);
    const match = dek.equals(out);
    if (!match || out.length !== 32) {
      console.error("FAIL — decrypted key does not match original");
      process.exit(1);
    }
    console.log("   OK — 32-byte DEK round-trip matches.");
    console.log("\nPASS — Lit encrypt + decrypt working.\n");
    process.exit(0);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("   FAIL — decrypt:", msg.split("\n")[0]);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
