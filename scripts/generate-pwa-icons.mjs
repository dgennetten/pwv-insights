#!/usr/bin/env node
/**
 * One-off generator for PWA PNG icons from public/favicon.svg.
 * Run: npx -y sharp-cli is unreliable for SVG density, so this uses sharp directly:
 *   npm i -D sharp && node scripts/generate-pwa-icons.mjs && npm un -D sharp
 */
import { readFileSync, writeFileSync } from 'node:fs'
import sharp from 'sharp'

const svg = readFileSync('public/favicon.svg', 'utf8')
// Full-bleed variant (no rounded corners) for maskable + apple-touch icons,
// since the OS applies its own corner mask.
const fullBleed = svg.replace('rx="7"', 'rx="0"')

const jobs = [
  { src: svg,       size: 192, out: 'public/pwa-192.png' },
  { src: svg,       size: 512, out: 'public/pwa-512.png' },
  { src: fullBleed, size: 512, out: 'public/pwa-maskable-512.png' },
  { src: fullBleed, size: 180, out: 'public/apple-touch-icon.png' },
]

for (const { src, size, out } of jobs) {
  const buf = await sharp(Buffer.from(src), { density: 72 * (size / 32) })
    .resize(size, size)
    .png()
    .toBuffer()
  writeFileSync(out, buf)
  console.log(`✓ ${out} (${size}x${size}, ${buf.length} bytes)`)
}
