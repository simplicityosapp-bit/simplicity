import { useEffect, useRef, useState } from 'react'
import { View, Alert, Linking, ActivityIndicator } from 'react-native'
import { FileText, ExternalLink, CircleAlert } from 'lucide-react-native'
import { isr, PAY_METHODS, docTypeLabel, payMethodLabel, isReceiptType, allowedDocTypes, defaultDocType, clampDocType } from '@simplicity/core'
import { Text, TextInput } from './Text'
import { Pressable } from './Pressable'
import Select from './Select'
import { useInvoiceStatus } from '../hooks/useInvoiceStatus'
import { issueDocument, creditDocument, issueCandidates, clearIssueClaim, linkIssuedDocument, loadInvoiceCatalog, invoiceErrorMessage } from '../lib/invoices'
import { showToast } from '../lib/toast'
import i18n from '../lib/i18n'
import { colors } from '../theme/theme'
import { themed } from '../theme/themed'

const t = (k, o) => i18n.t(`connections:actions.${k}`, o)
const CANCEL = () => i18n.t('modalsData:common.cancel', { defaultValue: 'ביטול' })
const dayKey = (d) => (d ? String(d).slice(0, 10) : null)
const ARM_MS = 4000

/* ════════════════════════════════════════════════════════════════
   "הפק חשבונית" for an income transaction — port of web InvoiceActions.
   ════════════════════════════════════════════════════════════════
   Renders nothing unless an invoice provider is connected. States:
     · issued   — number, a link to the document, and a credit note (זיכוי)
                  behind a confirmation naming the document and the amount;
     · in doubt — an issuance the provider never confirmed. The server kept
                  the claim, so a plain retry is never offered (it could mint
                  a second real tax document): check what the provider
                  created, link one, or — after a warning — release the claim;
     · blocked  — credentials invalid, or no client on the transaction;
     · picker   — document type (only what the business may issue), the
                  catalog item or free text, and the payment method for a
                  receipt. Issuing takes two taps; a likely duplicate or
                  unsaved edits escalate to a two-step warning.
   The phone could not issue, credit or repair anything before this.
   ════════════════════════════════════════════════════════════════ */
export default function InvoiceActions({ tx, clientName, transactions = [], formDirty = false, onIssued }) {
  const { status, loaded } = useInvoiceStatus()
  const [issued, setIssued] = useState(tx?.invoice_document_id ? { number: tx.invoice_document_number, url: tx.invoice_document_url, type: tx.invoice_document_type } : null)
  const [credited, setCredited] = useState(tx?.invoice_credited_at ? { number: tx.invoice_credit_document_number } : null)
  const [picking, setPicking] = useState(false)
  const [docType, setDocType] = useState('invoice_receipt')
  const [items, setItems] = useState([])
  const [itemId, setItemId] = useState('')
  const [itemName, setItemName] = useState('')
  const [catalogLoading, setCatalogLoading] = useState(false)
  const [catalogErr, setCatalogErr] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('bank_transfer')
  const [busy, setBusy] = useState(false)
  const [armed, setArmed] = useState(false)
  const [err, setErr] = useState('')
  const [doubt, setDoubt] = useState(() => !!(tx?.invoice_synced_at && !tx?.invoice_document_id))
  const [candidates, setCandidates] = useState(null)
  const armTimer = useRef(null)
  useEffect(() => () => clearTimeout(armTimer.current), [])

  if (!loaded || !status?.connected) return null

  const fail = (e) => setErr(invoiceErrorMessage(e))

  const doCredit = async () => {
    setErr(''); setBusy(true)
    try {
      const doc = (await creditDocument(tx.id))?.document
      setCredited({ number: doc?.number })
      showToast(doc?.number ? t('creditedToastNumbered', { number: doc.number }) : t('creditedToast'))
      onIssued?.()
    } catch (e) { fail(e) } finally { setBusy(false) }
  }

  const doLookup = async () => {
    setErr(''); setBusy(true)
    try { setCandidates(await issueCandidates(tx.id)) } catch (e) { fail(e) } finally { setBusy(false) }
  }
  const doLink = async (c) => {
    setErr(''); setBusy(true)
    try {
      await linkIssuedDocument(tx.id, c)
      setIssued({ number: c.number, url: c.url, type: c.type })
      setDoubt(false)
      showToast(t('doubt.linkedToast'))
      onIssued?.()
    } catch (e) { fail(e) } finally { setBusy(false) }
  }
  const doClear = async () => {
    setErr(''); setBusy(true)
    try {
      await clearIssueClaim(tx.id)
      setDoubt(false); setCandidates(null)
      showToast(t('doubt.clearedToast'))
      onIssued?.()
    } catch (e) { fail(e) } finally { setBusy(false) }
  }
  const confirmClear = () => Alert.alert(t('doubt.clearModalTitle'), t('doubt.clearModalMessage'), [
    { text: CANCEL(), style: 'cancel' },
    { text: t('doubt.clearConfirm'), style: 'destructive', onPress: doClear },
  ])

  if (issued) {
    return (
      <View style={styles.box} accessibilityLiveRegion="polite">
        <View style={styles.row}>
          <FileText size={15} strokeWidth={1.8} color={colors.positive} />
          <Text style={styles.text}>
            {t('issuedLabel', { docType: docTypeLabel(issued.type) })}
            {issued.number ? ` ${t('issuedNumber')} ${issued.number}` : ''}
            {tx?.amount ? ` · ${isr(tx.amount)}` : ''}
          </Text>
        </View>
        <View style={styles.actions}>
          {issued.url ? (
            <Pressable style={styles.linkBtn} onPress={() => Linking.openURL(issued.url).catch(() => {})} accessibilityRole="link">
              <Text style={styles.link}>{t('view')}</Text>
              <ExternalLink size={12} strokeWidth={1.8} color={colors.brand} />
            </Pressable>
          ) : null}
          {credited ? (
            <Text style={styles.muted}>{t('cancelled')}{credited.number ? ` ${t('creditNumber')} ${credited.number}` : ''}</Text>
          ) : (
            <Pressable
              style={styles.secondary}
              disabled={busy}
              accessibilityRole="button"
              onPress={() => Alert.alert(t('creditModalTitle'), t('creditModalMessage', {
                doc: `${docTypeLabel(issued.type)}${issued.number ? ` ${t('issuedNumber')} ${issued.number}` : ''}`,
                amount: isr(tx?.amount || 0),
              }), [{ text: CANCEL(), style: 'cancel' }, { text: t('creditConfirm'), style: 'destructive', onPress: doCredit }])}
            >
              {busy ? <ActivityIndicator color={colors.textSub} /> : <Text style={styles.secondaryText}>{t('creditBtn')}</Text>}
            </Pressable>
          )}
        </View>
        {err ? <Text style={styles.error}>{err}</Text> : null}
      </View>
    )
  }

  if (doubt) {
    return (
      <View style={[styles.box, styles.doubt]} accessibilityLiveRegion="polite">
        <View style={styles.row}>
          <CircleAlert size={15} strokeWidth={1.8} color={colors.amberWarn} />
          <Text style={styles.title}>{t('doubt.title')}</Text>
        </View>
        <Text style={styles.hint}>{t('doubt.body')}</Text>
        {candidates === null ? (
          <View style={styles.actions}>
            <Pressable style={styles.primary} onPress={doLookup} disabled={busy} accessibilityRole="button">
              {busy ? <ActivityIndicator color={colors.onBtn} /> : <Text style={styles.primaryText}>{t('doubt.check')}</Text>}
            </Pressable>
            <Pressable style={styles.secondary} onPress={confirmClear} disabled={busy} accessibilityRole="button">
              <Text style={styles.secondaryText}>{t('doubt.clearBtn')}</Text>
            </Pressable>
          </View>
        ) : candidates.length === 0 ? (
          <>
            <Text style={styles.hint}>{t('doubt.none')}</Text>
            <Pressable style={styles.primary} onPress={doClear} disabled={busy} accessibilityRole="button">
              <Text style={styles.primaryText}>{t('doubt.noneConfirm')}</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Text style={styles.hint}>{t('doubt.pick')}</Text>
            {candidates.map((c) => (
              <Pressable key={c.id} style={styles.cand} onPress={() => doLink(c)} disabled={busy} accessibilityRole="button">
                <Text style={styles.text}>{docTypeLabel(c.type)}{c.number ? ` · ${c.number}` : ''}</Text>
                <Text style={styles.muted}>
                  {Number.isFinite(Number(c.amount)) ? isr(c.amount) : ''}{c.date ? ` · ${c.date}` : ''}{c.amount_matches ? ` · ${t('doubt.amountMatches')}` : ''}
                </Text>
              </Pressable>
            ))}
            <Pressable style={styles.secondary} onPress={confirmClear} disabled={busy} accessibilityRole="button">
              <Text style={styles.secondaryText}>{t('doubt.noneOfThese')}</Text>
            </Pressable>
          </>
        )}
        {err ? <Text style={styles.error}>{err}</Text> : null}
      </View>
    )
  }

  if (status.credentials_invalid) return <Text style={styles.hint}>{t('credsInvalidHint')}</Text>
  if (!tx?.client_id) return <Text style={styles.hint}>{t('needClientHint')}</Text>

  /* A likely duplicate (same client + amount + day already issued) or unsaved
     edits — the document is issued from the SAVED transaction — escalate. */
  const duplicate = (transactions || []).some((o) => o.id !== tx.id && !o.deleted_at && o.invoice_document_id
    && o.client_id === tx.client_id && Number(o.amount) === Number(tx.amount) && dayKey(o.date) === dayKey(tx.date))
  const reasons = []
  if (duplicate) reasons.push(t('dupReason', { client: clientName || t('dupClientFallback'), amount: isr(tx.amount), date: dayKey(tx.date) ? t('dupReasonDate', { date: dayKey(tx.date) }) : '' }))
  if (formDirty) reasons.push(t('dirtyReason'))

  const openPicker = async () => {
    setErr(''); setCatalogErr(''); setArmed(false)
    setDocType(defaultDocType(status.business_type))
    setItemName(tx.desc || '')
    setItemId('')
    setPaymentMethod('bank_transfer')
    setPicking(true)
    setCatalogLoading(true)
    try {
      const list = await loadInvoiceCatalog()
      const arr = Array.isArray(list) ? list : []
      setItems(arr)
      if (arr.length) setItemId(String(arr[0].id))
    } catch {
      setItems([])
      setCatalogErr(t('catalogError'))
    } finally { setCatalogLoading(false) }
  }

  const doIssue = async () => {
    setErr(''); setBusy(true)
    const selected = items.find((it) => String(it.id) === String(itemId))
    try {
      const r = await issueDocument(tx.id, clampDocType(status.business_type, docType), {
        itemId: itemId || null,
        itemName: itemId ? (selected?.name || '') : itemName.trim(),
        paymentMethod,
      })
      const doc = r?.document
      const type = doc?.type || docType
      if (r?.link_failed) {
        // Real but unrecorded: hand it straight to the repair panel as the one candidate.
        setPicking(false)
        setDoubt(true)
        setCandidates([{ id: doc?.id, number: doc?.number, type, amount: tx.amount, url: doc?.url, amount_matches: true }])
        return
      }
      setIssued({ number: doc?.number, url: doc?.url, type })
      setPicking(false)
      showToast(doc?.number ? t('issuedToastNumbered', { docType: docTypeLabel(type), number: doc.number }) : t('issuedToast', { docType: docTypeLabel(type) }))
      onIssued?.()
    } catch (e) {
      if (e?.outcomeUnknown) { setPicking(false); setDoubt(true) }
      fail(e)
    } finally { setBusy(false) }
  }

  const onIssuePress = () => {
    if (reasons.length) {
      clearTimeout(armTimer.current); setArmed(false)
      const G = (k, o) => i18n.t(`modalsSystem:issueGuard.${k}`, o)
      Alert.alert(G('title1'), reasons.join('\n\n'), [
        { text: CANCEL(), style: 'cancel' },
        {
          text: G('sure'),
          onPress: () => Alert.alert(G('title2'), G('finalMsg', { amount: isr(tx.amount) }), [
            { text: CANCEL(), style: 'cancel' },
            { text: G('issue'), style: 'destructive', onPress: doIssue },
          ]),
        },
      ])
      return
    }
    if (!armed) {
      setArmed(true)
      clearTimeout(armTimer.current)
      armTimer.current = setTimeout(() => setArmed(false), ARM_MS)
      return
    }
    clearTimeout(armTimer.current)
    setArmed(false)
    doIssue()
  }

  if (!picking) {
    return (
      <View style={styles.box}>
        <Pressable style={styles.issueBtn} onPress={openPicker} accessibilityRole="button">
          <FileText size={15} strokeWidth={1.8} color={colors.brand} />
          <Text style={styles.issueText}>{t('issueBtn')}</Text>
        </Pressable>
        {err ? <Text style={styles.error}>{err}</Text> : null}
      </View>
    )
  }

  const canIssue = !busy && (!!itemId || !!itemName.trim())
  return (
    <View style={styles.box}>
      <Text style={styles.title}>{clientName ? t('pickerLabelNamed', { client: clientName }) : t('pickerLabel')}</Text>
      <View style={styles.pills} accessibilityLabel={t('docTypeAria')}>
        {allowedDocTypes(status.business_type).map((d) => {
          const on = docType === d.key
          return (
            <Pressable key={d.key} style={[styles.pill, on && styles.pillOn]} onPress={() => { setDocType(d.key); setArmed(false) }} accessibilityState={{ selected: on }}>
              <Text style={[styles.pillText, on && styles.pillTextOn]}>{docTypeLabel(d.key)}</Text>
            </Pressable>
          )
        })}
      </View>
      {catalogLoading ? <Text style={styles.hint}>{t('loadingItems')}</Text> : (
        <>
          {items.length ? (
            <Select
              label={t('itemFieldLabel')}
              value={itemId}
              onChange={setItemId}
              options={[...items.map((it) => ({ value: String(it.id), label: it.price != null ? `${it.name} · ${isr(it.price)}` : it.name })), { value: '', label: t('itemOther') }]}
            />
          ) : <Text style={styles.label}>{t('itemFieldLabel')}</Text>}
          {!items.length || itemId === '' ? (
            <TextInput style={styles.input} value={itemName} onChangeText={setItemName} placeholder={t('itemPlaceholder')} placeholderTextColor={colors.textFaint} accessibilityLabel={t('itemFieldLabel')} />
          ) : null}
          {items.length ? <Text style={styles.hint}>{t('itemHint')}</Text> : null}
          {catalogErr ? <Text style={styles.hint}>{catalogErr}</Text> : null}
        </>
      )}
      {isReceiptType(docType) ? (
        <Select
          label={t('payMethodLabel')}
          value={paymentMethod}
          onChange={setPaymentMethod}
          options={PAY_METHODS.map((m) => ({ value: m.key, label: payMethodLabel(m.key) }))}
        />
      ) : null}
      <View style={styles.actions}>
        <Pressable style={[styles.primary, !canIssue && styles.off]} onPress={onIssuePress} disabled={!canIssue} accessibilityRole="button">
          {busy ? <ActivityIndicator color={colors.onBtn} /> : (
            <Text style={styles.primaryText}>{armed ? t('issueConfirm', { amount: isr(tx.amount) }) : t('issue')}</Text>
          )}
        </Pressable>
        <Pressable style={styles.secondary} onPress={() => { setPicking(false); setArmed(false) }} disabled={busy}>
          <Text style={styles.secondaryText}>{t('cancel')}</Text>
        </Pressable>
      </View>
      {err ? <Text style={styles.error}>{err}</Text> : null}
    </View>
  )
}

const styles = themed((c) => ({
  box: { gap: 8, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: c.border, backgroundColor: c.cardFlat },
  doubt: { borderColor: c.amberWarn },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 14, fontWeight: '600', color: c.text },
  text: { flexShrink: 1, fontSize: 13, color: c.text },
  hint: { fontSize: 12, color: c.textSub, lineHeight: 17 },
  muted: { fontSize: 12, color: c.textSub },
  label: { fontSize: 13, color: c.textSub },
  error: { fontSize: 13, color: c.danger },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  linkBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 36 },
  link: { fontSize: 13, fontWeight: '600', color: c.brand },
  primary: { minHeight: 44, flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, borderRadius: 12, backgroundColor: c.btnBg },
  primaryText: { fontSize: 14, fontWeight: '600', color: c.onBtn },
  secondary: { minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, borderColor: c.border },
  secondaryText: { fontSize: 13, color: c.textSub },
  cand: { gap: 2, padding: 10, borderRadius: 10, borderWidth: 1, borderColor: c.border, backgroundColor: c.card },
  issueBtn: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  issueText: { fontSize: 14, fontWeight: '600', color: c.brand },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: { minHeight: 38, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: c.border, backgroundColor: c.card },
  pillOn: { backgroundColor: c.brand, borderColor: c.brand },
  pillText: { fontSize: 13, color: c.text },
  pillTextOn: { color: c.onBrand, fontWeight: '600' },
  input: { borderWidth: 1, borderColor: c.border, borderRadius: 12, paddingVertical: 11, paddingHorizontal: 14, fontSize: 15, color: c.text, backgroundColor: c.card },
  off: { opacity: 0.5 },
}))
