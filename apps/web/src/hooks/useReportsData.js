import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { selectAllRows } from '../lib/api/paginate'

/* ════════════════════════════════════════════════════════════════
   REPORTS DATA — the seven tables the reports engine reads, RAW.
   ════════════════════════════════════════════════════════════════
   Every other list hook in the app filters `deleted_at` server-side,
   which is right for the screens they feed and wrong for reports: a
   period is a record of what happened, and deleting the row afterwards
   does not un-happen the event. Reports asked the same six hooks as
   everyone else, so soft-deleted rows never reached the engine at all —
   a finished month quietly lost work as the user tidied up.

   Loading raw moves the decision to where it belongs: core's
   computeReportForRange decides per metric what a deleted row means
   (flow metrics count it; "as of" snapshots exclude it only once it was
   deleted BY that date). This hook just refuses to pre-empt that.

   Mirrors apps/mobile/src/hooks/useReportsData.js, which has always
   loaded raw — web was the odd one out.

   Its own query keys, never the shared ['leads']/['clients']/… ones:
   those cache entries are written optimistically by the editing screens
   and must keep holding live rows only.

   Reports aggregate whole history, so every read paginates — a plain
   select caps at 1000 rows and would under-count silently.
   ════════════════════════════════════════════════════════════════ */

/* group_members has no deleted_at filter to skip and groups is only
   read for drill-down labels; both are here so the bag is built in one
   place rather than half here and half from the shared hooks. */
const TABLES = {
  leads: 'leads',
  clients: 'clients',
  sessions: 'sessions',
  transactions: 'transactions',
  tasks: 'tasks',
  groupMembers: 'group_members',
  groups: 'groups',
}

const EMPTY = Object.fromEntries(Object.keys(TABLES).map((k) => [k, []]))

export function useReportsData() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['reports', 'raw'],
    queryFn: async () => {
      const keys = Object.keys(TABLES)
      const rows = await Promise.all(
        keys.map((k) => selectAllRows(() => supabase.from(TABLES[k]).select('*'))),
      )
      return Object.fromEntries(keys.map((k, i) => [k, rows[i]]))
    },
  })
  return { ...(data ?? EMPTY), loading: isLoading, error: error?.message ?? null }
}
