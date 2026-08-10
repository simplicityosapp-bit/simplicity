/* ════════════════════════════════════════════════════════════════
   LEAD SEARCH — pure, no React.
   ════════════════════════════════════════════════════════════════
   The board's free-text box used to test `lead.name.includes(query)`:
   case-SENSITIVE (so "dana" missed "Dana Cohen") and name-only, even
   though the card shows the phone, the source and the notes behind it.

   Mirrors the finance screen's searchTransactions so the two boxes
   behave the same way: lowercase both sides, and every term has to
   match somewhere, so "דנה 052" narrows rather than widens.
   ════════════════════════════════════════════════════════════════ */

const norm = (s) => String(s ?? '').toLowerCase().trim()

/* Digits only, so a phone typed as "052-123-4567" is findable by "0521234567"
   and vice versa. */
const digits = (s) => String(s ?? '').replace(/[^\d]/g, '')

/* A term that is ITSELF a phone number — digits and the separators people type
   between them. The digit fallback below is only for these: stripping digits
   out of any term at all made "זזזז1" match every lead whose phone contains a
   1, so a search that should have found nothing returned people.
   Three digits minimum for the same reason — a lone "1" is not a search. */
const PHONE_TERM = /^[\d\s()+-]+$/
const isPhoneTerm = (term) => PHONE_TERM.test(term) && digits(term).length >= 3

/**
 * Does this lead match the free-text query?
 *
 * @param lead    the lead row
 * @param query   raw query string; blank matches everything
 * @param lookups optional { sourcesById, projectsById } so a search can hit
 *                the source/project names shown on the card
 */
export function matchLead(lead, query, { sourcesById, projectsById } = {}) {
  const terms = norm(query).split(/\s+/).filter(Boolean)
  if (!terms.length) return true

  const source = sourcesById && lead.source_id ? sourcesById.get(lead.source_id) : null
  const project = projectsById && lead.project_id ? projectsById.get(lead.project_id) : null
  const hay = norm([lead.name, lead.phone, lead.email, lead.notes, source?.name, project?.name]
    .filter(Boolean).join(' '))
  const phoneDigits = digits(lead.phone)

  return terms.every((term) => {
    if (hay.includes(term)) return true
    /* A term that is a phone number also matches the phone with its separators
       stripped — and only such a term; see isPhoneTerm. */
    return isPhoneTerm(term) && phoneDigits.includes(digits(term))
  })
}

/** Build the id→row maps matchLead wants, once per render rather than per lead. */
export function leadLookups({ sources = [], projects = [] } = {}) {
  return {
    sourcesById: new Map(sources.map((s) => [s.id, s])),
    projectsById: new Map(projects.map((p) => [p.id, p])),
  }
}
