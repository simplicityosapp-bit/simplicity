import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { DEFAULT_LANG, LANG_CODES } from './config'
import heBundle from './locales/he/index'

/* Re-export the language config so consumers get the whole i18n surface
   (APP_LANGS, dirFor, isLang, LANGUAGE_OPTIONS, DEFAULT_LANG, LANG_CODES)
   from a single '@simplicity/core/i18n' entry point. */
export * from './config'

/* ════════════════════════════════════════════════════════════════
   I18N ENGINE — platform-agnostic (shared by apps/web + apps/mobile).
   ════════════════════════════════════════════════════════════════
   Owns the i18next singleton + all main-namespace resources. It does
   NOT decide the active language or persist it — that is platform glue:
   each app calls initI18n({ lng, dev, onMissingKey }) once at startup
   (web reads localStorage; mobile reads the device locale). For signed-in
   users the persisted preference (prefs.design.language) reconciles in
   via the app-side <I18nSync/>. Gender is applied per-call as i18next
   `context` (see the app-side useT hook).

   ONE LANGUAGE IS EAGER (2026-07-27). All four used to be imported
   statically, which built a single 1.14 MB / 331 KB-gzip chunk that was
   modulepreloaded on every page load — larger than the rest of the app put
   together, and three quarters of it was for languages the visitor had not
   chosen. Now only `he` ships up front (it is both DEFAULT_LANG and
   fallbackLng, so it must always be resolvable); en/es/fr live behind
   loadLanguage(), which dynamic-imports one bundle chunk on demand.

   Anything that CHANGES the language must go through setLanguage() rather
   than i18n.changeLanguage(), or it will switch to a language whose
   resources were never fetched and silently render the he fallback.

   The 7 dynamic namespaces (quotes/guidance/export/presets/reflections/
   booking/siteBuilder) are self-registered via addResourceBundle by the
   web libs that own them, and migrate here when those features move.
   Add a main namespace? Add it to NAMESPACES + all four locales/<lng>/index.ts.
   ════════════════════════════════════════════════════════════════ */

export const NAMESPACES: string[] = ['common', 'auth', 'nav', 'goals', 'settings', 'trash', 'home', 'clients', 'finance', 'calendar', 'leads', 'projects', 'tasks', 'connections', 'admin', 'landing', 'insights', 'reports', 'moon', 'components', 'onboarding', 'onboardingSteps', 'modalsClient', 'modalsData', 'modalsTask', 'modalsSystem', 'questions', 'help', 'cookies', 'subscription', 'community', 'pages']

type Bundle = Record<string, unknown>

/* The lazy languages. Keyed by code so the dynamic import is statically
   analysable — the bundler emits one chunk per entry and nothing more. */
const LAZY_BUNDLES: Record<string, () => Promise<{ default: Bundle }>> = {
  en: () => import('./locales/en/index'),
  es: () => import('./locales/es/index'),
  fr: () => import('./locales/fr/index'),
}

/* In-flight / settled loads, so concurrent callers share one fetch and a
   repeat call is free. */
const loading = new Map<string, Promise<void>>()

function addBundle(lng: string, bundle: Bundle): void {
  for (const ns of NAMESPACES) {
    if (bundle[ns] !== undefined) i18n.addResourceBundle(lng, ns, bundle[ns], true, true)
  }
}

/* ════════════════════════════════════════════════════════════════
   onI18nReady — run `register` once the singleton actually has a store.
   ════════════════════════════════════════════════════════════════
   The dynamic namespaces self-register with addResourceBundle at import
   time, which only works if their module happens to be evaluated AFTER
   initI18n. In dev that is true by luck: main.jsx imports ./i18n/init
   before <App/>, so nothing has pulled the domain modules in yet.

   In a BUILT app it is false. The bundler puts the registering module in
   a chunk that the entry chunk imports, and ESM evaluates every imported
   chunk before the importer's own body — so the registration ran before
   init.js had called initI18n. i18next only installs getResource/
   addResourceBundle/hasResourceBundle on the instance during init(), so
   pre-init those methods are `undefined`: the registration was skipped
   and never retried, and every `reflections:` key rendered as its own
   raw key ("moon.behind") in production while dev looked fine.

   Queue anything that arrives early and flush it at the end of initI18n,
   so registration is correct in BOTH orders. Synchronous on purpose (not
   the 'initialized' event, which i18next defers a tick) — the strings
   must be there for the first render, not one paint later.
   ════════════════════════════════════════════════════════════════ */
const pendingRegistrations: Array<() => void> = []

export function onI18nReady(register: () => void): void {
  if (typeof i18n.hasResourceBundle === 'function') register()
  else pendingRegistrations.push(register)
}

/* ════════════════════════════════════════════════════════════════
   loadLanguage — make `lng`'s resources available. Resolves immediately
   for he (bundled) and for anything already loaded. Unknown codes resolve
   without doing anything: the caller still gets the he fallback, which is
   what an unsupported language should render anyway.
   ════════════════════════════════════════════════════════════════ */
export function loadLanguage(lng: string): Promise<void> {
  const loader = LAZY_BUNDLES[lng]
  if (!loader) return Promise.resolve()
  if (i18n.hasResourceBundle?.(lng, 'common')) return Promise.resolve()
  const inFlight = loading.get(lng)
  if (inFlight) return inFlight
  const p = loader()
    .then((mod) => { addBundle(lng, mod.default) })
    .catch((e) => {
      // A failed chunk fetch (offline, stale deploy) must not wedge the app:
      // drop the cached promise so a later attempt can retry, and let the UI
      // fall back to he rather than throwing out of a click handler.
      loading.delete(lng)
      console.warn('[i18n] could not load language', lng, e)
    })
  loading.set(lng, p)
  return p
}

/* ════════════════════════════════════════════════════════════════
   setLanguage — the ONLY correct way to switch language. Fetches the
   bundle first, then flips i18next, so the UI never paints a half-
   translated screen. Use this everywhere instead of changeLanguage().
   ════════════════════════════════════════════════════════════════ */
export async function setLanguage(lng: string): Promise<void> {
  await loadLanguage(lng)
  await i18n.changeLanguage(lng)
}

export interface InitI18nOptions {
  /** Initial UI language. Falls back to DEFAULT_LANG (he) when omitted. */
  lng?: string
  /** Dev mode → surface unresolved keys via onMissingKey (no-op in prod). */
  dev?: boolean
  /** Called for any unresolved key when `dev` is true. */
  onMissingKey?: (lngs: readonly string[] | undefined, ns: string, key: string) => void
}

let started = false

/* ════════════════════════════════════════════════════════════════
   initI18n — build + init the shared i18next singleton. Idempotent.
   Called once per app at startup with platform-specific glue:
     web    → initI18n({ lng: localStorage['mg-lang'], dev: import.meta.env.DEV })
     mobile → initI18n({ lng: deviceLocale })

   Stays SYNCHRONOUS so the singleton is usable the moment it returns.
   Only `he` is loaded here; a caller starting in another language must
   await loadLanguage(lng) before its first render, or it will paint he
   first and swap. Both apps' bootstraps do exactly that.
   ════════════════════════════════════════════════════════════════ */
export function initI18n(opts: InitI18nOptions = {}): typeof i18n {
  if (started) return i18n
  started = true
  i18n
    .use(initReactI18next)
    .init({
      resources: { [DEFAULT_LANG]: heBundle },
      lng: opts.lng,
      fallbackLng: DEFAULT_LANG,
      supportedLngs: LANG_CODES,
      ns: NAMESPACES,
      defaultNS: 'common',
      interpolation: { escapeValue: false }, // React already escapes
      returnEmptyString: false,
      saveMissing: !!opts.dev,
      missingKeyHandler: opts.onMissingKey
        ? (lngs, ns, key) => opts.onMissingKey!(lngs, ns, key)
        : undefined,
    })
  /* i18next's init() installs the resource-store API synchronously, so any
     dynamic namespace that self-registered too early can go in right now. */
  while (pendingRegistrations.length) pendingRegistrations.shift()!()
  return i18n
}

export default i18n
