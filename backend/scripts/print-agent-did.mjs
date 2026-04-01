import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { parse } from "@web3-storage/w3up-client/principal/ed25519";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });
const raw = (process.env.STORACHA_PRINCIPAL || "").trim().replace(/^"|"$/g, "");
if (!raw) {
  console.error("STORACHA_PRINCIPAL missing");
  process.exit(1);
}
console.log(parse(raw).did());
