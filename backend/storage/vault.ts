import { createLitClient } from "@lit-protocol/lit-client";
import { nagaTest } from "@lit-protocol/networks";
import { generateSessionKeyPair } from "@lit-protocol/crypto";
import { ethers } from "ethers";

let litClient: Awaited<ReturnType<typeof createLitClient>> | null = null;

async function getLit() {
  if (litClient) return litClient;
  litClient = await createLitClient({ network: nagaTest });
  return litClient;
}

function getSigner(pk?: string) {
  const key = pk ?? process.env.SIGNER_PRIVATE_KEY;
  if (!key) throw new Error("SIGNER_PRIVATE_KEY is required");
  return new ethers.Wallet(key);
}

function ownerCondition(address: string) {
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
  const msg = `SEAL vault auth: ${Date.now()}`;
  const sig = await signer.signMessage(msg);

  return {
    chain: "baseSepolia",
    sessionKeyPair,
    authNeededCallback: async () => ({
      sig,
      derivedVia: "ethers",
      signedMessage: msg,
      address: signer.address,
    }),
  };
}

export interface VaultEntry {
  name: string;
  ciphertext: string;
  dataToEncryptHash: string;
  ownerAddress: string;
}

export async function storeCredential(name: string, value: string): Promise<VaultEntry> {
  const lit = await getLit();
  const signer = getSigner();
  const { ciphertext, dataToEncryptHash } = await lit.encrypt({
    dataToEncrypt: value,
    accessControlConditions: ownerCondition(signer.address),
  });

  return {
    name,
    ciphertext,
    dataToEncryptHash,
    ownerAddress: signer.address,
  };
}

export async function getCredential(entry: VaultEntry): Promise<string> {
  const lit = await getLit();
  const authContext = await makeAuthContext();
  const { decryptedData } = await lit.decrypt({
    data: {
      ciphertext: entry.ciphertext,
      dataToEncryptHash: entry.dataToEncryptHash,
    },
    accessControlConditions: ownerCondition(entry.ownerAddress),
    authContext: authContext as any,
  });

  return Buffer.from(decryptedData).toString("utf8");
}
