/* Compresses every PNG under public/backgrounds/ in place.
   Uses sharp's PNG palette mode (8-bit indexed) which gives ~3-5×
   size reduction on photo-soft images while staying visually
   indistinguishable on the kind of soft gradients these backgrounds
   are made of. Falls back to high-effort RGB encoding if the palette
   result somehow grows.
   Usage: node scripts/compress-backgrounds.mjs */

import { promises as fs } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..', 'public', 'backgrounds')

const PALETTE_OPTS = { palette: true, quality: 80, compressionLevel: 9, effort: 10 }
const FALLBACK_OPTS = { quality: 90, compressionLevel: 9, effort: 10 }

async function walk(dir, out = []) {
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    const full = join(dir, e.name)
    if (e.isDirectory()) await walk(full, out)
    else if (/\.png$/i.test(e.name)) out.push(full)
  }
  return out
}

function fmtKB(n) { return `${Math.round(n / 1024)} KB` }

async function processOne(file) {
  const orig = (await fs.stat(file)).size
  const buf = await fs.readFile(file)
  let out = await sharp(buf).png(PALETTE_OPTS).toBuffer()
  let mode = 'palette'
  if (out.length >= buf.length) {
    out = await sharp(buf).png(FALLBACK_OPTS).toBuffer()
    mode = 'rgb-effort10'
  }
  if (out.length >= buf.length) {
    return { file, kept: true, orig, next: orig }
  }
  await fs.writeFile(file, out)
  return { file, kept: false, orig, next: out.length, mode }
}

const files = await walk(root)
console.log(`Found ${files.length} PNGs under ${root}`)
let totalOrig = 0, totalNext = 0, kept = 0
for (const f of files) {
  const r = await processOne(f)
  totalOrig += r.orig
  totalNext += r.next
  if (r.kept) {
    kept++
    console.log(`  · ${f.replace(root + '\\', '').replace(root + '/', '')}  ${fmtKB(r.orig)} (kept — already optimal)`)
  } else {
    const pct = Math.round((1 - r.next / r.orig) * 100)
    console.log(`  · ${f.replace(root + '\\', '').replace(root + '/', '')}  ${fmtKB(r.orig)} → ${fmtKB(r.next)}  (-${pct}%, ${r.mode})`)
  }
}
console.log(`\nTotal: ${fmtKB(totalOrig)} → ${fmtKB(totalNext)}  (${kept} files unchanged)`)
