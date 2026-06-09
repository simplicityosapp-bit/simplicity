import { useState, useMemo } from 'react'
import Modal from './Modal'
import { useAddress } from '../hooks/useAddress'

/* Cascade-delete modal for groups. Mirrors the prototype's showDeleteOptions:
   for every child-type that has rows (members / future meetings / past sessions /
   reminders), let the user choose keep vs delete. Empty sections are skipped. */
export default function DeleteGroupModal({ open, onClose, group, counts, onConfirm }) {
  const { addr } = useAddress()
  const options = useMemo(() => {
    const out = []
    if (counts?.members) {
      out.push({
        key: 'keepMembers',
        label: `${counts.members} חבר${counts.members > 1 ? 'ים' : ''} בקבוצה`,
        sub: 'מומלץ: ישתחררו ויישארו בפרויקט כלקוחות פרטיים',
        defaultValue: true,
        keepLabel: 'להשאיר',
        deleteLabel: 'למחוק לקוחות',
      })
    }
    if (counts?.futureMeetings) {
      out.push({
        key: 'keepFutureMeetings',
        label: `${counts.futureMeetings} פגיש${counts.futureMeetings > 1 ? 'ות' : 'ה'} עתידי${counts.futureMeetings > 1 ? 'ות' : 'ת'}`,
        sub: 'מומלץ: למחוק — הכלל החוזר כבר לא קיים',
        defaultValue: false,
        keepLabel: 'להשאיר',
        deleteLabel: 'למחוק',
      })
    }
    if (counts?.pastSessions) {
      out.push({
        key: 'keepPastSessions',
        label: `${counts.pastSessions} פגיש${counts.pastSessions > 1 ? 'ות' : 'ה'} היסטורי${counts.pastSessions > 1 ? 'ות' : 'ת'}`,
        sub: 'מומלץ: להשאיר — תיעוד היסטורי',
        defaultValue: true,
        keepLabel: 'להשאיר',
        deleteLabel: 'למחוק',
      })
    }
    if (counts?.reminders) {
      out.push({
        key: 'keepReminders',
        label: `${counts.reminders} תזכורות מקושרות`,
        sub: 'מומלץ: להשאיר — תיעוד מתמשך',
        defaultValue: true,
        keepLabel: 'להשאיר',
        deleteLabel: 'למחוק',
      })
    }
    return out
  }, [counts])

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

  if (!group) return <Modal open={open} onClose={onClose} title="מחיקת קבוצה" />

  const set = (k, v) => setChoices((c) => ({ ...c, [k]: v }))

  const submit = () => {
    onConfirm?.(choices)
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title={`למחוק את "${group.name}"?`}>
      <p className="m-confirm-msg">{addr({ male: 'בחר מה לעשות עם הדאטה המקושר', female: 'בחרי מה לעשות עם הדאטה המקושר', neutral: 'בחר/י מה לעשות עם הדאטה המקושר' })}.</p>
      <div className="dg-list">
        {options.length === 0 ? (
          <p className="m-confirm-msg">אין דאטה מקושר — הקבוצה תימחק.</p>
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
        <button type="button" className="m-btn-cancel" onClick={onClose}>ביטול</button>
        <button type="button" className="m-btn-save danger" onClick={submit}>מחק קבוצה</button>
      </div>
    </Modal>
  )
}
