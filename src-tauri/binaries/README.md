Place `cme-sidecar` binaries here named per Tauri’s `externalBin` convention (files are gitignored; generated locally):

- **Dev:** `npm start` enables `dev-sidecar` and uses `sidecar/.venv` to run the Python source directly. The development Tauri config excludes external binaries; setup does not create a shim. Python changes restart the directory worker before its next request, while active exports finish with their existing process.
- **Production:** `npm run build:sidecar` builds the PyInstaller binary and copies it from `.build/sidecar/dist/` into `cme-sidecar-<host-triple>`. `npm run build` runs this step before `tauri build`.

Intermediate build outputs live under `.build/` (see `scripts/build-paths.mjs`), not under `sidecar/`.
