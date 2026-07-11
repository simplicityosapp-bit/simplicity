import { Platform } from 'react-native'

// Hermes (Android release) ships a PARTIAL Intl. Two gaps crash the app:
//
// 1. @simplicity/core builds `new Intl.DateTimeFormat('he-u-ca-hebrew', …)` at
//    MODULE-EVAL (domain/calendar.ts, for the Hebrew-calendar feature). That
//    non-Gregorian calendar can hard-abort Hermes at construction — before any
//    screen renders — which is a silent instant-close on device. Until we ship a
//    full Intl polyfill, wrap the constructor to strip unsupported calendar /
//    numbering Unicode extensions so it degrades to the default (Gregorian)
//    calendar instead of aborting. The Hebrew-calendar DISPLAY is opt-in and rare;
//    a running app beats a crashing one. (Restore proper Hebrew months later via
//    @formatjs/intl-datetimeformat.)
//
// 2. core's fmtTimeAgo (Trash screen) uses `Intl.RelativeTimeFormat`, which some
//    Hermes builds lack entirely → `new Intl.RelativeTimeFormat()` throws. Provide
//    a minimal shim only when it's missing.
//
// Web has a complete Intl, so this is a no-op there. MUST be imported before the
// @simplicity/core barrel evaluates (i.e. first in index.js).
if (Platform.OS !== 'web' && typeof Intl !== 'undefined') {
  if (Intl.DateTimeFormat) {
    const Native = Intl.DateTimeFormat
    // Drop the whole `-u-…` Unicode extension (e.g. `-u-ca-hebrew`); core only
    // uses simple locales so this leaves the base tag (e.g. 'he').
    const strip = (loc) => {
      if (typeof loc === 'string') return loc.replace(/-u-.*/i, '') || undefined
      if (Array.isArray(loc)) return loc.map((l) => (typeof l === 'string' ? l.replace(/-u-.*/i, '') || undefined : l))
      return loc
    }
    const Safe = function DateTimeFormat(locales, options) {
      const opts = options && options.calendar ? { ...options, calendar: undefined } : options
      try {
        return new Native(strip(locales), opts)
      } catch (_e) {
        try { return new Native(undefined, opts) } catch (_e2) { return new Native() }
      }
    }
    Safe.prototype = Native.prototype
    Safe.supportedLocalesOf = (...a) => Native.supportedLocalesOf(...a)
    try { Object.setPrototypeOf(Safe, Native) } catch (_e) { /* keep own statics */ }
    Intl.DateTimeFormat = Safe
  }

  if (typeof Intl.RelativeTimeFormat !== 'function') {
    // Minimal, non-localized fallback — enough to keep fmtTimeAgo from crashing.
    Intl.RelativeTimeFormat = function RelativeTimeFormat() {
      return { format: (v, unit) => `${v} ${unit}${Math.abs(v) === 1 ? '' : 's'}` }
    }
  }
}
