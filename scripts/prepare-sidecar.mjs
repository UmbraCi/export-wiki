import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { sidecarDist } from "./build-paths.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const distDir = sidecarDist;
const binariesDir = path.join(root, "src-tauri", "binaries");
const isWin = process.platform === "win32";
const distName = isWin ? "cme-sidecar.exe" : "cme-sidecar";
const source = path.join(distDir, distName);

if (!fs.existsSync(source)) {
  console.error(`Missing PyInstaller output at ${source}`);
  console.error("Run: npm run build:sidecar");
  process.exit(1);
}

let triple;
try {
  triple = execSync("rustc --print host-tuple", { encoding: "utf8" }).trim();
} catch {
  console.error("Failed to determine platform target triple (rustc required)");
  process.exit(1);
}

if (!triple) {
  console.error("Failed to determine platform target triple");
  process.exit(1);
}

const ext = isWin ? ".exe" : "";
const destName = `cme-sidecar-${triple}${ext}`;
const dest = path.join(binariesDir, destName);

fs.mkdirSync(binariesDir, { recursive: true });
const temporary = `${dest}.${process.pid}.tmp`;
try {
  fs.copyFileSync(source, temporary);
  if (!isWin) {
    fs.chmodSync(temporary, 0o755);
  }
  // Replacing the inode avoids macOS retaining the overwritten binary's code signature.
  fs.renameSync(temporary, dest);
} finally {
  if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
}
console.log("Prepared sidecar binary at src-tauri/binaries/cme-sidecar");
