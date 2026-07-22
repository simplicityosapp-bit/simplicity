import { useMemo, useState } from 'react'
import { Trash2, UserPlus } from 'lucide-react'
import DateField from '../components/DateField'
import SelectMenu from '../components/SelectMenu'
import Modal from './Modal'
import ConfirmModal from './ConfirmModal'
import InvoiceActions from '../components/InvoiceActions'
import GrowPayButton from '../components/GrowPayButton'
import { PAY_METHODS, payMethodLabel, toLocalDate, isr } from '@simplicity/core'
import { useT } from '../i18n/useT'
import { Box, Txt, Btn, Input } from '../components/ui'

/* The <input type=date> value for a stored transaction date. The column is
   date-only, so the stored string is already the right shape — the old
   `new Date(tx.date).toISOString().slice(0,10)` sent it through UTC and would
   hand back the previous day for anyone west of Greenwich (the same trap
   AddTransactionModal's todayStr avoids). */
const dateInputValue = (value) => {
  if (!value) return ''
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10)
  const d = toLocalDate(value)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/* Edit a transaction — type / amount / date / desc / status / client / project / category. */
export default function EditTransactionModal({ open, onClose, onSave, onIssued, tx, clients = [], projects = [], categories = [], onDelete, onSaveAsClient }) {
  const { t } = useT('modalsData')
  const STATUSES = [
    { k: 'confirmed', l: t('editTx.statusConfirmed') },
    { k: 'pending', l: t('editTx.statusPending') },
    { k: 'skipped', l: t('editTx.statusSkipped') },
  ]
  const [form, setForm] = useState(() => ({
    type: tx?.type || 'income',
    amount: tx?.amount ?? '',
    desc: tx?.desc || '',
    date: dateInputValue(tx?.date),
    status: tx?.status || 'confirmed',
    client_id: tx?.client_id || '',
    project_id: tx?.project_id || '',
    category_id: tx?.category_id || '',
    payment_method: tx?.payment_method || '',
  }))
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [savingClient, setSavingClient] = useState(false)
  /* Deleting money asks first — the undo toast is a safety net, not a prompt. */
  const [confirmDelete, setConfirmDelete] = useState(false)
  /* Escape / the overlay / the X used to throw away a half-finished edit
     without a word. They route through here instead; an untouched form still
     closes immediately, so the guard only appears when there is something to
     lose. Saving and deleting call onClose directly and bypass it. */
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  /* Ad-hoc recipient = a receipt was (or will be) issued to a non-client whose
     details live on the tx. Offer to promote them to a real client. */
  const isAdHoc = !!tx?.recipient_name && !tx?.client_id
  const saveAsClient = async () => {
    if (!onSaveAsClient || savingClient) return
    setSavingClient(true)
    try { await onSaveAsClient(tx); onClose() }
    catch (e) { setErr(t('common.saveFailed', { error: e.message || t('common.tryAgain') })); setSavingClient(false) }
  }
  /* Resolved once per (clients, client_id) instead of re-scanning on every keystroke. */
  const clientName = useMemo(() => clients.find((c) => c.id === tx?.client_id)?.name, [clients, tx?.client_id])
  /* Whether the form has unsaved edits vs the saved transaction — issuance is
     based on the SAVED tx, so InvoiceActions warns before issuing while dirty. */
  const formDirty = useMemo(() => {
    if (!tx) return false
    const orig = {
      type: tx.type || 'income',
      amount: tx.amount ?? '',
      desc: tx.desc || '',
      date: dateInputValue(tx.date),
      status: tx.status || 'confirmed',
      client_id: tx.client_id || '',
      project_id: tx.project_id || '',
      category_id: tx.category_id || '',
      payment_method: tx.payment_method || '',
    }
    return form.type !== orig.type
      || String(form.amount) !== String(orig.amount)
      || form.desc !== orig.desc
      || form.date !== orig.date
      || form.status !== orig.status
      || form.client_id !== orig.client_id
      || form.project_id !== orig.project_id
      || form.category_id !== orig.category_id
      || form.payment_method !== orig.payment_method
  }, [form, tx])

  /* The single exit used by Escape, the overlay and the X. */
  const requestClose = () => { if (formDirty) setConfirmDiscard(true); else onClose() }

  /* Same option shapes AddTransactionModal builds, so the two forms present
     the identical picker instead of a styled menu here and an OS-native list
     there. The client list stays searchable — a roster of 80 in a bare
     <select> was unusable. */
  const payOptions = [
    { value: '', label: t('tx.paymentMethodNone') },
    ...PAY_METHODS.map((m) => ({ value: m.key, label: payMethodLabel(m.key) })),
  ]
  const clientOptions = [{ value: '', label: t('common.none') }, ...clients.map((c) => ({ value: c.id, label: c.name }))]
  const projectOptions = [{ value: '', label: t('common.none') }, ...projects.map((p) => ({ value: p.id, label: p.name }))]
  const categoryOptions = [{ value: '', label: t('common.noCategory') }, ...categories.map((c) => ({ value: c.id, label: c.name }))]

  if (!tx) return <Modal open={open} onClose={onClose} title={t('editTx.title')} />

  const submit = async () => {
    const amount = parseFloat(form.amount)
    if (!amount || amount <= 0) { setErr(t('common.amountPositive')); return }
    if (!form.date) { setErr(t('editTx.needDate')); return }
    setBusy(true)
    setErr('')
    try {
      await onSave(tx.id, {
        type: form.type,
        amount,
        desc: form.desc.trim() || (form.type === 'income' ? t('tx.incomeFallback') : t('tx.expenseFallback')),
        date: form.date,
        status: form.status,
        client_id: form.client_id || null,
        project_id: form.project_id || null,
        category_id: form.type === 'expense' ? (form.category_id || null) : null,
        payment_method: form.payment_method || null,
      })
      onClose()
    } catch (e) {
      setBusy(false)
      setErr(t('common.saveFailed', { error: e.message || t('common.tryAgain') }))
    }
  }

  return (
    <Modal open={open} onClose={requestClose} title={t('editTx.title')}>
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
            className={`m-input${err && !(parseFloat(form.amount) > 0) ? ' err' : ''}`}
            value={form.amount}
            onChange={(e) => { set('amount', e.target.value); if (err) setErr('') }}
          />
        </Box>
        <Box className="m-field">
          <Box as="label" className="m-label">{t('common.date')}</Box>
          <DateField value={form.date} onChange={(e) => set('date', e.target.value)} />
        </Box>
      </Box>
      <Box className="m-field">
        <Box as="label" className="m-label">{t('common.description')}</Box>
        <Input className="m-input" value={form.desc} onChange={(e) => set('desc', e.target.value)} />
      </Box>
      <Box className="m-field">
        <Box as="label" className="m-label">{t('tx.paymentMethod')}</Box>
        <SelectMenu value={form.payment_method} onChange={(v) => set('payment_method', v)} options={payOptions} placeholder={t('tx.paymentMethodNone')} ariaLabel={t('tx.paymentMethod')} />
      </Box>
      <Box className="m-field">
        <Box as="label" className="m-label">{t('editTx.status')}</Box>
        <Box className="m-pills">
          {STATUSES.map((s) => (
            <Btn key={s.k} type="button" className={`m-pill${form.status === s.k ? ' on' : ''}`} onClick={() => set('status', s.k)}>{s.l}</Btn>
          ))}
        </Box>
      </Box>
      <Box className="m-row2">
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
      </Box>

      {isAdHoc && (
        <Box className="m-field m-recipient">
          <Txt as="p" className="m-label">{t('tx.recipientSectionLabel')}</Txt>
          <Txt as="p" className="m-recipient-name">{tx.recipient_name}</Txt>
          {(tx.recipient_email || tx.recipient_phone || tx.recipient_tax_id) && (
            <Txt as="p" className="m-recipient-meta">{[tx.recipient_email, tx.recipient_phone, tx.recipient_tax_id].filter(Boolean).join(' · ')}</Txt>
          )}
          {onSaveAsClient && (
            <Btn type="button" className="m-recipient-save" onClick={saveAsClient} disabled={savingClient}>
              <UserPlus size={15} strokeWidth={1.8} aria-hidden="true" /> {savingClient ? t('common.saving') : t('tx.saveAsClient')}
            </Btn>
          )}
        </Box>
      )}

      {form.type === 'expense' && (
        <Box className="m-field">
          <Box as="label" className="m-label">{t('common.category')}</Box>
          <SelectMenu value={form.category_id} onChange={(v) => set('category_id', v)} options={categoryOptions} placeholder={t('common.noCategory')} ariaLabel={t('common.category')} />
        </Box>
      )}

      {/* Issue a real invoice for this income payment (Route A). Renders only
          when an invoice provider is connected; based on the SAVED transaction. */}
      {tx.type === 'income' && (
        <InvoiceActions tx={tx} clientName={clientName} onIssued={onIssued} formDirty={formDirty} />
      )}

      {/* Online payment via Grow for this income — renders only when the gateway
          is enabled + connected (hidden while locked), and only for income still
          PENDING (not yet received), so we never offer a pay link for money
          already collected. On payment the webhook confirms THIS transaction. */}
      {tx.type === 'income' && tx.status === 'pending' && (
        <GrowPayButton
          source="transaction"
          transactionId={tx.id}
          clientId={tx.client_id}
          amount={Number(tx.amount)}
          description={tx.desc || clientName}
          clientName={clientName}
        />
      )}

      {err && <Txt as="p" className="m-error">{err}</Txt>}

      <Box className="m-actions">
        {onDelete && tx?.id && (
          <Btn type="button" className="m-btn-delete-inline" onClick={() => setConfirmDelete(true)}>
            <Trash2 size={15} strokeWidth={1.8} aria-hidden="true" /> {t('editTx.delete')}
          </Btn>
        )}
        <Btn type="button" className="m-btn-cancel" onClick={requestClose}>{t('common.cancel')}</Btn>
        <Btn type="button" className="m-btn-save" onClick={submit} disabled={busy}>{busy ? t('common.saving') : t('common.save')}</Btn>
      </Box>

      {/* Names what is about to go, and only closes the editor once the delete
          is actually confirmed — cancelling leaves the form exactly as it was. */}
      <ConfirmModal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={t('editTx.deleteConfirm.title')}
        message={t('editTx.deleteConfirm.message', {
          desc: tx.desc || t('editTx.deleteConfirm.noDesc'),
          amount: isr(tx.amount),
        })}
        confirmLabel={t('editTx.deleteConfirm.confirm')}
        danger
        onConfirm={async () => { await onDelete(tx.id); onClose() }}
      />

      <ConfirmModal
        open={confirmDiscard}
        onClose={() => setConfirmDiscard(false)}
        title={t('discard.title')}
        message={t('discard.message')}
        confirmLabel={t('discard.confirm')}
        cancelLabel={t('discard.cancel')}
        danger
        onConfirm={() => { setConfirmDiscard(false); onClose() }}
      />
    </Modal>
  )
}
