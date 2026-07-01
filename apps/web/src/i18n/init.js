import i18n, { initI18n } from '@simplicity/core/i18n'

/* ════════════════════════════════════════════════════════════════
   WEB i18n BOOTSTRAP — the browser-side init entry (NOT a shim).
   ════════════════════════════════════════════════════════════════
   Imported first in main.jsx (before <App/>) so the language is set
   before the first render — no flash of the fallback language. This is
   the platform glue the engine (@simplicity/core/i18n) intentionally
   omits: it replaces i18next-browser-languagedetector by reading the
   saved choice from localStorage ('mg-lang') synchronously, then
   persisting it on every change.
   ════════════════════════════════════════════════════════════════ */

const saved = (() => {
  try {
    return localStorage.getItem('mg-lang')
  } catch {
    return null
  }
})()

initI18n({
  lng: saved || undefined, // no saved choice → engine falls back to he
  dev: import.meta.env.DEV,
  onMissingKey: (lngs, ns, key) => {
    console.warn(`[i18n missing] ${ns}:${key} (${lngs?.join(',')})`)
  },
})

/* Persist the active language across reloads (replaces the detector cache). */
i18n.on('languageChanged', (lng) => {
  try {
    localStorage.setItem('mg-lang', lng)
  } catch {
    /* noop — private mode / storage disabled */
  }
})

/* DEV aid: expose the instance for console/preview debugging. */
if (import.meta.env.DEV) {
  try {
    window.i18n = i18n
  } catch {
    /* noop */
  }
}
