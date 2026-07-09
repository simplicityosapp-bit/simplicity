// Task write helpers shared by the tasks list + home quick-add paths (ported from
// web lib/api/tasks.js). Keep status ↔ completed_at in sync defensively: a
// status-driven write (e.g. picking a custom 'done'-meta status in AddTaskModal)
// sets status without completed_at — stamp it now so the task counts in
// reports/burndown/client timeline; reverting to 'todo' clears a stale
// completed_at so an open task isn't miscounted as done.
export function reconcileCompletion(row) {
  if (row.status === 'done' && (row.completed_at === undefined || row.completed_at === null)) {
    return { ...row, completed_at: new Date().toISOString() }
  }
  if (row.status === 'todo') {
    return { ...row, completed_at: null }
  }
  return row
}
