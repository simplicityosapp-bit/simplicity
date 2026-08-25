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

/* ── Finding one project among many ──────────────────────────────
   The list was ordered by created_at and nothing else, so past ~8 projects
   there was no way to reach a specific one except by eye.

   Search follows the same shape as the leads board and the finance screen
   (matchLead / searchTransactions): lowercase both sides, split on
   whitespace, and require EVERY term to match, so a second word narrows
   rather than widens. A project card shows only its name as text — the
   other three fields are numbers — so the name is what is searched. */
const normText = (s?: string | null): string => String(s ?? '').toLowerCase().trim()

export function matchProject(
  project: { name?: string | null } | null | undefined,
  query: string,
): boolean {
  const terms = normText(query).split(/\s+/).filter(Boolean)
  if (!terms.length) return true
  if (!project) return false
  const name = normText(project.name)
  return terms.every((term) => name.includes(term))
}

export type ProjectSort = 'recent' | 'name' | 'income' | 'clients'
export const PROJECT_SORTS: ProjectSort[] = ['recent', 'name', 'income', 'clients']

/* Sorts the CARD rows (which carry the computed income/client counts), not
   the raw projects — the numbers being sorted on are derived per card.
   Returns a new array; the input is left alone.

   'recent' reproduces the old behaviour exactly (created_at descending) and
   stays the default, so nobody's list silently reorders under them. Ties in
   every other mode fall back to the name, so the order is stable rather than
   dependent on however the rows happened to arrive. */
export function sortProjectCards<T extends {
  project: { name?: string | null; created_at?: string | null }
  income?: number
  clientsCount?: number
}>(cards: ReadonlyArray<T>, sort: ProjectSort): T[] {
  const byName = (a: T, b: T) => String(a.project.name ?? '').localeCompare(String(b.project.name ?? ''), 'he')
  const out = [...cards]
  switch (sort) {
    case 'name':
      return out.sort(byName)
    case 'income':
      return out.sort((a, b) => (b.income ?? 0) - (a.income ?? 0) || byName(a, b))
    case 'clients':
      return out.sort((a, b) => (b.clientsCount ?? 0) - (a.clientsCount ?? 0) || byName(a, b))
    case 'recent':
    default:
      return out.sort((a, b) => {
        const ta = new Date(a.project.created_at ?? 0).getTime()
        const tb = new Date(b.project.created_at ?? 0).getTime()
        return tb - ta || byName(a, b)
      })
  }
}

/* ── Meetings ────────────────────────────────────────────────────
   A meeting does NOT carry a project_id, so the rule above does not apply
   to it. It binds to a SUBJECT — a client or a group — and reaches a
   project through that subject. Hence its own helper rather than a
   special case bolted onto belongsToProject.

   Only `pending` counts as upcoming: a confirmed meeting has become a
   session and a skipped one did not happen. Both are history. */
export interface ScopedMeeting {
  subject_type?: string | null
  subject_id?: string | null
  scheduled_at?: string | null
  status?: string | null
}

export function upcomingProjectMeetings<T extends ScopedMeeting>(
  meetings: ReadonlyArray<T>,
  groupIds: Set<string> | ReadonlySet<string>,
  clientIds: Set<string> | ReadonlySet<string>,
  now: number,
): T[] {
  return meetings
    .filter((m) => m.status === 'pending')
    .filter((m) => !!m.scheduled_at && new Date(m.scheduled_at).getTime() >= now)
    .filter((m) => (m.subject_type === 'group'
      ? !!m.subject_id && groupIds.has(m.subject_id)
      : m.subject_type === 'client' && !!m.subject_id && clientIds.has(m.subject_id)))
    .sort((a, b) => new Date(a.scheduled_at as string).getTime() - new Date(b.scheduled_at as string).getTime())
}
