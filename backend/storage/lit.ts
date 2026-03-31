import { createLitClient } from "@lit-protocol/lit-client";
import { nagaDev } from "@lit-protocol/networks";
import { generateSessionKeyPair } from "@lit-protocol/crypto";
import { ethers } from "ethers";
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
import { LIT_ABILITY } from "@lit-protocol/constants";

let litClient: Awaited<ReturnType<typeof createLitClient>> | null = null;

async function getLit() {
  if (litClient) return litClient;
  litClient = await createLitClient({ network: nagaDev });
  return litClient;
}

function getSigner(pk?: string) {
  const key = pk ?? process.env.SIGNER_PRIVATE_KEY;
  if (!key) throw new Error("SIGNER_PRIVATE_KEY is required");
  return new ethers.Wallet(key);
}

function stakerCondition(address: string) {
  return [
    {
      contractAddress: "",
      standardContractType: "" as const,
      chain: "baseSepolia" as const,
      method: "",
      parameters: [":userAddress"],
      returnValueTest: { comparator: "=" as const, value: address.toLowerCase() },
    },
  ];
}

async function makeAuthContext(signerPk?: string) {
  const signer = getSigner(signerPk);
  const sessionKeyPair = generateSessionKeyPair();

  const expiration = new Date(Date.now() + 1000 * 60 * 60).toISOString();
  const msg = `SEAL auth: ${Date.now()}|exp:${expiration}`;
  const sig = await signer.signMessage(msg);

  const { LitAccessControlConditionResource } = await import("@lit-protocol/auth-helpers");
  const { LIT_ABILITY } = await import("@lit-protocol/constants");

  const authCallback = async () => ({
    sig,
    derivedVia: "web3.eth.personal.sign",
    signedMessage: msg,
    address: signer.address,
  });

  const authInfo = await authCallback();
  const resource = new LitAccessControlConditionResource("*");

  return {
    chain: "baseSepolia" as const,
    sessionKeyPair,
    authNeededCallback: authCallback,
    authConfig: {
      capabilityAuthSigs: [authInfo],
      expiration: new Date(Date.now() + 1000 * 60 * 60).toISOString(),
      statement: "SEAL Protocol Access",
      domain: "seal-protocol.io",
      resources: [{ resource, ability: LIT_ABILITY.AccessControlConditionDecryption }],
    },
    resourceAbilityRequests: [
      {
        resource,
        ability: LIT_ABILITY.AccessControlConditionDecryption,
      },
    ],
  } as any;
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

export async function decryptBlobKey(
  encryptedKey: EncryptedKey,
  requesterPk: string
): Promise<Buffer> {
  const lit = await getLit();
  const signer = getSigner(requesterPk);
  const sessionKeyPair = generateSessionKeyPair();

  const requesterAddress = signer.address;

  const authCallback = async () => {
    const msg = `localhost wants you to sign in with your Ethereum account:\n${signer.address}\n\nURI: http://localhost\nVersion: 1\nChain ID: 84532\nNonce: ${Date.now()}\nIssued At: ${new Date().toISOString()}\nExpiration Time: ${new Date(Date.now() + 3600000).toISOString()}`;
    const sig = await signer.signMessage(msg);
    return {
      sig,
      derivedVia: "web3.eth.personal.sign",
      signedMessage: msg,
      address: signer.address,
    };
  };

  const { decryptedData } = await lit.decrypt({
    data: {
      ciphertext: encryptedKey.ciphertext,
      dataToEncryptHash: encryptedKey.dataToEncryptHash,
    },
    accessControlConditions: stakerCondition(requesterAddress),
    authContext: {
      chain: "baseSepolia",
      sessionKeyPair,
      authNeededCallback: authCallback,
    } as any,
  } as any);

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
