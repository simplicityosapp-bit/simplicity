/* One-shot: copy + downscale + palette-quantize the 10 onboarding-tree
   stage PNGs from the design folder into /public/onboarding-tree/.
   The art is displayed at ~72px so 256×256 is plenty for retina, and
   palette mode preserves the transparency while dropping file size
   from 2–3MB → <50KB. */

import sharp from 'sharp'
import { readdir, mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { statSync } from 'node:fs'

const here = dirname(fileURLToPath(import.meta.url))
const SRC = join(here, '..', '..', 'עיצוב', 'עיצוב מסכים', 'עץ צומח בשלבים לאונבורדינג')
const OUT = join(here, '..', 'public', 'onboarding-tree')

await mkdir(OUT, { recursive: true })
const files = (await readdir(SRC)).filter((f) => /^\d+\.png$/i.test(f))

let totalIn = 0
let totalOut = 0
for (const name of files.sort((a, b) => parseInt(a) - parseInt(b))) {
  const inPath = join(SRC, name)
  const outPath = join(OUT, name)
  const sizeIn = statSync(inPath).size
  await sharp(inPath)
    .resize(256, 256, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ palette: true, quality: 82, effort: 9 })
    .toFile(outPath)
  const sizeOut = statSync(outPath).size
  totalIn += sizeIn
  totalOut += sizeOut
  console.log(`· ${name.padEnd(8)} ${(sizeIn / 1024).toFixed(0).padStart(5)} KB → ${(sizeOut / 1024).toFixed(0).padStart(4)} KB`)
}
console.log(`Total: ${(totalIn / 1024).toFixed(0)} KB → ${(totalOut / 1024).toFixed(0)} KB`)
