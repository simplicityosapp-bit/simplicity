import { useState, useMemo } from 'react'
import Modal from './Modal'
import { useT } from '../i18n/useT'
import { Box, Txt, Btn } from '../components/ui'

/* Cascade-delete modal for groups. Mirrors the prototype's showDeleteOptions:
   for every child-type that has rows (members / future meetings / past sessions /
   reminders), let the user choose keep vs delete. Empty sections are skipped. */
export default function DeleteGroupModal({ open, onClose, group, counts, onConfirm }) {
  const { t } = useT('modalsClient')
  const options = useMemo(() => {
    const out = []
    if (counts?.members) {
      out.push({
        key: 'keepMembers',
        label: t('deleteGroup.members', { count: counts.members }),
        sub: t('deleteGroup.membersSub'),
        defaultValue: true,
        keepLabel: t('deleteGroup.membersKeep'),
        deleteLabel: t('deleteGroup.membersDelete'),
      })
    }
    if (counts?.futureMeetings) {
      out.push({
        key: 'keepFutureMeetings',
        label: t('deleteGroup.futureMeetings', { count: counts.futureMeetings }),
        sub: t('deleteGroup.futureMeetingsSub'),
        defaultValue: false,
        keepLabel: t('deleteGroup.keep'),
        deleteLabel: t('deleteGroup.delete'),
      })
    }
    if (counts?.pastSessions) {
      out.push({
        key: 'keepPastSessions',
        label: t('deleteGroup.pastSessions', { count: counts.pastSessions }),
        sub: t('deleteGroup.pastSessionsSub'),
        defaultValue: true,
        keepLabel: t('deleteGroup.keep'),
        deleteLabel: t('deleteGroup.delete'),
      })
    }
    if (counts?.reminders) {
      out.push({
        key: 'keepReminders',
        label: t('deleteGroup.reminders', { count: counts.reminders }),
        sub: t('deleteGroup.remindersSub'),
        defaultValue: true,
        keepLabel: t('deleteGroup.keep'),
        deleteLabel: t('deleteGroup.delete'),
      })
    }
    return out
  }, [counts, t])

  const [choices, setChoices] = useState(() => {
    const init = {}
    options.forEach((o) => { init[o.key] = o.defaultValue })
    return init
  })

  /* Re-init choices when group changes (modal opens for a different group). */
  if (group && options.length && Object.keys(choices).length !== options.length) {
    const init = {}
    options.forEach((o) => { init[o.key] = o.defaultValue })
    setChoices(init)
  }

  if (!group) return <Modal open={open} onClose={onClose} title={t('deleteGroup.title')} />

  const set = (k, v) => setChoices((c) => ({ ...c, [k]: v }))

  const submit = () => {
    onConfirm?.(choices)
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title={t('deleteGroup.titleNamed', { name: group.name })}>
      <Txt as="p" className="m-confirm-msg">{t('deleteGroup.intro')}</Txt>
      <Box className="dg-list">
        {options.length === 0 ? (
          <Txt as="p" className="m-confirm-msg">{t('deleteGroup.noData')}</Txt>
        ) : (
          options.map((o) => (
            <Box key={o.key} className="dg-row">
              <Box className="dg-row-text">
                <Txt as="p" className="dg-row-l">{o.label}</Txt>
                <Txt as="p" className="dg-row-sub">{o.sub}</Txt>
              </Box>
              <Box className="dg-row-choice">
                <Btn
                  type="button"
                  className={`m-pill${choices[o.key] ? ' on' : ''}`}
                  onClick={() => set(o.key, true)}
                >
                  {o.keepLabel}
                </Btn>
                <Btn
                  type="button"
                  className={`m-pill${!choices[o.key] ? ' on' : ''}`}
                  onClick={() => set(o.key, false)}
                >
                  {o.deleteLabel}
                </Btn>
              </Box>
            </Box>
          ))
        )}
      </Box>
      <Box className="m-actions">
        <Btn type="button" className="m-btn-cancel" onClick={onClose}>{t('common.cancel')}</Btn>
        <Btn type="button" className="m-btn-save danger" onClick={submit}>{t('deleteGroup.confirm')}</Btn>
      </Box>
    </Modal>
  )
}
