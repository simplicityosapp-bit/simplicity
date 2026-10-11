// Tests for the edge functions' pure modules (no Deno/JSR imports), run under
// Node with the web app's vitest install:
//   cd apps/web && npx vitest run --config ../../supabase/functions/vitest.config.mjs
// `globals` so test files need not import 'vitest' (no node_modules here).
import { fileURLToPath } from 'node:url'

export default {
  test: {
    root: fileURLToPath(new URL('.', import.meta.url)),
    include: ['tests/**/*.test.ts'],
    globals: true,
  },
}
