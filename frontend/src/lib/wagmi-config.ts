import { createConfig, http } from "wagmi";
import { injected, walletConnect } from "wagmi/connectors";
import { baseSepolia } from "wagmi/chains";

const walletConnectProjectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;
export const walletConnectEnabled = Boolean(walletConnectProjectId);

export const wagmiConfig = createConfig({
  ssr: true,
  chains: [baseSepolia],
  connectors: walletConnectProjectId
    ? [
        injected(),
        walletConnect({
          projectId: walletConnectProjectId,
          showQrModal: true,
        }),
      ]
    : [injected()],
  transports: {
    [baseSepolia.id]: http(),
  },
});

export const sealContractAddress = (process.env.NEXT_PUBLIC_SEAL_CONTRACT_ADDRESS ??
  "0x") as `0x${string}`;

export const sealApiBase =
  process.env.NEXT_PUBLIC_SEAL_API_URL?.replace(/\/$/, "") ?? "http://localhost:3001";
