import { Trash2, BadgeCheck, CornerUpLeft, Pin, PinOff, Flag } from 'lucide-react'
import { fmtTime, fmtRelativeDay } from '@simplicity/core'
import CommunityAvatar from './CommunityAvatar'
import CommunityReactions from './CommunityReactions'
import { Box, Txt, Btn } from '../../components/ui'

/* Render message text with two inline treatments: @-mention highlights and
   clickable links. Mention names come from the message's embedded mentions
   (0089) — exact, no parsing guesswork. URLs are matched by pattern. One
   combined pass so the two never fight over the same span. Returns a plain
   string on the fast path, else an array of strings / spans / anchors. */
const URL_SOURCE = 'https?:\\/\\/[^\\s]+'
/* Trailing punctuation that almost always belongs to the sentence, not the URL
   ("see https://x.com." / "(https://x.com)"). Peeled off the link, kept as text. */
const TRAIL = /[.,;:!?)\]}'"»׃]+$/

function renderContent(text, mentionNames) {
  const hasMentions = mentionNames.length > 0
  const mentionAlt = hasMentions
    ? `@(?:${mentionNames.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`
    : null
  const re = new RegExp(`(${[mentionAlt, URL_SOURCE].filter(Boolean).join('|')})`, 'gi')

  const out = []
  let last = 0
  let match
  let key = 0
  while ((match = re.exec(text)) !== null) {
    if (match.index > last) out.push(text.slice(last, match.index))
    const token = match[0]
    if (token[0] === '@') {
      out.push(<span key={key++} className="cmt-mention">{token}</span>)
      last = match.index + token.length
    } else {
      /* URL — peel trailing sentence punctuation back into the text. */
      const trail = token.match(TRAIL)?.[0] ?? ''
      const href = trail ? token.slice(0, -trail.length) : token
      out.push(
        <a key={key++} className="cmt-link" href={href} target="_blank" rel="noopener noreferrer nofollow ugc">{href}</a>,
      )
      if (trail) out.push(trail)
      last = match.index + token.length
    }
  }
  if (!out.length) return text
  if (last < text.length) out.push(text.slice(last))
  return out
}

/* One message row: avatar (once per author-run) + bubble + time + reactions +
   actions (reply always, delete on my own). Reused for top-level messages and
   for thread replies (isReply → compact avatar, no group-start margin). The
   grouping / day-separator decisions stay with the parent, which passes
   showAuthor + groupStart. */
export default function CommunityMessage({
  m, mine, showAuthor, groupStart = false, isReply = false, myUserId, t,
  isAdmin = false, compact = false, onReact, onReply, onDelete, onPin, onReport, onAuthorClick,
}) {
  const pinned = !!m.pinned_at
  const author = m.community_profiles
  const name = author?.display_name || t('chat.unknownAuthor')
  const mentionNames = (m.community_message_mentions ?? [])
    .map((mn) => mn.community_profiles?.display_name)
    .filter(Boolean)
  /* Main flow is two-sided, so my own bubbles drop the avatar + name (it's me,
     on my side). A thread is a single indented column (Facebook-style), so
     there EVERY reply — mine included — shows its avatar + name. Search results
     (compact) are a plain single column, so they always carry the avatar too. */
  const withAvatar = compact || isReply || !mine
  return (
    <Box className={`cmt-row ${mine ? 'mine' : 'other'}${isReply ? ' reply' : ''}${groupStart ? ' group-start' : ''}`}>
      {withAvatar && (
        <Box className="cmt-row-avatar">
          {showAuthor ? (
            <Btn
              type="button"
              className="cmt-avatar-btn"
              onClick={(e) => onAuthorClick?.(m.user_id, e)}
              aria-label={t('profileCard.openAria', { name })}
            >
              <CommunityAvatar name={name} url={author?.avatar_url} size={isReply ? 24 : 30} />
            </Btn>
          ) : null}
        </Box>
      )}
      <Box className="cmt-bubble-wrap">
        {withAvatar && showAuthor && (
          <Box className="cmt-bubble-author">
            <Btn
              type="button"
              className="cmt-msg-author cmt-author-btn"
              onClick={(e) => onAuthorClick?.(m.user_id, e)}
            >
              {name}
            </Btn>
            {author?.is_verified && (
              <Txt className="cmt-msg-verified" title={t('chat.verified')}>
                {/* role="img" on the svg — VoiceOver/Safari ignore aria-label on a bare <svg>. */}
                <BadgeCheck size={13} strokeWidth={1.8} role="img" aria-label={t('chat.verified')} />
              </Txt>
            )}
          </Box>
        )}
        <Box className="cmt-bubble" title={`${fmtRelativeDay(m.created_at)} · ${fmtTime(m.created_at)}`}>
          <Txt as="p" className="cmt-msg-text">{renderContent(m.content, mentionNames)}</Txt>
          <Txt className="cmt-bubble-time">{fmtTime(m.created_at)}</Txt>
        </Box>
        {!compact && (
          <CommunityReactions
            reactions={m.community_message_reactions}
            myUserId={myUserId}
            onToggle={(emoji) => onReact(m.id, emoji)}
            addLabel={t('chat.reactions.add')}
          />
        )}
      </Box>
      {!compact && (
      <Box className="cmt-row-actions">
        <Btn type="button" className="cmt-row-action" onClick={() => onReply(m)} aria-label={t('chat.reply.action')}>
          <CornerUpLeft size={14} strokeWidth={1.7} aria-hidden="true" />
        </Btn>
        {isAdmin && !isReply && (
          <Btn
            type="button"
            className={`cmt-row-action${pinned ? ' on' : ''}`}
            onClick={() => onPin(m)}
            aria-label={t(pinned ? 'chat.mod.unpin' : 'chat.mod.pin')}
            aria-pressed={pinned}
          >
            {pinned
              ? <PinOff size={14} strokeWidth={1.7} aria-hidden="true" />
              : <Pin size={14} strokeWidth={1.7} aria-hidden="true" />}
          </Btn>
        )}
        {!mine && (
          <Btn type="button" className="cmt-row-action" onClick={() => onReport(m)} aria-label={t('chat.mod.report')}>
            <Flag size={14} strokeWidth={1.6} aria-hidden="true" />
          </Btn>
        )}
        {(mine || isAdmin) && (
          <Btn type="button" className="cmt-row-action cmt-msg-del" onClick={() => onDelete(m)} aria-label={t('chat.delete.aria')}>
            <Trash2 size={14} strokeWidth={1.6} aria-hidden="true" />
          </Btn>
        )}
      </Box>
      )}
    </Box>
  )
}
