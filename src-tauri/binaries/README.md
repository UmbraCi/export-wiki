Place `cme-sidecar` binaries here named per Tauri’s `externalBin` convention:

- **`cme-sidecar-aarch64-apple-darwin`** — minimal dev shim that runs `uv` against `repo/sidecar`
- Production: run `npm run build:sidecar` and rename/copy the PyInstaller artifact to match the active target triple expected by `tauri build`.
