import { createRequire } from 'node:module'

/* Teach node's CommonJS loader what a React Native asset is.

   Metro rewrites `require('../assets/x.webp')` into an asset handle at
   bundle time. Under vitest that require reaches node's own loader, which
   reads the binary and tries to parse it as JavaScript — so any module
   that maps an image or a font is unloadable, and therefore untestable,
   for a reason that has nothing to do with what it does. theme.js maps a
   background photo per screen, which is what surfaced it.

   A vite `resolve.alias` cannot help here: it governs vite's resolution,
   and this require is executed by node at runtime. Patching the loader is
   the level the problem actually lives at.

   The stub is an opaque number because that is what a caller does with
   the value — hands it to an <Image> — so nothing downstream can tell the
   difference. */
const require = createRequire(import.meta.url)
const Module = require('node:module')

for (const ext of ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.ttf', '.otf', '.woff', '.woff2']) {
  Module._extensions[ext] = (module) => { module.exports = 1 }
}
