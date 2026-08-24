/* ════════════════════════════════════════════════════════════════
   ATTENTION ROWS — the web half of the attention widget.
   ════════════════════════════════════════════════════════════════
   The rules that BUILD the rows live in @simplicity/core (attentionItems),
   shared with apps/mobile. What stays here is the part core deliberately
   does not know: how a row turns into a web navigation.

   Core emits a semantic `target` ('finance' | 'calendar' | 'clients' |
   'goals' | 'tasks' | 'leads'); mobile maps it to its navigator, this maps
   it to a ROUTES path. That split is the whole reason core can be shared.
   ════════════════════════════════════════════════════════════════ */

import { ROUTES } from './routes'

const TARGET_ROUTE = {
  finance: ROUTES.FINANCE,
  calendar: ROUTES.CALENDAR,
  clients: ROUTES.CLIENTS,
  goals: ROUTES.GOALS,
  tasks: ROUTES.TASKS,
  leads: ROUTES.LEADS,
}

/* The single source of truth for what clicking an attention row does, so the
   widget handler and the item shape can't silently drift apart. That drift is
   exactly what broke the widget once: a refactor pointed the handler at
   `it.target` while every web item still carried `it.to`, turning all four
   navigation rows into dead clicks.

   `it.to` is still honoured. Nothing emits it any more — the web copy of
   attentionItems that did is gone — but the widget builds its own rows
   (bookings / invoices / duplicates) and a future one may find a raw path
   easier than a target key. */
export function attentionRowAction(it) {
  if (!it) return null
  if (it.kind === 'pendingTx') return { type: 'popup', popup: 'tx' }
  if (it.kind === 'pendingMeetings') return { type: 'popup', popup: 'meetings' }
  /* Generic popup row — carries its own target. The widget builds three of
     these (bookings / invoices / calendar duplicates) so they can be ranked
     and rendered in the same list as the rule-derived rows instead of being
     hard-coded above them. */
  if (it.kind === 'popup' && it.popup) return { type: 'popup', popup: it.popup }
  if (it.kind === 'people') return { type: 'people' }
  const to = it.to || (it.target ? TARGET_ROUTE[it.target] : null)
  return to ? { type: 'navigate', to } : null
}
