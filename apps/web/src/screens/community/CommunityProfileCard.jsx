import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { X, BadgeCheck, Link2, ExternalLink, Pencil } from 'lucide-react'
import CommunityAvatar from './CommunityAvatar'
import { useCommunityMemberProfile } from '../../hooks/useCommunityMemberProfile'
import { Box, Txt, Btn } from '../../components/ui'

/* A member's public card (0091). Two modes off one component:
   • 'popover' — a compact card anchored to the tapped author (name/avatar),
     bio clamped and tags capped, with a button into the full view;
   • 'modal'   — a centred dialog with the whole profile.
   The extra fields aren't on the message embed (which carries only name +
   avatar + badge), so the card fetches them by user_id when it opens. */

const POPOVER_W = 268

/* Strip the protocol + trailing slash for a cleaner label; the href keeps the
   full URL. The DB already guarantees http(s) (0091 CHECK). */
function prettyLink(url) {
  return url.replace(/^https?:\/\//i, '').replace(/\/+$/, '')
}

function ProfileBody({ profile, mode, t }) {
  const name = profile?.display_name || t('chat.unknownAuthor')
  const specialties = (profile?.specialties ?? []).filter(Boolean)
  const tags = mode === 'popover' ? specialties.slice(0, 6) : specialties
  const hasDetails = !!(profile?.headline || profile?.bio || specialties.length || profile?.link)
  return (
    <>
      <Box className="cmt-pc-head">
        <CommunityAvatar name={name} url={profile?.avatar_url} size={mode === 'modal' ? 60 : 46} />
        <Box className="cmt-pc-id">
          <Box className="cmt-pc-name-row">
            <Txt className="cmt-pc-name">{name}</Txt>
            {profile?.is_verified && (
              <Txt className="cmt-pc-verified" title={t('chat.verified')}>
                {/* role="img" on the svg — VoiceOver ignores aria-label on a bare <svg>. */}
                <BadgeCheck size={15} strokeWidth={1.8} role="img" aria-label={t('chat.verified')} />
              </Txt>
            )}
          </Box>
          {profile?.headline && <Txt className="cmt-pc-headline">{profile.headline}</Txt>}
        </Box>
      </Box>

      {profile?.bio && (
        <Txt as="p" className={`cmt-pc-bio${mode === 'popover' ? ' clamp' : ''}`}>{profile.bio}</Txt>
      )}

      {tags.length > 0 && (
        <Box className="cmt-pc-tags">
          {tags.map((s, i) => <Txt key={i} className="cmt-pc-tag">{s}</Txt>)}
        </Box>
      )}

      {profile?.link && (
        <a className="cmt-pc-link" href={profile.link} target="_blank" rel="noopener noreferrer nofollow ugc">
          <Link2 size={14} strokeWidth={1.7} aria-hidden="true" />
          <span className="cmt-pc-link-text">{prettyLink(profile.link)}</span>
          <ExternalLink size={12} strokeWidth={1.7} aria-hidden="true" />
        </a>
      )}

      {!hasDetails && <Txt as="p" className="cmt-pc-empty">{t('profileCard.empty')}</Txt>}
    </>
  )
}

export default function CommunityProfileCard({
  userId, anchorRect, mode = 'popover', isMe = false, t, onClose, onOpenFull, onEdit,
}) {
  const { profile, loading } = useCommunityMemberProfile(userId, { enabled: !!userId })
  const cardRef = useRef(null)
  const [pos, setPos] = useState(null)

  /* Anchor the popover under (or, if it would overflow, above) the tapped
     element, clamped into the viewport. Fixed positioning → the rect's
     viewport coords map straight across. Re-measures once content loads. */
  useLayoutEffect(() => {
    if (mode !== 'popover' || !anchorRect || !cardRef.current) return
    const h = cardRef.current.offsetHeight
    const vw = window.innerWidth
    const vh = window.innerHeight
    let left = anchorRect.left + anchorRect.width / 2 - POPOVER_W / 2
    left = Math.max(8, Math.min(left, vw - POPOVER_W - 8))
    let top = anchorRect.bottom + 6
    if (top + h > vh - 8) top = Math.max(8, anchorRect.top - h - 6)
    setPos({ top, left })
  }, [mode, anchorRect, profile, loading])

  /* Escape closes both modes; outside-click closes the popover (the modal's
     backdrop handles its own). The listener attaches after the opening click
     has resolved, so it can't self-dismiss. */
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    let onDown
    if (mode === 'popover') {
      onDown = (e) => { if (cardRef.current && !cardRef.current.contains(e.target)) onClose() }
      document.addEventListener('pointerdown', onDown)
    }
    return () => {
      document.removeEventListener('keydown', onKey)
      if (onDown) document.removeEventListener('pointerdown', onDown)
    }
  }, [onClose, mode])

  useEffect(() => { cardRef.current?.focus() }, [])

  if (mode === 'modal') {
    return (
      <Box className="cmt-pc-overlay" onClick={onClose}>
        <Box
          ref={cardRef}
          className="cmt-pc cmt-pc-modal"
          role="dialog"
          aria-modal="true"
          aria-label={t('profileCard.title')}
          tabIndex={-1}
          onClick={(e) => e.stopPropagation()}
        >
          <Btn type="button" className="cmt-pc-close" onClick={onClose} aria-label={t('profileCard.close')}>
            <X size={16} strokeWidth={1.8} aria-hidden="true" />
          </Btn>
          {loading
            ? <Txt as="p" className="cmt-pc-loading">{t('profileCard.loading')}</Txt>
            : <ProfileBody profile={profile} mode="modal" t={t} />}
          {isMe && !loading && (
            <Btn type="button" className="cmt-pc-edit" onClick={onEdit}>
              <Pencil size={14} strokeWidth={1.7} aria-hidden="true" /> {t('profileCard.edit')}
            </Btn>
          )}
        </Box>
      </Box>
    )
  }

  return (
    <Box
      ref={cardRef}
      className="cmt-pc cmt-pc-popover"
      role="dialog"
      aria-label={t('profileCard.title')}
      tabIndex={-1}
      style={pos
        ? { position: 'fixed', top: pos.top, left: pos.left, visibility: 'visible' }
        : { position: 'fixed', top: 0, left: 0, visibility: 'hidden' }}
    >
      {loading ? (
        <Txt as="p" className="cmt-pc-loading">{t('profileCard.loading')}</Txt>
      ) : (
        <>
          <ProfileBody profile={profile} mode="popover" t={t} />
          <Box className="cmt-pc-actions">
            <Btn type="button" className="cmt-pc-full" onClick={onOpenFull}>{t('profileCard.viewFull')}</Btn>
            {isMe && (
              <Btn type="button" className="cmt-pc-edit-sm" onClick={onEdit} aria-label={t('profileCard.edit')}>
                <Pencil size={14} strokeWidth={1.7} aria-hidden="true" />
              </Btn>
            )}
          </Box>
        </>
      )}
    </Box>
  )
}
