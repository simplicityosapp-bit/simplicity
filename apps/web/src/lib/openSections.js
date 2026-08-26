/* ════════════════════════════════════════════════════════════════
   WHICH ACCORDION SECTIONS ARE OPEN — remembered for the sitting.
   ════════════════════════════════════════════════════════════════
   Someone who works out of one section had to reopen it on every visit.

   sessionStorage, the same choice useFormDraft made and for the same
   reason: this belongs to the person in front of the screen right now.
   Close the tab and the screen opens the way a first-time visitor sees it,
   which is what someone returning next week expects anyway.

   Deliberately NOT the user-preferences row: every chevron tap would become
   a write to the server, on the most-tapped control on the screen.

   Lives here rather than inside the screen so the behaviour can be tested
   against the real function instead of a copy of it.
   ════════════════════════════════════════════════════════════════ */

/* Reads storage defensively: private mode, a full quota and a disabled
   store all throw rather than return null, and none of them is a reason to
   fail a render. */
function readRaw(key) {
  try {
    return window.sessionStorage.getItem(key)
  } catch {
    return null
  }
}

/**
 * The open/closed map to start from.
 *
 * Merged over `defaults`, never used raw. A blob stored before a section
 * existed has no key for it, so reading it straight back would leave the
 * new section `undefined` — closed, and invisible to everyone who had used
 * the screen before it shipped, while a first-time visitor sees it open.
 * Only keys still present in `defaults` are read back, so a retired section
 * cannot linger either.
 */
export function loadOpenSections(key, defaults) {
  const raw = readRaw(key)
  if (!raw) return { ...defaults }
  let saved
  try {
    saved = JSON.parse(raw)
  } catch {
    return { ...defaults }
  }
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return { ...defaults }
  const out = { ...defaults }
  for (const k of Object.keys(defaults)) {
    if (typeof saved[k] === 'boolean') out[k] = saved[k]
  }
  return out
}

/* Called from the toggle handler, not from an effect watching the state —
   the repo forbids setState-adjacent effects, and a tap is the only thing
   that ever changes this. Failure is silently fine: the section still
   opens, it just will not be remembered. */
export function saveOpenSections(key, value) {
  try {
    window.sessionStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* not worth failing a tap over */
  }
}
