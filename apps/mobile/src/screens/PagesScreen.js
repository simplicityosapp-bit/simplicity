import { useMemo } from 'react'
import { View, Text, Pressable, StyleSheet, ScrollView, ActivityIndicator, RefreshControl, Share, Linking } from 'react-native'
import { LayoutTemplate, ClipboardList, CalendarClock, Share2, ExternalLink } from 'lucide-react-native'
import i18n from '../lib/i18n'
import Screen from '../components/Screen'
import ScreenHead from '../components/ScreenHead'
import Card from '../components/Card'
import { colors } from '../theme/theme'
import { useSitePages } from '../hooks/useSitePages'

// Public pages — READ-ONLY on mobile (the drag-drop builder is desktop): the
// user's landing / lead / booking pages grouped by kind, each with its publish
// status and a copy-link / open action. Editing stays on the web app.
const KINDS = [
  { key: 'landing', Icon: LayoutTemplate, label: 'דפי נחיתה' },
  { key: 'lead', Icon: ClipboardList, label: 'דפי לידים' },
  { key: 'booking', Icon: CalendarClock, label: 'קביעת פגישות' },
]

export default function PagesScreen() {
  const { pages, loading, error, refetch } = useSitePages()
  const byKind = useMemo(() => {
    const m = { landing: [], lead: [], booking: [] }
    pages.forEach((p) => (m[p.kind] || m.landing).push(p))
    return m
  }, [pages])

  const share = (p) => Share.share({ message: p.url, title: p.title }).catch(() => {})
  const open = (p) => Linking.openURL(p.url).catch(() => {})

  return (
    <Screen name="clients">
      {loading && !pages.length ? (
        <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>
      ) : (
        <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={loading} onRefresh={refetch} tintColor={colors.brand} />}>
          <ScreenHead
            title={i18n.t('nav:extras.sitePages', { defaultValue: 'דפים ציבוריים' })}
            meta={[i18n.t('nav:items.sitePagesSub', { defaultValue: 'בנו דפי נחיתה, טפסים ותורים' })]}
            tagline={i18n.t('pages:mobileHint', { defaultValue: 'צפייה ושיתוף — עריכה במחשב.' })}
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}

          {pages.length ? (
            KINDS.filter((k) => byKind[k.key].length).map((k) => (
              <View key={k.key} style={styles.group}>
                <View style={styles.groupHead}>
                  <k.Icon size={15} strokeWidth={1.6} color={colors.textSub} />
                  <Text style={styles.groupName}>{k.label}</Text>
                  <Text style={styles.groupCount}>{byKind[k.key].length}</Text>
                </View>
                <Card padded={false}>
                  {byKind[k.key].map((p, i) => (
                    <View key={p.id} style={[styles.row, i > 0 && styles.rowBorder]}>
                      <View style={styles.rowText}>
                        <Text style={styles.rowTitle} numberOfLines={1}>{p.title || p.url}</Text>
                        <View style={[styles.status, p.published ? styles.statusOn : styles.statusOff]}>
                          <Text style={[styles.statusText, p.published ? styles.statusTextOn : styles.statusTextOff]}>
                            {p.published ? i18n.t('pages:published', { defaultValue: 'פורסם' }) : i18n.t('pages:draft', { defaultValue: 'טיוטה' })}
                          </Text>
                        </View>
                      </View>
                      <Pressable style={styles.action} onPress={() => share(p)} hitSlop={6}>
                        <Share2 size={17} strokeWidth={1.7} color={colors.textSub} />
                      </Pressable>
                      <Pressable style={styles.action} onPress={() => open(p)} hitSlop={6} disabled={!p.published}>
                        <ExternalLink size={17} strokeWidth={1.7} color={p.published ? colors.brand : colors.textFaint} />
                      </Pressable>
                    </View>
                  ))}
                </Card>
              </View>
            ))
          ) : (
            <Text style={styles.empty}>{i18n.t('pages:empty', { defaultValue: 'אין עדיין דפים ציבוריים. צרו אותם באפליקציית המחשב.' })}</Text>
          )}
        </ScrollView>
      )}
    </Screen>
  )
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: 20, paddingBottom: 96, gap: 16 },
  error: { color: colors.danger, fontSize: 13 },
  empty: { color: colors.textFaint, fontSize: 14, textAlign: 'center', marginTop: 24, paddingHorizontal: 20, lineHeight: 20 },
  group: { gap: 8 },
  groupHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 2 },
  groupName: { flex: 1, fontSize: 11, fontWeight: '600', color: colors.textSub, letterSpacing: 0.4, textTransform: 'uppercase' },
  groupCount: { fontSize: 12, fontWeight: '600', color: colors.textSub, backgroundColor: colors.fillStrong, minWidth: 22, textAlign: 'center', borderRadius: 10, paddingVertical: 1, paddingHorizontal: 6, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 13, paddingHorizontal: 16 },
  rowText: { flex: 1, gap: 4 },
  rowTitle: { fontSize: 15, color: colors.text },
  status: { alignSelf: 'flex-start', paddingVertical: 1, paddingHorizontal: 8, borderRadius: 999 },
  statusOn: { backgroundColor: 'rgba(139,168,136,0.16)' },
  statusOff: { backgroundColor: colors.fillStrong },
  statusText: { fontSize: 10, fontWeight: '600' },
  statusTextOn: { color: colors.positive },
  statusTextOff: { color: colors.textSub },
  action: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
})
