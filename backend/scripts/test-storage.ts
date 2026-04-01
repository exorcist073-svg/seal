/**
 * End-to-end check: AES blob encrypt → Storacha pin → Lit-wrapped DEK (same path as pipeline sealBlob).
 *
 * Usage (from backend/): npm run test:storage
 *
 * Requires: STORACHA_PRINCIPAL + STORACHA_PROOF, SIGNER_PRIVATE_KEY (Lit uses it for encrypt/decrypt round-trip).
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { ethers } from "ethers";
import { sealBlob, hasStorachaCredentials, decryptBlobKey } from "../storage/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

async function main() {
  console.log("=== SEAL storage + Lit self-test ===\n");

  console.log("hasStorachaCredentials:", hasStorachaCredentials());
  if (!hasStorachaCredentials()) {
    console.error("Set STORACHA_PRINCIPAL and STORACHA_PROOF (or *_FILE) in backend/.env");
    process.exit(1);
  }

  const pk = process.env.SIGNER_PRIVATE_KEY?.trim();
  if (!pk) {
    console.error("SIGNER_PRIVATE_KEY is required so Lit can encrypt the AES key for your address.");
    process.exit(1);
  }
  const wallet = new ethers.Wallet(pk.startsWith("0x") ? pk : `0x${pk}`);
  const authorizedAddress = wallet.address;
  console.log("Lit authorizedAddress (same as pipeline authorizedAddress):", authorizedAddress);

  const merkle = `self-test-${Date.now()}`;
  const plaintext = `SEAL storage self-test\n${new Date().toISOString()}\n`;

  console.log("\nRunning sealBlob (AES → Storacha pin ∥ Lit encrypt key)…");
  let sealed;
  try {
    sealed = await sealBlob(plaintext, merkle, authorizedAddress);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/CAR|Invalid|parse|proof/i.test(msg)) {
      console.error(
        "\nSTORACHA_PROOF failed to parse (often truncated or wrong format). Regenerate the full base64 output:\n" +
          "  storacha delegation create -c space/blob/add -c space/index/add -c filecoin/offer -c upload/add <AGENT_DID> --base64\n" +
          "Or use STORACHA_PROOF_FILE=./.storacha/proof.txt with the complete single-line proof.\n"
      );
    }
    throw e;
  }

  const cidOk = Boolean(sealed.cid?.trim());
  const litOk = Boolean(sealed.encryptedKey?.ciphertext?.trim());
  const ivOk = Boolean(sealed.iv?.trim());

  console.log("\n--- Results ---");
  console.log("  CID:", sealed.cid || "(empty — Storacha pin failed)");
  console.log("  URL:", sealed.url || "—");
  console.log("  Lit ciphertext length:", sealed.encryptedKey?.ciphertext?.length ?? 0);
  console.log("  IV (hex):", ivOk ? `${sealed.iv.slice(0, 16)}…` : "(empty)");

  if (!cidOk || !litOk || !ivOk) {
    console.error("\nFAIL: Incomplete seal. Check Storacha proof/principal and Lit (signer + network).");
    process.exit(1);
  }

  console.log("\nRunning Lit decrypt round-trip (same SIGNER_PRIVATE_KEY)…");
  try {
    const rawKey = await decryptBlobKey(sealed.encryptedKey, pk.startsWith("0x") ? pk : `0x${pk}`);
    console.log("  Decrypted AES key length:", rawKey.length, rawKey.length === 32 ? "(ok)" : "(unexpected)");
  } catch (e: unknown) {
    console.error("  Lit decrypt failed:", e instanceof Error ? e.message : e);
    process.exit(1);
  }

  console.log("\nOK — storage + encoding path matches pipeline expectations.");
  console.log("\nReminder: on-chain you already have submitCommitment + executeTask.");
  console.log("Off-chain, the pipeline also returns sealed.cid + encryptedKey + iv when this path succeeds.");
  console.log("Run POST /api/pipeline-prepare from the dashboard to persist rows in sealed-blobs.json for audit reveal.\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
