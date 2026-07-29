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
       conversions, new clients, sessions, completed tasks. A deleted row
       still counts, forever.
     · SNAPSHOT metrics answer "how many, as of this date" — active
       clients / open tasks at the end. A row deleted DURING the period
       was already gone by then; one deleted afterwards was not. That is
       arithmetic, not preference, and blanket-counting deleted rows here
       would be a new bug wearing the fix's clothes.
     · MONEY is carved out entirely and keeps the old behaviour: a
       deleted transaction leaves the figures. See its own block below
       for why.

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
  /* income/expense/net are NOT here — money is the exception, covered
     below. Adding them to this table is the likely way the carve-out gets
     undone by someone making the list "complete". */
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

describe('money is the exception: a deleted transaction is gone', () => {
  /* The rest of this suite exists because deletion means "I'm done looking
     at this". A transaction is deleted because it was WRONG — a typo, a
     duplicate, a charge that never landed — and the trash only offers
     restore, so a figure that kept counting it could never be corrected.
     Owner's call, 2026-07-29, reversing this one metric group only. */
  const tx = (d, over = {}) => ({
    id: 't', type: 'income', amount: 500, date: IN, desc: 'paid',
    status: 'confirmed', deleted_at: d, ...over,
  })

  it('drops it from income', () => {
    expect(metrics({ transactions: [tx(null)] }).income).toBe(500)
    expect(metrics({ transactions: [tx(AFTER)] }).income).toBe(0)
  })

  it('drops it from expense', () => {
    const e = (d) => tx(d, { type: 'expense', amount: 200 })
    expect(metrics({ transactions: [e(null)] }).expense).toBe(200)
    expect(metrics({ transactions: [e(AFTER)] }).expense).toBe(0)
  })

  it('net follows both sides down', () => {
    const data = (d) => ({
      transactions: [
        tx(d),
        tx(null, { id: 'b', type: 'expense', amount: 200 }),
      ],
    })
    expect(metrics(data(null)).net).toBe(300)
    expect(metrics(data(AFTER)).net).toBe(-200)
  })

  it('leaves it out of the drill list too', () => {
    /* A number that excludes it and a list that shows it is the same
       count-vs-list mismatch this suite guards everywhere else. */
    expect(drill('income', { transactions: [tx(AFTER)] })).toHaveLength(0)
    expect(drill('net', { transactions: [tx(AFTER)] })).toHaveLength(0)
    const [row] = drill('income', { transactions: [tx(null)] })
    expect(row.secondary).not.toContain(marker())
  })

  it('still excludes a transaction that was never confirmed', () => {
    /* Confirmation gates independently of deletion — a pending row was
       never money either way. */
    const p = tx(null, { status: 'pending' })
    expect(metrics({ transactions: [p] }).income).toBe(0)
    expect(metrics({ transactions: [{ ...p, deleted_at: AFTER }] }).income).toBe(0)
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

/* ── The ledger ──────────────────────────────────────────────────── */

describe('the ledger and the row count agree', () => {
  /* computeReportForRange has two paths now: count the rows (no tallies) or
     read report_tallies (migration 0100). They must produce the same number
     for the same history, or switching the screen over would move figures
     the user has already seen. This pins them to each other.

     Tally periods are month-start dates in the app timezone, exactly what
     the database triggers write. */
  const JUNE = '2026-06-01'
  const rows = {
    leads: [
      { id: 'a', name: 'a', inquiry_date: '2026-06-02', status_meta: 'converted', converted_at: IN, closed_at: IN },
      { id: 'b', name: 'b', inquiry_date: '2026-06-03', status_meta: 'in_process' },
    ],
    clients: [{ id: 'c', name: 'c', created_at: IN, status_meta: 'active' }],
    sessions: [{ id: 's', date: IN }],
    tasks: [{ id: 'k', title: 'k', status: 'done', created_at: IN, completed_at: IN }],
  }
  /* What the triggers would have recorded for that same history. */
  const tallies = [
    { period: JUNE, metric: 'new_inquiries', count: 2 },
    { period: JUNE, metric: 'leads_closed', count: 1 },
    { period: JUNE, metric: 'leads_converted', count: 1 },
    { period: JUNE, metric: 'cohort_converted', count: 1 },
    { period: JUNE, metric: 'new_clients', count: 1 },
    { period: JUNE, metric: 'sessions_held', count: 1 },
    { period: JUNE, metric: 'tasks_completed', count: 1 },
  ]

  const FLOW_IDS = ['newInquiries', 'leadsClosed', 'leadsConverted', 'conversionRate',
    'newClients', 'sessions', 'tasksCompleted']

  it('produces identical flow metrics either way', () => {
    const fromRows = metrics(rows)
    const fromLedger = metrics({ ...rows, tallies })
    FLOW_IDS.forEach((id) => {
      expect(fromLedger[id], `${id} differs`).toEqual(fromRows[id])
    })
  })

  it('reads the ledger, not the rows, when both are present', () => {
    /* The proof that the ledger is authoritative: give it a number the rows
       cannot produce and it must win. This is what survives the purge. */
    const bumped = tallies.map((t) => (t.metric === 'tasks_completed' ? { ...t, count: 9 } : t))
    expect(metrics({ ...rows, tallies: bumped }).tasksCompleted).toBe(9)
  })

  it('counts a purged month with no rows left at all', () => {
    /* After the 30-day purge this is the real shape of an old month. */
    expect(metrics({ tallies }).tasksCompleted).toBe(1)
    expect(metrics({ tallies }).newInquiries).toBe(2)
    expect(metrics({ tallies }).conversionRate).toBe(50)
  })

  it('ignores buckets outside the period', () => {
    const other = [{ period: '2026-07-01', metric: 'tasks_completed', count: 7 }]
    expect(metrics({ tallies: other }).tasksCompleted).toBe(0)
  })

  it('leaves money and the snapshots on the rows', () => {
    /* Neither is in the ledger; a stray tally must not be picked up. */
    const noise = [{ period: JUNE, metric: 'income', count: 999 }]
    const withMoney = { transactions: [{ id: 't', type: 'income', amount: 50, date: IN, status: 'confirmed' }], tallies: noise }
    expect(metrics(withMoney).income).toBe(50)
    expect(metrics({ clients: rows.clients, tallies: noise }).activeClientsAtEnd).toBe(1)
  })
})

describe('snapshots are frozen per closed month', () => {
  /* "Active at the end of June" is state on a date, so it cannot come from an
     event counter — migration 0101 freezes one value per CLOSED month, and
     that stored value is what survives the purge. */
  const JUNE = '2026-06-01'
  const client = { id: 'c', name: 'c', status_meta: 'active', created_at: '2026-05-01T00:00:00.000Z' }
  const task = { id: 'k', title: 'k', status: 'todo', created_at: '2026-05-01T00:00:00.000Z', completed_at: null }

  it('prefers the frozen value over the rows', () => {
    const tallies = [
      { period: JUNE, metric: 'active_clients_at_end', count: 8 },
      { period: JUNE, metric: 'open_tasks_at_end', count: 3 },
    ]
    const m = metrics({ clients: [client], tasks: [task], tallies })
    expect(m.activeClientsAtEnd).toBe(8)
    expect(m.openTasksAtEnd).toBe(3)
  })

  it('survives a month whose rows are gone entirely', () => {
    /* The shape of a purged month: no rows at all, numbers intact. */
    const tallies = [
      { period: JUNE, metric: 'active_clients_at_end', count: 8 },
      { period: JUNE, metric: 'open_tasks_at_end', count: 3 },
    ]
    expect(metrics({ tallies }).activeClientsAtEnd).toBe(8)
    expect(metrics({ tallies }).openTasksAtEnd).toBe(3)
  })

  it('keeps a frozen zero rather than falling through to the rows', () => {
    /* 0 is a real answer. Nullish coalescing, not ||, is what makes this
       work — and it is the easy thing to get wrong here. */
    const tallies = [{ period: JUNE, metric: 'active_clients_at_end', count: 0 }]
    expect(metrics({ clients: [client], tallies }).activeClientsAtEnd).toBe(0)
  })

  it('falls back to live rows when the month has no snapshot', () => {
    /* The current month is deliberately never frozen — it is still moving. */
    const other = [{ period: '2026-05-01', metric: 'active_clients_at_end', count: 99 }]
    expect(metrics({ clients: [client], tallies: other }).activeClientsAtEnd).toBe(1)
  })

  it('does not let a flow tally answer a snapshot question', () => {
    const wrong = [{ period: JUNE, metric: 'new_clients', count: 42 }]
    expect(metrics({ clients: [client], tallies: wrong }).activeClientsAtEnd).toBe(1)
  })
})
