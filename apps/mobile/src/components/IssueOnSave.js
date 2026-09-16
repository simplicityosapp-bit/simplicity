import { View } from 'react-native'
import { isr, PAY_METHODS, docTypeLabel, payMethodLabel, isReceiptType, allowedDocTypes, defaultDocType, clampDocType } from '@simplicity/core'
import { Text, TextInput } from './Text'
import { Pressable } from './Pressable'
import Select from './Select'
import { issueDocument, loadInvoiceCatalog } from '../lib/invoices'
import { showToast } from '../lib/toast'
import i18n from '../lib/i18n'
import { colors } from '../theme/theme'
import { themed } from '../theme/themed'

const t = (k, o) => i18n.t(`modalsData:tx.${k}`, o)
const tc = (k, o) => i18n.t(`connections:actions.${k}`, o)

/* ════════════════════════════════════════════════════════════════
   "הפק קבלה עם השמירה" — web AddTransactionModal's issue-on-create.
   ════════════════════════════════════════════════════════════════
   The options live in the modal (one `issue` object, ISSUE_OFF when closed)
   so submit can hand them to issueAfterSave once the row exists. Offered for
   income only, when a usable provider is connected; a missing client or a
   future date explains itself instead of offering a toggle that can't work.
   The product line collapses to "יופק על: …" whenever that sentence is
   honest (a catalog item is chosen), and opens the real picker otherwise.
   ════════════════════════════════════════════════════════════════ */
export const ISSUE_OFF = { on: false, docType: 'invoice_receipt', payment: 'bank_transfer', items: [], itemId: '', itemName: '', loading: false, catalogErr: '', pickerManual: false }

// What the document will be billed on — exactly what issueAfterSave sends.
const itemSummary = (issue, desc) => {
  const selected = issue.items.find((it) => String(it.id) === String(issue.itemId))
  return issue.itemId ? (selected?.name || '') : (issue.itemName.trim() || desc.trim())
}

export default function IssueOnSave({ status, form, issue, setIssue, isFuture }) {
  if (form.type !== 'income' || !status?.connected || status.credentials_invalid) return null
  if (!form.client_id) return <Text style={styles.hint}>{t('issueNeedsClient')}</Text>
  if (isFuture) return <Text style={styles.hint}>{t('issueFutureBlocked')}</Text>

  const patch = (p) => setIssue((s) => ({ ...s, ...p }))
  // A catalog that lands after the toggle was switched off must not revive it.
  const patchIfOn = (p) => setIssue((s) => (s.on ? { ...s, ...p } : s))
  const toggle = async () => {
    if (issue.on) { setIssue(ISSUE_OFF); return }
    setIssue({ ...ISSUE_OFF, on: true, docType: defaultDocType(status.business_type), itemName: form.desc.trim(), loading: true })
    try {
      const list = await loadInvoiceCatalog()
      const arr = Array.isArray(list) ? list : []
      patchIfOn({ items: arr, itemId: arr.length ? String(arr[0].id) : '', loading: false })
    } catch {
      patchIfOn({ items: [], itemId: '', loading: false, catalogErr: tc('catalogError') })
    }
  }

  const summary = itemSummary(issue, form.desc)
  const pickerOpen = issue.pickerManual || !!issue.catalogErr || !issue.items.length || !issue.itemId || !summary

  return (
    <View style={styles.box}>
      <Pressable style={styles.toggleRow} onPress={toggle} accessibilityRole="switch" accessibilityState={{ checked: issue.on }}>
        <Text style={styles.toggleLabel}>{t('issueOnSave')}</Text>
        <View style={[styles.track, issue.on && styles.trackOn]}>
          <View style={[styles.knob, issue.on && styles.knobOn]} />
        </View>
      </Pressable>
      {issue.on ? (
        <View style={styles.opts}>
          <View style={styles.pills}>
            {allowedDocTypes(status.business_type).map((d) => {
              const on = issue.docType === d.key
              return (
                <Pressable key={d.key} style={[styles.pill, on && styles.pillOn]} onPress={() => patch({ docType: d.key })} accessibilityState={{ selected: on }}>
                  <Text style={[styles.pillText, on && styles.pillTextOn]}>{docTypeLabel(d.key)}</Text>
                </Pressable>
              )
            })}
          </View>
          {issue.loading ? <Text style={styles.hint}>{tc('loadingItems')}</Text> : pickerOpen ? (
            <>
              {issue.items.length ? (
                <Select
                  label={tc('itemFieldLabel')}
                  value={issue.itemId}
                  onChange={(v) => patch({ itemId: v })}
                  options={[...issue.items.map((it) => ({ value: String(it.id), label: it.price != null ? `${it.name} · ${isr(it.price)}` : it.name })), { value: '', label: tc('itemOther') }]}
                />
              ) : <Text style={styles.label}>{tc('itemFieldLabel')}</Text>}
              {!issue.items.length || issue.itemId === '' ? (
                <TextInput style={styles.input} value={issue.itemName} onChangeText={(v) => patch({ itemName: v })} placeholder={tc('itemPlaceholder')} placeholderTextColor={colors.textFaint} accessibilityLabel={tc('itemFieldLabel')} />
              ) : null}
              {issue.catalogErr ? <Text style={styles.hint}>{issue.catalogErr}</Text> : null}
            </>
          ) : (
            <View style={styles.sumRow}>
              <Text style={styles.sum}>{t('issueItemSummary', { item: summary })}</Text>
              <Pressable onPress={() => patch({ pickerManual: true })} hitSlop={8} accessibilityRole="button">
                <Text style={styles.change}>{t('issueItemChange')}</Text>
              </Pressable>
            </View>
          )}
          {/* The transaction's own payment method drives the receipt when set. */}
          {isReceiptType(issue.docType) ? (
            form.payment_method ? (
              <Text style={styles.hint}>{t('receiptUsesMethod', { method: payMethodLabel(form.payment_method) })}</Text>
            ) : (
              <Select
                label={t('paymentMethodAria')}
                value={issue.payment}
                onChange={(v) => patch({ payment: v })}
                options={PAY_METHODS.map((m) => ({ value: m.key, label: payMethodLabel(m.key) }))}
              />
            )
          ) : null}
        </View>
      ) : null}
    </View>
  )
}

/* Called by the modal after the income row is saved. A failure here never
   fails the save — the payment is recorded either way; the toast says what
   happened to the document and where to finish (the edit sheet's panel). */
export async function issueAfterSave({ row, issue, form, status, onIssued, isFuture = false }) {
  if (!issue.on || isFuture || !row?.id || !status?.connected || status.credentials_invalid) return false
  if (form.type !== 'income' || !form.client_id) return false
  const docType = clampDocType(status.business_type, issue.docType)
  const selected = issue.items.find((it) => String(it.id) === String(issue.itemId))
  const itemName = issue.itemId ? (selected?.name || '') : (issue.itemName.trim() || form.desc.trim())
  try {
    const r = await issueDocument(row.id, docType, { itemId: issue.itemId || null, itemName, paymentMethod: form.payment_method || issue.payment })
    const num = r?.document?.number
    const numText = num ? t('numPrefix', { num }) : ''
    onIssued?.()
    if (r?.link_failed) showToast(t('issuedNotLinked', { num: numText }), 'error')
    else showToast(t('savedAndIssued', { doc: docTypeLabel(docType), num: numText }))
  } catch (e) {
    if (e?.outcomeUnknown) { onIssued?.(); showToast(t('issueOutcomeUnknown'), 'error') } else showToast(e?.detail ? `${t('issueFailed')} (${e.detail})` : t('issueFailed'), 'error')
  }
  return true
}

const styles = themed((c) => ({
  box: { gap: 10, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: c.border, backgroundColor: c.cardFlat },
  toggleRow: { minHeight: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  toggleLabel: { flex: 1, fontSize: 14, color: c.text },
  track: { width: 44, height: 26, borderRadius: 13, backgroundColor: c.card, borderWidth: 1, borderColor: c.border, padding: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-start' },
  trackOn: { backgroundColor: c.brand, borderColor: c.brand, justifyContent: 'flex-end' },
  knob: { width: 20, height: 20, borderRadius: 10, backgroundColor: c.cardFlat },
  knobOn: { backgroundColor: c.onBrand },
  opts: { gap: 10 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: { minHeight: 38, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: c.border, backgroundColor: c.card },
  pillOn: { backgroundColor: c.brand, borderColor: c.brand },
  pillText: { fontSize: 13, color: c.text },
  pillTextOn: { color: c.onBrand, fontWeight: '600' },
  label: { fontSize: 13, color: c.textSub },
  hint: { fontSize: 12, color: c.textSub, lineHeight: 17 },
  input: { borderWidth: 1, borderColor: c.border, borderRadius: 12, paddingVertical: 11, paddingHorizontal: 14, fontSize: 15, color: c.text, backgroundColor: c.card },
  sumRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sum: { flex: 1, fontSize: 13, color: c.textSub },
  change: { fontSize: 13, fontWeight: '600', color: c.brand },
}))
