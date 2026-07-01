/* One-shot: for every PNG under public/backgrounds/ produce a sibling
   .webp at quality 80. WebP shrinks these soft-photographic backgrounds
   by 3-5× vs palette PNG with no visible difference, so the bulk of
   the screen-load cost drops once index.css is pointed at the .webp.
   The PNGs are left in place as a fallback / safety net.

   Also handles the login-bg-{mobile,desktop}.png pair at the root of
   /public, since those load on the auth screens.

   Usage: node scripts/build-backgrounds-webp.mjs */

import { promises as fs } from 'node:fs'
import { join, dirname, extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const here = dirname(fileURLToPath(import.meta.url))
const publicDir = join(here, '..', 'public')
const bgRoot = join(publicDir, 'backgrounds')

const WEBP_OPTS = { quality: 80, effort: 6 }

async function walk(dir, out = []) {
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    const full = join(dir, e.name)
    if (e.isDirectory()) await walk(full, out)
    else if (/\.png$/i.test(e.name)) out.push(full)
  }
  return out
}

function fmtKB(n) { return `${Math.round(n / 1024)} KB` }

async function processOne(pngPath) {
  const webpPath = pngPath.replace(/\.png$/i, '.webp')
  const origStat = await fs.stat(pngPath)
  const buf = await fs.readFile(pngPath)
  const out = await sharp(buf).webp(WEBP_OPTS).toBuffer()
  await fs.writeFile(webpPath, out)
  return { png: pngPath, webp: webpPath, origSize: origStat.size, webpSize: out.length }
}

const files = [
  ...(await walk(bgRoot)),
  join(publicDir, 'login-bg-mobile.png'),
  join(publicDir, 'login-bg-desktop.png'),
].filter(Boolean)

console.log(`Converting ${files.length} PNGs → .webp\n`)
let totalOrig = 0, totalNext = 0
for (const f of files) {
  try {
    const r = await processOne(f)
    totalOrig += r.origSize
    totalNext += r.webpSize
    const pct = Math.round((1 - r.webpSize / r.origSize) * 100)
    const rel = r.png.replace(publicDir + '\\', '').replace(publicDir + '/', '')
    console.log(`  · ${rel.padEnd(50)} ${fmtKB(r.origSize).padStart(8)} → ${fmtKB(r.webpSize).padStart(8)}  (-${pct}%)`)
  } catch (e) {
    console.log(`  · skip ${f}: ${e.message}`)
  }
}
console.log(`\nTotal: ${fmtKB(totalOrig)} → ${fmtKB(totalNext)} WebP (-${Math.round((1 - totalNext / totalOrig) * 100)}%)`)
