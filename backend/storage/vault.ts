import { createLitClient } from "@lit-protocol/lit-client";
import { resolveLitNetwork } from "./lit-network.js";
import { litDecryptAuthContext } from "./lit.js";
import { ethers } from "ethers";

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

function ownerCondition(address: string) {
  return [
    {
      contractAddress: "",
      standardContractType: "" as const,
      chain: "sepolia" as const,
      method: "",
      parameters: [":userAddress"],
      returnValueTest: { comparator: "=" as const, value: address.toLowerCase() },
    },
  ];
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
  const authContext = await litDecryptAuthContext(
    { ciphertext: entry.ciphertext, dataToEncryptHash: entry.dataToEncryptHash },
    entry.ownerAddress
  );
  const { decryptedData } = await lit.decrypt({
    ciphertext: entry.ciphertext,
    dataToEncryptHash: entry.dataToEncryptHash,
    accessControlConditions: ownerCondition(entry.ownerAddress),
    chain: "sepolia",
    authContext: {
      chain: authContext.chain,
      sessionKeyPair: authContext.sessionKeyPair,
      authNeededCallback: authContext.authNeededCallback,
      authConfig: authContext.authConfig,
    },
  });

  return Buffer.from(decryptedData).toString("utf8");
}
