/* ════════════════════════════════════════════════════════════════
   THE GROUP CARD — the three questions a facilitator opens a group to ask.
   ════════════════════════════════════════════════════════════════
   The card listed names. Where the group stood was reachable only by
   unfolding the calendar button in its actions row, and who still owed
   meant opening every member's file in turn. Selling one member another
   card of meetings had no path at all: the client file's «הוספת פגישות»
   writes the CLIENT's private quota, a different series with a different
   price, so on a group member it opened a personal track nobody asked for.

   What is pinned here:
     · the renewal arithmetic, which moves someone's debt and must be the
       same sum in the preview and in the row that gets written;
     · the per-member precedence — an individual quota or price wins over
       the group's, exactly as clientBalance bills it;
     · the card renders the progress, the owe count and the balances;
     · an empty groups section does not stand open on a project that will
       never have one.
   ════════════════════════════════════════════════════════════════ */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  membershipQuota, membershipDues, packageUnitPrice, renewedCard,
} from '../src/lib/groupMembership'

const read = (rel) => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8')
const group = (over = {}) => ({ id: 'g1', billing_mode: 'package', package_price: 1600, package_sessions: 8, ...over })
const member = (over = {}) => ({ id: 'm1', client_id: 'c1', group_id: 'g1', ...over })

describe('what one member holds', () => {
  it('falls back to the group when nothing was set for them', () => {
    expect(membershipQuota(member(), group())).toBe(8)
    expect(membershipDues(member(), group())).toBe(1600)
  })

  it('lets their own quota and their own price win', () => {
    expect(membershipQuota(member({ package_sessions_override: 20 }), group())).toBe(20)
    expect(membershipDues(member({ total_override: 900 }), group())).toBe(900)
  })

  it('keeps an explicit zero, which is someone attending for free', () => {
    expect(membershipDues(member({ total_override: 0 }), group())).toBe(0)
    expect(membershipQuota(member({ package_sessions_override: 0 }), group())).toBe(0)
  })
})

describe('what a meeting of the package costs', () => {
  it('spreads the package price over the meetings it buys', () => {
    expect(packageUnitPrice(group())).toBe(200)
  })

  it('is nothing when the group sells no package', () => {
    /* A per-session or unpriced group has no card to renew, which is why
       the button is not offered there at all. */
    expect(packageUnitPrice(group({ package_sessions: null }))).toBe(0)
    expect(packageUnitPrice(group({ package_price: null }))).toBe(0)
    expect(packageUnitPrice(null)).toBe(0)
  })
})

describe('selling another card', () => {
  it('moves the quota and the debt together', () => {
    /* Owner decision 2026-09-03: the debt grows by the group's defined
       package price. A different figure for one member goes in the
       per-member override that already exists on their client card. */
    expect(renewedCard({ currentQuota: 8, currentTotal: 1600, unitPrice: 200, count: 10 }))
      .toEqual({ quota: 18, total: 3600, count: 10 })
  })

  it('starts from what THEY hold, not from the group', () => {
    expect(renewedCard({ currentQuota: 20, currentTotal: 900, unitPrice: 200, count: 5 }))
      .toEqual({ quota: 25, total: 1900, count: 5 })
  })

  it('rounds to the agora', () => {
    /* ₪1,000 over 3 meetings is a repeating decimal, and it would
       otherwise land in someone's balance in full. */
    const out = renewedCard({ currentQuota: 3, currentTotal: 1000, unitPrice: 1000 / 3, count: 3 })
    expect(out.total).toBe(2000)
    expect(renewedCard({ currentQuota: 0, currentTotal: 0, unitPrice: 1000 / 3, count: 1 }).total).toBe(333.33)
  })

  it('adds meetings and no money when the group prices nothing', () => {
    expect(renewedCard({ currentQuota: 8, currentTotal: 0, unitPrice: 0, count: 4 }))
      .toEqual({ quota: 12, total: 0, count: 4 })
  })

  it('ignores a fractional or negative count', () => {
    expect(renewedCard({ currentQuota: 8, currentTotal: 1600, unitPrice: 200, count: 2.7 }).count).toBe(2)
    expect(renewedCard({ currentQuota: 8, currentTotal: 1600, unitPrice: 200, count: -5 }))
      .toEqual({ quota: 8, total: 1600, count: 0 })
  })
})

/* ── What the card renders ─────────────────────────────────────── */
describe('the card answers the questions', () => {
  const src = read('src/screens/project-detail/index.jsx')

  it('says how many meetings were held, and when the next one is', () => {
    expect(src).toMatch(/gc-progress/)
    expect(src).toMatch(/detail\.groups\.progressOf/)
    expect(src).toMatch(/detail\.groups\.nextMeeting/)
    /* The next meeting per group, taken off the list the section below
       already builds rather than re-derived. */
    expect(src).toMatch(/const nextByGroup = useMemo/)
  })

  it('drops the denominator where the group has no package to count against', () => {
    /* "/0" is a target of nothing — the same rule the client card and the
       client file apply to per-session billing. */
    expect(src).toMatch(/billingMode === 'package' \? \(g\.package_sessions \|\| 0\) : 0/)
  })

  it('shows each member their balance, and counts who owes', () => {
    expect(src).toMatch(/gc-member-owes/)
    expect(src).toMatch(/const owingCount = groupMembers/)
    expect(src).toMatch(/detail\.groups\.owing/)
  })

  it('computes the balances once, not once per row', () => {
    /* The alternative re-scans the whole transactions array per member on
       every render — the reason the clients screen keeps the same map. */
    expect(src).toMatch(/const balanceByClient = useMemo/)
  })

  it('marks a member whose balance is not the group\'s alone', () => {
    /* A payment is recorded against a client, not against a workshop, so
       for someone running a private series too the figure is both. */
    expect(src).toMatch(/detail\.groups\.memberMixed/)
    expect(src).toMatch(/const mixed = \(bal\?\.tracks\?\.length \|\| 0\) > 1/)
  })

  it('offers a renewal only where meetings come in cards', () => {
    expect(src).toMatch(/const canRenew = billingMode === 'package' && \(g\.package_sessions \|\| 0\) > 0/)
  })

  it('gives the renewal an undo, since it raises what someone owes', () => {
    expect(src).toMatch(/const renewMemberCard[\s\S]{0,900}pushUndo\(/)
  })
})

describe('a project with no groups', () => {
  const src = read('src/screens/project-detail/index.jsx')

  it('keeps the section closed, and one tap from opening', () => {
    expect(src).toMatch(/const groupsOpen = projectGroups\.length > 0 \? openSec\.groups : showEmptyGroups/)
    expect(src).toMatch(/const toggleGroupsSection/)
  })

  it('does not spend a stat on a group count of zero', () => {
    /* A therapist opens every project onto "0 קבוצות" and will for as long
       as they use the app. What took its place is the figure a 1-on-1
       practice does watch. */
    expect(src).toMatch(/projectGroups\.length \? 'pd-stats-3' : 'pd-stats-2'/)
    expect(src).toMatch(/detail\.stats\.sessionsMonth/)
    expect(src).toMatch(/const sessionsThisMonth = useMemo/)
  })
})

describe('every locale carries the group-card vocabulary', () => {
  const LOCALES = ['he', 'en', 'es', 'fr']
  const load = (lang, ns) => JSON.parse(
    readFileSync(new URL(`../../../packages/core/src/i18n/locales/${lang}/${ns}.json`, import.meta.url), 'utf8'),
  )

  it('names the progress, the next meeting, the owe count and the mixed balance', () => {
    for (const lang of LOCALES) {
      const g = load(lang, 'projects').detail.groups
      expect(g.progressOf, `${lang}.progressOf`).toMatch(/\{\{held\}\}/)
      expect(g.progressOf, `${lang}.progressOf`).toMatch(/\{\{quota\}\}/)
      expect(g.progressPlain_one, `${lang}.progressPlain_one`).toBeTruthy()
      expect(g.progressPlain_other, `${lang}.progressPlain_other`).toBeTruthy()
      expect(g.nextMeeting, `${lang}.nextMeeting`).toMatch(/\{\{date\}\}/)
      expect(g.owing_one, `${lang}.owing_one`).toBeTruthy()
      expect(g.owing_other, `${lang}.owing_other`).toBeTruthy()
      expect(g.memberMixed, `${lang}.memberMixed`).toBeTruthy()
      expect(g.renewAria, `${lang}.renewAria`).toMatch(/\{\{name\}\}/)
      expect(load(lang, 'projects').detail.stats.sessionsMonth, `${lang}.sessionsMonth`).toBeTruthy()
    }
  })

  it('states what a renewal does before it is saved', () => {
    for (const lang of LOCALES) {
      const s = load(lang, 'modalsClient').memberSessions
      expect(s?.title, `${lang}.title`).toBeTruthy()
      expect(s?.previewQuota, `${lang}.previewQuota`).toMatch(/\{\{from\}\}/)
      expect(s?.previewMoney, `${lang}.previewMoney`).toMatch(/\{\{amount\}\}/)
      /* And where a different price for one member goes, since the field
         already exists one screen over and nothing said so. */
      expect(s?.note, `${lang}.note`).toBeTruthy()
      expect(s?.previewFree, `${lang}.previewFree`).toBeTruthy()
    }
  })
})
