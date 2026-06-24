import { useState, useEffect, useMemo, useRef } from 'react'
import { ChevronDown, Plus, Check, RotateCcw, Trash2, CreditCard } from 'lucide-react'
import DateField from '../../components/DateField'
import { usePaymentPlans } from '../../hooks/usePaymentPlans'
import { planInstallments, planBalance, firstOfNextMonth, generateInstallments } from '../../lib/paymentPlans'
import { PAY_METHODS, payMethodLabel } from '../../lib/invoiceDocs'
import { isr } from '../../lib/finance'
import { fmtShortDate } from '../../lib/dates'
import { useT } from '../../i18n/useT'
import './PaymentPlanSection.css'

/* ════════════════════════════════════════════════════════════════
   PAYMENT PLAN SECTION — split a client's total into installments and
   track which were received. Self-contained: pulls plans/installments
   from usePaymentPlans and filters to this client (one active plan per
   client in v1). Marking an installment received creates a linked income
   transaction (see the hook), so finance + the client balance stay in sync.
   ════════════════════════════════════════════════════════════════ */
export default function PaymentPlanSection({ client }) {
  const { t } = useT('clients')
  const { plans, installments, loading, createPlan, markReceived, unmarkReceived, removePlan } = usePaymentPlans()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ total: '', count: '3', startDate: firstOfNextMonth() })
  const [busy, setBusy] = useState(false)
  /* Inline "received" flow: which installment id is being confirmed + its method. */
  const [receiving, setReceiving] = useState(null) // { id, method }
  const [confirmDelete, setConfirmDelete] = useState(false)

  const plan = plans.find((p) => p.client_id === client.id) || null
  const rows = plan ? planInstallments(plan.id, installments) : []
  const bal = plan ? planBalance(plan, rows) : null

  /* Auto-open the section ONCE when a plan is found, so a client with an
     active plan surfaces it without a manual tap (respects later toggles). */
  const autoOpenedRef = useRef(false)
  useEffect(() => {
    if (plan && !autoOpenedRef.current) { setOpen(true); autoOpenedRef.current = true }
  }, [plan])

  /* Live preview of the schedule the create form will generate, so the user
     sees "6 × ₪600" before committing. */
  const preview = useMemo(() => {
    const total = parseFloat(form.total); const count = parseInt(form.count, 10)
    if (!(total > 0) || !(count >= 1)) return null
    const gen = generateInstallments({ total, count, startDate: form.startDate || undefined })
    return { count, first: gen[0].amount, last: gen[gen.length - 1].amount }
  }, [form.total, form.count, form.startDate])

  const submitCreate = async () => {
    const total = parseFloat(form.total)
    const count = parseInt(form.count, 10)
    if (!(total > 0) || !(count >= 1)) return
    setBusy(true)
    try {
      await createPlan({ client_id: client.id, project_id: client.project_id || null, total, count, startDate: form.startDate || null })
    } finally { setBusy(false) }
  }

  const confirmReceived = async (inst) => {
    setBusy(true)
    try {
      await markReceived(inst, { plan, clientName: client.name, date: new Date().toISOString().slice(0, 10), paymentMethod: receiving?.method || null })
      setReceiving(null)
    } finally { setBusy(false) }
  }

  const doDelete = async () => {
    setBusy(true)
    try { await removePlan(plan.id); setConfirmDelete(false) } finally { setBusy(false) }
  }

  const headerCount = plan ? `${bal.receivedCount}/${rows.length}` : null

  return (
    <div className={`cd-section pp-section${open ? ' open' : ''}`}>
      <div className="cd-sec-head">
        <button type="button" className="cd-sec-toggle" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          <span className="cd-sec-title">
            {t('plan.title')}
            {headerCount && <span className="cd-sec-count">{headerCount}</span>}
          </span>
          <ChevronDown size={16} strokeWidth={1.6} className="cd-sec-chev" aria-hidden="true" />
        </button>
      </div>

      {open && (
        <div className="cd-sec-body">
          {loading ? (
            <p className="cd-empty">{t('plan.loading')}</p>
          ) : plan ? (
            <>
              <div className="pp-summary">
                <div className="pp-sum-cell"><span className="pp-sum-l">{t('plan.total')}</span><span className="pp-sum-v mono">{isr(bal.total)}</span></div>
                <div className="pp-sum-cell"><span className="pp-sum-l">{t('plan.received')}</span><span className="pp-sum-v mono">{isr(bal.received)}</span></div>
                <div className="pp-sum-cell"><span className="pp-sum-l">{t('plan.remaining')}</span><span className="pp-sum-v mono">{isr(bal.remaining)}</span></div>
              </div>

              <div className="pp-list">
                {rows.map((inst) => (
                  <div key={inst.id} className={`pp-inst${inst.received ? ' paid' : ''}`}>
                    <span className="pp-inst-num">{inst.num}/{plan.num_installments}</span>
                    <div className="pp-inst-mid">
                      <span className="pp-inst-amt mono">{isr(inst.amount)}</span>
                      <span className="pp-inst-date">
                        {inst.received
                          ? t('plan.receivedOn', { date: fmtShortDate(inst.received_date), method: inst.payment_method ? ` · ${payMethodLabel(inst.payment_method)}` : '' })
                          : t('plan.due', { date: fmtShortDate(inst.due_date) })}
                      </span>
                    </div>
                    {inst.received ? (
                      <button type="button" className="pp-btn ghost" disabled={busy} onClick={() => unmarkReceived(inst)} title={t('plan.undo')} aria-label={t('plan.undo')}>
                        <RotateCcw size={13} strokeWidth={1.9} aria-hidden="true" />
                      </button>
                    ) : receiving?.id === inst.id ? (
                      <span className="pp-receive">
                        <select className="pp-method" value={receiving.method || ''} onChange={(e) => setReceiving({ id: inst.id, method: e.target.value })} aria-label={t('plan.methodAria')}>
                          <option value="">{t('plan.methodNone')}</option>
                          {PAY_METHODS.map((m) => <option key={m.key} value={m.key}>{payMethodLabel(m.key)}</option>)}
                        </select>
                        <button type="button" className="pp-btn primary" disabled={busy} onClick={() => confirmReceived(inst)}>{t('plan.confirmReceived')}</button>
                        <button type="button" className="pp-btn ghost" disabled={busy} onClick={() => setReceiving(null)}>{t('plan.cancel')}</button>
                      </span>
                    ) : (
                      <button type="button" className="pp-btn mark" disabled={busy} onClick={() => setReceiving({ id: inst.id, method: '' })}>
                        <Check size={13} strokeWidth={2} aria-hidden="true" /> {t('plan.markReceived')}
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {confirmDelete ? (
                <div className="pp-del-confirm">
                  <span>{t('plan.deleteConfirm')}</span>
                  <button type="button" className="pp-btn danger" disabled={busy} onClick={doDelete}>{t('plan.delete')}</button>
                  <button type="button" className="pp-btn ghost" disabled={busy} onClick={() => setConfirmDelete(false)}>{t('plan.cancel')}</button>
                </div>
              ) : (
                <button type="button" className="pp-del" onClick={() => setConfirmDelete(true)}>
                  <Trash2 size={12} strokeWidth={1.7} aria-hidden="true" /> {t('plan.delete')}
                </button>
              )}
            </>
          ) : (
            <div className="pp-create">
              <p className="pp-create-intro">{t('plan.createIntro')}</p>
              <div className="pp-create-row">
                <label className="pp-field">
                  <span className="pp-field-l">{t('plan.totalLabel')}</span>
                  <input className="pp-input" type="number" min="0" value={form.total} placeholder="0"
                    onChange={(e) => setForm((f) => ({ ...f, total: e.target.value }))} />
                </label>
                <label className="pp-field">
                  <span className="pp-field-l">{t('plan.countLabel')}</span>
                  <input className="pp-input" type="number" min="1" value={form.count}
                    onChange={(e) => setForm((f) => ({ ...f, count: e.target.value }))} />
                </label>
              </div>
              <label className="pp-field">
                <span className="pp-field-l">{t('plan.startLabel')}</span>
                <DateField value={form.startDate} onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))} />
              </label>
              {preview && (
                <p className="pp-preview">
                  {isr(preview.first) === isr(preview.last)
                    ? t('plan.previewEven', { count: preview.count, amount: isr(preview.first) })
                    : t('plan.previewUneven', { count: preview.count, amount: isr(preview.first), last: isr(preview.last) })}
                </p>
              )}
              <button type="button" className="pp-btn primary pp-create-go" disabled={busy || !(parseFloat(form.total) > 0)} onClick={submitCreate}>
                <Plus size={14} strokeWidth={2} aria-hidden="true" /> {t('plan.create')}
              </button>
              <p className="pp-create-note"><CreditCard size={12} strokeWidth={1.7} aria-hidden="true" /> {t('plan.createNote')}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
