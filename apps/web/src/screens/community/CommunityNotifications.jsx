import { useEffect, useRef, useState } from 'react'
import { Bell } from 'lucide-react'
import { fmtTime, fmtRelativeDay } from '@simplicity/core'
import CommunityAvatar from './CommunityAvatar'
import { useCommunityNotifications } from '../../hooks/useCommunityNotifications'
import { useT } from '../../i18n/useT'
import { Box, Txt, Btn } from '../../components/ui'

/* Bell + unread badge + dropdown inbox. Opening the panel marks everything read
   (the common pattern) — the badge is "since you last looked". */
export default function CommunityNotifications({ enabled }) {
  const { t } = useT('community')
  const { notifications, unreadCount, markAllRead } = useCommunityNotifications({ enabled })
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    const onDown = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false) }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('pointerdown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])

  const toggle = () => {
    if (open) { setOpen(false); return }
    setOpen(true)
    markAllRead()   /* opening clears the badge */
  }

  return (
    <Box className="cmt-notif" ref={wrapRef}>
      <Btn
        type="button"
        className="cmt-notif-bell"
        onClick={toggle}
        aria-label={unreadCount > 0 ? t('chat.notif.ariaCount', { count: unreadCount }) : t('chat.notif.aria')}
        aria-expanded={open}
      >
        <Bell size={18} strokeWidth={1.7} aria-hidden="true" />
        {unreadCount > 0 && (
          <Txt className="cmt-notif-badge" aria-hidden="true">{unreadCount > 9 ? '9+' : unreadCount}</Txt>
        )}
      </Btn>

      {open && (
        <Box className="cmt-notif-panel" role="region" aria-label={t('chat.notif.title')}>
          <Txt as="p" className="cmt-notif-panel-title">{t('chat.notif.title')}</Txt>
          {notifications.length === 0 ? (
            <Txt as="p" className="cmt-notif-empty">{t('chat.notif.empty')}</Txt>
          ) : (
            notifications.map((n) => {
              const actorName = n.actor?.display_name || t('chat.unknownAuthor')
              return (
                <Box key={n.id} className={`cmt-notif-item${n.read_at ? '' : ' unread'}`}>
                  <CommunityAvatar name={actorName} url={n.actor?.avatar_url} size={26} />
                  <Box className="cmt-notif-item-body">
                    <Txt className="cmt-notif-item-text">{t('chat.notif.mentioned', { name: actorName })}</Txt>
                    {n.message?.content && <Txt className="cmt-notif-item-snippet">{n.message.content}</Txt>}
                    <Txt className="cmt-notif-item-time">{`${fmtRelativeDay(n.created_at)} · ${fmtTime(n.created_at)}`}</Txt>
                  </Box>
                </Box>
              )
            })
          )}
        </Box>
      )}
    </Box>
  )
}
