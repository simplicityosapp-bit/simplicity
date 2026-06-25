import { useState } from 'react'
import DateField from '../components/DateField'
import Modal from './Modal'
import { showToast } from '../lib/toast'
import { useT } from '../i18n/useT'
import { useInvoiceProvider } from '../hooks/useInvoiceProvider'
import { PAY_METHODS, payMethodLabel, docTypeLabel, isReceiptType, allowedDocTypes, defaultDocType, clampDocType } from '../lib/invoiceDocs'

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
  payment_method: defaults.payment_method || '',
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
  /* Ad-hoc recipient — issue a receipt for someone who ISN'T a client. Active
     when the client select is the "__adhoc__" sentinel (income only, standalone
     add flow). The details are saved on the transaction (recipient_*). */
  const [recipient, setRecipient] = useState({ name: '', email: '', phone: '', tax_id: '' })
  const setRcp = (k, v) => setRecipient((r) => ({ ...r, [k]: v }))
  const adHoc = form.type === 'income' && !lockedClientId && form.client_id === '__adhoc__'
  const set = (k, v) => {
    /* Leaving the expense type unmounts the inline category-creator block —
       reset its state so switching back to הוצאה shows the normal <select>. */
    if (k === 'type' && v !== 'expense') { setCreatingCat(false); setNewCatName('') }
    setForm((f) => {
      const next = { ...f, [k]: v }
      /* Leaving income → the ad-hoc recipient option no longer applies. */
      if (k === 'type' && v !== 'income' && f.client_id === '__adhoc__') next.client_id = ''
      return next
    })
  }
  const close = () => { setForm(blank(initial)); setErr(''); setBusy(false); setCreatingCat(false); setNewCatName(''); setCatBusy(false); setIssueOnCreate(false); setIssueDocType('invoice_receipt'); setIssuePayment('bank_transfer'); setRecipient({ name: '', email: '', phone: '', tax_id: '' }); onClose() }

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
    if (adHoc && !recipient.name.trim()) { setErr(t('tx.recipientNameRequired')); return }
    setBusy(true)
    setErr('')
    const isFuture = form.date > todayStr()
    const clientId = lockedClientId || (form.client_id && form.client_id !== '__adhoc__' ? form.client_id : null)
    const wantIssue = issueOnCreate && form.type === 'income' && (!!clientId || adHoc) && !isFuture
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
        payment_method: form.payment_method || null,
        recurring_id: null,
        orphaned_from: null,
        /* Ad-hoc recipient details ride on the income tx (only when in ad-hoc
           mode — normal client-linked inserts are byte-identical to before). */
        ...(adHoc ? {
          recipient_name: recipient.name.trim(),
          recipient_email: recipient.email.trim() || null,
          recipient_phone: recipient.phone.trim() || null,
          recipient_tax_id: recipient.tax_id.trim() || null,
        } : {}),
      })
      if (wantIssue && row?.id) {
        try {
          // Clamp to what this business may issue — the toggle's default can be
          // stale if status loaded after it was checked (would 2403 post-save).
          const docType = clampDocType(inv.status?.business_type, issueDocType)
          const r = await inv.issueDocument(row.id, docType, { itemId: null, itemName: form.desc.trim(), paymentMethod: form.payment_method || issuePayment })
          const num = r?.document?.number
          showToast(t('tx.savedAndIssued', { doc: docTypeLabel(docType), num: num ? t('tx.numPrefix', { num }) : '' }))
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
  /* An issuable target = a real client OR a named ad-hoc recipient. */
  const hasClient = !!(lockedClientId || (form.client_id && form.client_id !== '__adhoc__') || (adHoc && recipient.name.trim()))
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
      <div className="m-field">
        <label className="m-label">{t('tx.paymentMethod')}</label>
        <select className="m-select" value={form.payment_method} onChange={(e) => set('payment_method', e.target.value)}>
          <option value="">{t('tx.paymentMethodNone')}</option>
          {PAY_METHODS.map((m) => <option key={m.key} value={m.key}>{payMethodLabel(m.key)}</option>)}
        </select>
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
              {form.type === 'income' && <option value="__adhoc__">{t('tx.recipientAdHoc')}</option>}
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

      {adHoc && (
        <div className="m-field m-recipient">
          <p className="m-hint">{t('tx.recipientHint')}</p>
          <input
            className="m-input"
            value={recipient.name}
            onChange={(e) => setRcp('name', e.target.value)}
            placeholder={t('tx.recipientNamePlaceholder')}
          />
          <div className="m-row2">
            <input className="m-input" type="email" value={recipient.email} onChange={(e) => setRcp('email', e.target.value)} placeholder={t('tx.recipientEmailPlaceholder')} />
            <input className="m-input" value={recipient.phone} onChange={(e) => setRcp('phone', e.target.value)} placeholder={t('tx.recipientPhonePlaceholder')} />
          </div>
          <input className="m-input" value={recipient.tax_id} onChange={(e) => setRcp('tax_id', e.target.value)} placeholder={t('tx.recipientTaxIdPlaceholder')} />
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
                      <button key={d.key} type="button" className={`m-pill${issueDocType === d.key ? ' on' : ''}`} onClick={() => setIssueDocType(d.key)}>{docTypeLabel(d.key)}</button>
                    ))}
                  </div>
                  {/* Receipt payment method: the transaction's own אמצעי תשלום
                      drives the receipt when set (no duplicate picker); only
                      ask here when the transaction left it blank. */}
                  {isReceiptType(issueDocType) && (
                    form.payment_method ? (
                      <p className="m-hint">{t('tx.receiptUsesMethod', { method: payMethodLabel(form.payment_method) })}</p>
                    ) : (
                      <select className="m-select" value={issuePayment} onChange={(e) => setIssuePayment(e.target.value)} aria-label={t('tx.paymentMethodAria')}>
                        {PAY_METHODS.map((m) => <option key={m.key} value={m.key}>{payMethodLabel(m.key)}</option>)}
                      </select>
                    )
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
