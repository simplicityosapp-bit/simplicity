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
  /* The event ledger (migration 0100). The flow metrics are read from here
     rather than counted off the rows above, so a number survives the row
     being deleted — and, once the 30-day purge runs, being removed outright.
     The rows are still loaded: the drill-down lists them, and money and the
     two "as of" snapshots are not in the ledger. */
  tallies: 'report_tallies',
}

const EMPTY = Object.fromEntries(Object.keys(TABLES).map((k) => [k, []]))

/* WHY THIS RETURNS THREE STATES AND NOT TWO.
   When the read doesn't produce rows, the bag falls back to EMPTY and every
   metric computes as 0 — so the screen said "no activity this month", which
   is a false statement about the user's business rather than a visible
   glitch. `error` alone does not cover it: a query that never got to run
   sits at fetchStatus 'paused' (React Query parks fetches it believes are
   offline) with a null error and isLoading false, which lands in exactly the
   same silent hole. `unreachable` names both cases, so the screen can refuse
   to draw a report it doesn't have the data for. */
export function useReportsData() {
  const { data, status, fetchStatus, error, refetch, isFetching } = useQuery({
    queryKey: ['reports', 'raw'],
    queryFn: async () => {
      const keys = Object.keys(TABLES)
      const rows = await Promise.all(
        keys.map((k) => selectAllRows(() => supabase.from(TABLES[k]).select('*'))),
      )
      return Object.fromEntries(keys.map((k, i) => [k, rows[i]]))
    },
  })
  const paused = fetchStatus === 'paused' && data === undefined
  return {
    ...(data ?? EMPTY),
    /* 'idle' counts as still-settling, not as failure — otherwise the error
       card flashes for a frame on every mount, before the fetch starts. */
    loading: status === 'pending' && !paused,
    unreachable: !!error || paused,
    error: error?.message ?? null,
    refetch,
    refetching: isFetching,
  }
}
