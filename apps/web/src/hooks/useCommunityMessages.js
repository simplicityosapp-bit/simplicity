import { useCallback, useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import {
  listCommunityMessages, listPinnedMessages, MESSAGES_PAGE, insertCommunityMessage, softDeleteCommunityMessage,
  addReaction, removeReaction, insertMentions, setMessagePinned, reportMessage,
} from '../lib/api/communityMessages'
import { getCommunityProfileByUserId } from '../lib/api/communityProfiles'

/* ════════════════════════════════════════════════════════════════
   useCommunityMessages — the room's data + the app's FIRST realtime channel.
   ════════════════════════════════════════════════════════════════
   Read/write follow the house style (useQuery + plain async writers that
   patch the cache, as in useBookingPages — this repo has no useMutation).
   The realtime half is new ground: nothing here has ever opened a channel, so
   the shape below is the precedent, and the reasoning is written out.

   ─── THE CHANNEL ───────────────────────────────────────────────────────────
   One channel, INSERT only, for the lifetime of the mounted screen. Realtime
   re-checks the SELECT policy per subscriber before delivering, so the server
   decides who sees what — the client filters nothing.

   ─── WHY INSERT ONLY ───────────────────────────────────────────────────────
   Subscribing to UPDATE would be dead code, not caution. When a message is
   soft-deleted the updated row stops satisfying the SELECT policy
   (`deleted_at IS NULL`, 0081), so realtime filters the event out for every
   subscriber and it is never delivered. This is 0081's documented, accepted
   cost: a deletion is enforced everywhere instantly but propagates live
   nowhere. The deleter's own client drops the row locally (see remove());
   everyone else keeps seeing it until their next refetch. Making that instant
   needs a broadcast channel, not a weaker policy.

   ─── THE EMBED PROBLEM ─────────────────────────────────────────────────────
   A postgres_changes payload is the raw row. It has no
   community_profiles(...) embed, so a message from a member this client has
   never seen arrives with a user_id and no name. We look the author up in the
   messages already cached first (the common case in a chatty room — one
   fetch per NEW author, not per message) and only hit the network otherwise.

   ─── THE HAND-OFF / RECONNECT GAP ──────────────────────────────────────────
   postgres_changes does NOT replay events missed while the socket was down,
   and a message inserted in the window between the initial fetch's snapshot
   and the subscription going live belongs to neither the fetch nor any
   delivered event. Nothing else recovers it: the app's QueryClient has
   staleTime 60s + refetchOnWindowFocus off, and this screen never calls
   refetch — so a message lost that way stays lost for the whole session.
   The close: refetch() on every 'SUBSCRIBED' status. It fires on the initial
   join AND every rejoin, so its snapshot (>= subscribe time) sweeps up
   anything committed before the socket was live, on first load and after a
   drop alike. A vanishing residual remains — an event delivered during that
   refetch's own in-flight window, whose row is then overwritten by the
   refetch result — which self-heals on the next event or rejoin. Fully
   closing it needs event buffering across the fetch; not worth it at this
   scale, and it is documented rather than hidden.
   ════════════════════════════════════════════════════════════════ */
const KEY = ['communityMessages']
const PINNED_KEY = ['communityPinned']

/* Same shape the embed produces, so a realtime row and a fetched row are
   indistinguishable downstream. */
const withAuthor = (row, author) => ({ ...row, community_profiles: author ?? null })

export function useCommunityMessages({ enabled = true } = {}) {
  const qc = useQueryClient()
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: KEY,
    queryFn: () => listCommunityMessages(),
    enabled,
    /* staleTime ∞: this list is realtime-driven, and any React Query refetch
       (mount, refocus) re-runs listCommunityMessages() with no cursor → newest
       page only → it would REPLACE and truncate paged-in history. Freshness
       comes from the channel + catchUp() below, not from refetching. */
    staleTime: Infinity,
  })
  const messages = data ?? []

  /* Pinned bar: a dedicated query, independent of the paginated feed window, so
     a message pinned earlier than the loaded page still shows (otherwise pins
     go invisible the moment the room passes one page). */
  const pinnedQ = useQuery({ queryKey: PINNED_KEY, queryFn: listPinnedMessages, enabled, staleTime: 30_000 })
  const pinned = pinnedQ.data ?? []

  /* Pagination: the query above lands the newest page; loadOlder pages back.
     hasMore is seeded once from the first page's fullness (a full page implies
     there's older history), then owned by loadOlder. */
  const [hasMore, setHasMore] = useState(false)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const loadingOlderRef = useRef(false)   /* in-flight guard (state lags a double-tap) */
  const initedRef = useRef(false)
  useEffect(() => {
    if (!initedRef.current && data) {
      initedRef.current = true
      setHasMore(data.length >= MESSAGES_PAGE)
    }
  }, [data])

  /* On (re)subscribe, CATCH UP the reconnect gap without wiping paged history:
     fetch the newest page and MERGE it (dedup by id) instead of replacing the
     cache. The old code called refetch() here, which replaced the cache with
     the newest 50 on every rejoin — silently discarding every older page the
     user had loaded. Routed through a ref so the subscribe effect can call the
     latest without re-subscribing. Also refreshes the pinned set. */
  const catchUp = useCallback(async () => {
    try {
      const recent = await listCommunityMessages()
      qc.setQueryData(KEY, (prev) => {
        const list = prev ?? []
        const ids = new Set(list.map((m) => m.id))
        const fresh = recent.filter((m) => !ids.has(m.id))
        if (!fresh.length) return list
        const next = [...list, ...fresh]
        next.sort((a, b) =>
          a.created_at < b.created_at ? -1
            : a.created_at > b.created_at ? 1
              : a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
        return next
      })
    } catch { /* the channel keeps delivering; the next rejoin retries */ }
    qc.invalidateQueries({ queryKey: PINNED_KEY })
  }, [qc])
  const catchUpRef = useRef(catchUp)
  useEffect(() => { catchUpRef.current = catchUp }, [catchUp])

  /* Merge one row in, deduped by id and kept in (created_at, id) order.
     Sorted-insert, NOT append: the realtime handler is async (it may await an
     author lookup), so two arrivals delivered in order can be applied out of
     order — a blind append would render the later one above the earlier and
     never correct it. created_at is an ISO-8601 string, so a lexical compare
     is chronological; id breaks ties for a stable order. The initial list is
     already sorted, so this only ever slots a new row into place.
     id is the identity — the sender gets its own INSERT back over the channel
     as well as from insert(), and a rejoin can re-deliver — first writer wins. */
  const upsert = useCallback((row) => {
    qc.setQueryData(KEY, (prev) => {
      const list = prev ?? []
      if (list.some((m) => m.id === row.id)) return list
      const next = [...list, row]
      next.sort((a, b) =>
        a.created_at < b.created_at ? -1
          : a.created_at > b.created_at ? 1
            : a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
      return next
    })
  }, [qc])

  /* Add/remove one (emoji, user) on a message's embedded reactions, IDEMPOTENTLY
     — so the same call serves the optimistic toggle AND its own realtime echo
     (and a rejoin replay) without ever double-counting. */
  const applyReaction = useCallback((messageId, emoji, userId, add) => {
    qc.setQueryData(KEY, (prev) => (prev ?? []).map((m) => {
      if (m.id !== messageId) return m
      const rs = m.community_message_reactions ?? []
      const exists = rs.some((r) => r.user_id === userId && r.emoji === emoji)
      if (add === exists) return m   // nothing to change
      return {
        ...m,
        community_message_reactions: add
          ? [...rs, { emoji, user_id: userId }]
          : rs.filter((r) => !(r.user_id === userId && r.emoji === emoji)),
      }
    }))
  }, [qc])

  useEffect(() => {
    if (!enabled) return undefined
    let cancelled = false

    const channel = supabase
      .channel('community_messages')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'community_messages' },
        async (payload) => {
          const row = payload?.new
          if (!row?.id || cancelled) return
          /* Resolve the author without a round trip when we can. */
          const cached = (qc.getQueryData(KEY) ?? [])
            .find((m) => m.user_id === row.user_id && m.community_profiles)
          let author = cached?.community_profiles ?? null
          if (!author) {
            try { author = await getCommunityProfileByUserId(row.user_id) } catch { author = null }
          }
          /* A null author is survivable — the row renders with the fallback
             name — so a failed lookup must not swallow the message. */
          if (!cancelled) upsert(withAuthor(row, author))
        },
      )
      /* Reactions live/leave. INSERT carries the new row; DELETE carries the
         full OLD row thanks to REPLICA IDENTITY FULL (0087), so we know which
         (message, user, emoji) left. applyReaction is idempotent, so our own
         echoes are harmless. */
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'community_message_reactions' },
        (payload) => {
          const r = payload?.new
          if (r?.message_id && !cancelled) applyReaction(r.message_id, r.emoji, r.user_id, true)
        },
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'community_message_reactions' },
        (payload) => {
          const r = payload?.old
          if (r?.message_id && !cancelled) applyReaction(r.message_id, r.emoji, r.user_id, false)
        },
      )
      /* On join AND every rejoin, CATCH UP (merge the newest page) to sweep up
         anything inserted while the socket wasn't live (see THE HAND-OFF /
         RECONNECT GAP above) — without wiping loaded older pages. Via the ref so
         this doesn't have to be an effect dependency. */
      .subscribe((status) => {
        if (status === 'SUBSCRIBED' && !cancelled) catchUpRef.current?.()
      })

    return () => { cancelled = true; supabase.removeChannel(channel) }
  }, [enabled, qc, upsert, applyReaction])

  /* The sender already knows their own profile, so no fetch and no
     embed-on-insert dependency: pass it in and the row matches the embed's
     shape exactly. */
  /* mentions: [{ user_id, display_name }] the composer resolved from its
     @-picker. We store them (→ trigger → recipient notifications) and add them
     to the optimistic embed so the sender's own @-highlight shows at once. */
  const send = useCallback(async (content, author, replyToId = null, mentions = []) => {
    const row = await insertCommunityMessage(replyToId ? { content, reply_to_id: replyToId } : { content })
    const optimistic = {
      ...withAuthor(row, author ?? null),
      community_message_mentions: mentions.map((mn) => ({
        mentioned_user_id: mn.user_id,
        community_profiles: { display_name: mn.display_name },
      })),
    }
    upsert(optimistic)
    /* upsert is first-writer-wins; the realtime echo can beat this insert's
       resolution and slot the row WITHOUT the mention embed, in which case
       upsert just no-oped. Overwrite in place so the sender's own @-highlight
       shows immediately either way. */
    if (mentions.length) {
      qc.setQueryData(KEY, (prev) => (prev ?? []).map((m) => (m.id === optimistic.id ? { ...m, ...optimistic } : m)))
    }
    if (mentions.length) {
      /* A mention-insert failure must not lose the message — the row is already
         up. Surface nothing; the highlight/notification just won't land. */
      try { await insertMentions(row.id, mentions.map((mn) => mn.user_id)) } catch { /* noop */ }
    }
    return row
  }, [upsert, qc])

  /* Confirm-then-patch (NOT optimistic): the row leaves this client's list
     only AFTER the soft-delete succeeds — so a failed delete needs no
     rollback, it simply never left. The row can't come back over realtime
     (the soft-delete UPDATE is never delivered, see the UPDATE note above),
     and refetching would only re-prove what the SELECT policy guarantees. */
  const remove = useCallback(async (id) => {
    await softDeleteCommunityMessage(id)
    qc.setQueryData(KEY, (prev) => (prev ?? []).filter((m) => m.id !== id))
  }, [qc])

  /* Toggle my reaction: flip the cache optimistically off the current embedded
     state, fire the matching insert/delete, and revert on failure. userId is
     passed in (the caller holds the profile) so the optimistic path stays
     synchronous — no getSession round-trip before the UI updates. */
  const toggleReaction = useCallback(async (messageId, emoji, userId) => {
    const msg = (qc.getQueryData(KEY) ?? []).find((m) => m.id === messageId)
    const has = (msg?.community_message_reactions ?? []).some((r) => r.user_id === userId && r.emoji === emoji)
    applyReaction(messageId, emoji, userId, !has)
    try {
      if (has) await removeReaction(messageId, emoji)
      else await addReaction(messageId, emoji)
    } catch (e) {
      applyReaction(messageId, emoji, userId, has)   // revert
      throw e
    }
  }, [qc, applyReaction])

  /* Pin/unpin (admin). Optimistic; revert via refetch on failure. */
  const setPinned = useCallback(async (messageId, pinned) => {
    const now = pinned ? new Date().toISOString() : null
    qc.setQueryData(KEY, (prev) => (prev ?? []).map((m) => (m.id === messageId ? { ...m, pinned_at: now } : m)))
    /* The pinned bar reads its own query (PINNED_KEY) so it survives pagination
       — patch it too, so a pin/unpin shows in the bar immediately. */
    qc.setQueryData(PINNED_KEY, (prev) => {
      const list = prev ?? []
      if (!pinned) return list.filter((m) => m.id !== messageId)
      if (list.some((m) => m.id === messageId)) return list
      const msg = (qc.getQueryData(KEY) ?? []).find((m) => m.id === messageId)
      return msg ? [{ ...msg, pinned_at: now }, ...list] : list
    })
    try { await setMessagePinned(messageId, pinned) } catch (e) {
      qc.invalidateQueries({ queryKey: KEY })
      qc.invalidateQueries({ queryKey: PINNED_KEY })
      throw e
    }
  }, [qc])

  /* Flag a message (member). No cache change — reports live in the admin queue. */
  const report = useCallback((messageId, reason) => reportMessage(messageId, reason), [])

  /* Page back into history: fetch the window older than the oldest row held and
     prepend it, deduped and re-sorted. hasMore closes when a short page comes
     back (top reached) or nothing new does. The caller anchors scroll around
     this so the viewport doesn't jump. */
  const loadOlder = useCallback(async () => {
    if (loadingOlderRef.current) return   // in-flight guard: a rapid double-tap beats the loadingOlder state
    const current = qc.getQueryData(KEY) ?? []
    if (!current.length) return
    loadingOlderRef.current = true
    setLoadingOlder(true)
    try {
      const older = await listCommunityMessages({ before: current[0].created_at, limit: MESSAGES_PAGE })
      let added = 0
      qc.setQueryData(KEY, (prev) => {
        const list = prev ?? []
        const ids = new Set(list.map((m) => m.id))
        const fresh = older.filter((m) => !ids.has(m.id))
        added = fresh.length
        if (!fresh.length) return list
        const next = [...fresh, ...list]
        next.sort((a, b) =>
          a.created_at < b.created_at ? -1
            : a.created_at > b.created_at ? 1
              : a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
        return next
      })
      setHasMore(older.length >= MESSAGES_PAGE && added > 0)
    } catch {
      /* Leave hasMore as-is so the button stays available for a retry. */
    } finally {
      loadingOlderRef.current = false
      setLoadingOlder(false)
    }
  }, [qc])

  return {
    messages, pinned, loading: isLoading, error: error?.message ?? null,
    send, remove, toggleReaction, setPinned, report, refetch,
    hasMore, loadingOlder, loadOlder,
  }
}
