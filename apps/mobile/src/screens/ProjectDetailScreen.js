import { useMemo, useState } from 'react'
import { View, Text, Pressable, StyleSheet, ScrollView, ActivityIndicator, RefreshControl } from 'react-native'
import { useRoute, useNavigation } from '@react-navigation/native'
import { Pencil, Users, CalendarDays } from 'lucide-react-native'
import { financeQuery, currentMonthRange, isr, fmtShortDate } from '@simplicity/core'
import i18n from '../lib/i18n'
import Screen from '../components/Screen'
import ScreenHead from '../components/ScreenHead'
import Card from '../components/Card'
import AddProjectModal from '../modals/AddProjectModal'
import { colors } from '../theme/theme'
import { useProjectDetailData } from '../hooks/useProjectDetailData'

const D = (k, o) => i18n.t(`projects:detail.${k}`, o)
const STATUS_DOT = { active: colors.positive, wandering: colors.amberWarn, past: '#b3a99c', no_status: '#cbb9a8' }

// Project detail (scoped v1 of web's project-detail): header + stats + clients
// list + groups (read-only) + recent sessions + project edit. The heavy web
// group-management (billing/members/add-session/drag) stays on desktop for now.
export default function ProjectDetailScreen() {
  const route = useRoute()
  const nav = useNavigation()
  const projectId = route.params?.projectId
  const { project, clients, transactions, sessions, groups, members, loading, error, refetch, updateProject, removeProject } = useProjectDetailData(projectId)
  const [editing, setEditing] = useState(false)

  const projClientIds = useMemo(() => new Set(clients.map((c) => c.id)), [clients])
  const groupIds = useMemo(() => new Set(groups.map((g) => g.id)), [groups])
  const monthIncome = useMemo(() => {
    const allIncome = financeQuery({ type: 'income', ...currentMonthRange(), source: transactions })
    return allIncome
      .filter((f) => f.project_id === projectId || (!f.project_id && f.client_id && projClientIds.has(f.client_id)))
      .reduce((s, f) => s + f.amount, 0)
  }, [transactions, projectId, projClientIds])
  const recentSessions = useMemo(
    () => sessions
      .filter((s) => projClientIds.has(s.client_id) || groupIds.has(s.group_id))
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 6),
    [sessions, projClientIds, groupIds],
  )
  const memberCount = (gid) => members.filter((m) => m.group_id === gid && !m.left_at).length
  const clientName = (id) => clients.find((c) => c.id === id)?.name

  if (!loading && !project) {
    return (
      <Screen name="clients">
        <ScreenHead title={D('notFound', { defaultValue: 'הפרויקט לא נמצא' })} />
      </Screen>
    )
  }

  return (
    <Screen name="clients">
      <ScreenHead title={project?.name || ''} meta={project ? [D('stats.clients', { defaultValue: 'לקוחות' }) + ` ${clients.length}`] : []} />

      {loading && !project ? (
        <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>
      ) : (
        <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={loading} onRefresh={refetch} tintColor={colors.brand} />}>
          {error ? <Text style={styles.error}>{error}</Text> : null}

          {/* Header row — color + name + edit */}
          <View style={styles.headrow}>
            <View style={[styles.color, { backgroundColor: project.color || colors.positive }]} />
            <Text style={styles.name} numberOfLines={1}>{project.name}</Text>
            <Pressable style={styles.editBtn} onPress={() => setEditing(true)} hitSlop={6}>
              <Pencil size={14} strokeWidth={1.7} color={colors.textSub} />
            </Pressable>
          </View>

          {/* Stats */}
          <Card padded={false} contentStyle={styles.stats}>
            <Stat value={clients.length} label={D('stats.clients', { defaultValue: 'לקוחות' })} />
            <Stat value={isr(monthIncome)} label={D('stats.incomeMonth', { defaultValue: 'הכנסה החודש' })} divided />
            <Stat value={groups.length} label={D('stats.groups', { defaultValue: 'קבוצות' })} />
          </Card>

          {/* Clients */}
          <Section title={D('clients.title', { defaultValue: 'לקוחות' })} count={clients.length}>
            {clients.length ? clients.map((c, i) => (
              <View key={c.id} style={[styles.row, i > 0 && styles.rowBorder]}>
                <View style={[styles.sdot, { backgroundColor: STATUS_DOT[c.status_meta] || STATUS_DOT.no_status }]} />
                <Text style={styles.rowName} numberOfLines={1}>{c.name}</Text>
                {c.phone ? <Text style={styles.rowSub}>{c.phone}</Text> : null}
              </View>
            )) : <Text style={styles.empty}>{D('clients.empty', { defaultValue: 'אין לקוחות בפרויקט זה' })}</Text>}
          </Section>

          {/* Groups (read-only) */}
          <Section title={D('groups.title', { defaultValue: 'קבוצות' })} count={groups.length}>
            {groups.length ? groups.map((g, i) => (
              <View key={g.id} style={[styles.row, i > 0 && styles.rowBorder]}>
                <Users size={15} strokeWidth={1.6} color={colors.textSub} />
                <Text style={styles.rowName} numberOfLines={1}>{g.name}</Text>
                <Text style={styles.rowSub}>{D('groups.members', { count: memberCount(g.id), defaultValue: `${memberCount(g.id)} חברים` })}</Text>
              </View>
            )) : <Text style={styles.empty}>{D('groups.emptyShort', { defaultValue: 'אין קבוצות בפרויקט זה' })}</Text>}
          </Section>

          {/* Recent sessions */}
          {recentSessions.length ? (
            <Section title={D('groups.pastSessionsTitle', { defaultValue: 'פגישות שהתקיימו' })} count={recentSessions.length}>
              {recentSessions.map((s, i) => (
                <View key={s.id} style={[styles.row, i > 0 && styles.rowBorder]}>
                  <CalendarDays size={14} strokeWidth={1.6} color={colors.textFaint} />
                  <Text style={styles.rowName} numberOfLines={1}>{clientName(s.client_id) || s.summary || '—'}</Text>
                  <Text style={styles.rowSub}>{fmtShortDate(s.date)}</Text>
                </View>
              ))}
            </Section>
          ) : null}
        </ScrollView>
      )}

      <AddProjectModal
        open={editing}
        project={project}
        onClose={() => setEditing(false)}
        onSave={(patch) => updateProject(project.id, patch)}
        onDelete={async () => { await removeProject(project.id); setEditing(false); nav.goBack() }}
      />
    </Screen>
  )
}

function Stat({ value, label, divided }) {
  return (
    <View style={[styles.stat, divided && styles.statDivided]}>
      <Text style={styles.statV}>{value}</Text>
      <Text style={styles.statL}>{label}</Text>
    </View>
  )
}
function Section({ title, count, children }) {
  return (
    <View style={styles.section}>
      <View style={styles.secHead}>
        <Text style={styles.secTitle}>{title}</Text>
        {count != null ? <Text style={styles.secCount}>{count}</Text> : null}
      </View>
      <Card padded={false}><View style={styles.secBody}>{children}</View></Card>
    </View>
  )
}
Stat.displayName = 'Stat'
Section.displayName = 'Section'

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: 20, paddingBottom: 40, gap: 16 },
  error: { color: colors.danger, fontSize: 13 },

  headrow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  color: { width: 14, height: 14, borderRadius: 7 },
  name: { flex: 1, fontSize: 20, fontWeight: '700', color: colors.text },
  editBtn: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },

  stats: { flexDirection: 'row', paddingVertical: 16, paddingHorizontal: 8 },
  stat: { flex: 1, alignItems: 'center', gap: 4 },
  statDivided: { borderLeftWidth: StyleSheet.hairlineWidth, borderRightWidth: StyleSheet.hairlineWidth, borderColor: colors.divider },
  statV: { fontSize: 20, fontWeight: '600', color: colors.text },
  statL: { fontSize: 11, color: colors.textSub },

  section: { gap: 8 },
  secHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 2 },
  secTitle: { fontSize: 14, fontWeight: '600', color: colors.textSub, flex: 1 },
  secCount: { fontSize: 13, color: colors.textFaint },
  secBody: {},
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, paddingHorizontal: 16 },
  rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.divider },
  sdot: { width: 9, height: 9, borderRadius: 5 },
  rowName: { flex: 1, fontSize: 14, color: colors.text },
  rowSub: { fontSize: 12, color: colors.textFaint },
  empty: { fontSize: 13, color: colors.textFaint, textAlign: 'center', paddingVertical: 18 },
})
