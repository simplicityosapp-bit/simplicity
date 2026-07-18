import { Fragment, useEffect, useRef, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { MessagesSquare, Send, ChevronDown, ChevronUp, X, Pin, Search, ArrowUp, CalendarDays } from 'lucide-react'
import { fmtRelativeDay } from '@simplicity/core'
import { useCommunityProfile } from '../../hooks/useCommunityProfile'
import { useCommunityMessages } from '../../hooks/useCommunityMessages'
import { useCommunitySearch } from '../../hooks/useCommunitySearch'
import { useCommunityMembers } from '../../hooks/useCommunityMembers'
import { reasonForMessageWriteError } from '../../lib/api/communityMessages'
import { useAuth } from '../../auth/AuthContext'
import { isAdminUser } from '../../lib/admin'
import ConfirmModal from '../../modals/ConfirmModal'
import CommunityMessage from './CommunityMessage'
import CommunityAvatar from './CommunityAvatar'
import CommunityNotifications from './CommunityNotifications'
import CommunityModeration from './CommunityModeration'
import CommunityProfileCard from './CommunityProfileCard'
import { ROUTES } from '../../lib/routes'
import { useT } from '../../i18n/useT'
import './CommunityScreen.css'
import { Box, Txt, Btn, Input } from '../../components/ui'

/* The one global room. Oldest at the top, newest at the bottom, composer
   pinned under it — a chat, not a feed.

   The gate is the same shape InvoiceConnection uses for a direct-URL hit on
   the free plan: wait for the check, then <Navigate replace>. Deliberately
   not the App-level onboarding gate — that one replaces the whole router and
   is for "this account cannot use the app yet", which is a different claim
   from "this one screen needs one more row first". */
export default function CommunityChatScreen() {
  const { t } = useT('community')
  const navigate = useNavigate()
  const { profile, hasProfile, loading: profileLoading } = useCommunityProfile()
  /* Don't open a channel or fetch the room for someone who is about to be
     redirected out of it. */
  const { user } = useAuth()
  const isAdmin = isAdminUser(user)
  const gateOpen = !profileLoading && hasProfile
  const { messages, loading, error, send, remove, toggleReaction, setPinned, report, hasMore, loadingOlder, loadOlder } = useCommunityMessages({ enabled: gateOpen })
  const members = useCommunityMembers({ enabled: gateOpen })

  const [draft, setDraft] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [pendingDelete, setPendingDelete] = useState(null)
  const [pendingReport, setPendingReport] = useState(null)   /* message pending a report confirm */
  const [replyTarget, setReplyTarget] = useState(null)   /* the message being replied to */
  const [expandedThreads, setExpandedThreads] = useState(() => new Set())
  const [mention, setMention] = useState(null)           /* { at, query } of the @-token being typed */
  const [pickedMentions, setPickedMentions] = useState([])  /* [{ user_id, display_name }] inserted this draft */
  const [profileCard, setProfileCard] = useState(null)   /* { userId, rect, mode } of the open member card */
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')       /* what's typed in the search box */
  const [committedTerm, setCommittedTerm] = useState('') /* debounced term handed to the query */
  const searchRef = useRef(null)
  const feedRef = useRef(null)
  const inputRef = useRef(null)
  /* Is the user parked at the bottom of the feed? Starts true so first paint
     lands on the newest message; refreshed on every manual scroll. */
  const nearBottomRef = useRef(true)
  const prevLenRef = useRef(0)

  const onFeedScroll = () => {
    const el = feedRef.current
    if (el) nearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120
  }
  const scrollToBottom = () => {
    const el = feedRef.current
    if (el) el.scrollTop = el.scrollHeight   /* exact bottom, padding included */
  }

  /* Open a member's card as a popover anchored to the tapped name/avatar. The
     rect is captured now (viewport coords) because the card positions itself
     with fixed — see CommunityProfileCard. */
  const openAuthor = (userId, e) => {
    if (!userId) return
    setProfileCard({ userId, rect: e.currentTarget.getBoundingClientRect(), mode: 'popover' })
  }

  /* Search: the box drives searchTerm; a 300ms debounce commits it to the query
     key so a burst of keystrokes is one request. */
  const { results: searchResults, loading: searchLoading, active: searchActive } =
    useCommunitySearch(committedTerm, { enabled: searchOpen })
  useEffect(() => {
    const id = setTimeout(() => setCommittedTerm(searchTerm), 300)
    return () => clearTimeout(id)
  }, [searchTerm])
  const openSearch = () => { setSearchOpen(true); setTimeout(() => searchRef.current?.focus(), 0) }
  const closeSearch = () => { setSearchOpen(false); setSearchTerm(''); setCommittedTerm('') }

  /* Prepend older history without the viewport jumping: the prepend grows the
     scroll height at the TOP, so add that delta back to scrollTop and the
     messages the reader was looking at stay put. */
  const handleLoadOlder = async () => {
    const el = feedRef.current
    const prevHeight = el ? el.scrollHeight : 0
    const prevTop = el ? el.scrollTop : 0
    await loadOlder()
    requestAnimationFrame(() => {
      const el2 = feedRef.current
      if (el2) el2.scrollTop = prevTop + (el2.scrollHeight - prevHeight)
    })
  }

  /* Follow the newest message ONLY when the user is already at the bottom, or
     the newest message is their own send. A member who scrolled up to read
     history must NOT be yanked down when a realtime message arrives — the
     classic chat anti-pattern. And only on GROWTH: a delete shrinks the list
     and must never jump the viewport. (A "jump to latest" affordance for the
     suppressed case is left as an open product decision.) */
  useEffect(() => {
    const grew = messages.length > prevLenRef.current
    prevLenRef.current = messages.length
    if (!grew) return
    const newest = messages[messages.length - 1]
    const mineNewest = !!(newest && profile && newest.user_id === profile.user_id)
    if (nearBottomRef.current || mineNewest) {
      scrollToBottom()
      nearBottomRef.current = true
    }
  }, [messages, profile])

  if (profileLoading) return <Box className="screen" />
  if (!hasProfile) return <Navigate to={ROUTES.COMMUNITY_PROFILE} replace />

  const submit = async (e) => {
    e.preventDefault()
    const value = draft.trim()
    if (!value) return   /* an empty send is a no-op, not an error worth naming */
    /* Flatten: a reply always attaches to the ROOT message. If the target is
       itself a reply, use its parent; else the target is the root. */
    const replyToId = replyTarget ? (replyTarget.reply_to_id || replyTarget.id) : null
    /* Keep only mentions whose "@name" survived edits, deduped by member. */
    const mentions = pickedMentions.filter((mn, i, arr) =>
      draft.includes(`@${mn.display_name}`) && arr.findIndex((x) => x.user_id === mn.user_id) === i)
    setBusy(true)
    setErr('')
    try {
      await send(value, profile ? {
        display_name: profile.display_name,
        avatar_url: profile.avatar_url,
        is_verified: profile.is_verified,
      } : null, replyToId, mentions)
      setDraft('')
      setPickedMentions([])
      setMention(null)
      if (replyToId) {
        /* Open the thread so the sender sees their reply land, and leave reply
           mode. */
        setExpandedThreads((s) => new Set(s).add(replyToId))
        setReplyTarget(null)
      }
      /* Refocus the composer: a click-send focuses the send button, which then
         disables (busy → empty draft), dropping focus to <body> and — on
         mobile — dismissing the keyboard after every message. (Enter-send never
         leaves the input, so this only matters for the button path.) */
      inputRef.current?.focus()
    } catch (e2) {
      const reason = reasonForMessageWriteError(e2)
      /* 23503 means the profile row vanished under us (deleted in another
         tab, or the gate raced). Sending them back to make one is the only
         useful move — an error message would just be a dead end. */
      if (reason === 'noProfile') { navigate(ROUTES.COMMUNITY_PROFILE, { replace: true }); return }
      setErr(reason
        ? t(`chat.errors.${reason}`)
        : t('chat.errors.sendFailed', { error: e2?.message || '' }))
    } finally {
      setBusy(false)
    }
  }

  const onReact = async (messageId, emoji) => {
    if (!profile) return
    try { await toggleReaction(messageId, emoji, profile.user_id) }
    catch (e2) { setErr(t('chat.errors.reactFailed', { error: e2?.message || '' })) }
  }

  const onPin = async (m) => {
    try { await setPinned(m.id, !m.pinned_at) }
    catch (e2) { setErr(t('chat.mod.pinFailed', { error: e2?.message || '' })) }
  }
  const confirmReport = async () => {
    if (!pendingReport) return
    try { await report(pendingReport.id) }
    catch (e2) { setErr(t('chat.mod.reportFailed', { error: e2?.message || '' })) }
  }

  const startReply = (m) => { setReplyTarget(m); inputRef.current?.focus() }
  const toggleThread = (id) => setExpandedThreads((prev) => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })

  /* @-autocomplete. The active token runs from the nearest "@" (at start or
     after whitespace) up to the caret, as long as it holds no space — a space
     ends it, which is how a picked multi-word name (@דנה לוי ) stops retriggering. */
  const activeMention = (text, caret) => {
    const upto = text.slice(0, caret)
    const at = upto.lastIndexOf('@')
    if (at === -1 || (at > 0 && !/\s/.test(upto[at - 1]))) return null
    const query = upto.slice(at + 1)
    return /\s/.test(query) ? null : { at, query }
  }
  const onDraftChange = (e) => {
    const value = e.target.value
    setDraft(value)
    if (err) setErr('')
    setMention(activeMention(value, e.target.selectionStart ?? value.length))
  }
  const mentionMatches = mention
    ? members.filter((m) => m.display_name.toLowerCase().includes(mention.query.toLowerCase())).slice(0, 6)
    : []
  const pickMention = (mem) => {
    if (!mention) return
    const before = draft.slice(0, mention.at)
    const after = draft.slice(mention.at + 1 + mention.query.length)
    const inserted = `@${mem.display_name} `
    setDraft(before + inserted + after)
    setPickedMentions((prev) => [...prev, { user_id: mem.user_id, display_name: mem.display_name }])
    setMention(null)
    requestAnimationFrame(() => {
      const el = inputRef.current
      if (el) { el.focus(); const pos = (before + inserted).length; el.setSelectionRange?.(pos, pos) }
    })
  }

  const confirmDelete = async () => {
    if (!pendingDelete) return
    try {
      await remove(pendingDelete.id)
      /* The delete button just unmounted with its row, so ConfirmModal's
         focus-restore lands on a detached node (a no-op). Move focus to the
         feed — a stable, non-input target — so a keyboard/AT user keeps their
         place without the mobile keyboard popping up. This runs before the
         modal's onClose, so the modal's no-op restore can't fight it. */
      feedRef.current?.focus()
    } catch (e2) {
      setErr(t('chat.errors.deleteFailed', { error: e2?.message || '' }))
    }
  }

  /* Split the flat list into the top-level feed and each root's replies.
     messages is already sorted by created_at, so both stay chronological. */
  const topLevel = messages.filter((m) => !m.reply_to_id)
  const repliesByParent = new Map()
  for (const m of messages) {
    if (!m.reply_to_id) continue
    const arr = repliesByParent.get(m.reply_to_id)
    if (arr) arr.push(m)
    else repliesByParent.set(m.reply_to_id, [m])
  }
  const pinnedMessages = topLevel.filter((m) => m.pinned_at)

  return (
    <Box className="screen cmt-chat-screen">
      <Box as="header" className="screen-head cmt-head">
        <Box>
          <Txt as="p" className="t-screen">
            <MessagesSquare size={20} strokeWidth={1.6} aria-hidden="true" /> {t('chat.title')}
          </Txt>
          <Txt as="p" className="lbl-sm">{t('chat.subtitle')}</Txt>
        </Box>
        {gateOpen && (
          <Btn
            type="button"
            className={`cmt-head-events${isAdmin ? ' is-admin' : ''}`}
            onClick={() => navigate(ROUTES.COMMUNITY_EVENTS)}
            aria-label={t('events.title')}
          >
            <CalendarDays size={17} strokeWidth={1.7} aria-hidden="true" />
          </Btn>
        )}
        {gateOpen && (
          <Btn
            type="button"
            className={`cmt-head-search${isAdmin ? ' is-admin' : ''}${searchOpen ? ' on' : ''}`}
            onClick={searchOpen ? closeSearch : openSearch}
            aria-label={t('chat.search.toggle')}
            aria-expanded={searchOpen}
          >
            <Search size={17} strokeWidth={1.7} aria-hidden="true" />
          </Btn>
        )}
        <CommunityNotifications enabled={gateOpen} />
        <CommunityModeration enabled={gateOpen && isAdmin} onRemoveMessage={(id) => remove(id)} />
      </Box>

      {searchOpen && (
        <Box className="cmt-search-bar">
          <Search size={16} strokeWidth={1.7} className="cmt-search-icon" aria-hidden="true" />
          <Input
            ref={searchRef}
            className="cmt-search-input"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={t('chat.search.placeholder')}
            aria-label={t('chat.search.placeholder')}
            autoComplete="off"
            maxLength={100}
          />
          <Btn type="button" className="cmt-search-close" onClick={closeSearch} aria-label={t('chat.search.close')}>
            <X size={16} strokeWidth={1.8} aria-hidden="true" />
          </Btn>
        </Box>
      )}

      {!searchOpen && pinnedMessages.length > 0 && (
        <Box className="cmt-pinned-bar" aria-label={t('chat.mod.pinnedLabel')}>
          {pinnedMessages.map((m) => (
            <Box key={m.id} className="cmt-pinned-item">
              <Txt className="cmt-pinned-icon"><Pin size={13} strokeWidth={1.8} aria-hidden="true" /></Txt>
              <Txt className="cmt-pinned-text">
                <Txt as="span" className="cmt-pinned-author">{`${m.community_profiles?.display_name || t('chat.unknownAuthor')}: `}</Txt>
                {m.content}
              </Txt>
              {isAdmin && (
                <Btn type="button" className="cmt-pinned-unpin" onClick={() => onPin(m)} aria-label={t('chat.mod.unpin')}>
                  <X size={13} strokeWidth={1.7} aria-hidden="true" />
                </Btn>
              )}
            </Box>
          ))}
        </Box>
      )}

      {/* role="log" makes new arrivals announce politely (additions only, so
          the initial batch stays silent); tabIndex=-1 lets delete land focus
          here. The raw hook error is deliberately swapped for a translated
          line — a Postgres/network string has no place in the RTL UI (it's
          still in the console / React Query for debugging). */}
      <Box
        className="cmt-feed"
        ref={feedRef}
        onScroll={onFeedScroll}
        tabIndex={-1}
        role="log"
        aria-label={t('chat.title')}
      >
        {/* Search mode replaces the feed with server-side results (compact,
            single-column, read-only rows — author still clickable). */}
        {searchOpen && (
          !searchActive ? (
            <Txt as="p" className="m-hint cmt-feed-note">{t('chat.search.hint')}</Txt>
          ) : searchLoading ? (
            <Txt as="p" className="m-hint cmt-feed-note">{t('chat.search.searching')}</Txt>
          ) : searchResults.length === 0 ? (
            <Box className="cmt-card cmt-empty">
              <Txt className="cmt-empty-mark"><Search size={26} strokeWidth={1.5} aria-hidden="true" /></Txt>
              <Txt as="p" className="cmt-empty-title">{t('chat.search.noResults')}</Txt>
              <Txt as="p" className="m-hint">{t('chat.search.noResultsBody', { term: committedTerm })}</Txt>
            </Box>
          ) : (
            <>
              <Txt as="p" className="cmt-search-count">{t('chat.search.count', { count: searchResults.length })}</Txt>
              {searchResults.map((r) => (
                <CommunityMessage
                  key={r.id}
                  m={r}
                  mine={false}
                  showAuthor
                  compact
                  myUserId={profile?.user_id}
                  t={t}
                  onAuthorClick={openAuthor}
                />
              ))}
            </>
          )
        )}

        {/* Older history, on demand — keeps the room from loading everything at
            once. Anchored so the prepend doesn't jump the viewport. */}
        {!searchOpen && hasMore && (
          <Box className="cmt-load-older">
            <Btn type="button" className="cmt-load-older-btn" onClick={handleLoadOlder} disabled={loadingOlder}>
              <ArrowUp size={14} strokeWidth={1.8} aria-hidden="true" />
              {loadingOlder ? t('chat.loadingOlder') : t('chat.loadOlder')}
            </Btn>
          </Box>
        )}

        {!searchOpen && loading && <Txt as="p" className="m-hint cmt-feed-note">{t('chat.loading')}</Txt>}
        {!searchOpen && !loading && error && <Txt as="p" className="m-error cmt-feed-note" role="alert">{t('chat.errors.loadFailed')}</Txt>}
        {!searchOpen && !loading && !error && messages.length === 0 && (
          <Box className="cmt-card cmt-empty">
            <Txt className="cmt-empty-mark"><MessagesSquare size={26} strokeWidth={1.5} aria-hidden="true" /></Txt>
            <Txt as="p" className="cmt-empty-title">{t('chat.empty.title')}</Txt>
            <Txt as="p" className="m-hint">{t('chat.empty.body')}</Txt>
          </Box>
        )}

        {!searchOpen && topLevel.map((m, i) => {
          const mine = !!(profile && m.user_id === profile.user_id)
          /* Group consecutive messages from the same author; a day boundary also
             breaks the group so the author reappears after the date separator. */
          const prev = topLevel[i - 1]
          const newDay = !prev || new Date(prev.created_at).toDateString() !== new Date(m.created_at).toDateString()
          const firstInGroup = newDay || !prev || prev.user_id !== m.user_id
          const replies = repliesByParent.get(m.id) || []
          const expanded = expandedThreads.has(m.id)
          return (
            <Fragment key={m.id}>
              {newDay && (
                <Box className="cmt-day-sep" role="separator" aria-label={fmtRelativeDay(m.created_at)}>
                  <Txt className="cmt-day-sep-label">{fmtRelativeDay(m.created_at)}</Txt>
                </Box>
              )}
              <CommunityMessage
                m={m}
                mine={mine}
                showAuthor={firstInGroup}
                groupStart={firstInGroup}
                myUserId={profile?.user_id}
                isAdmin={isAdmin}
                t={t}
                onReact={onReact}
                onReply={startReply}
                onDelete={setPendingDelete}
                onPin={onPin}
                onReport={setPendingReport}
                onAuthorClick={openAuthor}
              />
              {/* A root's replies collapse under a toggle (Facebook-style); the
                  flat model means every reply lives here, never in the feed. */}
              {replies.length > 0 && (
                <Box className={`cmt-thread ${mine ? 'mine' : 'other'}`}>
                  <Btn
                    type="button"
                    className="cmt-thread-toggle"
                    onClick={() => toggleThread(m.id)}
                    aria-expanded={expanded}
                  >
                    {expanded
                      ? <ChevronUp size={14} strokeWidth={1.8} aria-hidden="true" />
                      : <ChevronDown size={14} strokeWidth={1.8} aria-hidden="true" />}
                    <Txt className="cmt-thread-toggle-label">{t('chat.reply.count', { count: replies.length })}</Txt>
                  </Btn>
                  {expanded && replies.map((r, j) => {
                    const rMine = !!(profile && r.user_id === profile.user_id)
                    const rPrev = replies[j - 1]
                    const rShowAuthor = !rPrev || rPrev.user_id !== r.user_id
                    return (
                      <CommunityMessage
                        key={r.id}
                        m={r}
                        mine={rMine}
                        showAuthor={rShowAuthor}
                        isReply
                        myUserId={profile?.user_id}
                        isAdmin={isAdmin}
                        t={t}
                        onReact={onReact}
                        onReply={startReply}
                        onDelete={setPendingDelete}
                        onPin={onPin}
                        onReport={setPendingReport}
                        onAuthorClick={openAuthor}
                      />
                    )
                  })}
                </Box>
              )}
            </Fragment>
          )
        })}
      </Box>

      {!searchOpen && (
      <Box as="form" className="cmt-composer" onSubmit={submit}>
        {replyTarget && (
          <Box className="cmt-reply-preview">
            <Box className="cmt-reply-preview-body">
              <Txt className="cmt-reply-preview-to">
                {t('chat.reply.replyingTo', { name: replyTarget.community_profiles?.display_name || t('chat.unknownAuthor') })}
              </Txt>
              <Txt className="cmt-reply-preview-snippet">{replyTarget.content}</Txt>
            </Box>
            <Btn type="button" className="cmt-reply-cancel" onClick={() => setReplyTarget(null)} aria-label={t('chat.reply.cancel')}>
              <X size={15} strokeWidth={1.7} aria-hidden="true" />
            </Btn>
          </Box>
        )}
        {mention && mentionMatches.length > 0 && (
          <Box className="cmt-mention-picker" role="listbox" aria-label={t('chat.mention.label')}>
            {mentionMatches.map((mem) => (
              <Btn
                key={mem.user_id}
                type="button"
                className="cmt-mention-item"
                role="option"
                aria-selected="false"
                onClick={() => pickMention(mem)}
              >
                <CommunityAvatar name={mem.display_name} url={mem.avatar_url} size={22} />
                <Txt className="cmt-mention-name">{mem.display_name}</Txt>
              </Btn>
            ))}
          </Box>
        )}
        {err && <Txt as="p" className="m-error cmt-composer-err" role="alert">{err}</Txt>}
        <Box className="cmt-composer-row">
          <Input
            ref={inputRef}
            className="m-input cmt-composer-input"
            value={draft}
            onChange={onDraftChange}
            onKeyDown={(e) => { if (e.key === 'Escape' && mention) { e.preventDefault(); setMention(null) } }}
            placeholder={t('chat.placeholder')}
            aria-label={t('chat.placeholder')}
            autoComplete="off"
            maxLength={2000}
          />
          <Btn
            type="submit"
            className="m-btn-save cmt-composer-send"
            disabled={busy || !draft.trim()}
            aria-label={t('chat.send')}
          >
            <Send size={16} strokeWidth={1.7} aria-hidden="true" />
          </Btn>
        </Box>
      </Box>
      )}

      {/* The repo's destructive-action pattern, same as ClientDrawer's. */}
      <ConfirmModal
        open={!!pendingDelete}
        onClose={() => setPendingDelete(null)}
        title={t('chat.delete.title')}
        message={t('chat.delete.message')}
        confirmLabel={t('chat.delete.confirm')}
        danger
        onConfirm={confirmDelete}
      />
      <ConfirmModal
        open={!!pendingReport}
        onClose={() => setPendingReport(null)}
        title={t('chat.mod.reportTitle')}
        message={t('chat.mod.reportMessage')}
        confirmLabel={t('chat.mod.report')}
        danger
        onConfirm={confirmReport}
      />

      {/* Member card — a popover off the tapped author, expandable to a full
          modal. isMe unlocks a shortcut to the profile editor. */}
      {profileCard && (
        <CommunityProfileCard
          userId={profileCard.userId}
          anchorRect={profileCard.rect}
          mode={profileCard.mode}
          isMe={!!(profile && profileCard.userId === profile.user_id)}
          t={t}
          onClose={() => setProfileCard(null)}
          onOpenFull={() => setProfileCard((pc) => (pc ? { ...pc, mode: 'modal' } : pc))}
          onEdit={() => { setProfileCard(null); navigate(ROUTES.COMMUNITY_PROFILE) }}
        />
      )}
    </Box>
  )
}
