/* ════════════════════════════════════════════════════════════════
   GOAL CATEGORIES AND A GOAL'S OWN ENTRIES
   ════════════════════════════════════════════════════════════════
   Pinned: an older account's manual bucket ("אחר"/"אישי", no key) is found
   instead of duplicated; an auto metric reuses its category by data source;
   a new manual bucket carries web's name; and a card lists only its own
   entries (plus legacy ones with no goal), newest first.
   ════════════════════════════════════════════════════════════════ */

import { describe, it, expect, vi } from 'vitest'

vi.mock('../src/lib/i18n', () => ({ default: { t: (k) => k } }))

const { findManualCategory, resolveGoalCategoryId, goalOwnEntries } = await import('../src/lib/goalPresets')

describe('findManualCategory', () => {
  it('prefers the keyed bucket', () => {
    const cats = [{ id: 'a', name: 'אישי', measurement_type: 'manual' }, { id: 'b', key: 'other', measurement_type: 'manual' }]
    expect(findManualCategory(cats).id).toBe('b')
  })

  it('finds a legacy bucket written before the key existed', () => {
    expect(findManualCategory([{ id: 'a', name: 'אחר', measurement_type: 'manual', builtin: false }]).id).toBe('a')
    expect(findManualCategory([{ id: 'a', name: 'אישי', measurement_type: 'manual' }]).id).toBe('a')
  })

  it('never claims a category the user named themselves', () => {
    expect(findManualCategory([{ id: 'a', name: 'ריצה', measurement_type: 'manual' }])).toBeNull()
  })
})

describe('resolveGoalCategoryId', () => {
  it('reuses the legacy manual bucket instead of creating a second one', async () => {
    const insert = vi.fn()
    await expect(resolveGoalCategoryId('other', [{ id: 'old', name: 'אחר', measurement_type: 'manual' }], insert)).resolves.toBe('old')
    expect(insert).not.toHaveBeenCalled()
  })

  it('creates the manual bucket with the key and the shared name', async () => {
    const insert = vi.fn(async (row) => ({ id: 'new', ...row }))
    await expect(resolveGoalCategoryId('other', [], insert)).resolves.toBe('new')
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ key: 'other', measurement_type: 'manual', name: 'presets:category.other.name' }))
  })

  it('reuses an auto category by its data source', async () => {
    const insert = vi.fn()
    await expect(resolveGoalCategoryId('income', [{ id: 'inc', data_source: 'transactions' }], insert)).resolves.toBe('inc')
  })

  it('rejects a metric it does not know', async () => {
    await expect(resolveGoalCategoryId('nope', [], vi.fn())).rejects.toThrow('goals:unknownMetric')
  })
})

describe('goalOwnEntries', () => {
  const cat = { id: 'cat', measurement_type: 'manual' }
  const entries = [
    { id: 'e1', goal_id: 'g1', category_id: 'cat', date: '2026-09-01' },
    { id: 'e2', goal_id: 'g2', category_id: 'cat', date: '2026-09-03' },
    { id: 'e3', goal_id: null, category_id: 'cat', date: '2026-09-05' },
    { id: 'e4', goal_id: 'g1', category_id: 'cat', date: '2026-09-04' },
  ]

  it("lists this goal's entries and legacy ones, newest first", () => {
    expect(goalOwnEntries(entries, { id: 'g1' }, cat).map((e) => e.id)).toEqual(['e3', 'e4', 'e1'])
  })

  it('an auto goal has no entries to list', () => {
    expect(goalOwnEntries(entries, { id: 'g1' }, { id: 'cat', measurement_type: 'auto' })).toEqual([])
  })
})
