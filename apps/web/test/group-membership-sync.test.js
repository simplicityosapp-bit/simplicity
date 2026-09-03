/* ════════════════════════════════════════════════════════════════
   GROUP MEMBERSHIP SYNC — the tag and the row agree.
   ════════════════════════════════════════════════════════════════
   "This client is in that group" is written twice: as a group_members
   row (the roster, the group-driven status, the group dues) and as the
   single-group tag clients.group_id (the project screen's client list,
   the client file's session feed). Two writers each updated one half:

     · the edit form's «קבוצה» picker set the tag and never a row — the
       group card said "שני חברים" and drew one chip, and the client owed
       the group nothing;
     · the chip's ✕ closed the row and never the tag — the chip vanished
       while the client's row still said "מעגל בוקר".

   lib/groupMembership.js is now the one place that decides what a change
   to either record does to the other. The unit tests pin that rule; the
   source assertions pin that the writers actually go through it, in the
   shape project-add-seeding.test.js already uses — there is no DOM test
   runner in this app.
   ════════════════════════════════════════════════════════════════ */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { groupMembershipPlan, newMembership, nextGroupTag } from '../src/lib/groupMembership'

const read = (rel) => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8')

const row = (id, group_id, over = {}) => ({ id, client_id: 'c1', group_id, left_at: null, deleted_at: null, ...over })

describe('groupMembershipPlan', () => {
  it('does nothing when the tag did not move', () => {
    expect(groupMembershipPlan({ prevGroupId: 'A', nextGroupId: 'A', memberships: [row('m1', 'A')] }))
      .toEqual({ remove: [], add: [] })
    /* '' and null are the same "no group" — the form sends '' for the
       empty option and the row stores null. */
    expect(groupMembershipPlan({ prevGroupId: null, nextGroupId: '', memberships: [] }))
      .toEqual({ remove: [], add: [] })
  })

  it('opens a row for a first group', () => {
    expect(groupMembershipPlan({ prevGroupId: null, nextGroupId: 'A', memberships: [] }))
      .toEqual({ remove: [], add: ['A'] })
  })

  it('closes the old row and opens the new one on a move', () => {
    expect(groupMembershipPlan({ prevGroupId: 'A', nextGroupId: 'B', memberships: [row('m1', 'A')] }))
      .toEqual({ remove: ['m1'], add: ['B'] })
  })

  it('only closes when the tag is cleared', () => {
    expect(groupMembershipPlan({ prevGroupId: 'A', nextGroupId: '', memberships: [row('m1', 'A')] }))
      .toEqual({ remove: ['m1'], add: [] })
  })

  it('does not duplicate a membership the client already has', () => {
    /* The tag was stale (null) while a real row already existed — the case
       every client added through "הוספת חבר" was in before the tag was
       mirrored on that path. */
    expect(groupMembershipPlan({ prevGroupId: null, nextGroupId: 'A', memberships: [row('m1', 'A')] }))
      .toEqual({ remove: [], add: [] })
  })

  it('leaves memberships in other groups alone', () => {
    const memberships = [row('m1', 'A'), row('m2', 'C')]
    expect(groupMembershipPlan({ prevGroupId: 'A', nextGroupId: 'B', memberships }))
      .toEqual({ remove: ['m1'], add: ['B'] })
  })

  it('ignores rows that already left or were deleted', () => {
    const memberships = [row('m1', 'A', { left_at: '2026-01-01' }), row('m2', 'A', { deleted_at: '2026-01-01' })]
    expect(groupMembershipPlan({ prevGroupId: 'A', nextGroupId: null, memberships }))
      .toEqual({ remove: [], add: [] })
    /* …and a "new" group whose only row has left gets a fresh one. */
    expect(groupMembershipPlan({ prevGroupId: null, nextGroupId: 'A', memberships }))
      .toEqual({ remove: [], add: ['A'] })
  })
})

describe('newMembership', () => {
  it('carries every column the insert needs, with no override', () => {
    const m = newMembership('g1', 'c1', '2026-09-03T12:00:00.000Z')
    expect(m).toEqual({
      group_id: 'g1',
      client_id: 'c1',
      joined_at: '2026-09-03T12:00:00.000Z',
      left_at: null,
      total_override: null,
      has_custom_price: false,
      package_sessions_override: null,
      left_mid_process: false,
    })
  })

  it('joins today when no date is given', () => {
    const before = Date.now()
    const m = newMembership('g1', 'c1')
    expect(new Date(m.joined_at).getTime()).toBeGreaterThanOrEqual(before - 1000)
  })
})

describe('nextGroupTag', () => {
  it('falls back to another group the client is still in', () => {
    const memberships = [row('m1', 'A'), row('m2', 'B')]
    expect(nextGroupTag('c1', 'm1', memberships)).toBe('B')
  })

  it('clears when that was the only group', () => {
    expect(nextGroupTag('c1', 'm1', [row('m1', 'A')])).toBeNull()
  })

  it('never borrows another client\'s group', () => {
    const memberships = [row('m1', 'A'), row('m2', 'B', { client_id: 'c2' })]
    expect(nextGroupTag('c1', 'm1', memberships)).toBeNull()
  })
})

/* ── The writers go through the rule ──────────────────────────── */
describe('the writers of one record keep the other in step', () => {
  it('the clients screen syncs memberships when an edit moves the tag', () => {
    const src = read('src/screens/clients/index.jsx')
    expect(src).toMatch(/const handleUpdateClient[\s\S]*?groupMembershipPlan\(/)
  })

  it('removing a chip re-tags the client', () => {
    const src = read('src/screens/project-detail/index.jsx')
    expect(src).toMatch(/const handleRemoveMember[\s\S]*?nextGroupTag\(/)
  })

  it('adding a member through the modal tags the client too', () => {
    const src = read('src/screens/project-detail/index.jsx')
    /* The bare hook is what left every modal-added member reading "פרטי"
       in the project's client list. */
    expect(src).not.toMatch(/<AddGroupMemberModal[\s\S]*?onSave=\{addMember\}/)
  })

  it('nobody hand-rolls the membership row any more', () => {
    for (const rel of ['src/screens/project-detail/index.jsx', 'src/modals/AddGroupMemberModal.jsx', 'src/screens/clients/index.jsx']) {
      expect(read(rel), rel).not.toMatch(/package_sessions_override:\s*null/)
    }
  })
})

/* ── The add-member picker says where the client lands ─────────── */
describe('"הוספת חבר" tells the truth about the project', () => {
  const LOCALES = ['he', 'en', 'es', 'fr']
  const load = (lang) => JSON.parse(
    readFileSync(new URL(`../../../packages/core/src/i18n/locales/${lang}/modalsClient.json`, import.meta.url), 'utf8'),
  )

  it('every locale names the two groups of clients and the move', () => {
    for (const lang of LOCALES) {
      const s = load(lang).addGroupMember
      expect(s.inProject, `${lang}.inProject`).toBeTruthy()
      expect(s.elsewhere, `${lang}.elsewhere`).toBeTruthy()
      expect(s.movesToProject, `${lang}.movesToProject`).toMatch(/\{\{project\}\}/)
    }
  })

  it('the modal splits the picker by project and warns before a move', () => {
    const src = read('src/modals/AddGroupMemberModal.jsx')
    expect(src).toMatch(/addGroupMember\.inProject/)
    expect(src).toMatch(/addGroupMember\.elsewhere/)
    expect(src).toMatch(/addGroupMember\.movesToProject/)
  })

  /* "1 חבר בקבוצה" is not Hebrew — the singular form has to spell the
     number out, as every other _one string in the app does. */
  it('the Hebrew delete dialog counts one and two in words', () => {
    const d = load('he').deleteGroup
    for (const key of ['members', 'futureMeetings', 'pastSessions', 'reminders']) {
      expect(d[`${key}_one`], `${key}_one`).not.toMatch(/\{\{count\}\}/)
      expect(d[`${key}_two`], `${key}_two`).toBeTruthy()
      expect(d[`${key}_two`], `${key}_two`).not.toMatch(/\{\{count\}\}/)
    }
  })
})
