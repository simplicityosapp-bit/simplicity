import { useMemo, useState } from 'react'
import DateField from '../components/DateField'
import SelectMenu from '../components/SelectMenu'
import Modal from './Modal'
import { showToast } from '../lib/toast'
import { useT } from '../i18n/useT'
import { useInvoiceProvider } from '../hooks/useInvoiceProvider'
import { effectiveClientMeta } from '../lib/clients'
import { PAY_METHODS, payMethodLabel, docTypeLabel, isReceiptType, allowedDocTypes, defaultDocType, clampDocType } from '../lib/invoiceDocs'
import { Box, Txt, Btn, Input } from '../components/ui'

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
export default function AddTransactionModal({ open, onClose, onSave, clients = [], projects = [], categories = [], onCreateCategory, client, defaultType, defaults = {}, members = [], groups = [] }) {
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
          // Mirror the per-tx issue picker (InvoiceActions): for SUMIT, link the
          // line to a real catalog product/service (Item.ID) by defaulting to the
          // first catalog item, instead of emitting a free-text-only line. Green
          // Invoice ignores the id (uses the name as the line), so only SUMIT
          // needs this; if the catalog can't load we fall back to free text.
          let itemId = null
          let itemName = form.desc.trim()
          if (inv.status?.provider === 'sumit') {
            try {
              const items = await inv.loadItems()
              if (Array.isArray(items) && items.length) {
                itemId = String(items[0].id)
                itemName = items[0].name || itemName
              }
            } catch { /* catalog unavailable — issue with a free-text line */ }
          }
          const r = await inv.issueDocument(row.id, docType, { itemId, itemName, paymentMethod: form.payment_method || issuePayment })
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

  /* Standard-dropdown option lists. The client picker shows ACTIVE clients on
     first open and reveals the rest only via search (searchOnly), then the
     "new client" action row; the others mirror their old <select>s. */
  const payOptions = [{ value: '', label: t('tx.paymentMethodNone') }, ...PAY_METHODS.map((m) => ({ value: m.key, label: payMethodLabel(m.key) }))]
  const projectOptions = [{ value: '', label: t('common.none') }, ...projects.map((p) => ({ value: p.id, label: p.name }))]
  const clientOptions = useMemo(() => {
    const opts = [{ value: '', label: t('common.none') }]
    clients.forEach((c) => opts.push({ value: c.id, label: c.name, searchOnly: effectiveClientMeta(c, members, groups) !== 'active' }))
    if (form.type === 'income') opts.push({ value: '__adhoc__', label: t('tx.recipientAdHoc'), accent: true })
    return opts
  }, [clients, members, groups, form.type, t])
  const categoryOptions = [
    { value: '', label: t('common.noCategory') },
    ...categories.map((c) => ({ value: c.id, label: c.name })),
    ...(onCreateCategory ? [{ value: '__new__', label: t('tx.newCatOption'), accent: true }] : []),
  ]

  return (
    <Modal open={open} onClose={close} title={client ? t('tx.titlePayment') : t('tx.titleNew')}>
      {client && (
        <Txt as="p" className="m-sub">
          <Txt className="m-sub-dot" style={{ background: 'var(--sage)' }} />
          {client.name}
        </Txt>
      )}
      <Box className="m-field">
        <Box className="m-pills">
          <Btn type="button" className={`m-pill${form.type === 'income' ? ' on income' : ''}`} onClick={() => set('type', 'income')}>{t('common.income')}</Btn>
          <Btn type="button" className={`m-pill${form.type === 'expense' ? ' on expense' : ''}`} onClick={() => set('type', 'expense')}>{t('common.expense')}</Btn>
        </Box>
      </Box>
      <Box className="m-row2">
        <Box className="m-field">
          <Box as="label" className="m-label">{t('common.amount')}</Box>
          <Input
            type="number"
            min="0"
            className={`m-input${amountInvalid ? ' err' : ''}`}
            value={form.amount}
            onChange={(e) => { set('amount', e.target.value); if (err) setErr('') }}
            placeholder="0"
          />
        </Box>
        <Box className="m-field">
          <Box as="label" className="m-label">{t('common.date')}</Box>
          <DateField value={form.date} onChange={(e) => set('date', e.target.value)} />
          {form.date > todayStr() && (
            <Txt as="p" className="m-hint">{t('tx.futureHint')}</Txt>
          )}
        </Box>
      </Box>
      <Box className="m-field">
        <Box as="label" className="m-label">{t('common.description')}</Box>
        <Input className="m-input" value={form.desc} onChange={(e) => set('desc', e.target.value)} placeholder={t('tx.descPlaceholder')} />
      </Box>
      <Box className="m-field">
        <Box as="label" className="m-label">{t('tx.paymentMethod')}</Box>
        <SelectMenu value={form.payment_method} onChange={(v) => set('payment_method', v)} options={payOptions} placeholder={t('tx.paymentMethodNone')} ariaLabel={t('tx.paymentMethod')} />
      </Box>
      {client ? (
        <Box className="m-field">
          <Box as="label" className="m-label">{t('common.project')}</Box>
          <SelectMenu value={form.project_id} onChange={(v) => set('project_id', v)} options={projectOptions} placeholder={t('common.none')} ariaLabel={t('common.project')} />
        </Box>
      ) : (
        <>
          <Box className="m-field">
            <Box as="label" className="m-label">{t('common.client')}</Box>
            <SelectMenu
              value={form.client_id}
              onChange={(v) => set('client_id', v)}
              options={clientOptions}
              placeholder={t('common.none')}
              ariaLabel={t('common.client')}
              searchable
              searchPlaceholder={t('common.client')}
            />
          </Box>
          <Box className="m-field">
            <Box as="label" className="m-label">{t('common.project')}</Box>
            <SelectMenu value={form.project_id} onChange={(v) => set('project_id', v)} options={projectOptions} placeholder={t('common.none')} ariaLabel={t('common.project')} />
          </Box>
        </>
      )}

      {adHoc && (
        <Box className="m-field m-recipient">
          <Txt as="p" className="m-hint">{t('tx.recipientHint')}</Txt>
          <Input
            className="m-input"
            value={recipient.name}
            onChange={(e) => setRcp('name', e.target.value)}
            placeholder={t('tx.recipientNamePlaceholder')}
          />
          <Box className="m-row2">
            <Input className="m-input" type="email" value={recipient.email} onChange={(e) => setRcp('email', e.target.value)} placeholder={t('tx.recipientEmailPlaceholder')} />
            <Input className="m-input" value={recipient.phone} onChange={(e) => setRcp('phone', e.target.value)} placeholder={t('tx.recipientPhonePlaceholder')} />
          </Box>
          <Input className="m-input" value={recipient.tax_id} onChange={(e) => setRcp('tax_id', e.target.value)} placeholder={t('tx.recipientTaxIdPlaceholder')} />
        </Box>
      )}

      {form.type === 'expense' && (
        <Box className="m-field">
          <Box as="label" className="m-label">{t('common.category')}</Box>
          {creatingCat ? (
            <Box className="m-cat-create">
              <Input
                className="m-input"
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); createCat() } }}
                placeholder={t('tx.newCatPlaceholder')}
                autoFocus
              />
              <Btn type="button" className="m-cat-add" onClick={createCat} disabled={catBusy || !newCatName.trim()}>
                {catBusy ? '…' : t('common.add')}
              </Btn>
              <Btn type="button" className="m-cat-cancel" onClick={() => { setCreatingCat(false); setNewCatName('') }}>
                {t('common.cancel')}
              </Btn>
            </Box>
          ) : (
            <SelectMenu
              value={form.category_id}
              onChange={(v) => { if (v === '__new__') { setCreatingCat(true); return } set('category_id', v) }}
              options={categoryOptions}
              placeholder={t('common.noCategory')}
              ariaLabel={t('common.category')}
            />
          )}
        </Box>
      )}

      {issuable && (
        <Box className="m-field m-issue">
          {!hasClient ? (
            <Txt as="p" className="m-hint">{t('tx.issueNeedsClient')}</Txt>
          ) : futureDate ? (
            <Txt as="p" className="m-hint">{t('tx.issueFutureBlocked')}</Txt>
          ) : (
            <>
              <Box as="label" className="m-issue-toggle">
                <Input type="checkbox" checked={issueOnCreate} onChange={(e) => { const on = e.target.checked; setIssueOnCreate(on); if (on) setIssueDocType(defaultDocType(inv.status?.business_type)) }} />
                <Txt>{t('tx.issueOnSave')}</Txt>
              </Box>
              {issueOnCreate && (
                <Box className="m-issue-opts">
                  <Box className="m-pills m-issue-types">
                    {allowedDocTypes(inv.status?.business_type).map((d) => (
                      <Btn key={d.key} type="button" className={`m-pill${issueDocType === d.key ? ' on' : ''}`} onClick={() => setIssueDocType(d.key)}>{docTypeLabel(d.key)}</Btn>
                    ))}
                  </Box>
                  {/* Receipt payment method: the transaction's own אמצעי תשלום
                      drives the receipt when set (no duplicate picker); only
                      ask here when the transaction left it blank. */}
                  {isReceiptType(issueDocType) && (
                    form.payment_method ? (
                      <Txt as="p" className="m-hint">{t('tx.receiptUsesMethod', { method: payMethodLabel(form.payment_method) })}</Txt>
                    ) : (
                      <SelectMenu value={issuePayment} onChange={setIssuePayment} options={PAY_METHODS.map((m) => ({ value: m.key, label: payMethodLabel(m.key) }))} ariaLabel={t('tx.paymentMethodAria')} />
                    )
                  )}
                </Box>
              )}
            </>
          )}
        </Box>
      )}

      {err && <Txt as="p" className="m-error">{err}</Txt>}

      <Box className="m-actions">
        <Btn type="button" className="m-btn-cancel" onClick={close}>{t('common.cancel')}</Btn>
        <Btn type="button" className="m-btn-save" onClick={submit} disabled={busy}>{busy ? t('common.saving') : t('common.save')}</Btn>
      </Box>
    </Modal>
  )
}
