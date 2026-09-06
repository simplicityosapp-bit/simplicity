/* ════════════════════════════════════════════════════════════════
   TRACKS — what a client's account is made of.
   ════════════════════════════════════════════════════════════════
   A client pays for things: each group they belong to, and their personal
   process. The account was the SUM of those and nothing else — one total,
   one balance, and no way to tell which part came from where.

   That made a whole class of mistakes invisible. The add and edit forms
   offer a quota, a price and a manual total to every client, group members
   included, so a coach who typed the GROUP's eight meetings into «מספר
   פגישות» gave that member a private series of eight nobody asked for; and
   one who typed the group's price into «סה״כ לתשלום» charged the same dues
   twice. The card printed "0/8" beside the group's own "1/8" and the file
   showed ₪3,200 owed, with nothing anywhere saying ₪1,600 of it was the
   same ₪1,600.

   `clientBalance().tracks` names the parts. Nothing is ignored and nothing
   is rewritten — a quota entered by mistake still shows, beside the group
   line that explains it, so the coach can see both and decide.

   Run: npm test
   ════════════════════════════════════════════════════════════════ */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { clientBalance } from '@simplicity/core'

const read = (rel) => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8')

const client = (over = {}) => ({ id: 'c1', billing_mode: 'package', sessions: 0, price_per_session: 0, ...over })
const group = (over = {}) => ({ id: 'g1', name: 'מעגל בוקר', status: 'active', billing_mode: 'package', package_price: 1600, package_sessions: 8, ...over })
const member = (over = {}) => ({ id: 'm1', client_id: 'c1', group_id: 'g1', left_at: null, deleted_at: null, ...over })
const session = (over = {}) => ({ client_id: null, group_id: null, date: '2026-08-01', deleted_at: null, ...over })

const tracksOf = (c, { sessions = [], members = [], groups = [], txns = [] } = {}) =>
  clientBalance(c, txns, sessions, members, groups).tracks
const kinds = (tracks) => tracks.map((t) => t.kind)

describe('a client in no group', () => {
  it('is one personal track, always — even brand new and empty', () => {
    const tracks = tracksOf(client())
    expect(kinds(tracks)).toEqual(['personal'])
    expect(tracks[0]).toMatchObject({ held: 0, quota: 0, total: 0 })
  })

  it('counts its meetings and its money', () => {
    const tracks = tracksOf(client({ sessions: 12, price_per_session: 380 }), {
      sessions: [session({ client_id: 'c1' })],
    })
    expect(tracks[0]).toMatchObject({ kind: 'personal', held: 1, quota: 12, total: 4560 })
  })

  it('drops the quota for per-session billing with nothing booked ahead', () => {
    /* "/0" was never a target of anything. Once meetings ARE booked ahead
       the number is real again and reads like any other client. */
    const perSession = client({ billing_mode: 'per_session', price_per_session: 300 })
    expect(tracksOf(perSession, { sessions: [session({ client_id: 'c1' })] })[0])
      .toMatchObject({ mode: 'per_session', held: 1, quota: null, total: 300 })
    expect(tracksOf({ ...perSession, sessions: 10 }, { sessions: [session({ client_id: 'c1' })] })[0])
      .toMatchObject({ quota: 10 })
  })
})

describe('a client who is only in a group', () => {
  const g = group()
  const m = member()

  it('has the group track and NO personal one', () => {
    const tracks = tracksOf(client(), { members: [m], groups: [g] })
    expect(kinds(tracks)).toEqual(['group'])
    expect(tracks[0]).toMatchObject({ name: 'מעגל בוקר', mode: 'package', quota: 8, total: 1600 })
  })

  it('takes the group\'s model even when the group prices nothing', () => {
    /* «ללא מחיר קבוע» is a real answer, not a missing one: the member owes
       nothing until the coach prices them individually. */
    const free = group({ billing_mode: 'none', package_price: null, package_sessions: null })
    const tracks = tracksOf(client(), { members: [m], groups: [free] })
    expect(tracks[0]).toMatchObject({ mode: 'none', total: 0, quota: null })
  })

  it('bills a per-session group by what took place', () => {
    const drop = group({ billing_mode: 'per_session', price_per_session: 90, package_sessions: null })
    const tracks = tracksOf(client(), {
      members: [m], groups: [drop],
      sessions: [session({ group_id: 'g1' }), session({ group_id: 'g1' })],
    })
    expect(tracks[0]).toMatchObject({ mode: 'per_session', held: 2, quota: null, total: 180 })
  })

  it('lets a per-member price win over the group\'s', () => {
    const tracks = tracksOf(client(), { members: [member({ total_override: 900 })], groups: [g] })
    expect(tracks[0].total).toBe(900)
  })

  it('lets a per-member quota win over the group\'s', () => {
    const tracks = tracksOf(client(), { members: [member({ package_sessions_override: 20 })], groups: [g] })
    expect(tracks[0].quota).toBe(20)
  })

  it('keeps a closed group as a track, flagged', () => {
    const tracks = tracksOf(client(), { members: [m], groups: [group({ status: 'ended' })] })
    expect(tracks[0]).toMatchObject({ ended: true, total: 1600 })
  })
})

describe('the personal track appears for a member only when something says so', () => {
  const ctx = { members: [member()], groups: [group()] }

  it('a private meeting on the books opens one', () => {
    const tracks = tracksOf(client(), { ...ctx, sessions: [session({ client_id: 'c1' })] })
    expect(kinds(tracks)).toEqual(['group', 'personal'])
    expect(tracks[1].held).toBe(1)
  })

  it('a price of their own opens one', () => {
    expect(kinds(tracksOf(client({ price_per_session: 380 }), ctx))).toEqual(['group', 'personal'])
  })

  it('an imported done-count opens one', () => {
    expect(kinds(tracksOf(client({ sessions_done_adjustment: 3 }), ctx))).toEqual(['group', 'personal'])
  })

  it('a quota opens one, and is NOT quietly dropped', () => {
    /* The phantom case: the coach typed the group's eight meetings into the
       client's own quota. It is still their data, so it still shows — now
       beside the group line that explains where the eight came from. */
    const tracks = tracksOf(client({ sessions: 8 }), ctx)
    expect(kinds(tracks)).toEqual(['group', 'personal'])
    expect(tracks[1]).toMatchObject({ held: 0, quota: 8, total: 0 })
  })

  it('a manual total opens one, and the double charge becomes two lines', () => {
    /* ₪1,600 of group dues typed a second time into the client's own total.
       The account still says ₪3,200 — we do not rewrite anyone's numbers —
       but it is now ₪1,600 twice, on two named lines, instead of one total
       with no explanation. */
    const bal = clientBalance(client({ total_override: 1600 }), [], [], [member()], [group()])
    expect(bal.total).toBe(3200)
    expect(bal.tracks.map((t) => [t.kind, t.total])).toEqual([['group', 1600], ['personal', 1600]])
  })

  it('nothing of the sort leaves the member with the group alone', () => {
    expect(kinds(tracksOf(client({ billing_mode: 'per_session' }), ctx))).toEqual(['group'])
  })
})

describe('two groups and a private series', () => {
  it('are three tracks that add up to the account', () => {
    const groups = [group(), group({ id: 'g2', name: 'סדנת חורף', package_price: 1200, package_sessions: 6 })]
    const members = [member(), member({ id: 'm2', group_id: 'g2' })]
    const bal = clientBalance(
      client({ sessions: 4, price_per_session: 380 }),
      [], [session({ client_id: 'c1' })], members, groups,
    )
    expect(bal.tracks).toHaveLength(3)
    expect(bal.tracks.reduce((s, t) => s + t.total, 0)).toBe(bal.total)
    expect(bal.privateTotal + bal.memberTotal).toBe(bal.total)
  })
})

/* ── The surfaces read the tracks ─────────────────────────────── */
describe('the card, the file and the form say the same thing', () => {
  it('the client card takes its meetings figure from the tracks', () => {
    const src = read('src/screens/clients/ClientCard.jsx')
    expect(src).toMatch(/tracks\.filter\(\(tr\) => !tr\.ended\)/)
    /* The old shape: personal-only when hasPersonal, group sum otherwise —
       which is what printed a per-session denominator of 0 and counted
       ended groups the client file had already dropped. */
    expect(src).not.toMatch(/hasPersonal\s*\n?\s*\?/)
  })

  it('the card leaves ended groups out, as the file does', () => {
    /* The two disagreed: the card summed every group, the file's header
       only the running ones (beta decision 04/06/2026). */
    const card = read('src/screens/clients/ClientCard.jsx')
    const drawer = read('src/drawers/client/ClientDrawer.jsx')
    for (const [name, src] of [['card', card], ['drawer', drawer]]) {
      expect(src, name).toMatch(/const running = [\s\S]{0,80}filter\(\(tr\) => !tr\.ended\)/)
    }
  })

  it('the client file lists the tracks with what each one costs', () => {
    const src = read('src/drawers/client/ClientDrawer.jsx')
    expect(src).toMatch(/balance\.tracks\.map/)
    expect(src).toMatch(/tracks\.title/)
    /* And what each one has received — see payment-attribution.test.js. */
    expect(src).toMatch(/tracks\.paidOf/)
  })

  it('"הוספת פגישות" is offered only where a personal quota exists', () => {
    /* On a pure group member it was the shortest path to the phantom
       private series this whole round exists to remove. */
    const src = read('src/drawers/client/ClientDrawer.jsx')
    expect(src).toMatch(/balance\.hasPersonal && \([\s\S]{0,400}addSessions/)
  })

  it('the edit form warns a member with no personal track', () => {
    const src = read('src/modals/EditClientModal.jsx')
    expect(src).toMatch(/isMemberWithoutPersonal/)
    expect(src).toMatch(/editClient\.noPersonalTrack/)
  })

  it('the edit form shows the personal/group split for any membership', () => {
    /* Gated on memberTotal > 0 before, so a member of a group priced
       «ללא מחיר קבוע» saw one total with no sign a group was inside it. */
    const src = read('src/modals/EditClientModal.jsx')
    expect(src).toMatch(/\{\(memberships\.length > 0 \|\| liveAdj !== 0\) && \(/)
  })
})

describe('every locale carries the tracks vocabulary', () => {
  const LOCALES = ['he', 'en', 'es', 'fr']
  const load = (lang, ns) => JSON.parse(
    readFileSync(new URL(`../../../packages/core/src/i18n/locales/${lang}/${ns}.json`, import.meta.url), 'utf8'),
  )

  it('names the section, the personal track, and all three billing models', () => {
    for (const lang of LOCALES) {
      const tr = load(lang, 'clients').tracks
      expect(tr?.title, `${lang}.title`).toBeTruthy()
      expect(tr?.personal, `${lang}.personal`).toBeTruthy()
      for (const mode of ['package', 'per_session', 'none']) {
        expect(tr?.mode?.[mode], `${lang}.mode.${mode}`).toBeTruthy()
      }
      expect(tr?.progress, `${lang}.progress`).toMatch(/\{\{held\}\}/)
      expect(tr?.progressNoQuota_one, `${lang}.progressNoQuota_one`).toBeTruthy()
      expect(tr?.progressNoQuota_other, `${lang}.progressNoQuota_other`).toBeTruthy()
    }
  })

  it('tells the manual total which track it belongs to', () => {
    for (const lang of LOCALES) {
      const ec = load(lang, 'modalsClient').editClient
      expect(ec.noPersonalTrack, `${lang}.noPersonalTrack`).toBeTruthy()
      /* The label used to read as the client's whole bill; it only ever
         set the personal side. */
      expect(ec.totalDueOptional, `${lang}.totalDueOptional`).not.toBe('סה״כ לתשלום (אופציונלי)')
    }
  })
})
