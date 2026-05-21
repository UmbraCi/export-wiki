import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

/** All build artifacts live here (gitignored). */
export const buildRoot = path.join(root, ".build");

export const frontendDist = path.join(buildRoot, "frontend");

export const sidecarDist = path.join(buildRoot, "sidecar", "dist");
export const sidecarWork = path.join(buildRoot, "sidecar", "work");
