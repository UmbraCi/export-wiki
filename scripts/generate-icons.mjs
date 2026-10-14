import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { buildRoot } from "./build-paths.mjs";

const root = path.resolve(import.meta.dirname, "..");

const output = path.join(buildRoot, "icons");
const source = readFileSync(path.join(root, "src-tauri/icons/icon-source.png"));
// The dev Dock needs the same power-five squircle mask macOS applies to bundled icons.
const points = Array.from({ length: 256 }, (_, i) => {
  const angle = i * Math.PI * 2 / 256;
  const coordinate = value => 512 + Math.sign(value) * Math.abs(value) ** 0.4 * 512;
  return `${coordinate(Math.cos(angle))},${coordinate(Math.sin(angle))}`;
}).join(" ");
mkdirSync(output, { recursive: true });
const dockSource = path.join(output, "dock.svg");
writeFileSync(dockSource, `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1024" height="1024"><defs><clipPath id="dock"><polygon points="${points}"/></clipPath></defs><image width="1024" height="1024" clip-path="url(#dock)" xlink:href="data:image/png;base64,${source.toString("base64")}"/></svg>`);

execFileSync(process.execPath, [
  "node_modules/@tauri-apps/cli/tauri.js", "icon", "src-tauri/icons/icon-source.png",
], { cwd: root, stdio: "inherit" });
execFileSync(process.execPath, [
  "node_modules/@tauri-apps/cli/tauri.js", "icon", dockSource,
  "--png", "1024", "--output", output,
], { cwd: root, stdio: "inherit" });
renameSync(path.join(output, "1024x1024.png"), path.join(root, "src-tauri/icons/icon-dock.png"));

await import("./prune-tauri-icons.mjs");
