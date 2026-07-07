import { useMemo, useState } from 'react'
import { View, Text, Pressable, StyleSheet, ScrollView, ActivityIndicator, RefreshControl } from 'react-native'
import { LEAD_META, statusMetaOfLead, metaTitle, isPendingReview, isConvertedLead, fmtShortDate } from '@simplicity/core'
import i18n from '../lib/i18n'
import Screen from '../components/Screen'
import ScreenHead from '../components/ScreenHead'
import Card from '../components/Card'
import AddLeadModal from '../modals/AddLeadModal'
import ConvertLeadModal from '../modals/ConvertLeadModal'
import { colors } from '../theme/theme'
import { useFormOptions } from '../lib/formOptions'
import { useLeadsList } from '../hooks/useLeadsList'

const META_COLOR = { in_process: '#D9A566', converted: colors.positive, not_relevant: '#b3a99c' }
const todayYmd = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Leads screen — leads grouped by their status-meta (core statusMetaOfLead), in
// the canonical LEAD_META order. Rows show source + follow-up (overdue in amber),
// over the per-screen photo (Warm Precision).
export default function LeadsScreen() {
  const { leads, loading, error, refetch, addLead, updateLead, deleteLead, addClient, addGroupMember } = useLeadsList()
  const { leadSources } = useFormOptions()
  const [editing, setEditing] = useState(null)
  const [adding, setAdding] = useState(false)
  const [converting, setConverting] = useState(null)

  const sourceById = useMemo(() => Object.fromEntries(leadSources.map((s) => [s.id, s.name])), [leadSources])
  const today = todayYmd()

  const pending = useMemo(() => leads.filter((l) => !l.deleted_at && isPendingReview(l)), [leads])
  const official = useMemo(() => leads.filter((l) => !l.deleted_at && !isPendingReview(l)), [leads])
  const groups = useMemo(
    () => LEAD_META
      .map((m) => ({ meta: m.key, title: metaTitle(m.key), rows: official.filter((l) => statusMetaOfLead(l) === m.key) }))
      .filter((g) => g.rows.length),
    [official],
  )
  // Stats hero — new this month · converted this month · conversion rate (cohort).
  const stats = useMemo(() => {
    const now = new Date()
    const inMonth = (d) => { if (!d) return false; const x = new Date(d); return x.getFullYear() === now.getFullYear() && x.getMonth() === now.getMonth() }
    const newThis = official.filter((l) => (l.inquiry_date ? inMonth(l.inquiry_date) : inMonth(l.created_at)))
    const convertedThisMonth = official.filter((l) => isConvertedLead(l) && inMonth(l.converted_at)).length
    const cohortConverted = newThis.filter(isConvertedLead).length
    const convRate = newThis.length ? Math.round((cohortConverted / newThis.length) * 100) : null
    return { newThisMonth: newThis.length, convertedThisMonth, convRate }
  }, [official])

  return (
    <Screen name="leads">
      <ScreenHead
        title={i18n.t('leads:title', { defaultValue: 'לידים' })}
        meta={[i18n.t('leads:countLabel', { count: official.length, defaultValue: `${official.length} לידים` })]}
        tagline={i18n.t('leads:tagline', { defaultValue: 'טיפוח קשרים מוביל לתוצאות.' })}
        onAdd={() => setAdding(true)}
        addLabel={i18n.t('leads:newLeadAria', { defaultValue: 'ליד חדש' })}
      />

      {loading && !leads.length ? (
        <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={refetch} tintColor={colors.brand} />}
        >
          {error ? <Text style={styles.error}>{error}</Text> : null}

          {official.length ? (
            <Card padded={false} contentStyle={styles.hero}>
              <HeroStat value={stats.newThisMonth} label={i18n.t('leads:stats.newThisMonth', { defaultValue: 'פניות החודש' })} />
              <HeroStat value={stats.convertedThisMonth} label={i18n.t('leads:stats.converted', { defaultValue: 'הומרו ללקוחות' })} divided accent />
              <HeroStat value={stats.convRate == null ? '—' : `${stats.convRate}%`} label={i18n.t('leads:stats.convRate', { defaultValue: 'אחוז המרה' })} />
            </Card>
          ) : null}

          {pending.length ? (
            <View style={styles.group}>
              <View style={styles.groupHead}>
                <View style={[styles.dot, { backgroundColor: colors.brand }]} />
                <Text style={styles.groupTitle}>{i18n.t('leads:pending.title', { defaultValue: 'ממתינים לאישור' })}</Text>
                <Text style={styles.count}>{pending.length}</Text>
              </View>
              <Card padded={false}>
                {pending.map((l, i) => (
                  <View key={l.id || i} style={[styles.row, i > 0 && styles.rowBorder]}>
                    <View style={styles.info}>
                      <Text style={styles.name} numberOfLines={1}>{l.name || '—'}</Text>
                      {l.phone ? <Text style={styles.phone}>{l.phone}</Text> : null}
                    </View>
                    <Pressable style={styles.approve} onPress={() => updateLead(l.id, { pending_review: false })} hitSlop={6}>
                      <Text style={styles.approveText}>{i18n.t('leads:pending.approve', { defaultValue: 'אישור' })}</Text>
                    </Pressable>
                    <Pressable style={styles.reject} onPress={() => deleteLead(l.id)} hitSlop={6}>
                      <Text style={styles.rejectText}>{i18n.t('leads:pending.reject', { defaultValue: 'דחייה' })}</Text>
                    </Pressable>
                  </View>
                ))}
              </Card>
            </View>
          ) : null}

          {groups.length ? (
            groups.map(({ meta, title, rows }) => (
              <View key={meta} style={styles.group}>
                <View style={styles.groupHead}>
                  <View style={[styles.dot, { backgroundColor: META_COLOR[meta] || '#cbb9a8' }]} />
                  <Text style={styles.groupTitle}>{title}</Text>
                  <Text style={styles.count}>{rows.length}</Text>
                </View>
                <Card padded={false}>
                  {rows.map((l, i) => {
                    const overdue = l.follow_up_date && String(l.follow_up_date).slice(0, 10) <= today
                    const metaParts = []
                    if (sourceById[l.source_id]) metaParts.push(sourceById[l.source_id])
                    if (l.follow_up_date) metaParts.push(`${i18n.t('modalsClient:common.followUp')} ${fmtShortDate(l.follow_up_date)}`)
                    const meta = metaParts.join(' · ')
                    return (
                      <Pressable key={l.id || i} style={[styles.row, i > 0 && styles.rowBorder]} onPress={() => setEditing(l)}>
                        <View style={styles.info}>
                          <Text style={styles.name} numberOfLines={1}>{l.name || '—'}</Text>
                          {l.phone ? <Text style={styles.phone}>{l.phone}</Text> : null}
                          {meta ? <Text style={[styles.meta, overdue && styles.metaOverdue]} numberOfLines={1}>{meta}</Text> : null}
                        </View>
                        {isPendingReview(l) ? <View style={styles.pending} /> : null}
                      </Pressable>
                    )
                  })}
                </Card>
              </View>
            ))
          ) : !pending.length ? (
            <Text style={styles.empty}>{i18n.t('leads:empty', { defaultValue: 'עדיין אין לידים.' })}</Text>
          ) : null}
        </ScrollView>
      )}

      <AddLeadModal open={adding} onClose={() => setAdding(false)} onSave={addLead} />
      <AddLeadModal
        open={!!editing}
        lead={editing}
        onClose={() => setEditing(null)}
        onSave={(patch) => updateLead(editing.id, patch)}
        onDelete={() => deleteLead(editing.id)}
        onConvert={(l) => { setEditing(null); setConverting(l) }}
      />
      <ConvertLeadModal
        open={!!converting}
        lead={converting}
        onClose={() => setConverting(null)}
        onCreateClient={addClient}
        onUpdateLead={updateLead}
        onAddGroupMember={addGroupMember}
      />
    </Screen>
  )
}

function HeroStat({ value, label, accent, divided }) {
  return (
    <View style={[styles.heroStat, divided && styles.heroStatDivided]}>
      <Text style={[styles.heroStatV, accent && styles.heroStatAccent]}>{value}</Text>
      <Text style={styles.heroStatL}>{label}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  hero: { flexDirection: 'row', paddingVertical: 16, paddingHorizontal: 8 },
  heroStat: { flex: 1, alignItems: 'center', gap: 4 },
  heroStatDivided: { borderLeftWidth: StyleSheet.hairlineWidth, borderRightWidth: StyleSheet.hairlineWidth, borderColor: colors.divider },
  heroStatV: { fontSize: 22, fontWeight: '600', color: colors.text },
  heroStatAccent: { color: colors.positive },
  heroStatL: { fontSize: 10, fontWeight: '500', color: colors.textSub, letterSpacing: 0.3, textTransform: 'uppercase', textAlign: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: 20, paddingBottom: 40, gap: 18 },
  error: { color: colors.danger, fontSize: 13 },
  empty: { color: colors.textFaint, fontSize: 14, textAlign: 'center', marginTop: 24 },
  group: { gap: 8 },
  groupHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  groupTitle: { fontSize: 14, fontWeight: '600', color: colors.textSub, flex: 1 },
  count: { fontSize: 13, color: colors.textFaint },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, paddingHorizontal: 16 },
  rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.divider },
  info: { flex: 1, gap: 2 },
  name: { fontSize: 15, color: colors.text },
  phone: { fontSize: 12, color: colors.textFaint },
  meta: { fontSize: 12, color: colors.textFaint },
  metaOverdue: { color: colors.amberWarn },
  pending: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.brand },
  approve: { paddingVertical: 7, paddingHorizontal: 12, borderRadius: 999, backgroundColor: colors.positive },
  approveText: { fontSize: 13, fontWeight: '600', color: colors.onBrand },
  reject: { paddingVertical: 7, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: colors.border },
  rejectText: { fontSize: 13, color: colors.textSub },
})

