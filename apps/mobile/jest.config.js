/* Jest, for COMPONENT tests only.
   ────────────────────────────────────────────────────────────────
   This app has two test runners on purpose, and the split is by file
   extension so neither can pick up the other's files:

     · test/*.test.js   → vitest  (`pnpm test`)     — pure logic
     · test/*.test.jsx  → jest    (`pnpm test:ui`)  — components

   Vitest is the monorepo's runner and stays that way for logic: it is
   fast and needs no native shims. It cannot render a screen here, though.
   Vite 8 transforms with oxc, oxc decides JSX by file extension, and every
   component in this app is a `.js` file holding JSX because that is how
   Metro reads it. Its options omit `lang`, so it cannot be told otherwise,
   and the escape hatches (esbuild loader, oxc:false, a plugin `include`)
   are all either ignored or run after vite's own transform. Making it work
   would mean hand-building a babel pipeline that duplicates Metro.

   jest-expo already IS that pipeline — the same babel transform Metro
   uses, plus the mocks for native modules and assets. So components go
   through it, and render as real React Native rather than through
   react-native-web, which means what a test asserts here is the component
   that actually ships. */
module.exports = {
  preset: 'jest-expo',
  /* Component tests only. The .js suffix belongs to vitest. */
  testMatch: ['<rootDir>/test/**/*.test.jsx'],
  setupFilesAfterEnv: ['<rootDir>/test/jest-setup.js'],
  /* The harness drops stale full-repo copies under .claude/; never scan them. */
  testPathIgnorePatterns: ['/node_modules/', '/.claude/'],
  /* Written to match ANYWHERE after node_modules/ rather than anchored to
     the package name, because pnpm stores real files under
     node_modules/.pnpm/<pkg>@<ver>/node_modules/<pkg>. An anchored pattern
     sees `.pnpm` first, matches nothing in the allow-list, and leaves React
     Native's own jest preset untransformed — which fails as "Must use
     import to load ES Module" before a single test runs. */
  transformIgnorePatterns: [
    'node_modules/(?!.*(react-native|@react-native|expo|@expo|@react-navigation|lucide-react-native|@simplicity))',
  ],
}
