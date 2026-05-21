#!/usr/bin/env python3
"""Prepare macOS icons: opaque full-bleed source + dev Dock PNG with squircle mask."""
from __future__ import annotations

import collections
import sys
from pathlib import Path

from PIL import Image

CANVAS = 1024


def is_margin_pixel(p: tuple[int, int, int, int]) -> bool:
    r, g, b, a = p
    if a < 128:
        return False
    return r >= 230 and g >= 233 and b >= 240


def fill_margin_pixels(im: Image.Image) -> Image.Image:
    w, h = im.size
    px = im.load()
    color: list[list[tuple[int, int, int, int] | None]] = [[None] * w for _ in range(h)]
    q: collections.deque[tuple[int, int]] = collections.deque()

    for y in range(h):
        for x in range(w):
            p = px[x, y]
            if not is_margin_pixel(p):
                color[y][x] = p
                q.append((x, y))

    while q:
        x, y = q.popleft()
        c = color[y][x]
        assert c is not None
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h and color[ny][nx] is None:
                color[ny][nx] = c
                q.append((nx, ny))

    out = Image.new("RGBA", (w, h))
    opx = out.load()
    for y in range(h):
        for x in range(w):
            p = px[x, y]
            filled = color[y][x]
            opx[x, y] = filled if filled is not None else p
    return out


def scale_cover(im: Image.Image, scale: float = 1.14) -> Image.Image:
    w, h = im.size
    nw, nh = int(w * scale), int(h * scale)
    scaled = im.resize((nw, nh), Image.Resampling.LANCZOS)
    left = (nw - w) // 2
    top = (nh - h) // 2
    return scaled.crop((left, top, left + w, top + h))


def in_mac_squircle(x: float, y: float, size: int = CANVAS) -> bool:
    nx = (x - size / 2) / (size / 2)
    ny = (y - size / 2) / (size / 2)
    return abs(nx) ** 5 + abs(ny) ** 5 <= 1.0


def apply_squircle_mask(im: Image.Image) -> Image.Image:
    out = im.copy()
    opx = out.load()
    w, h = out.size
    for y in range(h):
        for x in range(w):
            if not in_mac_squircle(x, y, w):
                opx[x, y] = (0, 0, 0, 0)
    return out


def main() -> int:
    icons_dir = Path("src-tauri/icons")
    source_path = Path(sys.argv[1] if len(sys.argv) > 1 else icons_dir / "icon-source.png")
    dock_path = icons_dir / "icon-dock.png"

    im = Image.open(source_path).convert("RGBA")
    im = fill_margin_pixels(im)
    im = scale_cover(im)

    # Bundled app icon: opaque full-bleed square (macOS applies Dock mask at runtime).
    im.convert("RGBA").save(source_path)

    # Dev Dock icon: transparent outside squircle (setApplicationIconImage needs this).
    apply_squircle_mask(im).save(dock_path)
    print(f"Fixed macOS icon source: {source_path}")
    print(f"Wrote dev Dock icon: {dock_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
