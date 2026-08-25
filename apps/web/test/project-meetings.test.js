/* ════════════════════════════════════════════════════════════════
   UPCOMING MEETINGS ON A PROJECT — reaching a project through a SUBJECT.
   ════════════════════════════════════════════════════════════════
   A meeting carries no project_id. It binds to a client or to a group, and
   reaches the project through that subject — so belongsToProject (the
   project_id-first rule the transactions and tasks use) does not apply and
   would quietly match nothing.

   The rules worth pinning, each of which would be wrong in its own way:

     · a CONFIRMED meeting has already become a session, and a SKIPPED one
       did not happen. Neither is "upcoming"; listing them would put
       history in a section titled "what is coming".
     · a meeting in the past is not upcoming either, however pending.
     · `subject_type` must be checked, not just `subject_id`. A client and
       a group could hold the same id in principle, and matching on the id
       alone would surface another project's meeting.
     · the list is capped for display. The overflow must be COUNTED and
       stated — a list that silently stops at six reads as "that is all".
   ════════════════════════════════════════════════════════════════ */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { upcomingProjectMeetings } from '@simplicity/core'

const HOUR = 3600 * 1000
const NOW = new Date('2026-08-25T12:00:00.000Z').getTime()
const at = (offsetHours) => new Date(NOW + offsetHours * HOUR).toISOString()

const GROUPS = new Set(['g1', 'g2'])
const CLIENTS = new Set(['c1', 'c2'])

const m = (over) => ({
  id: Math.random().toString(16).slice(2),
  subject_type: 'client',
  subject_id: 'c1',
  scheduled_at: at(24),
  status: 'pending',
  ...over,
})

describe('which meetings belong to the project', () => {
  it('takes both a group subject and a client subject', () => {
    const out = upcomingProjectMeetings([
      m({ subject_type: 'group', subject_id: 'g1', scheduled_at: at(2) }),
      m({ subject_type: 'client', subject_id: 'c2', scheduled_at: at(3) }),
    ], GROUPS, CLIENTS, NOW)
    expect(out).toHaveLength(2)
  })

  it('drops subjects that belong to another project', () => {
    const out = upcomingProjectMeetings([
      m({ subject_type: 'group', subject_id: 'g-elsewhere' }),
      m({ subject_type: 'client', subject_id: 'c-elsewhere' }),
    ], GROUPS, CLIENTS, NOW)
    expect(out).toHaveLength(0)
  })

  /* The id-only shortcut would pass this by accident. */
  it('checks the subject TYPE, not just the id', () => {
    const out = upcomingProjectMeetings([
      /* a group id sitting in subject_type 'client' must not match the
         group set, and vice versa */
      m({ subject_type: 'client', subject_id: 'g1' }),
      m({ subject_type: 'group', subject_id: 'c1' }),
    ], GROUPS, CLIENTS, NOW)
    expect(out).toHaveLength(0)
  })

  it('ignores an unknown subject_type entirely', () => {
    const out = upcomingProjectMeetings(
      [m({ subject_type: 'lead', subject_id: 'c1' })], GROUPS, CLIENTS, NOW,
    )
    expect(out).toHaveLength(0)
  })
})

describe('which meetings count as upcoming', () => {
  it('keeps only pending', () => {
    const out = upcomingProjectMeetings([
      m({ status: 'pending' }),
      m({ status: 'confirmed' }),   // already a session
      m({ status: 'skipped' }),     // did not happen
    ], GROUPS, CLIENTS, NOW)
    expect(out).toHaveLength(1)
    expect(out[0].status).toBe('pending')
  })

  it('drops meetings already in the past', () => {
    const out = upcomingProjectMeetings([
      m({ scheduled_at: at(-1) }),
      m({ scheduled_at: at(1) }),
    ], GROUPS, CLIENTS, NOW)
    expect(out).toHaveLength(1)
  })

  it('counts one happening right now as upcoming', () => {
    /* >= now, not > now: a meeting at this exact minute has not passed. */
    const out = upcomingProjectMeetings([m({ scheduled_at: at(0) })], GROUPS, CLIENTS, NOW)
    expect(out).toHaveLength(1)
  })

  it('survives a row with no date rather than throwing', () => {
    const out = upcomingProjectMeetings([m({ scheduled_at: null })], GROUPS, CLIENTS, NOW)
    expect(out).toHaveLength(0)
  })

  it('returns them soonest first', () => {
    const out = upcomingProjectMeetings([
      m({ scheduled_at: at(72) }),
      m({ scheduled_at: at(2) }),
      m({ scheduled_at: at(24) }),
    ], GROUPS, CLIENTS, NOW)
    expect(out.map((x) => x.scheduled_at)).toEqual([at(2), at(24), at(72)])
  })
})

describe('the display cap states what it hides', () => {
  const src = readFileSync(new URL('../src/screens/project-detail/index.jsx', import.meta.url), 'utf8')

  it('caps the rows and computes the remainder', () => {
    expect(src).toMatch(/const MEETINGS_SHOWN = 6/)
    expect(src).toMatch(/upcomingMeetings\.slice\(0, MEETINGS_SHOWN\)/)
    expect(src).toMatch(/Math\.max\(0, upcomingMeetings\.length - MEETINGS_SHOWN\)/)
  })

  it('renders the overflow line rather than truncating in silence', () => {
    expect(src).toMatch(/meetingsOverflow > 0 && \(/)
    expect(src).toMatch(/detail\.meetings\.more/)
  })

  it('the badge shows the TRUE total, not the capped one', () => {
    /* The count beside the heading must not be slice()d — otherwise a
       project with nine meetings would announce six. */
    expect(src).toMatch(/upcomingMeetings\.length > 0 && <Txt className="pd-sec-count">\{upcomingMeetings\.length\}/)
  })
})

describe('the copy resolves in all four languages', () => {
  const load = (lang) => JSON.parse(readFileSync(
    new URL(`../../../packages/core/src/i18n/locales/${lang}/projects.json`, import.meta.url), 'utf8',
  ))

  it('has every meetings key', () => {
    for (const lang of ['he', 'en', 'es', 'fr']) {
      const mt = load(lang).detail.meetings
      for (const key of ['title', 'empty', 'untitled', 'openAria', 'toCalendar']) {
        expect(mt[key], `${lang}:${key}`).toBeTruthy()
      }
      /* "and N more" is a counted string — it needs the plural forms the
         language actually has, not one hard-coded noun. */
      expect(mt.more_one, `${lang}:more_one`).toBeTruthy()
      expect(mt.more_other, `${lang}:more_other`).toBeTruthy()
    }
    /* Hebrew has a dual. */
    expect(load('he').detail.meetings.more_two).toBeTruthy()
  })
})
