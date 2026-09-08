/* ════════════════════════════════════════════════════════════════
   PRERENDER ENTRY — renders the real screens to a string, in Node.
   ════════════════════════════════════════════════════════════════
   This module is loaded through Vite's SSR pipeline (build.js calls
   ssrLoadModule), so JSX, the `@` alias, CSS imports and the
   @simplicity/core workspace package all resolve exactly as they do in
   the browser build. That is the whole point: the static HTML is
   produced by the SAME components the visitor gets, from the SAME
   strings, so it cannot drift from what the app shows.

   Why this works without any SSR plumbing in the app — checked, not
   assumed, before this file was written:

     · useUserPreferences() returns a harmless stub with no provider,
       so useT() and <MG> work outside the app shell.
     · useAuth()'s context has a real default ({ session: null, … }),
       so LegalPage's destructuring is safe with no provider.
     · LandingScreen touches window/document only inside effects and
       event handlers — and its one render-time read of `document` is
       already guarded with `typeof document !== 'undefined'`.
       renderToString never runs effects, so trackLandingEvent() does
       not fire and the build sends no funnel beacons.

   MemoryRouter (not StaticRouter) supplies the router context: it needs
   no history object, takes the URL as a plain string, and is exported
   from react-router-dom in every version the app has used.
   ════════════════════════════════════════════════════════════════ */
import { renderToString } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import i18n, { initI18n } from '@simplicity/core/i18n'
import { getLegal } from '../src/components/legal/legalI18n'
import LandingScreen from '../src/screens/landing/index.jsx'
import LegalPage from '../src/components/legal/LegalPage.jsx'
import { PRERENDER_LANG } from './routes.js'

/* Every key i18next could not resolve during the render. A renamed or
   deleted key in landing.json shows up here instead of silently baking
   the raw key name ("hero.title") into the static HTML — build.js fails
   the build on a non-empty list. `dev: true` is what turns the handler
   on; it costs nothing here and never ships. */
const missing = []

initI18n({
  lng: PRERENDER_LANG,
  dev: true,
  onMissingKey: (lngs, ns, key) => {
    missing.push(`${ns}:${key}`)
  },
})

const SCREENS = {
  landing: LandingScreen,
  legal: LegalPage,
}

/* Render one route's screen to an HTML string, ready to drop inside
   <div id="root">. No providers beyond the router: see the header. */
export function renderRoute({ kind, location }) {
  const Screen = SCREENS[kind]
  if (!Screen) throw new Error(`prerender: unknown route kind "${kind}"`)
  return renderToString(
    <MemoryRouter initialEntries={[location]}>
      <Screen />
    </MemoryRouter>,
  )
}

/* The i18n keys that failed to resolve, deduped. */
export function missingKeys() {
  return [...new Set(missing)]
}

/* Every paragraph and heading of one legal document, straight from the
   content module the app itself renders (legalContent.js via legalI18n).
   build.js asserts each one appears in the prerendered HTML — a complete
   parity check rather than a handful of sampled sentinels, so a block
   added to the policy can never be silently missing from the static page. */
/* One line of copy from every section of the landing page, resolved through
   the same i18n instance the render used. build.js asserts each appears in
   the prerendered HTML, so deleting a whole <section> from the JSX fails the
   build instead of quietly shrinking the page a crawler sees. (A RENAMED key
   is caught by missingKeys() instead — t() would return the raw key here and
   the handler above would record it.) */
export function landingSentinels() {
  return [
    'hero.eyebrow',
    'demo.title',
    'values.title',
    'features.title',
    'feedback.title',
    'trust.title',
    'faq.title',
    'cta.title',
    'footer.copyright',
  ].map((key) => i18n.t(`landing:${key}`))
}

export function legalBlocksText(tab) {
  const { tabs } = getLegal(PRERENDER_LANG)
  const doc = tabs.find((t) => t.key === tab)
  if (!doc) throw new Error(`prerender: unknown legal tab "${tab}"`)
  return [doc.meta, ...doc.blocks.map((b) => b.h ?? b.h2 ?? b.t)].filter(Boolean)
}
