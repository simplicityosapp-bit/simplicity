/* ════════════════════════════════════════════════════════════════
   REPORTS COUNT WHAT HAPPENED, NOT WHAT STILL EXISTS.
   ════════════════════════════════════════════════════════════════
   A beta user finished a month, tidied the done tasks off the tasks
   screen, and watched that month's number fall (feedback acbbeaa5). The
   owner then extended the rule to every metric: a period is a record of
   what happened in it, and deleting a row afterwards is housekeeping on
   the working screens — not a claim the event never occurred.

   Two shapes, and the split is the thing most likely to be lost:

     · FLOW metrics count events on a date — inquiries, closes,
       conversions, new clients, sessions, money, completed tasks. A
       deleted row still counts, forever.
     · SNAPSHOT metrics answer "how many, as of this date" — active
       clients / open tasks at the end. A row deleted DURING the period
       was already gone by then; one deleted afterwards was not. That is
       arithmetic, not preference, and blanket-counting deleted rows here
       would be a new bug wearing the fix's clothes.

   The drill-down list must agree with its number in both shapes,
   otherwise the user taps a count of 5 and sees 3 rows.
   ════════════════════════════════════════════════════════════════ */
import { describe, it, expect, beforeAll } from 'vitest'
import i18n, { initI18n } from '@simplicity/core/i18n'
import { computeReportForRange, getDrillRecords } from '@simplicity/core'

/* i18n must be live: the drill rows are built from translated strings, and
   an uninitialised i18n returns undefined, which silently coerces to the
   string "undefined" and makes assertions here pass on nonsense. */
beforeAll(async () => { await initI18n({ lng: 'he' }) })

const START = new Date(2026, 5, 1, 0, 0, 0, 0)           /* June 2026 */
const END = new Date(2026, 5, 30, 23, 59, 59, 999)
const IN = '2026-06-15T09:00:00.000Z'                    /* inside  */
const AFTER = '2026-07-15T09:00:00.000Z'                 /* after   */
const DURING = '2026-06-20T09:00:00.000Z'                /* inside, later */

const metrics = (data) => computeReportForRange(START, END, data).metrics
const drill = (id, data) => getDrillRecords(id, START, END, data)
const marker = () => i18n.t('reports:drill.deleted')

/* Each flow metric, with the row that makes it 1 and the field that has to
   land inside the period. Driving them from one table is deliberate: a new
   metric added without a decision about deletion stands out as a missing
   row here rather than quietly picking whichever behaviour its neighbour
   happened to have. */
const FLOW = [
  {
    id: 'newInquiries', key: 'leads',
    row: (d) => ({ id: 'l1', name: 'lead', inquiry_date: '2026-06-15', created_at: IN, deleted_at: d }),
  },
  {
    id: 'leadsClosed', key: 'leads',
    row: (d) => ({ id: 'l2', name: 'lead', closed_at: IN, status_meta: 'not_relevant', deleted_at: d }),
  },
  {
    id: 'leadsConverted', key: 'leads',
    row: (d) => ({ id: 'l3', name: 'lead', status_meta: 'converted', converted_at: IN, deleted_at: d }),
  },
  {
    id: 'newClients', key: 'clients',
    row: (d) => ({ id: 'c1', name: 'client', created_at: IN, status_meta: 'active', deleted_at: d }),
  },
  {
    id: 'sessions', key: 'sessions',
    row: (d) => ({ id: 's1', date: IN, deleted_at: d }),
  },
  {
    id: 'income', key: 'transactions',
    row: (d) => ({ id: 't1', type: 'income', amount: 100, date: IN, desc: 'paid', status: 'confirmed', deleted_at: d }),
  },
  {
    id: 'expense', key: 'transactions',
    row: (d) => ({ id: 't2', type: 'expense', amount: 40, date: IN, desc: 'rent', status: 'confirmed', deleted_at: d }),
  },
  {
    id: 'tasksCompleted', key: 'tasks',
    row: (d) => ({ id: 'k1', title: 'task', status: 'done', created_at: IN, completed_at: IN, deleted_at: d }),
  },
]

describe('flow metrics survive deletion', () => {
  FLOW.forEach(({ id, key, row }) => {
    it(`${id} counts a deleted row the same as a live one`, () => {
      const liveVal = metrics({ [key]: [row(null)] })[id]
      const goneVal = metrics({ [key]: [row(AFTER)] })[id]
      const duringVal = metrics({ [key]: [row(DURING)] })[id]

      expect(liveVal).toBeTruthy()
      expect(goneVal).toEqual(liveVal)
      /* Deleted inside the period too — the event still happened. */
      expect(duringVal).toEqual(liveVal)
    })

    it(`${id} lists the deleted row and marks it`, () => {
      const rows = drill(id, { [key]: [row(AFTER)] })
      expect(rows).toHaveLength(1)
      expect(rows[0].secondary).toContain(marker())
      expect(rows[0].navigateTo).toBe('/trash')
    })

    it(`${id} leaves a live row unmarked`, () => {
      const [rec] = drill(id, { [key]: [row(null)] })
      expect(rec.secondary).toBeTypeOf('string')
      expect(rec.secondary).not.toContain(marker())
      expect(rec.navigateTo).not.toBe('/trash')
    })
  })
})

describe('net follows income and expense', () => {
  it('is unchanged by deleting either side', () => {
    const data = (d) => ({
      transactions: [
        { id: 'a', type: 'income', amount: 500, date: IN, status: 'confirmed', deleted_at: d },
        { id: 'b', type: 'expense', amount: 200, date: IN, status: 'confirmed', deleted_at: null },
      ],
    })
    expect(metrics(data(null)).net).toBe(300)
    expect(metrics(data(AFTER)).net).toBe(300)
  })

  it('still excludes a transaction that was never confirmed', () => {
    /* Deletion stopped gating; confirmation did not. A pending row was
       never money, deleted or otherwise. */
    const tx = { id: 'p', type: 'income', amount: 900, date: IN, status: 'pending' }
    expect(metrics({ transactions: [tx] }).income).toBe(0)
    expect(metrics({ transactions: [{ ...tx, deleted_at: AFTER }] }).income).toBe(0)
  })
})

describe('conversionRate uses the same cohort on both sides', () => {
  it('is unaffected by deleting a converted lead', () => {
    const leads = (d) => ([
      { id: 'a', name: 'a', inquiry_date: '2026-06-02', status_meta: 'converted', converted_at: IN, deleted_at: d },
      { id: 'b', name: 'b', inquiry_date: '2026-06-03', status_meta: 'in_process', deleted_at: null },
    ])
    expect(metrics({ leads: leads(null) }).conversionRate).toBe(50)
    expect(metrics({ leads: leads(AFTER) }).conversionRate).toBe(50)
  })
})

describe('leftMidProcessPct counts endings that happened', () => {
  it('keeps a deleted client in the numerator and denominator', () => {
    const clients = (d) => ([{
      id: 'c', name: 'c', status_meta: 'past', sessions: 4,
      last_status_changed_at: IN, left_mid_process: true, deleted_at: d,
    }])
    expect(metrics({ clients: clients(null) }).leftMidProcessPct).toBe(100)
    expect(metrics({ clients: clients(AFTER) }).leftMidProcessPct).toBe(100)
  })
})

/* ── The other half of the rule ─────────────────────────────────── */

describe('snapshot metrics keep "as of" semantics', () => {
  const client = (d) => ({ id: 'c', name: 'c', status_meta: 'active', created_at: '2026-05-01T00:00:00.000Z', deleted_at: d })
  const openTask = (d) => ({ id: 'k', title: 'k', status: 'todo', created_at: '2026-05-01T00:00:00.000Z', completed_at: null, deleted_at: d })

  it('activeClientsAtEnd counts a client deleted AFTER the period', () => {
    expect(metrics({ clients: [client(AFTER)] }).activeClientsAtEnd).toBe(1)
  })

  it('activeClientsAtEnd drops a client deleted DURING the period', () => {
    /* Gone by the 30th, so it was not active at the end of June. */
    expect(metrics({ clients: [client(DURING)] }).activeClientsAtEnd).toBe(0)
  })

  it('openTasksAtEnd applies the same rule', () => {
    expect(metrics({ tasks: [openTask(AFTER)] }).openTasksAtEnd).toBe(1)
    expect(metrics({ tasks: [openTask(DURING)] }).openTasksAtEnd).toBe(0)
  })

  it('the activeClientsAtEnd drill matches its number', () => {
    expect(drill('activeClientsAtEnd', { clients: [client(DURING)] })).toHaveLength(0)
    const rows = drill('activeClientsAtEnd', { clients: [client(AFTER)] })
    expect(rows).toHaveLength(1)
    /* Still in the trash TODAY, so the row says where it went even though
       it counted for the period. */
    expect(rows[0].secondary).toContain(marker())
  })
})

describe('a task with no completion is not counted by deleting it', () => {
  it('stays out of tasksCompleted', () => {
    /* What stops the fix from inflating the number with abandoned work. */
    const abandoned = { id: 'k', title: 'k', status: 'todo', created_at: IN, completed_at: null, deleted_at: DURING }
    expect(metrics({ tasks: [abandoned] }).tasksCompleted).toBe(0)
  })
})

describe('the period still bounds everything', () => {
  it('a deleted row outside the range does not leak in', () => {
    FLOW.forEach(({ id, key, row }) => {
      const outside = { ...row(AFTER) }
      /* Push every date field past the period end. */
      Object.keys(outside).forEach((k) => {
        if (/_at$|^date$|_date$/.test(k) && outside[k] && k !== 'deleted_at') outside[k] = AFTER
      })
      expect(metrics({ [key]: [outside] })[id], `${id} leaked`).toBeFalsy()
    })
  })
})
