#!/usr/bin/env node
/**
 * Keep only icons referenced in src-tauri/tauri.conf.json plus the 1024px source.
 */
import { rmSync, readdirSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'

const iconsDir = new URL('../src-tauri/icons', import.meta.url).pathname

const keep = new Set([
  'icon-source.png',
  'icon-dock.png',
  'icon.icns',
  'icon.ico',
  '32x32.png',
  '128x128.png',
  '128x128@2x.png',
])

for (const name of readdirSync(iconsDir)) {
  if (keep.has(name)) continue
  const path = join(iconsDir, name)
  if (name === 'android' || name === 'ios') {
    rmSync(path, { recursive: true, force: true })
    continue
  }
  unlinkSync(path)
}

console.log('Pruned tauri icons to:', [...keep].join(', '))
