/* Native modules a component test cannot have.
   ────────────────────────────────────────────────────────────────
   jest-expo gives us the Metro transform and the Expo module mocks, but a
   few libraries own their own. Each of these is imported at module load
   somewhere in the screen graph, so without a stand-in the suite fails
   before a single assertion runs — and the failure reads like the
   component is broken rather than like a missing shim. */

/* theme.js reads the saved palette from here at import time. */
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'))

/* The reload chain reaches for this lazily; in a test nothing should
   actually relaunch the app. */
jest.mock('expo-updates', () => ({ reloadAsync: jest.fn(async () => {}) }))

/* Icons are SVG components with no behaviour of their own. Rendering the
   real ones drags react-native-svg into every screen test for nothing. */
jest.mock('lucide-react-native', () => {
  const React = require('react')
  const { View } = require('react-native')
  return new Proxy({}, {
    get: (_t, name) => {
      if (name === '__esModule') return true
      return (props) => React.createElement(View, { ...props, testID: `icon-${String(name)}` })
    },
  })
})

/* i18n. Every screen asks for its strings through the shared engine; with
   it uninitialised t() hands back the key, and every text assertion in a
   component test fails for a reason unrelated to the component. */
require('../src/lib/i18n').setupI18n()
