import { useTransactions } from '../../hooks/useTransactions'
import { useScheduledMeetings } from '../../hooks/useScheduledMeetings'
import { useClients } from '../../hooks/useClients'
import { useGroups } from '../../hooks/useGroups'
import { useRecurring } from '../../hooks/useRecurring'
import { useBookings } from '../../hooks/useBookings'
import { useScheduledMeetingsGeneration } from '../../hooks/useScheduledMeetingsGeneration'
import { useRecurringGeneration } from '../../hooks/useRecurringGeneration'
import { useBookingsGeneration } from '../../hooks/useBookingsGeneration'

/* ════════════════════════════════════════════════════════════════
   HOME GENERATORS — the materialisation engines, mounted unconditionally.
   ════════════════════════════════════════════════════════════════
   These three hooks turn scheduled/templated rows into real ones:
     • scheduled meetings  — recurring client/group meetings → pending rows
     • recurring engine    — templates → pending transactions
     • bookings            — auto-confirmed bookings → lead + calendar event

   They used to live inside AttentionWidget, on the assumption (stated in a
   comment there) that it "always mounts on home". It doesn't: every widget,
   including that one, can be switched off in Settings → widgets. Turning it
   off silently stopped booking materialisation altogether — useBookingsGeneration
   has no other mount anywhere in the app — and delayed the other two until the
   user happened to open the calendar / finance screen, which do host their own
   copies.

   Rendering NOTHING and mounting from HomeScreen itself (not from a widget)
   makes the guarantee real. All three engines are idempotent and carry their
   own in-flight latches, so co-existing with the calendar/finance mounts is
   safe — whichever runs first materialises the rows, the other finds nothing
   owed.
   ════════════════════════════════════════════════════════════════ */
export default function HomeGenerators() {
  const { transactions, addTransaction, loading: transactionsLoading } = useTransactions()
  const { meetings, addMeeting, loading: meetingsLoading } = useScheduledMeetings()
  const { clients } = useClients()
  const { groups } = useGroups()
  const { templates } = useRecurring()
  const { bookings, materialize, loading: bookingsLoading } = useBookings()

  useScheduledMeetingsGeneration({ clients, groups, meetings, meetingsLoading, addMeeting })
  useRecurringGeneration({
    templates,
    transactions,
    addTransaction,
    scheduledMeetings: meetings,
    transactionsLoading,
    scheduledMeetingsLoading: meetingsLoading,
  })
  useBookingsGeneration({ bookings, loading: bookingsLoading, materialize })

  return null
}
