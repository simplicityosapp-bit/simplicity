import { useMemo, useState } from 'react'
import { View, Text, Pressable, StyleSheet, ScrollView, ActivityIndicator, RefreshControl } from 'react-native'
import { LEAD_META, statusMetaOfLead, metaTitle, isPendingReview } from '@simplicity/core'
import i18n from '../lib/i18n'
import Screen from '../components/Screen'
import ScreenHeader from '../components/ScreenHeader'
import Card from '../components/Card'
import AddLeadModal from '../modals/AddLeadModal'
import { colors } from '../theme/theme'
import { useLeadsList } from '../hooks/useLeadsList'

const META_COLOR = { in_process: '#D9A566', converted: colors.positive, not_relevant: '#b3a99c' }

// Leads screen — leads grouped by their status-meta (core statusMetaOfLead), in
// the canonical LEAD_META order, over the per-screen photo (Warm Precision).
export default function LeadsScreen() {
  const { leads, loading, error, refetch, updateLead, deleteLead } = useLeadsList()
  const [editing, setEditing] = useState(null)

  const groups = useMemo(
    () => LEAD_META
      .map((m) => ({ meta: m.key, title: metaTitle(m.key), rows: leads.filter((l) => statusMetaOfLead(l) === m.key) }))
      .filter((g) => g.rows.length),
    [leads],
  )

  return (
    <Screen name="leads">
      <ScreenHeader title={i18n.t('leads:title', { defaultValue: 'לידים' })} />

      {loading && !leads.length ? (
        <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={refetch} tintColor={colors.brand} />}
        >
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {groups.length ? (
            groups.map(({ meta, title, rows }) => (
              <View key={meta} style={styles.group}>
                <View style={styles.groupHead}>
                  <View style={[styles.dot, { backgroundColor: META_COLOR[meta] || '#cbb9a8' }]} />
                  <Text style={styles.groupTitle}>{title}</Text>
                  <Text style={styles.count}>{rows.length}</Text>
                </View>
                <Card padded={false}>
                  {rows.map((l, i) => (
                    <Pressable key={l.id || i} style={[styles.row, i > 0 && styles.rowBorder]} onPress={() => setEditing(l)}>
                      <View style={styles.info}>
                        <Text style={styles.name} numberOfLines={1}>{l.name || '—'}</Text>
                        {l.phone ? <Text style={styles.phone}>{l.phone}</Text> : null}
                      </View>
                      {isPendingReview(l) ? <View style={styles.pending} /> : null}
                    </Pressable>
                  ))}
                </Card>
              </View>
            ))
          ) : (
            <Text style={styles.empty}>—</Text>
          )}
        </ScrollView>
      )}

      <AddLeadModal
        open={!!editing}
        lead={editing}
        onClose={() => setEditing(null)}
        onSave={(patch) => updateLead(editing.id, patch)}
        onDelete={() => deleteLead(editing.id)}
      />
    </Screen>
  )
}

const styles = StyleSheet.create({
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
  pending: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.brand },
})
