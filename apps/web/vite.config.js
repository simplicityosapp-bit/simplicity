import { defineConfig } from 'vite'
import { configDefaults } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'
import { fileURLToPath } from 'url'

const dirname = path.dirname(fileURLToPath(import.meta.url))

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // The web app moved under apps/web/ in the monorepo migration, but the
  // developer .env.local (VITE_SUPABASE_URL / ANON_KEY) stays at the repo root.
  // Point Vite's env dir there so local dev picks it up (prod env comes from
  // Vercel's env vars, so this is a no-op there — no .env file in the build).
  envDir: path.resolve(dirname, '../..'),
  resolve: {
    alias: {
      '@': path.resolve(dirname, './src'),
    },
  },
  test: {
    /* Never scan git worktrees the harness drops under .claude/ — they are
       stale full-repo copies that would shadow/duplicate the real suite. */
    exclude: [...configDefaults.exclude, '**/.claude/**'],
  },
  build: {
    /* CSS output target. Without it Vite 8 hands lightningcss its default
       "baseline widely available" target, which rewrites every media query
       into Level 4 range syntax — `@media (max-width: 767px)` comes out as
       `@media (width<=767px)`. That form needs Safari 16.4, and a browser
       that doesn't parse it drops the WHOLE block, so every mobile rule in
       the app (the calendar's day rows, and ~16 others) would silently not
       apply on an older iPhone rather than degrade.

       The floor is set to what the app ALREADY requires rather than to
       something older, because a lower number would be a fiction:
       `color-mix()` is Safari 16.2+, and the token system uses it 469 times
       — 451 of those with var() arguments, which lightningcss cannot lower
       to a static fallback because the value only exists at runtime. Below
       16.2 the palette collapses regardless of what this line says.

       So 16.2 is both the honest minimum and enough to undo the rewrite
       (16.2 < 16.4). Nothing else regressed: color-mix is emitted untouched
       and the main stylesheet grew 47 bytes.

       NOT expressible as a `browserslist` field — tried, and lightningcss
       under Vite 8 ignores it; this is the option it actually reads. */
    cssTarget: ['chrome111', 'edge111', 'firefox113', 'safari16.2'],
    rollupOptions: {
      output: {
        /* Split rarely-changing third-party code into its own long-lived
           chunks so they stay cached across app deploys (the app code
           changes far more often than these do). Route-level code-split
           chunks are produced automatically from React.lazy imports.
           Rolldown (Vite 8) requires manualChunks as a function. The
           node_modules boundary keeps unrelated packages that merely
           contain "react" in their path out of the react chunk. */
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          if (/[\\/]node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/.test(id)) return 'react-vendor'
          if (id.includes('@supabase')) return 'supabase'
          if (id.includes('@tanstack')) return 'query'
          if (id.includes('lucide-react')) return 'icons'
          return undefined
        },
      },
    },
  },
})
