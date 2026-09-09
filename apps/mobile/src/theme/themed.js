import { StyleSheet } from 'react-native'
import { colors, type, getThemeMode } from './theme'

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
