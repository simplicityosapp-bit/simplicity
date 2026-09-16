/* ════════════════════════════════════════════════════════════════
   ADDING A GOAL OUTSIDE THE GOALS SCREEN
   ════════════════════════════════════════════════════════════════
   AddGoalModal hands back a metric, not a category. Home's quick-add and
   both project-page entry points passed that payload straight to insertGoal,
   so the row carried a `metric_key` column goals doesn't have and no
   category_id — every such save failed. They now share useAddGoal, whose
   resolver (lib/goalPresets) is pinned here.
   ════════════════════════════════════════════════════════════════ */
import { describe, it, expect, vi } from 'vitest'

/* lib/goalPresets registers its i18n bundle at load, which this DOM-less suite
   can't construct (see goal-manual-category.test.js) — a stand-in is enough,
   since what is pinned is the lookup, not the wording. */
vi.mock('@simplicity/core/i18n', () => ({ default: { addResourceBundle: () => {}, t: (k) => k } }))

const { resolveGoalCategoryId } = await import('../src/lib/goalPresets')

describe('resolveGoalCategoryId', () => {
  it('reuses the account manual bucket, legacy name included', async () => {
    const addCategory = vi.fn()
    await expect(resolveGoalCategoryId('other', [{ id: 'm', name: 'אחר', measurement_type: 'manual' }], addCategory)).resolves.toBe('m')
    expect(addCategory).not.toHaveBeenCalled()
  })

  it('reuses an auto category by data source', async () => {
    await expect(resolveGoalCategoryId('income', [{ id: 'inc', data_source: 'transactions' }], vi.fn())).resolves.toBe('inc')
  })

  it('creates the auto category the first time its metric is chosen', async () => {
    const addCategory = vi.fn(async (row) => ({ id: 'new', ...row }))
    await expect(resolveGoalCategoryId('leads_closings', [], addCategory)).resolves.toBe('new')
    const row = addCategory.mock.calls[0][0]
    expect(row).toMatchObject({ key: 'leads_closings', data_source: 'leads_closings', measurement_type: 'auto' })
    expect(row).not.toHaveProperty('hint')
  })

  it('refuses a metric it does not know rather than inserting garbage', async () => {
    await expect(resolveGoalCategoryId('metric_key', [], vi.fn())).rejects.toThrow()
  })
})
