import { createLitClient } from "@lit-protocol/lit-client";
import { generateSessionKeyPair } from "@lit-protocol/crypto";
import {
  getHashedAccessControlConditions,
  validateAccessControlConditions,
} from "@lit-protocol/access-control-conditions";
import {
  createSiweMessage,
  generateAuthSig,
  LitAccessControlConditionResource,
} from "@lit-protocol/auth-helpers";
import { uint8arrayToString } from "@lit-protocol/uint8arrays";
import { SessionKeyUriSchema } from "@lit-protocol/schemas";
import { resolveLitNetwork } from "./lit-network.js";
import { ethers } from "ethers";
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
import { LIT_ABILITY } from "@lit-protocol/constants";

/**
 * Lit (Naga) decrypt does **not** use a Lit API key. Nodes expect:
 * 1. Access control conditions + ciphertext (already stored with the sealed blob).
 * 2. An **AuthSig**: your Ethereum address signs a **SIWE** message (EIP-4361) with ReCap capabilities
 *    so `issueSessionFromContext` can build valid session sigs. The SIWE **`uri`** must be the Lit
 *    session-key form `lit:session:<ed25519 pubkey>` (`SessionKeyUriSchema`), not a generic https URL —
 *    same as `@lit-protocol/auth` `getEoaAuthContext`. The wallet key must match `:userAddress` on the ACC.
 */

let litClient: Awaited<ReturnType<typeof createLitClient>> | null = null;

async function getLit() {
  if (litClient) return litClient;
  litClient = await createLitClient({ network: resolveLitNetwork() });
  return litClient;
}

function getSigner(pk?: string) {
  const key = pk ?? process.env.SIGNER_PRIVATE_KEY;
  if (!key) throw new Error("SIGNER_PRIVATE_KEY is required");
  return new ethers.Wallet(key);
}

/** Same shape `lit.encrypt` / `lit.decrypt` use; `conditionType` matches ACC schemas. */
function stakerCondition(address: string) {
  return [
    {
      conditionType: "evmBasic" as const,
      contractAddress: "",
      standardContractType: "" as const,
      chain: "sepolia" as const,
      method: "",
      parameters: [":userAddress"],
      returnValueTest: { comparator: "=" as const, value: address.toLowerCase() },
    },
  ];
}

/**
 * Resource id must match `createLitClient` encrypt identity: `hash(ACC)_base16 + '/' + dataToEncryptHash`
 * (same as `getHashedAccessControlConditions` + `uint8arrayToString` in lit-client).
 */
async function accResourceIdFromEncryptedKey(
  accs: ReturnType<typeof stakerCondition>,
  dataToEncryptHash: string
): Promise<string> {
  const accParams = { accessControlConditions: accs };
  await validateAccessControlConditions(accParams);
  const buf = await getHashedAccessControlConditions(accParams);
  if (!buf) throw new Error("Failed to hash access control conditions");
  const hashHex = uint8arrayToString(new Uint8Array(buf), "base16");
  const dataHex = dataToEncryptHash.trim().toLowerCase();
  return `${hashHex}/${dataHex}`;
}

/**
 * SIWE + ReCap for Naga: session sigs require `Expiration Time:` in each capability, and ReCap must list the
 * **hashed ACC resource** for this ciphertext (not `*`) — see LitAccessControlConditionResource.generateResourceString.
 */
async function signSiweRecapAuth(
  signer: ethers.Wallet,
  accResource: InstanceType<typeof LitAccessControlConditionResource>,
  sessionKeyPair: { publicKey: string; secretKey: string }
) {
  const expiration = new Date(Date.now() + 1000 * 60 * 60).toISOString();
  const nonce = "0x" + randomBytes(32).toString("hex");
  const resources = [{ resource: accResource, ability: LIT_ABILITY.AccessControlConditionDecryption }];
  /** Must be `lit:session:<ed25519 pubkey>` — same as `getEoaAuthContext` / Lit session sigs (not an https URL). */
  const uri = SessionKeyUriSchema.parse(sessionKeyPair.publicKey);

  const toSign = await createSiweMessage({
    walletAddress: ethers.getAddress(signer.address),
    chainId: 11155111,
    expiration,
    nonce,
    statement: "SEAL Protocol — access-control decryption",
    domain: "seal-protocol.io",
    uri,
    version: "1",
    resources,
  });

  return generateAuthSig({ signer: signer as any, toSign, address: ethers.getAddress(signer.address) });
}

/**
 * Builds `authContext` for `lit.decrypt`. Triggers a **fresh SIWE sign** from `signerPk` each decrypt
 * (the signed payload Lit nodes validate).
 * `conditionAddress` must match the ACC used at encrypt time (same wallet as `:userAddress`).
 */
export async function litDecryptAuthContext(
  encryptedKey: EncryptedKey,
  conditionAddress: string,
  signerPk?: string
) {
  const signer = getSigner(signerPk);
  const sessionKeyPair = generateSessionKeyPair();
  const accs = stakerCondition(conditionAddress);
  const resourceId = await accResourceIdFromEncryptedKey(accs, encryptedKey.dataToEncryptHash);
  const accResource = new LitAccessControlConditionResource(resourceId);
  const resourceAbilityRequests = [
    { resource: accResource, ability: LIT_ABILITY.AccessControlConditionDecryption },
  ];
  const expiration = new Date(Date.now() + 1000 * 60 * 60).toISOString();

  return {
    chain: "sepolia" as const,
    sessionKeyPair,
    authNeededCallback: () => signSiweRecapAuth(signer, accResource, sessionKeyPair),
    authConfig: {
      capabilityAuthSigs: [] as [],
      expiration,
      statement: "SEAL Protocol — access-control decryption",
      domain: "seal-protocol.io",
      resources: resourceAbilityRequests,
    },
    resourceAbilityRequests,
  };
}

export interface EncryptedKey {
  ciphertext: string;
  dataToEncryptHash: string;
}

export async function encryptBlobKey(aesKey: Buffer, ownerAddress: string): Promise<EncryptedKey> {
  const lit = await getLit();

  const { ciphertext, dataToEncryptHash } = await lit.encrypt({
    dataToEncrypt: new Uint8Array(aesKey),
    accessControlConditions: stakerCondition(ownerAddress),
  });

  return { ciphertext, dataToEncryptHash };
}

/** Decrypts the Lit-wrapped AES key. `requesterPk` must be the private key for the address that owns the ACC (signs SIWE). */
export async function decryptBlobKey(
  encryptedKey: EncryptedKey,
  requesterPk: string
): Promise<Buffer> {
  const lit = await getLit();
  const requesterAddress = getSigner(requesterPk).address;
  const ctx = await litDecryptAuthContext(encryptedKey, requesterAddress, requesterPk);

  const { decryptedData } = await lit.decrypt({
    ciphertext: encryptedKey.ciphertext,
    dataToEncryptHash: encryptedKey.dataToEncryptHash,
    accessControlConditions: stakerCondition(requesterAddress),
    chain: "sepolia",
    authContext: {
      chain: ctx.chain,
      sessionKeyPair: ctx.sessionKeyPair,
      authNeededCallback: ctx.authNeededCallback,
      authConfig: ctx.authConfig,
    },
  });

  return Buffer.from(decryptedData);
}

export function encryptBlob(blob: string): { encrypted: Buffer; key: Buffer; iv: Buffer } {
  const key = randomBytes(32);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(blob, "utf8"),
    cipher.final(),
    cipher.getAuthTag(),
  ]);
  return { encrypted, key, iv };
}

export function decryptBlob(encrypted: Buffer, key: Buffer, iv: Buffer): string {
  const authTag = encrypted.slice(-16);
  const data = encrypted.slice(0, -16);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  return decipher.update(data) + decipher.final("utf8");
}
