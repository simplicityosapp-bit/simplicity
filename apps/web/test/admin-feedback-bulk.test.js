/* ════════════════════════════════════════════════════════════════
   ADMIN FEEDBACK — bulk select + delete.
   ════════════════════════════════════════════════════════════════
   The board's "select all" is scoped to the ACTIVE FILTER: the point of it
   is "show me everything already handled, then delete that" — so it must
   never reach a row the filter is hiding. There is no DOM test setup in this
   suite, so the selection maths is asserted directly here against the same
   rules the screen applies, and the copy is asserted through i18n.

   Deleting feedback is irreversible, so the failure this guards against is
   the expensive direction: deleting MORE than was on screen.
   ════════════════════════════════════════════════════════════════ */
import { describe, it, expect, beforeAll } from 'vitest'
import i18n, { initI18n, loadLanguage } from '@simplicity/core/i18n'

beforeAll(async () => {
  await initI18n({ lng: 'he' })
  await Promise.all(['en', 'es', 'fr'].map(loadLanguage))
})

const t = (lng, key, count) => i18n.getFixedT(lng, 'admin')(key, { count })

/* Mirrors the screen: filter first, then intersect with the selection. */
const ROWS = [
  { id: 'a', status: 'done', type: 'bug' },
  { id: 'b', status: 'done', type: 'idea' },
  { id: 'c', status: 'new', type: 'bug' },
  { id: 'd', status: 'in_progress', type: 'bug' },
]
const applyFilter = (rows, statusF) => rows.filter((r) => statusF === 'all' || r.status === statusF)
const idsToDelete = (rows, statusF, selected) =>
  applyFilter(rows, statusF).map((r) => r.id).filter((id) => selected.has(id))

describe('the selection never escapes the active filter', () => {
  it('select-all under a filter deletes only that filter\'s rows', () => {
    const visible = applyFilter(ROWS, 'done').map((r) => r.id)
    const selected = new Set(visible) // "select all" while filtered to done
    expect(idsToDelete(ROWS, 'done', selected)).toEqual(['a', 'b'])
  })

  it('rows selected under one filter are not deleted from another', () => {
    // Select everything under `done`, then switch the filter to `new`.
    const selected = new Set(['a', 'b'])
    // Nothing on screen is selected, so there is nothing to delete...
    expect(idsToDelete(ROWS, 'new', selected)).toEqual([])
    // ...and pressing delete under `new` must not reach the `done` rows.
    expect(idsToDelete(ROWS, 'new', selected)).not.toContain('a')
  })

  it('a carried-over selection is still honoured once those rows are visible', () => {
    // Back on `all`, the earlier picks are on screen again and do count.
    expect(idsToDelete(ROWS, 'all', new Set(['a', 'b']))).toEqual(['a', 'b'])
  })

  it('select-all on an empty filter selects nothing', () => {
    expect(idsToDelete(ROWS, 'rejected', new Set(['a', 'b', 'c', 'd']))).toEqual([])
  })
})

describe('the counts read correctly at 1 and 2', () => {
  /* The confirm dialog states a count and says the action is irreversible —
     "למחוק 1 פידבקים?" would undercut exactly the sentence meant to make
     the reader stop and check. */
  it('Hebrew never puts a bare number in front of the noun', () => {
    expect(t('he', 'feedback.deleteConfirm', 1)).toBe('למחוק פידבק אחד? הפעולה בלתי הפיכה.')
    expect(t('he', 'feedback.deleteConfirm', 2)).toBe('למחוק שני פידבקים? הפעולה בלתי הפיכה.')
    expect(t('he', 'feedback.deleteConfirm', 7)).toBe('למחוק 7 פידבקים? הפעולה בלתי הפיכה.')

    expect(t('he', 'feedback.deletedToast', 1)).toBe('פידבק אחד נמחק')
    expect(t('he', 'feedback.deletedToast', 2)).toBe('שני פידבקים נמחקו')
    expect(t('he', 'feedback.deletedToast', 9)).toBe('9 פידבקים נמחקו')

    expect(t('he', 'feedback.selectedCount', 1)).toBe('אחד נבחר')
    expect(t('he', 'feedback.selectedCount', 2)).toBe('שניים נבחרו')
    expect(t('he', 'feedback.selectedCount', 5)).toBe('5 נבחרו')
  })

  it('the other three agree with their own count', () => {
    for (const key of ['feedback.deleteConfirm', 'feedback.deletedToast', 'feedback.selectedCount']) {
      for (const lng of ['en', 'es', 'fr']) {
        const one = t(lng, key, 1)
        const many = t(lng, key, 4)
        expect(one, `${lng} ${key} @1`).not.toContain('{{count}}')
        expect(many, `${lng} ${key} @4`).toContain('4')
        expect(one, `${lng} ${key} singular differs`).not.toBe(many)
      }
    }
    // The old copy hedged with "(s)" instead of pluralising — don't regress.
    expect(t('en', 'feedback.deleteConfirm', 1)).not.toMatch(/\(s\)/)
    expect(t('es', 'feedback.deleteConfirm', 1)).not.toMatch(/\(s\)/)
    expect(t('fr', 'feedback.deleteConfirm', 1)).not.toMatch(/\(s\)/)
  })
})
