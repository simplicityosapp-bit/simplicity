import { useState } from 'react'
import { View, Alert, Linking, ActivityIndicator } from 'react-native'
import { FileDown, Check, X, TriangleAlert } from 'lucide-react-native'
import { isr } from '@simplicity/core'
import { Text } from '../../components/Text'
import { Pressable } from '../../components/Pressable'
import Card from '../../components/Card'
import { useInvoiceImports } from '../../hooks/useInvoiceImports'
import { showToast } from '../../lib/toast'
import i18n from '../../lib/i18n'
import { colors } from '../../theme/theme'
import { themed } from '../../theme/themed'

const t = (k, o) => i18n.t(`finance:imports.${k}`, o)

/* ════════════════════════════════════════════════════════════════
   Invoices issued outside the app, waiting to be recorded as income.
   ════════════════════════════════════════════════════════════════
   Port of web InvoiceImports. The phone had no way to see this queue, so a
   document issued in the invoicing service waited for the web app. Approving
   creates a real income transaction, so it asks first — and says so more
   loudly when an income for the same client and amount already exists (a
   payment logged by hand), a soft warning, never a block. Dismissing is
   reversible and stays one tap. Renders nothing when the queue is empty.
   ════════════════════════════════════════════════════════════════ */
export default function InvoiceImports({ transactions = [], onImported }) {
  const { imports, loading, approve, dismiss } = useInvoiceImports({ onImported })
  const [busy, setBusy] = useState(null)
  if (loading || !imports.length) return null

  const typeLabel = (type) => ({ invoice_receipt: t('typeInvoiceReceipt'), receipt: t('typeReceipt'), invoice: t('typeInvoice') }[type] || t('typeDoc'))
  const possibleDuplicate = (imp) => !!imp.client_id && (transactions || []).some((tx) =>
    tx.type === 'income' && !tx.deleted_at && tx.client_id === imp.client_id && Number(tx.amount) === Number(imp.amount))

  const act = async (fn, id, toast) => {
    setBusy(id)
    try { await fn(id); showToast(toast) } catch { /* the hook raised its own toast */ } finally { setBusy(null) }
  }
  const confirmApprove = (imp) => {
    const dup = possibleDuplicate(imp)
    const vars = { amount: isr(imp.amount || 0), forName: imp.customer_name ? t('dupForName', { name: imp.customer_name }) : '' }
    Alert.alert(dup ? t('dupTitle') : t('confirmTitle'), dup ? t('dupMessage', vars) : t('confirmMessage', vars), [
      { text: t('cancel'), style: 'cancel' },
      { text: dup ? t('dupConfirm') : t('confirmBtn'), onPress: () => act(approve, imp.id, t('importedToast')) },
    ])
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <FileDown size={16} strokeWidth={1.7} color={colors.brand} />
        <Text style={styles.heading}>{t('heading')}</Text>
        <Text style={styles.count} accessibilityLabel={t('countAria', { count: imports.length })}>{imports.length}</Text>
      </View>
      <Text style={styles.sub}>{t('sub')}</Text>
      <Card padded={false}>
        {imports.map((imp, i) => (
          <View key={imp.id} style={[styles.row, i > 0 && styles.rowBorder]}>
            <View style={styles.main}>
              <Text style={styles.title} numberOfLines={1}>{typeLabel(imp.document_type)}{imp.document_number ? ` ${t('docNumber')} ${imp.document_number}` : ''}</Text>
              <Text style={styles.meta} numberOfLines={2}>
                {imp.customer_name || t('noName')}{imp.doc_date ? ` · ${imp.doc_date}` : ''}
              </Text>
              <View style={styles.metaRow}>
                {imp.document_url ? (
                  <Text style={styles.link} onPress={() => Linking.openURL(imp.document_url).catch(() => {})}>{t('view')}</Text>
                ) : null}
                {possibleDuplicate(imp) ? (
                  <View style={styles.dup}>
                    <TriangleAlert size={11} strokeWidth={2} color={colors.amberWarn} />
                    <Text style={styles.dupText}>{t('possibleDup')}</Text>
                  </View>
                ) : null}
              </View>
            </View>
            <Text style={styles.amount}>+{isr(imp.amount || 0)}</Text>
            {busy === imp.id ? (
              <ActivityIndicator color={colors.positive} accessibilityLabel={t('importingAria')} />
            ) : (
              <>
                <Pressable style={styles.approve} onPress={() => confirmApprove(imp)} accessibilityLabel={t('importAria')} hitSlop={6}>
                  <Check size={16} strokeWidth={2.2} color={colors.positive} />
                </Pressable>
                <Pressable style={styles.dismiss} onPress={() => act(dismiss, imp.id, t('dismissedToast'))} accessibilityLabel={t('dismiss')} hitSlop={6}>
                  <X size={15} strokeWidth={2} color={colors.textSub} />
                </Pressable>
              </>
            )}
          </View>
        ))}
      </Card>
    </View>
  )
}

const styles = themed((c) => ({
  wrap: { gap: 6 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  heading: { flex: 1, fontSize: 14, fontWeight: '600', color: c.textSub },
  count: { fontSize: 12, fontWeight: '600', color: c.textSub, backgroundColor: c.fillStrong, borderRadius: 10, paddingHorizontal: 8, overflow: 'hidden' },
  sub: { fontSize: 12, color: c.textSub },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, paddingHorizontal: 14 },
  rowBorder: { borderTopWidth: 1, borderTopColor: c.divider },
  main: { flex: 1, gap: 2 },
  title: { fontSize: 14, color: c.text },
  meta: { fontSize: 12, color: c.textFaint },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  link: { fontSize: 12, fontWeight: '600', color: c.brand },
  dup: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  dupText: { fontSize: 11, color: c.amberWarn },
  amount: { fontSize: 14, fontWeight: '600', color: c.positive },
  approve: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderColor: 'rgba(139,168,136,0.4)', alignItems: 'center', justifyContent: 'center' },
  dismiss: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderColor: c.border, alignItems: 'center', justifyContent: 'center' },
}))
