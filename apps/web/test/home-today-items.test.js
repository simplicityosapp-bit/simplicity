/* ════════════════════════════════════════════════════════════════
   TODAY-ITEMS SUITE — the pure logic behind the home "פגישות היום"
   chip + drill panel (lib/homeData.todayItems). Merges scheduled
   meetings + synced calendar events + lead follow-ups for TODAY,
   honouring the `kinds` filter, and sorts by time. Uses LOCAL date
   parts, so fixtures are built with the local Date constructor to
   stay timezone-stable.
   Run: npm test
   ════════════════════════════════════════════════════════════════ */
import { describe, it, expect } from 'vitest'
import { todayItems } from '../src/lib/homeData'

const now = new Date(2026, 5, 25, 12, 0, 0) // local 2026-06-25 noon
const at = (h, m = 0, day = 25) => new Date(2026, 5, day, h, m, 0).toISOString()

const clients = [
  { id: 'c1', name: 'דנה', phone: '0501234567' },
  { id: 'c2', name: 'יוסי' },
]
const groups = [{ id: 'g1', name: 'קבוצת בוקר' }]

describe('todayItems', () => {
  it('includes today scheduled meetings, resolves name + phone, excludes other days/skipped/deleted', () => {
    const meetings = [
      { id: 'm1', subject_type: 'client', subject_id: 'c1', scheduled_at: at(10), status: 'pending' },
      { id: 'm2', subject_type: 'group', subject_id: 'g1', scheduled_at: at(9), status: 'confirmed' },
      { id: 'm3', subject_type: 'client', subject_id: 'c1', scheduled_at: at(10, 0, 26), status: 'pending' }, // tomorrow
      { id: 'm4', subject_type: 'client', subject_id: 'c2', scheduled_at: at(11), status: 'skipped' },        // skipped
      { id: 'm5', subject_type: 'client', subject_id: 'c1', scheduled_at: at(8), status: 'pending', deleted_at: '2026-06-20' },
    ]
    const items = todayItems(now, { meetings, clients, groups }, { kinds: ['meeting'] })
    expect(items.map((i) => i.id)).toEqual(['mtg-m2', 'mtg-m1']) // sorted by time, only today + not skipped/deleted
    const dana = items.find((i) => i.id === 'mtg-m1')
    expect(dana.title).toBe('דנה')
    expect(dana.phone).toBe('0501234567')
    const grp = items.find((i) => i.id === 'mtg-m2')
    expect(grp.title).toBe('קבוצת בוקר')
    expect(grp.phone).toBe('') // groups have no phone
  })

  it('includes today calendar events with all-day flag, excludes deleted/other days', () => {
    const calendarEvents = [
      { id: 'e1', start_time: at(14), title: 'רופא שיניים' },
      { id: 'e2', start_time: at(0), all_day: true, title: 'חג' },
      { id: 'e3', start_time: at(15, 0, 24), title: 'אתמול' },
      { id: 'e4', start_time: at(16), title: 'נמחק', deleted_at: '2026-06-20' },
    ]
    const items = todayItems(now, { calendarEvents }, { kinds: ['calendar'] })
    expect(items.map((i) => i.id)).toEqual(['cal-e2', 'cal-e1'])
    expect(items.find((i) => i.id === 'cal-e2').allDay).toBe(true)
  })

  it('includes in-process lead follow-ups due today, pinned to 09:00, with phone', () => {
    const leads = [
      { id: 'l1', name: 'ליד חם', phone: '0529998888', status_meta: 'in_process', follow_up_date: '2026-06-25' },
      { id: 'l2', name: 'מחר', status_meta: 'in_process', follow_up_date: '2026-06-26' },
      { id: 'l3', name: 'הומר', status_meta: 'converted', follow_up_date: '2026-06-25' }, // not in_process
    ]
    const items = todayItems(now, { leads }, { kinds: ['followup'] })
    expect(items.map((i) => i.id)).toEqual(['fu-l1'])
    expect(items[0].when).toBe('2026-06-25T09:00:00')
    expect(items[0].phone).toBe('0529998888')
  })

  it('merges all kinds time-sorted, and the kinds filter excludes sources', () => {
    const data = {
      clients,
      meetings: [{ id: 'm1', subject_type: 'client', subject_id: 'c1', scheduled_at: at(10), status: 'pending' }],
      calendarEvents: [{ id: 'e1', start_time: at(14), title: 'רופא' }],
      leads: [{ id: 'l1', name: 'ליד', status_meta: 'in_process', follow_up_date: '2026-06-25' }],
    }
    const all = todayItems(now, data, { kinds: ['meeting', 'calendar', 'followup'] })
    expect(all.map((i) => i.id)).toEqual(['fu-l1', 'mtg-m1', 'cal-e1']) // 09:00, 10:00, 14:00
    const meetingsOnly = todayItems(now, data, { kinds: ['meeting'] })
    expect(meetingsOnly.map((i) => i.kind)).toEqual(['meeting'])
    expect(todayItems(now, data, { kinds: [] }).length).toBe(3) // empty kinds = default all
  })

  it('never fabricates rows from missing data (no mock fallback)', () => {
    expect(todayItems(now, {}, {})).toEqual([])
  })
})
