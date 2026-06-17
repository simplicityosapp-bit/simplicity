import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { useRecurring } from '../../../hooks/useRecurring'
import { useT } from '../../../i18n/useT'
import { isr } from '../../../lib/finance'

/* Quick-fill presets. "Other" clears the composer so the user types their own.
   The localized label doubles as the prefilled description. */
const PRESETS = [
  { k: 'rent',      labelKey: 'step7.presetRent',      type: 'expense', amount: 3500 },
  { k: 'insurance', labelKey: 'step7.presetInsurance', type: 'expense', amount: 220 },
  { k: 'phone',     labelKey: 'step7.presetPhone',     type: 'expense', amount: 70  },
  { k: 'office',    labelKey: 'step7.presetOffice',    type: 'expense', amount: 950 },
  { k: 'other',     labelKey: 'step7.presetOther',     clear: true },
]

/* Step 7 — recurring items. Optional, and now multi-add: each "הוסף לרשימה"
   commits a real recurring_templates row and clears the composer so the user
   can stack several (mirrors the step-4 client flow). monthly_date cadence;
   on_meeting / every-X-days can be set later from the finance screen. */
export default function Step7Recurring({ ob, setCTA }) {
  const { t } = useT('onboardingSteps')
  const { addRecurring, removeRecurring } = useRecurring()
  const initial = ob.state.answers?.recurring || {}
  const [type, setType] = useState('expense')
  const [desc, setDesc] = useState('')
  const [amount, setAmount] = useState('')
  const [dayOfMonth, setDayOfMonth] = useState(1)
  const [added, setAdded] = useState(initial.added || [])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const tryAgain = t('step7.tryAgainVerb')
  const composerValid = desc.trim().length > 0 && Number(amount) > 0
  const canAdvance = added.length > 0 || composerValid
  useEffect(() => { setCTA({ onNext, canAdvance, busy, hint: null }) }, [type, desc, amount, dayOfMonth, added, busy, canAdvance]) // eslint-disable-line react-hooks/exhaustive-deps

  const fillPreset = (p) => {
    if (p.clear) { setType('expense'); setDesc(''); setAmount(''); return }
    setType(p.type); setDesc(t(p.labelKey)); setAmount(p.amount)
  }
  const resetComposer = () => { setType('expense'); setDesc(''); setAmount(''); setDayOfMonth(1) }

  const buildRow = () => ({
    type,
    amount: Number(amount),
    desc: desc.trim(),
    client_id: null,
    project_id: null,
    category_id: null,
    cadence_type: 'monthly_date',
    day_of_month: Number(dayOfMonth) || 1,
    day_of_week: null,
    trigger_type: 'schedule',
    until_date: null,
    active: true,
  })

  /* Commit the composer to a real row, stash it in the list + answers,
     and clear the fields so the next one can be entered. */
  const commitComposer = async () => {
    const row = await addRecurring(buildRow())
    const next = [...added, { id: row.id, desc: desc.trim(), amount: Number(amount), type }]
    setAdded(next)
    await ob.setAnswers('recurring', { added: next, created_ids: next.map((a) => a.id) })
    return next
  }

  const onAddToList = async () => {
    if (!composerValid) return
    setBusy(true); setErr('')
    try { await commitComposer(); resetComposer() }
    catch (e) { setErr(t('step7.errSaveFail', { error: e.message || tryAgain })) }
    finally { setBusy(false) }
  }

  const onRemove = async (id) => {
    try { await removeRecurring(id) } catch { /* non-fatal — keep the UI in sync regardless */ }
    const next = added.filter((a) => a.id !== id)
    setAdded(next)
    await ob.setAnswers('recurring', { added: next, created_ids: next.map((a) => a.id) })
  }

  const onNext = async () => {
    setBusy(true); setErr('')
    try {
      if (composerValid) await commitComposer()
      await ob.advance()
    } catch (e) {
      setErr(t('step7.errSaveFail', { error: e.message || tryAgain }))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <p className="ob-intro">{t('step7.intro')}</p>
      <p className="ob-intro-sub">{t('step7.introSub', { verb: t('step7.introSubVerb') })}</p>

      <div className="ob-field">
        <p className="ob-label">{t('step7.quickSuggestions')}</p>
        <div className="ob-pills">
          {PRESETS.map((p) => {
            const presetLabel = t(p.labelKey)
            return (
            <button
              key={p.k}
              type="button"
              className={`ob-pill${!p.clear && desc === presetLabel ? ' on' : ''}`}
              onClick={() => fillPreset(p)}
            >
              {presetLabel}
            </button>
          )})}
        </div>
      </div>

      <div className="ob-step-grid">
        <div className="ob-field">
          <label className="ob-label">{t('step7.typeLabel')}</label>
          <div className="ob-pills">
            <button type="button" className={`ob-pill${type === 'expense' ? ' on' : ''}`} onClick={() => setType('expense')}>{t('step7.expense')}</button>
            <button type="button" className={`ob-pill${type === 'income' ? ' on' : ''}`} onClick={() => setType('income')}>{t('step7.income')}</button>
          </div>
        </div>
        <div className="ob-field">
          <label className="ob-label" htmlFor="ob-r-day">{t('step7.dayOfMonthLabel')}</label>
          <input
            id="ob-r-day"
            className="ob-input"
            type="number"
            min="1"
            max="28"
            value={dayOfMonth}
            onChange={(e) => setDayOfMonth(e.target.value)}
          />
        </div>
      </div>

      <div className="ob-field">
        <label className="ob-label" htmlFor="ob-r-desc">{t('step7.descLabel')}</label>
        <input
          id="ob-r-desc"
          className="ob-input"
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          placeholder={t('step7.descPlaceholder')}
        />
      </div>
      <div className="ob-field">
        <label className="ob-label" htmlFor="ob-r-amt">{t('step7.amountLabel')}</label>
        <input
          id="ob-r-amt"
          className="ob-input"
          type="number"
          min="0"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
      </div>

      {composerValid && (
        <button type="button" className="ob-pc-add" onClick={onAddToList} disabled={busy}>
          + {t('step7.addToListVerb')} {t('step7.toList')}
        </button>
      )}

      {added.length > 0 && (
        <div className="ob-field">
          <p className="ob-label">{t('step7.addedHeading', { count: added.length })}</p>
          <div className="ob-pc-group-list">
            {added.map((a) => (
              <div key={a.id} className="ob-pc-group">
                <span className="ob-pc-group-color" style={{ background: a.type === 'income' ? 'var(--sage)' : 'var(--clay)' }} />
                <div className="ob-pc-group-body">
                  <p className="ob-pc-group-name">{a.desc}</p>
                  <p className="ob-pc-group-meta">{a.type === 'income' ? t('step7.income') : t('step7.expense')} · {isr(a.amount)}</p>
                </div>
                <button type="button" className="ob-pc-group-x" onClick={() => onRemove(a.id)} aria-label={t('step7.removeAria', { name: a.desc })}>
                  <X size={13} strokeWidth={2} aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {err && <p className="ob-empty-hint" style={{ color: 'var(--clay)' }}>{err}</p>}

    </>
  )
}
