/* ════════════════════════════════════════════════════════════════
   PROJECTS — "does this row belong to the project?" — ONE rule.

   A transaction / task / any row can reach a project two ways: it is
   tagged to the project itself (project_id), or it belongs to a CLIENT
   who sits in the project. Both count — a coach who tags the client and
   not every payment still expects the money to show up in the project.

   The precedence matters and is the whole reason this lives here:
   an explicit project_id WINS. The client fallback applies only to rows
   carrying NO project_id of their own. Without that guard a row tagged
   to project A whose client sits in project B is counted in BOTH, and
   the same project reports two different totals depending on which
   screen you happen to be standing on.

   That guard used to exist only in the projects-list card. The project
   screen, its income chart and the mobile twin each re-implemented the
   rule WITHOUT it, so "הכנסה החודש" and "משימות" disagreed with the card
   that had just been tapped. Every caller now shares these helpers.
   ════════════════════════════════════════════════════════════════ */

export interface ProjectScopedRow {
  project_id?: string | null
  client_id?: string | null
}

/* True when `row` belongs to `projectId` — tagged directly, or (only when
   untagged) via a client in `projectClientIds`. */
export function belongsToProject(
  row: ProjectScopedRow | null | undefined,
  projectId: string,
  projectClientIds: Set<string> | ReadonlySet<string>,
): boolean {
  if (!row || !projectId) return false
  if (row.project_id) return row.project_id === projectId
  return !!row.client_id && projectClientIds.has(row.client_id)
}

/* The ids of every client sitting in `projectId`. Pass the FULL client list;
   soft-deleted clients are already filtered out upstream by the API layer. */
export function projectClientIdSet(
  clients: ReadonlyArray<{ id: string; project_id?: string | null }>,
  projectId: string,
): Set<string> {
  return new Set(clients.filter((c) => c.project_id === projectId).map((c) => c.id))
}

/* Every row of `rows` that belongs to `projectId`. */
export function scopeToProject<T extends ProjectScopedRow>(
  rows: ReadonlyArray<T>,
  projectId: string,
  projectClientIds: Set<string> | ReadonlySet<string>,
): T[] {
  return rows.filter((r) => belongsToProject(r, projectId, projectClientIds))
}
