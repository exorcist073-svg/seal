/**
 * Generate missing Storacha agent principal (Mg… / base64) and optionally fetch delegation proof.
 *
 * Usage (from backend/): npm run storacha:setup
 *
 * - If STORACHA_PRINCIPAL is unset: generates a new Ed25519 agent via @web3-storage/w3up-client (same as storage/filecoin.ts).
 * - If STORACHA_PROOF is unset: tries `storacha delegation create … <AGENT_DID> --base64` when `storacha` is on PATH
 *   (requires: npm i -g @storacha/cli`, `storacha login`, `storacha space create …` per https://docs.storacha.network/ai/quickstart/).
 * - Writes updates to backend/.env (never commits secrets).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import dotenv from "dotenv";
import { generate, format, parse } from "@web3-storage/w3up-client/principal/ed25519";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, "..", ".env");

function readProofFromFiles(parsed) {
  const f = parsed.STORACHA_PROOF_FILE?.trim();
  if (!f) return "";
  const abs = path.isAbsolute(f) ? f : path.join(path.dirname(envPath), f);
  if (!fs.existsSync(abs)) return "";
  return fs.readFileSync(abs, "utf8").trim();
}

function readPrincipalFromFile(parsed) {
  const f = parsed.STORACHA_PRINCIPAL_FILE?.trim();
  if (!f) return "";
  const abs = path.isAbsolute(f) ? f : path.join(path.dirname(envPath), f);
  if (!fs.existsSync(abs)) return "";
  return fs.readFileSync(abs, "utf8").trim();
}

/** Quote .env value if needed (e.g. proof contains =). */
function envValueLine(value) {
  if (/[\r\n#]/.test(value)) {
    throw new Error("Value must be a single line for .env");
  }
  if (/^[\w.-]+$/.test(value) && !value.includes("=")) {
    return value;
  }
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function upsertEnvKey(content, key, value) {
  const line = `${key}=${envValueLine(value)}`;
  const re = new RegExp(`^${key}=.*(?:\r?\n|$)`, "m");
  if (re.test(content)) {
    return content.replace(re, line + "\n");
  }
  const trimmed = content.replace(/\s*$/, "");
  return (trimmed ? trimmed + "\n" : "") + line + "\n";
}

function tryDelegationViaCli(agentDid) {
  const caps = [
    "-c",
    "space/blob/add",
    "-c",
    "space/index/add",
    "-c",
    "filecoin/offer",
    "-c",
    "upload/add",
    agentDid,
    "--base64",
  ];
  const tryCmd = (cmd, args, useShell = false) => {
    return spawnSync(cmd, args, {
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
      shell: useShell,
      timeout: 120_000,
    });
  };

  const cliArgs = ["delegation", "create", ...caps];

  let r = tryCmd("storacha", cliArgs);
  if (r.error || r.status !== 0) {
    r = tryCmd("storacha.cmd", cliArgs);
  }
  if (r.error || r.status !== 0) {
    r = tryCmd("npx", ["--yes", "@storacha/cli", ...cliArgs]);
  }
  if ((r.error || r.status !== 0) && process.platform === "win32") {
    r = tryCmd("cmd", ["/c", "npx", "--yes", "@storacha/cli", ...cliArgs], true);
  }
  if (r.status !== 0) {
    return {
      ok: false,
      stderr: (r.stderr || r.error?.message || "").trim(),
      stdout: (r.stdout || "").trim(),
    };
  }
  const out = (r.stdout || "").trim();
  return { ok: true, proof: out };
}

async function main() {
  if (!fs.existsSync(envPath)) {
    console.error("Missing backend/.env — copy .env.example to .env first.");
    process.exit(1);
  }

  let content = fs.readFileSync(envPath, "utf8");
  const parsed = dotenv.parse(content);

  let principal = (parsed.STORACHA_PRINCIPAL || "").trim() || readPrincipalFromFile(parsed);
  let proof = (parsed.STORACHA_PROOF || "").trim() || readProofFromFiles(parsed);

  if (!principal) {
    const signer = await generate();
    principal = format(signer);
    console.log("Generated new STORACHA_PRINCIPAL (agent private key).");
    console.log("  Agent DID (use for delegation):", signer.did());
    content = upsertEnvKey(content, "STORACHA_PRINCIPAL", principal);
    fs.writeFileSync(envPath, content, "utf8");
  } else {
    console.log("STORACHA_PRINCIPAL already set — skipping generation.");
  }

  if (proof) {
    console.log("STORACHA_PROOF (or *_FILE) already set — skipping delegation fetch.");
    console.log("Done.");
    return;
  }

  let agentDid;
  try {
    agentDid = parse(principal.trim()).did();
  } catch (e) {
    console.error("Could not parse STORACHA_PRINCIPAL:", e.message);
    process.exit(1);
  }

  console.log("STORACHA_PROOF missing — trying Storacha CLI delegation…");
  const result = tryDelegationViaCli(agentDid);
  if (result.ok) {
    content = fs.readFileSync(envPath, "utf8");
    content = upsertEnvKey(content, "STORACHA_PROOF", result.proof);
    fs.writeFileSync(envPath, content, "utf8");
    console.log("Wrote STORACHA_PROOF to backend/.env");
    console.log("Done.");
    return;
  }

  const errText = `${result.stderr || ""}\n${result.stdout || ""}`.trim();
  console.warn("Could not run delegation automatically:", errText || "unknown error");
  if (/no current space/i.test(errText)) {
    console.log('\nHint: run `storacha space create my-space` (or `storacha space use <did>`), then re-run: npm run storacha:setup\n');
  }
  console.log(`
Finish manually (after: npm install -g @storacha/cli, storacha login, storacha space create …):

  storacha delegation create -c space/blob/add -c space/index/add -c filecoin/offer -c upload/add ${agentDid} --base64

Paste the base64 output into STORACHA_PROOF or save it to backend/.storacha/proof.txt and set:

  STORACHA_PROOF_FILE=./.storacha/proof.txt

See https://docs.storacha.network/ai/quickstart/
`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
