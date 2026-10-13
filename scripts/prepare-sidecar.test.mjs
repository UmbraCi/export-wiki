import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import os from "node:os";
import { sidecarDist } from "./build-paths.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const isWin = process.platform === "win32";
const source = path.join(sidecarDist, isWin ? "cme-sidecar.exe" : "cme-sidecar");

test("preparation replaces the binary and preserves runnable structured logging", { skip: !fs.existsSync(source) }, () => {
  const triple = execFileSync("rustc", ["--print", "host-tuple"], { encoding: "utf8" }).trim();
  const target = path.join(root, "src-tauri/binaries", `cme-sidecar-${triple}${isWin ? ".exe" : ""}`);
  const previous = fs.existsSync(target) ? fs.statSync(target).ino : null;
  execFileSync(process.execPath, [path.join(root, "scripts/prepare-sidecar.mjs")]);
  if (!isWin && previous !== null) assert.notEqual(fs.statSync(target).ino, previous);
  const started = Date.now();
  const result = spawnSync(target, [], {
    input: JSON.stringify({ protocol_version: 1, request_id: "smoke", type: "ping", payload: {} }) + "\n",
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
    timeout: 15000,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).ok, true);
  const logs = result.stderr.trim().split("\n").map(JSON.parse);
  assert.ok(logs.some((entry) => entry.level === "debug" && entry.message.includes("smoke")));
  assert.equal(fs.existsSync(path.join(root, "logs")), false, "sidecar must not create repository logs");
  assert.equal(fs.existsSync(path.join(root, "sidecar/cme-sidecar.spec")), false, "spec belongs in .build");
  if (process.platform === "darwin") {
    const logFile = path.join(os.homedir(), "Library/Application Support/com.exportwiki.app/logs/sidecar.log");
    assert.ok(fs.statSync(logFile).mtimeMs >= started, "packaged sidecar must write to the app data directory");
  }
});
