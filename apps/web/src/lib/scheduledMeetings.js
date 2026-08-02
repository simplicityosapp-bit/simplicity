/* ════════════════════════════════════════════════════════════════
   SCHEDULED MEETINGS — the browser-side half: confirming, skipping and
   reviewing the meetings the engine materialised.

   The ENGINE (which occurrences a recurring slot owes) moved to
   @simplicity/core → domain/scheduledMeetings, because the nightly cron
   runs it too, inside a Deno edge function. One implementation, so a rule
   fixed in one place cannot go stale in the other. What stays here is
   everything that only makes sense with a user watching: toasts, undo,
   and the review-window filter.
   ════════════════════════════════════════════════════════════════ */

import { generateScheduledMeetings, staleScheduledMeetingIds } from '@simplicity/core'
import i18n from '@simplicity/core/i18n'
/* No showToast here any more: confirm and skip both register an undo, and the
   undo toast carries the same wording plus a way back. Two toasts firing for
   one action just stacked on top of each other. */
import { showError } from './toast'
import { pushUndo } from './undo'

const MS_PER_DAY = 24 * 60 * 60 * 1000
const PAST_LOOKBACK_DAYS = 14

/* The engine itself now lives in @simplicity/core (domain/scheduledMeetings)
   so the nightly cron edge function runs the very same rules. Re-exported
   here because every caller — and the tests — already import it from this
   path, and because this file keeps the surrounding confirm / skip / review
   helpers that DO belong to the browser (toasts, undo). */
export { generateScheduledMeetings }

/* Ids of FUTURE pending meetings left behind when a recurring slot changes.
   It lives in core beside the generator: both answer "does this instant fall on
   that slot?", and when only one of them knew about time zones the two could
   disagree the moment the runtime wasn't in Israel. */
export { staleScheduledMeetingIds }

/* Next session number for a meeting's subject — count of the subject's
   existing sessions + 1 (mirrors ClientDrawer / project-detail). */
function nextSessionNum(sessions, m) {
  const owned = m.subject_type === 'group'
    ? (sessions || []).filter((s) => s.group_id === m.subject_id)
    : (sessions || []).filter((s) => s.client_id === m.subject_id)
  return owned.length + 1
}

/* Confirming a scheduled meeting "happened" MATERIALISES a real session and
   links it via scheduled_meetings.session_id — the schema link that was
   designed but never wired, which is why a confirmed meeting never showed up
   in the client/group card or counted toward sessions. Dedup: if a session is
   already linked, just flip the status. Best-effort: if the session insert
   fails, still mark confirmed so the row doesn't get stuck. Shared by the home
   review widget and the calendar event-details flow so both surfaces update
   the card identically. */
export async function confirmScheduledMeeting({ meeting, sessions, addSession, updateMeeting, removeSession, putBackSession, clients = [] }) {
  try {
    /* Captured BEFORE anything changes, so undo restores what was actually
       there rather than assuming 'pending' / null. */
    const prevStatus = meeting.status
    const prevSessionId = meeting.session_id ?? null
    /* Per-session clients bill each meeting through the explicit one-off charge
       prompt (the calendar's billSession), so auto-materialising a session here
       too would double-count. The calendar screen guarded this inline; centralise
       it in the helper so EVERY surface (home review widget, today-tile drill,
       calendar) behaves identically instead of the home surfaces silently
       creating a billable session the calendar deliberately avoids. */
    const subjectClient = meeting.subject_type === 'client'
      ? (clients || []).find((c) => c.id === meeting.subject_id)
      : null
    const perSession = subjectClient?.billing_mode === 'per_session'
    /* Which session, if any, this confirmation brought into existence. Kept
       mutable: undo soft-deletes it, redo restores THAT SAME row rather than
       inserting a new one, so ids stay stable across repeated undo/redo. */
    let madeSessionId = null
    if (meeting.session_id || perSession) {
      await updateMeeting(meeting.id, { status: 'confirmed' })
    } else {
      const isGroup = meeting.subject_type === 'group'
      let session = null
      /* Best-effort: if the session insert fails we still mark the meeting
         confirmed (just without a link) — only a failure of that final write
         is a real failure worth surfacing. */
      try {
        session = await addSession({
          date: meeting.scheduled_at,
          summary: null,
          notes: null,
          client_id: isGroup ? null : meeting.subject_id,
          group_id: isGroup ? meeting.subject_id : null,
          subject_type: meeting.subject_type,
          subject_id: meeting.subject_id,
          num: nextSessionNum(sessions, meeting),
        })
      } catch { /* session insert failed — fall through to mark confirmed */ }
      madeSessionId = session?.id ?? null
      await updateMeeting(meeting.id, session ? { status: 'confirmed', session_id: session.id } : { status: 'confirmed' })
    }

    /* Confirming is the most consequential one-tap action on the home screen:
       it materialises a real session, which feeds the client's session count
       and their balance. It had no way back — no confirm step, no undo — while
       merely snoozing a client did offer one. It offers one now.

       The undo toast REPLACES the plain confirmation toast rather than
       stacking with it; it carries the same wording plus the way out. */
    pushUndo({
      label: i18n.t('calendar:toast.meetingConfirmed'),
      undo: async () => {
        if (madeSessionId && removeSession) await removeSession(madeSessionId, { silent: true })
        await updateMeeting(meeting.id, { status: prevStatus, session_id: prevSessionId })
      },
      redo: async () => {
        if (madeSessionId && putBackSession) await putBackSession(madeSessionId)
        await updateMeeting(meeting.id, { status: 'confirmed', session_id: madeSessionId ?? prevSessionId })
      },
    })
  } catch {
    showError(i18n.t('calendar:toast.actionFailed'))
  }
}

/* Log the one-off held session that BILLS a per-session client for a confirmed
   meeting — mirrors the calendar's billSession (clientBalance accrues held ×
   price_per_session). Offered as an explicit "charge?" step AFTER confirming,
   so per-session clients are billed the same way on the home surfaces and the
   calendar. The session is intentionally unlinked from the meeting (like the
   calendar), a standalone charge. */
export async function billPerSessionMeeting({ meeting, sessions, addSession }) {
  const num = (sessions || []).filter((s) => !s.deleted_at && s.client_id === meeting.subject_id).length + 1
  return addSession({
    date: meeting.scheduled_at,
    summary: null,
    notes: null,
    client_id: meeting.subject_id,
    group_id: null,
    subject_type: 'client',
    subject_id: meeting.subject_id,
    num,
  })
}

/* Didn't happen: mark skipped and drop any session we materialised for it
   (clearing the link). Linked-expense handling stays with the caller. */
/* "It didn't happen" — flips the meeting to skipped, drops any session that
   was materialised for it, and skips the expenses that were only owed because
   the meeting was going to take place (an `on_meeting` recurring template).
   `linkedTxs` is passed in rather than derived here so this stays a meetings
   helper; the caller that knows about recurring templates finds them.

   All of it is reversed by ONE undo. removeSession is called with silent:true
   because it would otherwise register an undo of its own — and pushUndo is
   single-level, so the last registration wins and everything else would be
   stranded half-applied.

   `label` overrides the undo toast's wording. The mechanics of "didn't
   happen" and "cancelled in advance" are identical — same status, same
   session and expense unwinding — but a coach who just cancelled next week's
   meeting should not be told it was "דולגה". */
export async function skipScheduledMeeting({ meeting, updateMeeting, removeSession, putBackSession, linkedTxs = [], setTxStatus, label }) {
  try {
    const prevStatus = meeting.status
    const prevSessionId = meeting.session_id ?? null
    const droppedSessionId = meeting.session_id || null
    /* Each linked expense's status BEFORE we touch it — restoring to a
       hard-coded 'pending' would resurrect one the user had already skipped. */
    const prevTx = (linkedTxs || []).map((t) => ({ id: t.id, status: t.status }))

    await updateMeeting(meeting.id, { status: 'skipped', session_id: null })
    if (droppedSessionId && removeSession) await removeSession(droppedSessionId, { silent: true })
    if (setTxStatus) for (const t of prevTx) await setTxStatus(t.id, 'skipped')

    pushUndo({
      label: label || i18n.t('calendar:toast.meetingSkipped'),
      undo: async () => {
        if (droppedSessionId && putBackSession) await putBackSession(droppedSessionId)
        await updateMeeting(meeting.id, { status: prevStatus, session_id: prevSessionId })
        if (setTxStatus) for (const t of prevTx) await setTxStatus(t.id, t.status)
      },
      redo: async () => {
        await updateMeeting(meeting.id, { status: 'skipped', session_id: null })
        if (droppedSessionId && removeSession) await removeSession(droppedSessionId, { silent: true })
        if (setTxStatus) for (const t of prevTx) await setTxStatus(t.id, 'skipped')
      },
    })
  } catch {
    showError(i18n.t('calendar:toast.actionFailed'))
  }
}

/* Move a meeting to another date/time.

   NOT an update of scheduled_at, and that is the whole point. The generator
   dedups on the exact (subject, instant) key of every existing row, whatever
   its status — so simply moving the row frees the original slot's key and the
   very next mount of the calendar or the home screen materialises the old
   occurrence again, leaving the coach with the meeting in both places.

   Instead: the original row STAYS on its instant as 'skipped' (holding the key
   down — the same trick the duplicate resolver's hideMeeting uses) and the new
   time gets a fresh pending row. Applied uniformly, including to a one-off
   meeting that sits on no recurring slot: telling the two apart means
   re-deriving the subject's slot here, and a spare invisible row costs less
   than a second copy of that rule going stale. A skipped meeting renders
   nowhere — the calendar feed keeps only pending/confirmed, and the home
   tile filters it out explicitly.

   Throws so the caller can keep its form open: the partial-unique index on
   (user, subject, scheduled_at) WHERE pending rejects a move onto a slot the
   same subject already has, and that has to reach the coach as an error
   rather than as a silently dropped save. */
export async function rescheduleScheduledMeeting({ meeting, at, updateMeeting, addMeeting, removeMeeting }) {
  const prevStatus = meeting.status
  const created = await addMeeting({
    subject_type: meeting.subject_type,
    subject_id: meeting.subject_id,
    scheduled_at: at,
    status: 'pending',
  })
  /* Only once the new row exists — if the insert is rejected the original is
     left exactly as it was, rather than cancelled with nothing to replace it. */
  await updateMeeting(meeting.id, { status: 'skipped', session_id: null })

  /* Undo re-inserts rather than un-deletes: removeMeeting is a hard delete, so
     the replacement comes back with a fresh id. Tracked in `liveId` so a redo
     after an undo still removes the row that is actually there. */
  let liveId = created?.id
  pushUndo({
    label: i18n.t('calendar:toast.meetingRescheduled'),
    undo: async () => {
      if (liveId && removeMeeting) await removeMeeting(liveId)
      await updateMeeting(meeting.id, { status: prevStatus })
    },
    redo: async () => {
      const again = await addMeeting({
        subject_type: meeting.subject_type,
        subject_id: meeting.subject_id,
        scheduled_at: at,
        status: 'pending',
      })
      liveId = again?.id
      await updateMeeting(meeting.id, { status: 'skipped', session_id: null })
    },
  })
  return created
}

/* Visible-in-widget filter: a meeting that's already in the past, no
   older than 14 days, and still pending. Sorted oldest-first so the
   user clears them in chronological order. */
export function pendingMeetingsToReview(meetings, now = new Date()) {
  const cutoff = new Date(now.getTime() - PAST_LOOKBACK_DAYS * MS_PER_DAY)
  return (meetings || [])
    .filter((m) => m.status === 'pending')
    .filter((m) => {
      const at = new Date(m.scheduled_at)
      return at <= now && at >= cutoff
    })
    .sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at))
}
