import { useState, useMemo } from 'react'
import Modal from './Modal'
import { useT } from '../i18n/useT'

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
      <p className="m-confirm-msg">{t('deleteGroup.intro')}</p>
      <div className="dg-list">
        {options.length === 0 ? (
          <p className="m-confirm-msg">{t('deleteGroup.noData')}</p>
        ) : (
          options.map((o) => (
            <div key={o.key} className="dg-row">
              <div className="dg-row-text">
                <p className="dg-row-l">{o.label}</p>
                <p className="dg-row-sub">{o.sub}</p>
              </div>
              <div className="dg-row-choice">
                <button
                  type="button"
                  className={`m-pill${choices[o.key] ? ' on' : ''}`}
                  onClick={() => set(o.key, true)}
                >
                  {o.keepLabel}
                </button>
                <button
                  type="button"
                  className={`m-pill${!choices[o.key] ? ' on' : ''}`}
                  onClick={() => set(o.key, false)}
                >
                  {o.deleteLabel}
                </button>
              </div>
            </div>
          ))
        )}
      </div>
      <div className="m-actions">
        <button type="button" className="m-btn-cancel" onClick={onClose}>{t('common.cancel')}</button>
        <button type="button" className="m-btn-save danger" onClick={submit}>{t('deleteGroup.confirm')}</button>
      </div>
    </Modal>
  )
}
