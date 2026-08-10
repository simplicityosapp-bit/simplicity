import { useState } from 'react'
import { Check } from 'lucide-react'
import { addMonths } from '@simplicity/core'
import Modal from './Modal'
import DateField from '../components/DateField'
import { useT } from '../i18n/useT'
import { Box, Txt, Btn } from '../components/ui'

/* ════════════════════════════════════════════════════════════════
   When to chase this lead again — set from the card.
   ════════════════════════════════════════════════════════════════
   follow_up_date already drives three things: the "דרושה תשומת לב"
   widget, the follow-ups banner on the leads screen, and a soft event
   in the calendar. Until now the card could only SHOW it — changing it
   meant opening the whole lead editor, which is a lot of form for one
   date (beta request).

   Most follow-ups are "tomorrow", "next week" or "next month", so those
   are one tap and the picker is there for the rest. A lead that already
   has a date can also be cleared from here, the same "done" the banner
   and the calendar already offer — the point of the request was to stop
   sending people to the editor for this.

   Local dates throughout: a UTC round-trip would slip the day on an
   Israeli evening, which is exactly when a coach sets these.
   ════════════════════════════════════════════════════════════════ */
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const todayYmd = () => ymd(new Date())
const plusDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return ymd(d) }

export default function LeadFollowupModal({ open, onClose, lead, onSave }) {
  const { t } = useT('leads')
  const [custom, setCustom] = useState('')
  const [picking, setPicking] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const close = () => { setCustom(''); setPicking(false); setBusy(false); setErr(''); onClose() }

  const commit = async (date) => {
    if (busy) return
    setBusy(true)
    setErr('')
    try {
      await onSave(date)
      close()
    } catch (e) {
      setBusy(false)
      setErr(t('followup.saveFailed', { error: e.message || '' }))
    }
  }

  const PRESETS = [
    { k: 'tomorrow', date: plusDays(1) },
    { k: 'week', date: plusDays(7) },
    { k: 'month', date: addMonths(todayYmd(), 1) },
  ]
  const hasDate = !!lead?.follow_up_date

  return (
    <Modal
      open={open}
      onClose={close}
      title={t('followup.title')}
      titleLabel={t('followup.titleAria', { name: lead?.name || '' })}
    >
      <Txt as="p" className="m-sub">{lead?.name}</Txt>

      <Box className="lfu-choices">
        {PRESETS.map((p) => (
          <Btn key={p.k} type="button" className="lfu-choice" disabled={busy} onClick={() => commit(p.date)}>
            <Txt className="lfu-choice-label">{t(`followup.${p.k}`)}</Txt>
            <Txt className="lfu-choice-date mono">{p.date.slice(8, 10)}/{p.date.slice(5, 7)}</Txt>
          </Btn>
        ))}
      </Box>

      {/* A column, not two inline children: .m-clear-link is inline-block and
          .lfu-done inline-flex, so left to flow they shared a line and
          collided. */}
      <Box className="lfu-rest">
        {picking ? (
          <Box className="m-field lfu-custom">
            <Box as="label" className="m-label">{t('followup.otherDate')}</Box>
            <DateField value={custom} onChange={(e) => setCustom(e.target.value)} />
            <Btn
              type="button"
              className="empty-action lfu-custom-save"
              disabled={busy || !custom}
              onClick={() => commit(custom)}
            >
              {t('followup.setIt')}
            </Btn>
          </Box>
        ) : (
          <Btn type="button" className="m-clear-link" onClick={() => setPicking(true)}>
            {t('followup.otherDate')}
          </Btn>
        )}

        {/* Only offered when there is something to clear. Same act as the
            banner's and the calendar's "done" — it empties follow_up_date. */}
        {hasDate && (
          <Btn type="button" className="lfu-done" disabled={busy} onClick={() => commit(null)}>
            <Check size={15} strokeWidth={2} aria-hidden="true" />
            {t('followup.markDone')}
          </Btn>
        )}
      </Box>

      {err && <Txt as="p" className="m-error">{err}</Txt>}

      <Box className="m-actions">
        <Btn type="button" className="m-btn-cancel" onClick={close}>{t('followup.cancel')}</Btn>
      </Box>
    </Modal>
  )
}
