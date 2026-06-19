/* ════════════════════════════════════════════════════════════════
   WHATSAPP — build click-to-chat (wa.me) links for manual sending.
   ════════════════════════════════════════════════════════════════
   No API, no credentials, nothing to "connect": every send just opens
   WhatsApp (the app on mobile, web/desktop otherwise) with a recipient
   and a prefilled — but fully editable — message. The coach presses
   send inside WhatsApp. One-sided by design.
   ════════════════════════════════════════════════════════════════ */

/* Normalize a phone string to wa.me's required form: country code +
   national number, digits only, NO leading "+" or "0".

   The app serves Israeli coaches, so a local 0-prefixed (or bare)
   number is assumed to be Israeli (+972). Numbers written in explicit
   international form (+… or 00…) keep their own country code.

   Returns '' when there are no usable digits — callers treat an empty
   result as "no recipient", and wa.me then opens the contact picker. */
export function normalizeIsraeliPhone(raw) {
  if (!raw) return ''
  const s = String(raw).trim()
  const international = s.startsWith('+') || s.startsWith('00')
  let digits = s.replace(/\D/g, '')
  if (!digits) return ''
  if (international) {
    // 00 is an international dialing escape — drop it, keep the rest.
    if (s.startsWith('00')) digits = digits.replace(/^00/, '')
    return digits // respect the explicitly-given country code
  }
  if (digits.startsWith('972')) return digits // already IL country code
  if (digits.startsWith('0')) return '972' + digits.slice(1) // 0xx… → 972xx…
  return '972' + digits // bare national number → assume Israel
}

/* Build a wa.me click-to-chat URL. `phone` is normalized first; an
   empty/invalid phone yields the picker form (https://wa.me/?text=…).
   `text` is optional and URL-encoded (Hebrew + newlines are safe). */
export function waLink(phone, text) {
  const num = normalizeIsraeliPhone(phone)
  const base = 'https://wa.me/' + num // num may be '' → contact picker
  return text ? base + '?text=' + encodeURIComponent(text) : base
}

/* Fill a coach-customised message template by replacing {{token}}
   placeholders with values. Unknown / missing tokens collapse to ''.
   Used so a custom template from preferences behaves like the built-in
   i18n default (which uses the same token names). */
export function fillTemplate(template, vars = {}) {
  if (!template) return ''
  return String(template).replace(
    /\{\{\s*(\w+)\s*\}\}/g,
    (_, key) => (vars[key] == null ? '' : String(vars[key])),
  )
}

/* Pick the message for a surface: the coach's custom template (filled)
   when set, otherwise the provided localized default. Keeps every call
   site to a single one-liner. */
export function resolveMessage(customTemplate, vars, fallback) {
  const t = (customTemplate || '').trim()
  return t ? fillTemplate(t, vars) : fallback
}
