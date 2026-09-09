import { useEffect, useState } from 'react'
import { StyleSheet } from 'react-native'
import { colors, type, getThemeMode, subscribeTheme } from './theme'

/* themed() — a stylesheet that follows the active palette.
   ────────────────────────────────────────────────────────────────
   StyleSheet.create copies colour VALUES at module load, which is why
   changing the palette used to need an app reload: every screen had
   already baked yesterday's colours into a frozen object.

   This returns a proxy instead. `styles.card` resolves on ACCESS — that
   is, during render — so it hands back the sheet for whichever mode is
   active right then. Sheets are built once per mode and cached, so this
   costs one extra property lookup per style, not a rebuild per render.

   The reason it is a proxy and not a hook: 79 files here declare one
   module-level `styles` object, and in a third of them several components
   share it. A hook would have to be called inside each of those
   components, which is an edit to every component body in the app. A
   proxy changes only the stylesheet declaration and nothing else.

   Authoring change is mechanical:

     const styles = StyleSheet.create({ a: { color: colors.text } })
     const styles = themed((c, t) => ({ a: { color: c.text } }))

   `t` is the type scale, which carries colours of its own — spreading
   `...type.body` inside a sheet would otherwise pin that text to the
   palette that was live at boot.

   Inline uses (`style={{ color: colors.text }}`) need no change: they
   already read the live object during render, which is exactly why they
   were the 484 references that always worked. */
export function themed(build) {
  const cache = {}
  return new Proxy({}, {
    get(_target, key) {
      const mode = getThemeMode()
      /* Built lazily, and only after applyThemeColors has swapped the
         palette in place — so `colors`/`type` hold this mode's values. */
      let sheet = cache[mode]
      if (!sheet) {
        sheet = StyleSheet.create(build(colors, type))
        cache[mode] = sheet
      }
      return sheet[key]
    },
    /* Object.keys(styles) and the spread form are rare but real; without
       these the proxy would look empty to them. */
    ownKeys() {
      const mode = getThemeMode()
      if (!cache[mode]) cache[mode] = StyleSheet.create(build(colors, type))
      return Reflect.ownKeys(cache[mode])
    },
    getOwnPropertyDescriptor() {
      return { enumerable: true, configurable: true }
    },
  })
}

/* themedMap() — the same trick for a plain lookup table.
   ────────────────────────────────────────────────────────────────
   themed() covers stylesheets, but a colour read is frozen wherever it
   stands, and screens here keep small maps beside their sheet:

     const PRIORITY_COLOR = { high: colors.danger, low: colors.positive }

   That object is built once, at import, and hands out boot-time colours
   for the rest of the session — so after a theme switch the dot keeps
   the old palette while everything around it repaints. `fill` and
   `textFaint` are the two that really bite, because they INVERT between
   modes (see theme.js): a light fill frozen onto a dark card is a chip
   nobody can see any more.

     const PRIORITY_COLOR = themedMap((c) => ({ high: c.danger, low: c.positive }))

   Reads stay exactly as they were — PRIORITY_COLOR[p] — since the proxy
   resolves on access. Build an array and an array comes back, so .map
   and spread keep working too.

   Deliberately not StyleSheet.create: these hold bare colour strings and
   bucket descriptors, not style objects. */
export function themedMap(build) {
  /* The first build doubles as the proxy target, so the resolved shape
     and the target always agree — which is what keeps Array.isArray and
     the ownKeys/descriptor invariants honest for array maps. */
  const mode0 = getThemeMode()
  const cache = { [mode0]: build(colors, type) }
  const resolve = () => {
    const mode = getThemeMode()
    if (!cache[mode]) cache[mode] = build(colors, type)
    return cache[mode]
  }
  return new Proxy(cache[mode0], {
    get(_target, key) { return resolve()[key] },
    ownKeys() { return Reflect.ownKeys(resolve()) },
    getOwnPropertyDescriptor(_target, key) { return Reflect.getOwnPropertyDescriptor(resolve(), key) },
  })
}

/* useThemeMode() — for colours that get captured rather than read.
   ────────────────────────────────────────────────────────────────
   themed() and themedMap() both resolve on ACCESS, which is enough for
   anything read during render. A useMemo is the case they cannot cover:
   it reads the colour live, correctly, and then caches the result. Its
   dependency array says when to look again, and "the palette changed" is
   not usually on that list — so a memoised colour outlives the switch
   that should have replaced it, until some unrelated dependency happens
   to move.

   Name the mode and list it, and the memo recomputes with everything
   else that depends on the palette:

     const themeMode = useThemeMode()
     const groups = useMemo(() => …, [tasks, themeMode])

   Only needed when a colour crosses a memo boundary. Plain render-time
   reads and themed()/themedMap() lookups already follow the palette. */
export function useThemeMode() {
  const [mode, setMode] = useState(getThemeMode)
  useEffect(() => subscribeTheme(setMode), [])
  return mode
}
