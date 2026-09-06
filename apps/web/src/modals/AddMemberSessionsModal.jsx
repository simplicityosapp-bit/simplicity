import { useState } from 'react'
import Modal from './Modal'
import { isr } from '@simplicity/core'
import { renewedCard } from '../lib/groupMembership'
import { useT } from '../i18n/useT'
import { Box, Txt, Btn, Input } from '../components/ui'

/* ════════════════════════════════════════════════════════════════
   AddMemberSessionsModal — sell one member another card of meetings.

   The yoga model: a group runs on and on, and each student buys ten
   classes at a time. The group's package says what a card is worth; the
   student's own row says how many they have left to use.

   This had no path at all. The client file's «הוספת פגישות» writes the
   CLIENT's private quota, which is a different series with a different
   price — on a group member it opened a personal track nobody asked for
   (see clientBalance's `hasPersonal`), so it is not offered to them any
   more. Extending a MEMBERSHIP is this: the member's own quota, and the
   dues that come with it.

   Both numbers move together, and the sheet says so before saving.
   Raising what someone owes is not a thing to do silently.
   ════════════════════════════════════════════════════════════════ */
export default function AddMemberSessionsModal({
  open, onClose, onSave,
  memberName = '', groupName = '', groupColor = '',
  unitPrice = 0, currentQuota = 0, currentTotal = 0,
}) {
  const { t } = useT('modalsClient')
  const [count, setCount] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  /* The arithmetic lives in lib/groupMembership so the preview below and
     the row that gets written can never be two different sums. */
  const next = renewedCard({ currentQuota, currentTotal, unitPrice, count })
  const n = next.count
  const added = Math.round((next.total - currentTotal) * 100) / 100

  const close = () => { setCount(''); setBusy(false); setErr(''); onClose() }

  const submit = async () => {
    if (busy) return
    if (!(n > 0)) { setErr(t('memberSessions.countRequired')); return }
    setBusy(true)
    setErr('')
    try {
      await onSave(next)
      close()
    } catch {
      setBusy(false)
      setErr(t('memberSessions.saveFailed'))
    }
  }

  return (
    <Modal open={open} onClose={close} onSubmit={submit} title={t('memberSessions.title')}>
      {(memberName || groupName) && (
        <Txt as="p" className="m-sub">
          <Txt className="m-sub-dot" style={{ background: groupColor || 'var(--stone)' }} />
          {[memberName, groupName].filter(Boolean).join(' · ')}
        </Txt>
      )}
      <Box className="m-field">
        <Box as="label" className="m-label">{t('memberSessions.howMany')}</Box>
        <Input
          type="number"
          min="1"
          className="m-input"
          value={count}
          onChange={(e) => { setCount(e.target.value); if (err) setErr('') }}
          placeholder="0"
          aria-label={t('memberSessions.howMany')}
        />
      </Box>

      {/* What this is about to do, in this member's own numbers. */}
      {n > 0 && (
        <Box className="adj-preview">
          <Txt as="p" className="adj-preview-line">
            {t('memberSessions.previewQuota', { from: currentQuota, to: next.quota })}
          </Txt>
          <Txt as="p" className="adj-preview-line">
            {unitPrice > 0
              ? t('memberSessions.previewMoney', { n, price: isr(unitPrice), amount: isr(added), name: memberName })
              : t('memberSessions.previewFree')}
          </Txt>
        </Box>
      )}

      {/* Where the price came from, and where to change it — the per-member
          override already exists, one screen over, and nothing said so. */}
      <Txt as="p" className="m-hint">{t('memberSessions.note')}</Txt>

      {err && <Txt as="p" className="m-error">{err}</Txt>}

      <Box className="m-actions">
        <Btn type="button" className="m-btn-cancel" onClick={close} disabled={busy}>{t('common.cancel')}</Btn>
        <Btn type="button" className="m-btn-save" onClick={submit} disabled={busy}>
          {busy ? t('common.saving') : t('common.save')}
        </Btn>
      </Box>
    </Modal>
  )
}
