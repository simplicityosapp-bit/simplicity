import { defineConfig, configDefaults } from 'vitest/config'

/* Vitest for apps/mobile.
   ────────────────────────────────────────────────────────────────
   The same runner the rest of the monorepo uses, rather than a second
   toolchain: apps/web and packages/core are both on vitest, and a jest
   here would mean two ways to run one repo's tests.

   These cover the app's PURE logic — the lib/ modules that decide things,
   which is where a silent wrong answer costs the most and where a test
   needs no device. Rendering React Native components is a separate
   problem: it needs either jest-expo or a react-native-web alias, and a
   component asserted through react-native-web is not the component that
   ships (forceRTL and accessibilityState are both no-ops there). Worth
   doing, worth doing deliberately, and not silently conflated with this.

   `react-native` resolves to react-native-web so a module that
   incidentally imports a primitive still loads — RN ships untranspiled
   Flow, which node cannot parse. react-native-web is already a dependency
   here for the browser preview, so this costs nothing.

   NOTE for anyone mocking a primitive: because of that alias, the
   specifier is rewritten before a mock is matched, so `vi.mock('react-
   native')` silently does nothing. Mock 'react-native-web'. (And a
   `require()` executed inside a function bypasses both the alias and the
   mock registry — it runs through node's loader — so lazily-required
   modules cannot be mocked here at all.)

   Assets are handled by test/setup.js rather than an alias, because every
   asset reference in this app is a `require()` that node resolves at
   runtime. */
export default defineConfig({
  resolve: {
    alias: { 'react-native': 'react-native-web' },
  },
  test: {
    environment: 'node',
    setupFiles: ['./test/setup.js'],
    /* Never scan git worktrees the harness drops under .claude/ — they are
       stale full-repo copies that would shadow the real suite. */
    exclude: [...configDefaults.exclude, '**/.claude/**', '**/*.test.jsx'],
  },
})
