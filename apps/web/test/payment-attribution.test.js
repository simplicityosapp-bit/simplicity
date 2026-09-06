/* ════════════════════════════════════════════════════════════════
   WHAT A PAYMENT WAS FOR.
   ════════════════════════════════════════════════════════════════
   A client's account is made of tracks. The money side had none: a
   transaction carried client_id and nothing finer, so once someone was in a
   workshop AND running private sessions, "did she pay for the workshop" had
   no answer anywhere. The same gap is why a group card could not say who in
   it still owed, or what the group brought in — both are questions about a
   group's money, and a payment did not know it belonged to one.

   transactions.group_id (migration 0115) closes it. The rules that matter:

     · a client with ONE track is never asked, and their track takes the
       whole of `paid` whatever the column holds — which is also what keeps
       every account written before the migration adding up;
     · a group track takes the income that names it;
     · the personal track takes the rest, because "no group" is what the
       form writes for personal AND what every legacy row already says;
     · with several tracks and no personal one, money that names no group is
       reported as unallocated rather than shared out by guesswork.

   Run: npm test
   ════════════════════════════════════════════════════════════════ */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { clientBalance, clientPaymentTargets } from '@simplicity/core'

const read = (rel) => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8')
const LOCALES = ['he', 'en', 'es', 'fr']
const load = (lang, ns) => JSON.parse(
  readFileSync(new URL(`../../../packages/core/src/i18n/locales/${lang}/${ns}.json`, import.meta.url), 'utf8'),
)

const client = (over = {}) => ({ id: 'c1', billing_mode: 'package', sessions: 0, price_per_session: 0, ...over })
const group = (over = {}) => ({ id: 'g1', name: 'מעגל בוקר', status: 'active', billing_mode: 'package', package_price: 1600, package_sessions: 8, ...over })
const member = (over = {}) => ({ id: 'm1', client_id: 'c1', group_id: 'g1', left_at: null, deleted_at: null, ...over })
const income = (amount, group_id = null) => ({ id: Math.random().toString(16).slice(2), type: 'income', client_id: 'c1', group_id, amount, date: '2026-08-01', status: 'confirmed' })

const balanceOf = (c, { txns = [], members = [], groups = [], sessions = [] } = {}) =>
  clientBalance(c, txns, sessions, members, groups)
const byKind = (tracks) => Object.fromEntries(tracks.map((t) => [t.kind === 'group' ? t.id : 'personal', t]))

describe('a client with one track is never asked', () => {
  it('gives a 1-on-1 client every shekel, whatever the column says', () => {
    /* Nothing to disambiguate: it is the only thing they pay for. This is
       also every account that existed before the column did. */
    const bal = balanceOf(client({ sessions: 10, price_per_session: 300 }), { txns: [income(1200)] })
    expect(bal.tracks[0]).toMatchObject({ kind: 'personal', total: 3000, paid: 1200, balance: 1800 })
  })

  it('gives a pure group member every shekel too', () => {
    const bal = balanceOf(client(), { txns: [income(600)], members: [member()], groups: [group()] })
    expect(bal.tracks[0]).toMatchObject({ kind: 'group', total: 1600, paid: 600, balance: 1000 })
  })

  it('carries an informal «שולם» correction into that one track', () => {
    const bal = balanceOf(client({ paid_adjustment: 400 }), { members: [member()], groups: [group()] })
    expect(bal.tracks[0].paid).toBe(400)
  })
})

describe('a client with a workshop and a private series', () => {
  const ctx = {
    members: [member()],
    groups: [group()],
    txns: [income(1600, 'g1'), income(500)],
  }
  const c = client({ sessions: 4, price_per_session: 300 })

  it('sends each payment to the track it names', () => {
    const t = byKind(balanceOf(c, ctx).tracks)
    expect(t.g1).toMatchObject({ total: 1600, paid: 1600, balance: 0 })
    expect(t.personal).toMatchObject({ total: 1200, paid: 500, balance: 700 })
  })

  it('still adds up to the account', () => {
    const bal = balanceOf(c, ctx)
    expect(bal.tracks.reduce((s, t) => s + t.paid, 0)).toBe(bal.paid)
    expect(bal.tracks.reduce((s, t) => s + t.balance, 0)).toBe(bal.balance)
  })

  it('reads a payment that names nothing as personal', () => {
    /* Which is what the form writes for "תהליך אישי", and what every row
       written before the column existed already says. */
    const t = byKind(balanceOf(c, { ...ctx, txns: [income(500)] }).tracks)
    expect(t.personal.paid).toBe(500)
    expect(t.g1.paid).toBe(0)
  })

  it('ignores a pending payment, like every other total here', () => {
    const pending = { ...income(900, 'g1'), status: 'pending' }
    const t = byKind(balanceOf(c, { ...ctx, txns: [pending] }).tracks)
    expect(t.g1.paid).toBe(0)
  })
})

describe('a client in two groups', () => {
  const twoGroups = {
    members: [member(), member({ id: 'm2', group_id: 'g2' })],
    groups: [group(), group({ id: 'g2', name: 'סדנת חורף', package_price: 1200, package_sessions: 6 })],
  }

  it('splits the money between them', () => {
    const t = byKind(balanceOf(client(), { ...twoGroups, txns: [income(1600, 'g1'), income(300, 'g2')] }).tracks)
    expect(t.g1.balance).toBe(0)
    expect(t.g2).toMatchObject({ paid: 300, balance: 900 })
  })

  it('reports money that names neither rather than guessing', () => {
    /* No personal track to absorb it, and picking a group for the coach
       would be inventing a fact about someone's money. */
    const bal = balanceOf(client(), { ...twoGroups, txns: [income(700)] })
    expect(bal.unallocatedPaid).toBe(700)
    expect(bal.tracks.every((t) => t.paid === 0)).toBe(true)
  })

  it('has nothing unallocated once the payments say where they went', () => {
    const bal = balanceOf(client(), { ...twoGroups, txns: [income(700, 'g2')] })
    expect(bal.unallocatedPaid).toBe(0)
  })
})

describe('who gets asked', () => {
  it('nobody with a single track', () => {
    expect(clientPaymentTargets(client(), [], [])).toEqual([])
    expect(clientPaymentTargets(client(), [member()], [group()])).toEqual([])
  })

  it('a member who also has a personal track', () => {
    const out = clientPaymentTargets(client({ price_per_session: 300 }), [member()], [group()])
    expect(out.map((o) => o.kind)).toEqual(['group', 'personal'])
    expect(out[0]).toMatchObject({ id: 'g1', name: 'מעגל בוקר' })
  })

  it('a member of two groups, personal track or not', () => {
    const members = [member(), member({ id: 'm2', group_id: 'g2' })]
    const groups = [group(), group({ id: 'g2' })]
    expect(clientPaymentTargets(client(), members, groups).map((o) => o.kind))
      .toEqual(['group', 'group', 'personal'])
  })

  it('reads the personal side off the client row, not their sessions', () => {
    /* The five screens that open the payment form do not all hold
       `sessions`; a quota, a price or a manual total is enough to say the
       personal track exists, and someone with only a logged meeting and no
       price owes nothing personally anyway. */
    for (const field of [{ sessions: 4 }, { price_per_session: 300 }, { total_override: 900 }, { sessions_done_adjustment: 2 }]) {
      expect(clientPaymentTargets(client(field), [member()], [group()]), JSON.stringify(field)).toHaveLength(2)
    }
  })

  it('skips a group that was deleted', () => {
    expect(clientPaymentTargets(client({ price_per_session: 300 }), [member()], [group({ deleted_at: '2026-01-01' })]))
      .toEqual([])
  })

  it('answers for no client at all', () => {
    expect(clientPaymentTargets(null, [member()], [group()])).toEqual([])
  })
})

/* ── The surfaces ──────────────────────────────────────────────── */
describe('the forms ask, and the screens read', () => {
  it('both payment forms carry the question and save the answer', () => {
    for (const rel of ['src/modals/AddTransactionModal.jsx', 'src/modals/EditTransactionModal.jsx']) {
      const src = read(rel)
      expect(src, rel).toMatch(/clientPaymentTargets\(/)
      expect(src, rel).toMatch(/tx\.paidFor/)
      /* Never on an expense: it belongs to no one's track. */
      expect(src, rel).toMatch(/group_id: form\.type === 'income' \? \(form\.group_id \|\| null\) : null/)
    }
  })

  it('the add form clears the group when the client or the type changes', () => {
    /* A group belongs to one client, so a group left over from the previous
       pick would answer for somebody else's workshop. */
    expect(read('src/modals/AddTransactionModal.jsx'))
      .toMatch(/if \(k === 'client_id' \|\| \(k === 'type' && v !== 'income'\)\) next\.group_id = ''/)
  })

  it('the forms read the memberships themselves', () => {
    /* Of the five screens that open the add form only Finance passed them,
       so everywhere else effectiveClientMeta fell back to the stale status
       column — and a question that appears on one screen and not another
       would be worse than no question. */
    for (const rel of ['src/modals/AddTransactionModal.jsx', 'src/modals/EditTransactionModal.jsx']) {
      const src = read(rel)
      expect(src, rel).toMatch(/const \{ groups \} = useGroups\(\)/)
      expect(src, rel).toMatch(/const \{ members \} = useGroupMembers\(\)/)
      expect(src, rel).not.toMatch(/members = \[\], groups = \[\]/)
    }
  })

  it('the client file shows what each track has received', () => {
    const src = read('src/drawers/client/ClientDrawer.jsx')
    expect(src).toMatch(/tracks\.paidOf/)
    expect(src).toMatch(/tracks\.unallocated/)
    /* And why the hero can still differ: a write-off belongs to no track. */
    expect(src).toMatch(/tracks\.writeOffNote/)
  })
})

describe('the migration', () => {
  const sql = readFileSync(new URL('../../../supabase/migrations/0115_transactions_group_id.sql', import.meta.url), 'utf8')

  it('adds one nullable column and touches no row', () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS group_id uuid REFERENCES groups\(id\)/)
    /* Nullable: a backfill would have to invent which group every existing
       payment was for, and there is no such fact to recover. */
    expect(sql).not.toMatch(/group_id uuid[^;]*\bNOT NULL\b/)
    /* And nothing that rewrites what is already there. */
    expect(sql).not.toMatch(/\bUPDATE\s+\w|\bDELETE\s+FROM\b|\bDROP\s+COLUMN\b/i)
  })

  it('keeps the payment when a group is hard-deleted', () => {
    /* The money is real and must not go with the group. */
    expect(sql).toMatch(/ON DELETE SET NULL/)
  })
})

describe('every locale asks the question', () => {
  it('names it and its personal answer', () => {
    for (const lang of LOCALES) {
      const tx = load(lang, 'modalsData').tx
      expect(tx.paidFor, `${lang}.paidFor`).toBeTruthy()
      expect(tx.paidForPersonal, `${lang}.paidForPersonal`).toBeTruthy()
    }
  })

  it('names what a track received, and what nothing claims', () => {
    for (const lang of LOCALES) {
      const tr = load(lang, 'clients').tracks
      expect(tr.paidOf, `${lang}.paidOf`).toMatch(/\{\{paid\}\}/)
      expect(tr.left, `${lang}.left`).toMatch(/\{\{amount\}\}/)
      expect(tr.unallocated, `${lang}.unallocated`).toMatch(/\{\{amount\}\}/)
      expect(tr.writeOffNote, `${lang}.writeOffNote`).toMatch(/\{\{amount\}\}/)
      /* The line that said no per-track "paid" existed yet. It does now. */
      expect(tr.note, `${lang}.note`).toBeUndefined()
    }
  })
})
