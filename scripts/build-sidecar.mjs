import { execFileSync } from "node:child_process";
import path from "node:path";
import { buildRoot, sidecarDist, sidecarWork } from "./build-paths.mjs";

const root = path.resolve(import.meta.dirname, "..");

execFileSync("uv", [
  "run", "python", "-m", "PyInstaller",
  "--onefile", "--name", "cme-sidecar",
  "--specpath", path.join(buildRoot, "sidecar"),
  "--distpath", sidecarDist,
  "--workpath", sidecarWork,
  "confluence_export_sidecar/__main__.py",
], { cwd: path.join(root, "sidecar"), stdio: "inherit" });

await import("./prepare-sidecar.mjs");
