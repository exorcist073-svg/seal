import type { LitNetworkModule } from "@lit-protocol/networks";
import {
  naga,
  nagaDev,
  nagaLocal,
  nagaMainnet,
  nagaProto,
  nagaStaging,
  nagaTest,
} from "@lit-protocol/networks";

/** Modules for `createLitClient({ network })` — no API key. */
const BY_NORMALIZED_ID: Record<string, LitNetworkModule> = {
  naga,
  nagadev: nagaDev,
  nagatest: nagaTest,
  nagastaging: nagaStaging,
  nagalocal: nagaLocal,
  nagamainnet: nagaMainnet,
  nagaproto: nagaProto,
};

function normalizeLitNetworkId(raw: string): string {
  return raw.trim().toLowerCase().replace(/[-_\s]/g, "");
}

/**
 * Lit network for `createLitClient` — no API key; set **`LIT_NETWORK`** only.
 * Examples: `nagaDev`, `naga-dev`, `NAGADEV` → Naga devnet.
 */
export function resolveLitNetwork(): LitNetworkModule {
  const env = process.env.LIT_NETWORK;
  const key = normalizeLitNetworkId(env ?? "nagaDev");
  const mod = BY_NORMALIZED_ID[key];
  if (!mod) {
    throw new Error(
      `Unknown LIT_NETWORK="${env ?? ""}". Use one of: naga, nagaDev, nagaTest, nagaStaging, nagaLocal, nagaMainnet, nagaProto`
    );
  }
  return mod;
}
