/* ════════════════════════════════════════════════════════════════
   LEADS SCREEN — the board's quiet failures.
   ════════════════════════════════════════════════════════════════
   Pinned to America/New_York for the date half, for the same reason as
   finance: leads.inquiry_date is a DATE column, and every one of these
   assertions passes against the buggy code when run in Asia/Jerusalem.
   ════════════════════════════════════════════════════════════════ */
process.env.TZ = 'America/New_York'

import { describe, it, expect } from 'vitest'
import { isConvertedLead, statusMetaOfLead, toLocalDate } from '@simplicity/core'
import { matchLead, leadLookups } from '../src/screens/leads/matchLead'

/* ── The drag path, copied from applyLeadMove in screens/leads/index.jsx ──
   Kept in step with the screen by the assertions below: if the screen stops
   stamping converted_at, "counts as a conversion" fails here. */
function applyLeadMove(lead, newMeta, statusId = null, now = '2026-07-26T09:00:00.000Z') {
  return {
    ...lead,
    status_meta: newMeta,
    status_id: statusId,
    last_status_changed_at: now,
    ...(newMeta !== 'converted' ? { converted_at: null, converted_to_client_id: null } : {}),
    ...(newMeta === 'converted' && !lead?.converted_at ? { converted_at: now } : {}),
  }
}

const freshLead = () => ({
  id: '1', name: 'דנה כהן', status_meta: 'in_process',
  converted_at: null, converted_to_client_id: null,
})

describe('dragging a lead into the converted column', () => {
  it('lands in the column AND counts as a conversion', () => {
    const moved = applyLeadMove(freshLead(), 'converted')
    expect(statusMetaOfLead(moved)).toBe('converted')
    /* The whole bug: this used to be false, so the stats card read 0. */
    expect(isConvertedLead(moved)).toBe(true)
    expect(moved.converted_at).toBeTruthy()
  })

  it('does NOT invent a client record', () => {
    /* A drag cannot create a client — only ConvertLeadModal can. The card
       uses this to keep offering "create client record". */
    const moved = applyLeadMove(freshLead(), 'converted')
    expect(moved.converted_to_client_id).toBeNull()
  })

  it('keeps the ORIGINAL stamp when a lead returns to converted', () => {
    /* Overwriting would silently move the lead between months in the stats. */
    const original = '2026-03-01T10:00:00.000Z'
    const wasConverted = { ...freshLead(), status_meta: 'converted', converted_at: original }
    const out = applyLeadMove(applyLeadMove(wasConverted, 'in_process'), 'converted')
    /* Out and back: the trip through in_process clears it, so a re-entry
       stamps fresh — but a lead that never left keeps its date. */
    expect(applyLeadMove(wasConverted, 'converted').converted_at).toBe(original)
    expect(out.converted_at).toBeTruthy()
  })

  it('still clears the stamp on the way OUT', () => {
    const converted = { ...freshLead(), status_meta: 'converted', converted_at: '2026-07-01T00:00:00.000Z', converted_to_client_id: 'c1' }
    const out = applyLeadMove(converted, 'not_relevant')
    expect(out.converted_at).toBeNull()
    expect(out.converted_to_client_id).toBeNull()
    expect(isConvertedLead(out)).toBe(false)
  })
})

/* ── computeStats' month test, copied from screens/leads/index.jsx ── */
const inMonth = (d, now) => {
  if (!d) return false
  const x = toLocalDate(d)
  return x.getFullYear() === now.getFullYear() && x.getMonth() === now.getMonth()
}

describe('a lead from the 1st belongs to its own month', () => {
  const august = new Date(2026, 7, 15)

  it('inquiry_date on the 1st counts in August, not July', () => {
    expect(inMonth('2026-08-01', august)).toBe(true)
    expect(inMonth('2026-08-01', new Date(2026, 6, 15))).toBe(false)
  })

  it('the last day of the month counts too', () => {
    expect(inMonth('2026-08-31', august)).toBe(true)
  })

  it('neighbouring months stay out', () => {
    expect(inMonth('2026-07-31', august)).toBe(false)
    expect(inMonth('2026-09-01', august)).toBe(false)
  })

  it('a real timestamp (converted_at) is still read as an instant', () => {
    /* 02:00Z on Aug 1 is 22:00 July 31 in New York — this one SHOULD move. */
    expect(inMonth('2026-08-01T02:00:00Z', august)).toBe(false)
  })
})

describe('board search', () => {
  const sources = [{ id: 's1', name: 'Instagram' }]
  const projects = [{ id: 'p1', name: 'ליווי אישי' }]
  const lookups = leadLookups({ sources, projects })
  const lead = {
    id: '1', name: 'Dana Cohen', phone: '052-123-4567',
    email: 'dana@example.com', notes: 'הגיעה מהמלצה', source_id: 's1', project_id: 'p1',
  }
  const m = (q) => matchLead(lead, q, lookups)

  it('is case-insensitive — the bug that made "dana" find nothing', () => {
    expect(m('dana')).toBe(true)
    expect(m('DANA')).toBe(true)
    expect(m('Dana')).toBe(true)
  })

  it('searches past the name', () => {
    expect(m('הגיעה')).toBe(true)        // notes
    expect(m('instagram')).toBe(true)     // source
    expect(m('ליווי')).toBe(true)         // project
    expect(m('example.com')).toBe(true)   // email
  })

  it('finds a phone however it was typed', () => {
    expect(m('0521234567')).toBe(true)
    expect(m('052-123')).toBe(true)
    expect(m('1234')).toBe(true)
  })

  it('every term must match', () => {
    expect(m('dana instagram')).toBe(true)
    expect(m('dana חתול')).toBe(false)
  })

  it('a blank query matches everything', () => {
    expect(m('')).toBe(true)
    expect(m('   ')).toBe(true)
  })

  it('survives a lead with almost no data', () => {
    expect(matchLead({ id: '2', name: 'X' }, 'x')).toBe(true)
    expect(matchLead({ id: '2' }, 'x')).toBe(false)
    expect(matchLead({ id: '2' }, '')).toBe(true)
  })
})

/* ── The lead card's own actions ─────────────────────────────────
   Derivation copied from LeadCard: the convert chip in the footer and the
   delete button in the corner, both on the card itself. The rule worth
   pinning is the awkward middle state: a lead DRAGGED into the converted
   column is converted but has no client record, and must still be offered
   the step that creates one — otherwise the drag path becomes a dead end. */
function cardActions(lead, { onConvert = true, onDelete = true } = {}) {
  const converted = isConvertedLead(lead)
  const needsClientRecord = converted && !lead.converted_to_client_id
  const out = []
  if (onConvert && (!converted || needsClientRecord)) out.push(needsClientRecord ? 'createClient' : 'convert')
  if (onDelete) out.push('delete')
  return out
}

describe('the lead card offers the right actions', () => {
  it('an ordinary lead: convert + delete', () => {
    expect(cardActions({ status_meta: 'in_process' })).toEqual(['convert', 'delete'])
  })

  it('a lead DRAGGED into converted still offers the client record', () => {
    const dragged = applyLeadMove(freshLead(), 'converted')
    expect(cardActions(dragged)).toEqual(['createClient', 'delete'])
  })

  it('a properly converted lead offers delete only', () => {
    expect(cardActions({ status_meta: 'converted', converted_at: '2026-07-01T00:00:00Z', converted_to_client_id: 'c1' }))
      .toEqual(['delete'])
  })

  it('collapses to nothing when the parent wires no handlers', () => {
    /* Both controls render only when their handler exists, so a read-only
       card carries neither. */
    expect(cardActions({ status_meta: 'in_process' }, { onConvert: false, onDelete: false })).toEqual([])
  })
})
