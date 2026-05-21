import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const sidecarDir = path.join(root, "sidecar");
const binariesDir = path.join(root, "src-tauri", "binaries");

function run(cmd, opts = {}) {
  console.log(`\n> ${cmd}`);
  execSync(cmd, { stdio: "inherit", cwd: opts.cwd ?? root, env: opts.env ?? process.env });
}

function hasCommand(cmd, env = process.env) {
  try {
    execSync(`command -v ${cmd}`, { shell: true, stdio: "ignore", env });
    return true;
  } catch {
    return false;
  }
}

function resolveUvBin(env = process.env) {
  if (hasCommand("uv", env)) return "uv";
  const home = env.HOME ?? env.USERPROFILE;
  if (!home) return null;
  for (const sub of [".local/bin/uv", ".cargo/bin/uv"]) {
    const candidate = path.join(home, sub);
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function uvEnv() {
  const home = process.env.HOME;
  if (!home) return process.env;
  const extra = [path.join(home, ".local/bin"), path.join(home, ".cargo/bin")];
  const pathKey = process.platform === "win32" ? "Path" : "PATH";
  return { ...process.env, [pathKey]: [...extra, process.env[pathKey] ?? ""].join(path.delimiter) };
}

function installUv() {
  if (process.platform === "win32") {
    console.error("uv not found. Install: https://docs.astral.sh/uv/getting-started/installation/");
    process.exit(1);
  }
  console.log("\nInstalling uv...");
  run("curl -LsSf https://astral.sh/uv/install.sh | sh");
}

function hostTriple() {
  try {
    return execSync("rustc --print host-tuple", { encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

function ensureDevShim(triple) {
  if (!triple || process.platform === "win32") return;

  const dest = path.join(binariesDir, `cme-sidecar-${triple}`);
  if (fs.existsSync(dest)) {
    fs.chmodSync(dest, 0o755);
    return;
  }

  const content = `#!/usr/bin/env sh
set -eu
BIN_DIR="$(CDPATH="" cd "$(dirname "$0")" && pwd)"
REPO="$(CDPATH="" cd "$BIN_DIR/../.." && pwd)"
SC="$REPO/sidecar"
exec uv run --directory "$SC" python -m confluence_export_sidecar
`;

  fs.mkdirSync(binariesDir, { recursive: true });
  fs.writeFileSync(dest, content, { mode: 0o755 });
  console.log(`Created dev sidecar shim: ${path.relative(root, dest)}`);
}

console.log("=== export-wiki setup ===\n");

console.log("[1/4] Node dependencies");
run("npm install");

console.log("\n[2/4] Rust toolchain");
if (!hasCommand("rustc")) {
  console.error(
    "rustc not found. Install Rust from https://rustup.rs/ (macOS: also run xcode-select --install)",
  );
  process.exit(1);
}
const triple = hostTriple();
if (triple) {
  console.log(`  host triple: ${triple}`);
}

console.log("\n[3/4] Python sidecar (uv)");
let env = uvEnv();
if (!resolveUvBin(env)) {
  installUv();
  env = uvEnv();
}
const uv = resolveUvBin(env);
if (!uv) {
  console.error("uv install finished but uv is still not on PATH. Restart the shell and run: npm run setup");
  process.exit(1);
}
run(`"${uv}" sync --extra dev`, { cwd: sidecarDir, env });

console.log("\n[4/4] Dev sidecar shim");
ensureDevShim(triple);

console.log("\n=== setup complete ===");
console.log("Start the desktop app:  npm start");
