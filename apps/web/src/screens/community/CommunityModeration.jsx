import { useEffect, useRef, useState } from 'react'
import { Flag } from 'lucide-react'
import { useCommunityReports } from '../../hooks/useCommunityReports'
import { useT } from '../../i18n/useT'
import { Box, Txt, Btn } from '../../components/ui'

/* Admin-only reports queue: a flag + count in the header, opening a panel of
   reported messages (grouped, newest first) with remove / dismiss. Renders
   nothing for non-admins (and RLS returns them nothing anyway). */
export default function CommunityModeration({ enabled, onRemoveMessage }) {
  const { t } = useT('community')
  const { reports, dismiss } = useCommunityReports({ enabled })
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

  if (!enabled) return null

  /* Group reports by message so an admin acts on a message, not each flag. */
  const byMessage = new Map()
  for (const r of reports) {
    const g = byMessage.get(r.message_id) || { message: r.message, count: 0 }
    g.count += 1
    byMessage.set(r.message_id, g)
  }
  const groups = [...byMessage.entries()].map(([id, g]) => ({ messageId: id, ...g }))

  return (
    <Box className="cmt-mod" ref={wrapRef}>
      <Btn
        type="button"
        className="cmt-mod-flag"
        onClick={() => setOpen((o) => !o)}
        aria-label={groups.length > 0 ? t('chat.mod.queueAriaCount', { count: groups.length }) : t('chat.mod.queueAria')}
        aria-expanded={open}
      >
        <Flag size={17} strokeWidth={1.7} aria-hidden="true" />
        {groups.length > 0 && (
          <Txt className="cmt-mod-badge" aria-hidden="true">{groups.length > 9 ? '9+' : groups.length}</Txt>
        )}
      </Btn>

      {open && (
        <Box className="cmt-notif-panel cmt-mod-panel" aria-label={t('chat.mod.queueTitle')}>
          <Txt as="p" className="cmt-notif-panel-title">{t('chat.mod.queueTitle')}</Txt>
          {groups.length === 0 ? (
            <Txt as="p" className="cmt-notif-empty">{t('chat.mod.queueEmpty')}</Txt>
          ) : (
            groups.map((g) => {
              /* A soft-deleted message's embed comes back NULL (the members
                 SELECT policy hides deleted_at IS NOT NULL rows), so a null
                 message means it's already gone — show the "removed" state
                 rather than a blank row with a live remove button. */
              const removed = !g.message || !!g.message?.deleted_at
              const authorName = g.message?.community_profiles?.display_name || t('chat.unknownAuthor')
              return (
                <Box key={g.messageId} className="cmt-mod-item">
                  <Txt className="cmt-mod-item-text">
                    <Txt as="span" className="cmt-mod-item-author">{`${authorName}: `}</Txt>
                    {removed ? <em>{t('chat.mod.removedMsg')}</em> : (g.message?.content ?? '')}
                    <Txt as="span" className="cmt-mod-item-count">{` ×${g.count}`}</Txt>
                  </Txt>
                  <Box className="cmt-mod-item-actions">
                    {!removed && (
                      <Btn
                        type="button"
                        className="cmt-mod-btn danger"
                        onClick={async () => {
                          /* Only clear the reports once the soft-delete actually
                             succeeds — otherwise a failed delete leaves the
                             message live but gone from the queue. */
                          try { await onRemoveMessage(g.messageId); dismiss(g.messageId) } catch { /* keep the report */ }
                        }}
                      >
                        {t('chat.mod.removeMessage')}
                      </Btn>
                    )}
                    <Btn type="button" className="cmt-mod-btn" onClick={() => dismiss(g.messageId)}>
                      {t('chat.mod.dismiss')}
                    </Btn>
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
