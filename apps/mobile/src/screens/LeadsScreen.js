import { useMemo } from 'react'
import { View, Text, Pressable, StyleSheet, ScrollView, ActivityIndicator, RefreshControl } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { LEAD_META, statusMetaOfLead, metaTitle, isPendingReview } from '@simplicity/core'
import i18n from '../lib/i18n'
import { useLeadsList } from '../hooks/useLeadsList'

const META_COLOR = { in_process: '#D9A566', converted: '#8BA888', not_relevant: '#b3a99c' }

// Real Leads screen (replaces the stub). Leads grouped by their status-meta
// (core statusMetaOfLead), in the canonical LEAD_META order. Read-only for now.
export default function LeadsScreen() {
  const nav = useNavigation()
  const { leads, loading, error, refetch } = useLeadsList()

  const groups = useMemo(
    () => LEAD_META
      .map((m) => ({ meta: m.key, title: metaTitle(m.key), rows: leads.filter((l) => statusMetaOfLead(l) === m.key) }))
      .filter((g) => g.rows.length),
    [leads],
  )

  return (
    <View style={styles.root}>
      <View style={styles.bar}>
        <Pressable onPress={() => nav.goBack()} hitSlop={10}><Text style={styles.back}>‹</Text></Pressable>
        <Text style={styles.title}>{i18n.t('leads:title', { defaultValue: 'לידים' })}</Text>
        <View style={styles.spacer} />
      </View>

      {loading && !leads.length ? (
        <View style={styles.center}><ActivityIndicator color="#C97B5E" /></View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={refetch} tintColor="#C97B5E" />}
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
                <View style={styles.card}>
                  {rows.map((l, i) => (
                    <View key={l.id || i} style={[styles.row, i > 0 && styles.rowBorder]}>
                      <View style={styles.info}>
                        <Text style={styles.name} numberOfLines={1}>{l.name || '—'}</Text>
                        {l.phone ? <Text style={styles.phone}>{l.phone}</Text> : null}
                      </View>
                      {isPendingReview(l) ? <Text style={styles.pending}>●</Text> : null}
                    </View>
                  ))}
                </View>
              </View>
            ))
          ) : (
            <Text style={styles.empty}>—</Text>
          )}
        </ScrollView>
      )}
    </View>
  )
}

const BRAND = '#C97B5E'
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fbf7f2' },
  bar: { flexDirection: 'row', alignItems: 'center', paddingTop: 56, paddingBottom: 12, paddingHorizontal: 16, gap: 8 },
  back: { fontSize: 30, color: BRAND, lineHeight: 30 },
  title: { fontSize: 18, fontWeight: '600', color: '#3a342e', flex: 1, textAlign: 'center' },
  spacer: { width: 30 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: 20, paddingBottom: 40, gap: 18 },
  error: { color: '#c0392b', fontSize: 13 },
  empty: { color: '#a89f95', fontSize: 14, textAlign: 'center', marginTop: 24 },
  group: { gap: 8 },
  groupHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  groupTitle: { fontSize: 14, fontWeight: '600', color: '#7c6f63', flex: 1 },
  count: { fontSize: 13, color: '#a89f95' },
  card: { backgroundColor: '#fff', borderRadius: 20, borderWidth: 1, borderColor: '#efe7da', overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, paddingHorizontal: 16 },
  rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#f2ece1' },
  info: { flex: 1, gap: 2 },
  name: { fontSize: 15, color: '#3a342e' },
  phone: { fontSize: 12, color: '#a89f95' },
  pending: { color: '#C97B5E', fontSize: 12 },
})
