/* ════════════════════════════════════════════════════════════════
   EVERY SCREEN — renders, with real data, and says nothing in code.
   ════════════════════════════════════════════════════════════════
   AGENTS.md lists the bugs this app shipped because nobody could open a
   screen: a settings page that rendered raw i18n keys, a theme switch
   that did nothing, a root component that registered too late. Most
   screens have no test of their own, and writing eighteen hand-mocked
   ones would mean eighteen sets of fake hooks that drift from the real
   ones.

   So this drives every screen through its REAL data hooks, fed by the
   same mock backend the web preview uses (lib/mockSupabase), under the
   real providers. Two things are asserted per screen:

     · it renders without throwing, once its data has arrived;
     · no text on it is a raw translation key — the exact failure that
       once shipped on Settings, where every heading read like
       `groups.personal.title` and nothing threw.

   Rendered through jest-expo, so this is real React Native.
   ════════════════════════════════════════════════════════════════ */

import React from 'react'
import { render, act } from '@testing-library/react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'

/* The backend: the preview's in-memory fixtures instead of the network. */
jest.mock('../src/lib/supabase', () => ({
  supabase: require('../src/lib/mockSupabase').makeMockClient(),
}))

/* Navigation: screens here render outside a navigator, so the hooks they
   call get stand-ins. ProjectDetail needs a real project id from the
   fixtures, which are generated at load — so it is read lazily. */
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn(), setParams: jest.fn(), addListener: () => () => {} }),
  useRoute: () => ({ params: { projectId: require('../src/data/mock').MOCK_DB.projects?.[0]?.id } }),
  useFocusEffect: () => {},
  useIsFocused: () => true,
}))

/* The frame's background photo has nothing to do with whether a screen
   renders its content. */
jest.mock('../src/components/Screen', () => {
  const { View } = require('react-native')
  return { __esModule: true, default: ({ children }) => <View>{children}</View> }
})

// eslint-disable-next-line import/first
import { hasMG } from '@simplicity/core'
// eslint-disable-next-line import/first
import i18n from '../src/lib/i18n'
// eslint-disable-next-line import/first
import { AuthProvider } from '../src/lib/auth'
// eslint-disable-next-line import/first
import { PreferencesProvider } from '../src/lib/preferences'
// eslint-disable-next-line import/first
import { FormOptionsProvider } from '../src/lib/formOptions'
// eslint-disable-next-line import/first
import { DrawerProvider } from '../src/lib/drawer'
// eslint-disable-next-line import/first
import { BottomBarProvider } from '../src/lib/bottomBar'

/* The first screen pays for importing the whole app graph, and each one
   waits for its providers and hooks to load. Jest's 5s default made every
   test after the first time out in a cascade that looked like 17 broken
   screens and was none. */
jest.setTimeout(60000)

const METRICS = { frame: { x: 0, y: 0, width: 375, height: 812 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }

function Shell({ children }) {
  return (
    <SafeAreaProvider initialMetrics={METRICS}>
      <AuthProvider>
        <PreferencesProvider>
          <FormOptionsProvider>
            <DrawerProvider>
              <BottomBarProvider>{children}</BottomBarProvider>
            </DrawerProvider>
          </FormOptionsProvider>
        </PreferencesProvider>
      </AuthProvider>
    </SafeAreaProvider>
  )
}

/* Every string rendered anywhere in the tree. */
function allText(node, out = []) {
  if (node == null) return out
  if (typeof node === 'string') { out.push(node); return out }
  if (Array.isArray(node)) { node.forEach((n) => allText(n, out)); return out }
  if (node.children) node.children.forEach((c) => allText(c, out))
  return out
}

/* A missing key comes back from i18next as the key itself: either
   "namespace:path.to.key" or the bare dotted path. Real copy has spaces,
   Hebrew, digits-first numbers or an @ — none of which a key has. */
const looksLikeKey = (s) => {
  const t = s.trim()
  if (t.length < 3 || /\s/.test(t) || /@/.test(t)) return false
  if (/^[a-zA-Z]+:[a-zA-Z0-9_.]+$/.test(t)) return true
  return /^[a-z][a-zA-Z0-9_]*(\.[a-zA-Z0-9_]+){1,}$/.test(t) && !/\.(com|net|org|io|local|me|co|il)$/.test(t)
}

/* Text that means a value went missing on the way to the screen — a
   formatter handed null, a field that does not exist. None of these are
   ever copy. */
const looksBroken = (s) => /\bNaN\b|\bundefined\b|\[object Object\]/.test(s)

/* The one known exception, and it belongs to the mock, not the app: the
   mock backend ignores query filters, so the recycle bin also receives
   rows that were never deleted, and "deleted <time ago>" of a null
   deleted_at renders as NaN/NaN. The real query only returns rows that
   have a deleted_at. */
const KNOWN_MOCK_ARTIFACT = { Trash: (s) => /NaN\/NaN/.test(s) }

/* Let the providers and the screen's own hooks finish their async loads. */
async function settle() {
  for (let i = 0; i < 6; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await act(async () => { await new Promise((r) => setTimeout(r, 0)) })
  }
}

const SCREENS = [
  ['Home', () => require('../src/screens/HomeScreen').default],
  ['Clients', () => require('../src/screens/ClientsScreen').default],
  ['Tasks', () => require('../src/screens/TasksScreen').default],
  ['Finance', () => require('../src/screens/FinanceScreen').default],
  ['Goals', () => require('../src/screens/GoalsScreen').default],
  ['Leads', () => require('../src/screens/LeadsScreen').default],
  ['Calendar', () => require('../src/screens/CalendarScreen').default],
  ['Moon', () => require('../src/screens/MoonScreen').default],
  ['Settings', () => require('../src/screens/SettingsScreen').default],
  ['Trash', () => require('../src/screens/TrashScreen').default],
  ['Projects', () => require('../src/screens/ProjectsScreen').default],
  ['ProjectDetail', () => require('../src/screens/ProjectDetailScreen').default],
  ['Reports', () => require('../src/screens/ReportsScreen').default],
  ['Insights', () => require('../src/screens/InsightsScreen').default],
  ['Pages', () => require('../src/screens/PagesScreen').default],
  ['Connections', () => require('../src/screens/ConnectionsScreen').default],
  ['Help', () => require('../src/screens/HelpScreen').default],
  ['Admin', () => require('../src/screens/AdminScreen').default],
]

describe('every screen', () => {
  /* Pin the language. jest-expo reports an English device, so setupI18n
     picks en, whose bundle is a dynamic import that jest cannot run — the
     strings then fall back to Hebrew while i18n.language stays en, and the
     screens mix the two: an English quote on Home, 'September 2026' on the
     Calendar. That split cannot happen on a phone, where Metro bundles every
     language. Hebrew is what the app shows by default, so test that. */
  beforeAll(async () => { await i18n.changeLanguage('he') })

  let errorSpy
  beforeEach(() => { errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {}) })
  afterEach(() => { errorSpy.mockRestore() })

  it.each(SCREENS)('%s renders with data and shows no raw keys or broken values', async (name, load) => {
    const ScreenComponent = load()
    const view = render(<Shell><ScreenComponent /></Shell>)
    await settle()

    const text = allText(view.toJSON())
    expect(text.length).toBeGreaterThan(0)
    expect(text.filter(looksLikeKey)).toEqual([])
    /* A merge glyph that reaches the screen is a box on a phone: this app
       does not load the font that draws it. components/Text converts them —
       and because every screen imports it, this checks that none escaped. */
    expect(text.filter(hasMG)).toEqual([])
    const allowed = KNOWN_MOCK_ARTIFACT[name] || (() => false)
    expect(text.filter((s) => looksBroken(s) && !allowed(s))).toEqual([])
    view.unmount()
  })
})
