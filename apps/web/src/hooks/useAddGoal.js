import { useCallback } from 'react'
import { resolveGoalCategoryId } from '../lib/goalPresets'
import { useGoals } from './useGoals'
import { useGoalCategories } from './useGoalCategories'

/* ════════════════════════════════════════════════════════════════
   useAddGoal — save what AddGoalModal hands back.
   ════════════════════════════════════════════════════════════════
   AddGoalModal returns a METRIC (metric_key), not a category: the category
   is created on demand the first time a goal picks that metric. Only the
   goals screen resolved it. Home's quick-add, the project ring and the
   project quick row passed the modal's payload straight to addGoal, so the
   insert carried a `metric_key` column `goals` does not have and no
   category_id — every goal added from those three places failed to save.
   They all go through here now (resolver: lib/goalPresets).
   ════════════════════════════════════════════════════════════════ */

export function useAddGoal() {
  const { categories, addCategory } = useGoalCategories()
  const { addGoal } = useGoals()
  return useCallback(async ({ metric_key, ...rest }) => {
    const category_id = await resolveGoalCategoryId(metric_key, categories, addCategory)
    return addGoal({ category_id, ...rest })
  }, [categories, addCategory, addGoal])
}
