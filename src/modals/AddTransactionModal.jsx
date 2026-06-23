import { useState } from 'react'
import DateField from '../components/DateField'
import Modal from './Modal'
import { showToast } from '../lib/toast'
import { useT } from '../i18n/useT'
import { useInvoiceProvider } from '../hooks/useInvoiceProvider'
import { PAY_METHODS, docTypeLabel, isReceiptType, allowedDocTypes, defaultDocType } from '../lib/invoiceDocs'

/* Local YYYY-MM-DD — UTC toISOString would misclassify "today" as future on
   Israeli evenings, flipping a same-day tx to pending. */
const todayStr = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const blank = (defaults = {}) => ({
  type: defaults.type || 'income',
  amount: defaults.amount || '',
  desc: defaults.desc || '',
  date: todayStr(),
  client_id: defaults.client_id || '',
  project_id: defaults.project_id || '',
  category_id: '',
})

/* onSave is async (Supabase insert). When `client` is provided the client is
   locked (drawer "קיבלתי תשלום" flow); otherwise a select is shown.
   `defaults` lets callers pre-fill any blank() field — used by the
   project-detail QuickRow to pre-bind project_id so the user doesn't
   have to re-pick the project they're clearly already on. */
export default function AddTransactionModal({ open, onClose, onSave, clients = [], projects = [], categories = [], onCreateCategory, client, defaultType, defaults = {} }) {
  const { t } = useT('modalsData')
  const inv = useInvoiceProvider()
  const lockedClientId = client?.id || ''
  const initial = { ...defaults, client_id: lockedClientId || defaults.client_id, type: defaultType || defaults.type }
  const [form, setForm] = useState(() => blank(initial))
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [creatingCat, setCreatingCat] = useState(false)
  const [newCatName, setNewCatName] = useState('')
  const [catBusy, setCatBusy] = useState(false)
  /* "הפק קבלה עם היצירה" — issues a real document right after the income is
     saved (one action instead of two). Only offered for income when a provider
     is connected; the doc is irreversible, so the picker mirrors the per-tx one. */
  const [issueOnCreate, setIssueOnCreate] = useState(false)
  const [issueDocType, setIssueDocType] = useState('invoice_receipt')
  const [issuePayment, setIssuePayment] = useState('bank_transfer')
  const set = (k, v) => {
    /* Leaving the expense type unmounts the inline category-creator block —
       reset its state so switching back to הוצאה shows the normal <select>. */
    if (k === 'type' && v !== 'expense') { setCreatingCat(false); setNewCatName('') }
    setForm((f) => ({ ...f, [k]: v }))
  }
  const close = () => { setForm(blank(initial)); setErr(''); setBusy(false); setCreatingCat(false); setNewCatName(''); setCatBusy(false); setIssueOnCreate(false); setIssueDocType('invoice_receipt'); setIssuePayment('bank_transfer'); onClose() }

  /* Inline "new category" creation (Option C1): only when the parent passes
     onCreateCategory. Creating one selects it immediately so the user never
     has to leave the modal to set up a category first. */
  const createCat = async () => {
    const name = newCatName.trim()
    if (!name || !onCreateCategory) return
    setCatBusy(true)
    try {
      const row = await onCreateCategory(name)
      if (row?.id) set('category_id', row.id)
      setCreatingCat(false)
      setNewCatName('')
    } catch {
      /* leave the field open so the user can retry */
    } finally {
      setCatBusy(false)
    }
  }

  const submit = async () => {
    const amount = parseFloat(form.amount)
    if (!amount || amount <= 0) { setErr(t('common.amountPositive')); return }
    setBusy(true)
    setErr('')
    const isFuture = form.date > todayStr()
    const clientId = lockedClientId || form.client_id || null
    const wantIssue = issueOnCreate && form.type === 'income' && !!clientId && !isFuture
      && !!inv.status?.connected && !inv.status?.credentials_invalid
    try {
      const row = await onSave({
        amount,
        type: form.type,
        desc: form.desc.trim() || (form.type === 'income' ? t('tx.incomeFallback') : t('tx.expenseFallback')),
        date: form.date,
        status: isFuture ? 'pending' : 'confirmed',
        project_id: form.project_id || null,
        client_id: clientId,
        category_id: form.type === 'expense' ? (form.category_id || null) : null,
        recurring_id: null,
        orphaned_from: null,
      })
      if (wantIssue && row?.id) {
        try {
          const r = await inv.issueDocument(row.id, issueDocType, { itemId: null, itemName: form.desc.trim(), paymentMethod: issuePayment })
          const num = r?.document?.number
          showToast(t('tx.savedAndIssued', { doc: docTypeLabel(issueDocType), num: num ? t('tx.numPrefix', { num }) : '' }))
        } catch (e) {
          // Surface the provider's real reason (e.detail) when present, instead
          // of a bare "issue failed" — same actionable detail the per-tx flow shows.
          showToast(e?.detail ? `${t('tx.issueFailed')} (${e.detail})` : t('tx.issueFailed'), 'error')
        }
      } else {
        showToast(t('tx.saved'))
      }
      close()
    } catch (e) {
      setBusy(false)
      setErr(t('common.saveFailed', { error: e.message || t('common.tryAgain') }))
    }
  }

  const amountInvalid = !!err && !(parseFloat(form.amount) > 0)
  /* Issue-on-creation is offered only for income when a usable provider is
     connected; the body explains the missing piece (client / future date). */
  const issuable = form.type === 'income' && !!inv.status?.connected && !inv.status?.credentials_invalid
  const hasClient = !!(lockedClientId || form.client_id)
  const futureDate = form.date > todayStr()

  return (
    <Modal open={open} onClose={close} title={client ? t('tx.titlePayment') : t('tx.titleNew')}>
      {client && (
        <p className="m-sub">
          <span className="m-sub-dot" style={{ background: 'var(--sage)' }} />
          {client.name}
        </p>
      )}
      <div className="m-field">
        <div className="m-pills">
          <button type="button" className={`m-pill${form.type === 'income' ? ' on income' : ''}`} onClick={() => set('type', 'income')}>{t('common.income')}</button>
          <button type="button" className={`m-pill${form.type === 'expense' ? ' on expense' : ''}`} onClick={() => set('type', 'expense')}>{t('common.expense')}</button>
        </div>
      </div>
      <div className="m-row2">
        <div className="m-field">
          <label className="m-label">{t('common.amount')}</label>
          <input
            type="number"
            min="0"
            className={`m-input${amountInvalid ? ' err' : ''}`}
            value={form.amount}
            onChange={(e) => { set('amount', e.target.value); if (err) setErr('') }}
            placeholder="0"
          />
        </div>
        <div className="m-field">
          <label className="m-label">{t('common.date')}</label>
          <DateField value={form.date} onChange={(e) => set('date', e.target.value)} />
          {form.date > todayStr() && (
            <p className="m-hint">{t('tx.futureHint')}</p>
          )}
        </div>
      </div>
      <div className="m-field">
        <label className="m-label">{t('common.description')}</label>
        <input className="m-input" value={form.desc} onChange={(e) => set('desc', e.target.value)} placeholder={t('tx.descPlaceholder')} />
      </div>
      {client ? (
        <div className="m-field">
          <label className="m-label">{t('common.project')}</label>
          <select className="m-select" value={form.project_id} onChange={(e) => set('project_id', e.target.value)}>
            <option value="">{t('common.none')}</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
      ) : (
        <div className="m-row2">
          <div className="m-field">
            <label className="m-label">{t('common.client')}</label>
            <select className="m-select" value={form.client_id} onChange={(e) => set('client_id', e.target.value)}>
              <option value="">{t('common.none')}</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="m-field">
            <label className="m-label">{t('common.project')}</label>
            <select className="m-select" value={form.project_id} onChange={(e) => set('project_id', e.target.value)}>
              <option value="">{t('common.none')}</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        </div>
      )}

      {form.type === 'expense' && (
        <div className="m-field">
          <label className="m-label">{t('common.category')}</label>
          {creatingCat ? (
            <div className="m-cat-create">
              <input
                className="m-input"
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); createCat() } }}
                placeholder={t('tx.newCatPlaceholder')}
                autoFocus
              />
              <button type="button" className="m-cat-add" onClick={createCat} disabled={catBusy || !newCatName.trim()}>
                {catBusy ? '…' : t('common.add')}
              </button>
              <button type="button" className="m-cat-cancel" onClick={() => { setCreatingCat(false); setNewCatName('') }}>
                {t('common.cancel')}
              </button>
            </div>
          ) : (
            <select
              className="m-select"
              value={form.category_id}
              onChange={(e) => {
                if (e.target.value === '__new__') { setCreatingCat(true); return }
                set('category_id', e.target.value)
              }}
            >
              <option value="">{t('common.noCategory')}</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              {onCreateCategory && <option value="__new__">{t('tx.newCatOption')}</option>}
            </select>
          )}
        </div>
      )}

      {issuable && (
        <div className="m-field m-issue">
          {!hasClient ? (
            <p className="m-hint">{t('tx.issueNeedsClient')}</p>
          ) : futureDate ? (
            <p className="m-hint">{t('tx.issueFutureBlocked')}</p>
          ) : (
            <>
              <label className="m-issue-toggle">
                <input type="checkbox" checked={issueOnCreate} onChange={(e) => { const on = e.target.checked; setIssueOnCreate(on); if (on) setIssueDocType(defaultDocType(inv.status?.business_type)) }} />
                <span>{t('tx.issueOnSave')}</span>
              </label>
              {issueOnCreate && (
                <div className="m-issue-opts">
                  <div className="m-pills m-issue-types">
                    {allowedDocTypes(inv.status?.business_type).map((d) => (
                      <button key={d.key} type="button" className={`m-pill${issueDocType === d.key ? ' on' : ''}`} onClick={() => setIssueDocType(d.key)}>{d.label}</button>
                    ))}
                  </div>
                  {isReceiptType(issueDocType) && (
                    <select className="m-select" value={issuePayment} onChange={(e) => setIssuePayment(e.target.value)} aria-label={t('tx.paymentMethodAria')}>
                      {PAY_METHODS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
                    </select>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {err && <p className="m-error">{err}</p>}

      <div className="m-actions">
        <button type="button" className="m-btn-cancel" onClick={close}>{t('common.cancel')}</button>
        <button type="button" className="m-btn-save" onClick={submit} disabled={busy}>{busy ? t('common.saving') : t('common.save')}</button>
      </div>
    </Modal>
  )
}
