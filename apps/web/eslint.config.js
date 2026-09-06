import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      /* __APP_VERSION__ is substituted by vite at build time (see vite.config.js
         define), so it exists at runtime but nothing declares it to the linter. */
      globals: { ...globals.browser, __APP_VERSION__: "readonly" },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  },
  {
    /* Node contexts, not browser: api/ is a Vercel serverless function and
       test/ runs under vitest. Both legitimately read `process`, which
       globals.browser doesn't declare — the resulting no-undef errors were
       standing noise that made a genuinely clean run indistinguishable from
       a broken one. */
    files: ['api/**/*.{js,jsx}', 'test/**/*.{js,jsx}'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
  },
])
