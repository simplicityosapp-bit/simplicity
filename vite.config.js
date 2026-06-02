import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { fileURLToPath } from 'url'

const dirname = path.dirname(fileURLToPath(import.meta.url))

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(dirname, './src'),
    },
  },
  build: {
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
