Place `cme-sidecar` binaries here named per Tauri’s `externalBin` convention (files are gitignored; generated locally):

- **Dev:** `npm run setup` creates `cme-sidecar-<host-triple>` as a shim that runs `uv` against `sidecar/`.
- **Production:** `npm run prepare:sidecar` copies the PyInstaller binary from `.build/sidecar/dist/` into `cme-sidecar-<host-triple>` for `tauri build`.

Intermediate build outputs live under `.build/` (see `scripts/build-paths.mjs`), not under `sidecar/`.
