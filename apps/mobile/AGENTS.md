# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

# Tests

**There are two runners here, split by file extension. Both must pass.**

| files | run with | covers |
|---|---|---|
| `test/*.test.js` | `pnpm test` (vitest) | pure logic — lib/, decisions, formatting |
| `test/*.test.jsx` | `pnpm test:ui` (jest-expo) | components — what renders, what it says, what it calls |

Neither runner picks up the other's files: vitest excludes `*.test.jsx`, and
jest's `testMatch` is `*.test.jsx` only.

**Write a component test when you add or change a screen.** Most sessions here
have no device to open, and this app's history is full of bugs that were only
ever visible by looking: a settings screen that rendered raw i18n keys, a theme
switch that did nothing in release builds, a root component that registered too
late to exist. A screen with no test is a screen nobody is checking.

## Why two runners

Vitest is the monorepo's runner and stays that way for logic — fast, no native
shims. It cannot render a screen here. Vite 8 transforms with oxc, oxc decides
JSX by file extension, and every component in this app is a `.js` file holding
JSX because that is how Metro reads it. `OxcOptions` omits `lang`, so it cannot
be told otherwise, and the escape hatches (`esbuild.loader`, `oxc: false`, a
plugin `include`) are ignored or run after vite's own transform. Making it work
would mean hand-building a babel pipeline that duplicates Metro. jest-expo
already is that pipeline.

The payoff beyond "it parses": jest-expo renders real React Native, so a
component test can assert accessibility roles and state — which
react-native-web silently drops.

## Traps, each of which cost someone an afternoon

- **vitest: mock `react-native-web`, not `react-native`.** The config aliases
  one to the other, so the specifier is rewritten before a mock is matched and
  `vi.mock('react-native')` silently does nothing.
- **vitest: a `require()` inside a function cannot be mocked at all.** It runs
  through node's loader, bypassing both the alias and the mock registry. A test
  written over one asserts against the real module while appearing to pass.
- **jest: `transformIgnorePatterns` must match anywhere after `node_modules/`,
  not anchored to the package name.** pnpm stores real files under
  `node_modules/.pnpm/<pkg>@<ver>/node_modules/<pkg>`; an anchored pattern sees
  `.pnpm` first and leaves React Native's own jest preset untransformed, which
  fails as "Must use import to load ES Module" before any test runs.
- **i18n resolves to HEBREW in tests.** Only `he` ships with the engine; other
  languages load asynchronously. Component tests assert Hebrew strings — which
  is also what the app shows by default.
- **Native modules need a stand-in.** `test/jest-setup.js` mocks AsyncStorage,
  expo-updates and the icon set. Anything else imported at module load in a
  screen's graph has to be added there, or the suite fails before asserting and
  the failure reads like a broken component.

## Colours: read them, never keep them

The palette is one object that gets MUTATED when the theme changes, so a
colour is only correct if it is read at the moment it is used. Anything that
copies a value out and holds it keeps the palette that was live when it ran,
and nothing throws — the screen simply repaints around one stubborn element
that stayed the old colour. `fill`, `textFaint`, `textSub` and `brand` invert
between modes, so a stale one is often invisible rather than merely wrong.

Three places a copy hides, and what to write instead:

| Where | Instead of | Write |
|---|---|---|
| A stylesheet | `StyleSheet.create({ … colors.text })` | `themed((c, t) => ({ … c.text }))` |
| A module-level map or list | `const DOT = { high: colors.danger }` | `themedMap((c) => ({ high: c.danger }))` |
| Inside a `useMemo` | any `colors.x`, or a themed lookup | keep it, and add `themeMode` from `useThemeMode()` to the deps |

The memo one is the sneakiest: it reads the colour live and correctly, then
caches the result behind a dependency list that has nothing to do with the
theme, so the value outlives the switch that should have replaced it.

Reads during render — `style={{ color: colors.text }}`, or a `themed()` /
`themedMap()` lookup — need nothing. They already resolve on access. Default
parameters (`onColor = colors.brand`) are fine too; they evaluate per call.

Two throwaway scanners found every instance of the first two classes: grep for
`colors.` at module scope outside a `themed(` block, and for `colors.` inside a
`useMemo` whose deps omit the theme. Worth re-running after a batch of new
screens.

## Assets

`test/setup.js` (vitest) teaches node's CommonJS loader what a `.webp` or
`.ttf` is. There are 34 `require()`s of images and fonts in this app; without
it, any module that maps one — `theme.js` maps a background photo per screen —
is unloadable under test for a reason unrelated to what it does.
