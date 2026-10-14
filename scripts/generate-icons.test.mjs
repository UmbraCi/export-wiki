import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { inflateSync } from "node:zlib";

const root = path.resolve(import.meta.dirname, "..");

test("icon generation preserves source, masks the Dock and is repeatable", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "export-wiki-icons-"));
  try {
    fs.mkdirSync(path.join(dir, "scripts"));
    const icons = path.join(dir, "src-tauri/icons");
    fs.mkdirSync(icons, { recursive: true });
    for (const name of ["generate-icons.mjs", "prune-tauri-icons.mjs", "build-paths.mjs"]) {
      fs.copyFileSync(path.join(root, "scripts", name), path.join(dir, "scripts", name));
    }
    fs.copyFileSync(path.join(root, "src-tauri/tauri.conf.json"), path.join(dir, "src-tauri/tauri.conf.json"));
    fs.copyFileSync(path.join(root, "src-tauri/icons/icon-source.png"), path.join(icons, "icon-source.png"));
    fs.symlinkSync(path.join(root, "node_modules"), path.join(dir, "node_modules"), "junction");
    const source = fs.readFileSync(path.join(icons, "icon-source.png"));
    const generate = () => execFileSync(process.execPath, [path.join(dir, "scripts/generate-icons.mjs")], { cwd: dir, stdio: "pipe" });
    generate();
    const dock = fs.readFileSync(path.join(icons, "icon-dock.png"));
    assert.equal(dock.readUInt32BE(16), 1024);
    assert.equal(dock.readUInt32BE(20), 1024);
    assert.equal(dock[24], 8);
    assert.equal(dock[25], 6, "Dock PNG must have an alpha channel");
    const imageData = [];
    for (let offset = 8; offset < dock.length;) {
      const length = dock.readUInt32BE(offset);
      if (dock.toString("ascii", offset + 4, offset + 8) === "IDAT") {
        imageData.push(dock.subarray(offset + 8, offset + 8 + length));
      }
      offset += length + 12;
    }
    const pixels = inflateSync(Buffer.concat(imageData));
    // The first row has no above neighbor; only its left bytes affect PNG filters.
    for (let i = 1; i <= 1024 * 4; i++) {
      const left = i > 4 ? pixels[i - 4] : 0;
      if (pixels[0] === 1 || pixels[0] === 4) pixels[i] += left;
      if (pixels[0] === 3) pixels[i] += Math.floor(left / 2);
    }
    assert.equal(pixels[4], 0, "Dock corner must be transparent");
    assert.ok(pixels[512 * 4 + 4] > 0, "Dock artwork must remain visible");
    generate();
    assert.deepEqual(fs.readFileSync(path.join(icons, "icon-source.png")), source);
    assert.deepEqual(fs.readFileSync(path.join(icons, "icon-dock.png")), dock);
    assert.deepEqual(fs.readdirSync(icons).sort(), [
      "128x128.png", "128x128@2x.png", "32x32.png", "icon-dock.png",
      "icon-source.png", "icon.icns", "icon.ico",
    ]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
