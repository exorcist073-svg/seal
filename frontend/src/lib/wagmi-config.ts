import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { baseSepolia } from "wagmi/chains";

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "";

export const wagmiConfig = getDefaultConfig({
  appName: "SĒAL — Secure Enclave Agent Layer",
  projectId: projectId || "00000000000000000000000000000000",
  chains: [baseSepolia],
  ssr: true,
});

export const sealContractAddress = (process.env.NEXT_PUBLIC_SEAL_CONTRACT_ADDRESS ??
  "0x") as `0x${string}`;

export const sealApiBase =
  process.env.NEXT_PUBLIC_SEAL_API_URL?.replace(/\/$/, "") ?? "http://localhost:3001";
