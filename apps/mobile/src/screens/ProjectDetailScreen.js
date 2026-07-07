import { useMemo, useState } from 'react'
import { View, Text, Pressable, StyleSheet, ScrollView, ActivityIndicator, RefreshControl } from 'react-native'
import { useRoute, useNavigation } from '@react-navigation/native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Pencil, Users, CalendarDays, Plus, ChevronDown, ChevronRight, X } from 'lucide-react-native'
import { financeQuery, currentMonthRange, isr, fmtShortDate, statusMetaOf } from '@simplicity/core'
import i18n from '../lib/i18n'
import Screen from '../components/Screen'
import Card from '../components/Card'
import FinanceChart from './finance/FinanceChart'
import AddProjectModal from '../modals/AddProjectModal'
import AddGroupModal from '../modals/AddGroupModal'
import AddGroupMemberModal from '../modals/AddGroupMemberModal'
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
  const insets = useSafeAreaInsets()
  const projectId = route.params?.projectId
  const { project, clients, transactions, sessions, groups, members, loading, error, refetch, updateProject, removeProject, addGroup, updateGroup, removeGroup, addMember, removeMember } = useProjectDetailData(projectId)
  const [editing, setEditing] = useState(false)
  const [addingGroup, setAddingGroup] = useState(false)
  const [editGroup, setEditGroup] = useState(null)
  const [addMemberTo, setAddMemberTo] = useState(null)
  const [expanded, setExpanded] = useState(null)

  const projClientIds = useMemo(() => new Set(clients.map((c) => c.id)), [clients])
  const groupIds = useMemo(() => new Set(groups.map((g) => g.id)), [groups])
  const activeCount = clients.filter((c) => statusMetaOf(c) === 'active').length
  const wanderingCount = clients.filter((c) => statusMetaOf(c) === 'wandering').length
  const projectTx = useMemo(
    () => transactions.filter((t) => t.project_id === projectId || (!t.project_id && projClientIds.has(t.client_id))),
    [transactions, projectId, projClientIds],
  )
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
  const membersOf = (gid) => members.filter((m) => m.group_id === gid && !m.left_at)
  const availableFor = (gid) => { const ids = new Set(membersOf(gid).map((m) => m.client_id)); return clients.filter((c) => !ids.has(c.id)) }
  const groupBilling = (g) => {
    const mode = g.billing_mode || 'package'
    if (mode === 'per_session') return g.price_per_session ? D('groups.pricePerSession', { price: isr(g.price_per_session) }) : ''
    if (mode === 'none') return ''
    return g.package_price ? D('groups.pricePackage', { price: isr(g.package_price), count: g.package_sessions || 1 }) : ''
  }
  const groupRecurring = (g) => (g.recurring_day != null && g.recurring_time) ? `${i18n.t(`modalsClient:common.day${g.recurring_day}`)} ${g.recurring_time}` : null
  const clientName = (id) => clients.find((c) => c.id === id)?.name

  if (!loading && !project) {
    return (
      <Screen name="clients">
        <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
          <Pressable onPress={() => nav.goBack()} hitSlop={10}><ChevronRight size={26} strokeWidth={1.8} color={colors.brand} /></Pressable>
          <Text style={styles.hname}>{D('notFound', { defaultValue: 'הפרויקט לא נמצא' })}</Text>
        </View>
      </Screen>
    )
  }

  return (
    <Screen name="clients">
      {/* Compact header — color + name + meta counts + edit (mirrors web pd-head) */}
      <View style={[styles.headWrap, { paddingTop: insets.top + 10 }]}>
        <Card contentStyle={styles.header}>
          <Pressable onPress={() => nav.goBack()} hitSlop={10}><ChevronRight size={26} strokeWidth={1.8} color={colors.brand} /></Pressable>
          {project ? <View style={[styles.hcolor, { backgroundColor: project.color || colors.positive }]} /> : null}
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.hname} numberOfLines={1}>{project?.name || ''}</Text>
            {project ? (
              <Text style={styles.hmeta} numberOfLines={1}>
                {`${activeCount} ${D('metaActive', { defaultValue: 'פעיל' })}${wanderingCount > 0 ? ` · ${D('metaWandering', { count: wanderingCount })}` : ''} · ${D('metaGroups', { count: groups.length })}`}
              </Text>
            ) : null}
          </View>
          {project ? <Pressable style={styles.hedit} onPress={() => setEditing(true)} hitSlop={6}><Pencil size={15} strokeWidth={1.7} color={colors.textSub} /></Pressable> : null}
        </Card>
      </View>

      {loading && !project ? (
        <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>
      ) : (
        <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={loading} onRefresh={refetch} tintColor={colors.brand} />}>
          {error ? <Text style={styles.error}>{error}</Text> : null}

          {/* Stats */}
          <Card padded={false} contentStyle={styles.stats}>
            <Stat value={clients.length} label={D('stats.clients', { defaultValue: 'לקוחות' })} />
            <Stat value={isr(monthIncome)} label={D('stats.incomeMonth', { defaultValue: 'הכנסה החודש' })} divided />
            <Stat value={groups.length} label={D('stats.groups', { defaultValue: 'קבוצות' })} />
          </Card>

          {/* Project income — cumulative this month (scoped to the project) */}
          {projectTx.length ? <FinanceChart month={new Date()} transactions={projectTx} /> : null}

          {/* Clients */}
          <Section title={D('clients.title', { defaultValue: 'לקוחות' })} count={clients.length}>
            {clients.length ? clients.map((c, i) => (
              <View key={c.id} style={[styles.row, i > 0 && styles.rowBorder]}>
                <View style={[styles.sdot, { backgroundColor: STATUS_DOT[statusMetaOf(c)] || STATUS_DOT.no_status }]} />
                <Text style={styles.rowName} numberOfLines={1}>{c.name}</Text>
                {c.phone ? <Text style={styles.rowSub}>{c.phone}</Text> : null}
              </View>
            )) : <Text style={styles.empty}>{D('clients.empty', { defaultValue: 'אין לקוחות בפרויקט זה' })}</Text>}
          </Section>

          {/* Groups — add / edit / members */}
          <View style={styles.section}>
            <View style={styles.secHead}>
              <Text style={styles.secTitle}>{D('groups.title', { defaultValue: 'קבוצות' })}</Text>
              <Text style={styles.secCount}>{groups.length}</Text>
              <Pressable style={styles.addChip} onPress={() => setAddingGroup(true)} hitSlop={6}><Plus size={16} strokeWidth={2} color={colors.brand} /></Pressable>
            </View>
            {groups.length ? groups.map((g) => {
              const gm = membersOf(g.id)
              const gb = groupBilling(g)
              const open = expanded === g.id
              return (
                <Card key={g.id} contentStyle={styles.gcard}>
                  <Pressable style={styles.grow} onPress={() => setExpanded(open ? null : g.id)}>
                    <View style={[styles.gdot, { backgroundColor: g.color || colors.positive }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.gname} numberOfLines={1}>{g.name}</Text>
                      <Text style={styles.gsub} numberOfLines={1}>{D('groups.members', { count: gm.length, defaultValue: `${gm.length} חברים` })}{gb ? ` · ${gb}` : ''}{groupRecurring(g) ? ` · ${groupRecurring(g)}` : ''}</Text>
                    </View>
                    <Pressable onPress={() => setEditGroup(g)} hitSlop={8}><Pencil size={13} strokeWidth={1.7} color={colors.textSub} /></Pressable>
                    <ChevronDown size={16} strokeWidth={1.6} color={colors.textSub} style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }} />
                  </Pressable>
                  {open ? (
                    <View style={styles.gbody}>
                      {gm.length ? gm.map((m) => (
                        <View key={m.id} style={styles.mrow}>
                          <Text style={styles.mname} numberOfLines={1}>{clientName(m.client_id) || '—'}</Text>
                          <Pressable onPress={() => removeMember(m.id)} hitSlop={8}><X size={13} strokeWidth={2} color={colors.textFaint} /></Pressable>
                        </View>
                      )) : <Text style={styles.mEmpty}>{i18n.t('modalsClient:addGroup.noMembers', { defaultValue: 'עדיין אין חברים' })}</Text>}
                      <Pressable style={styles.addMember} onPress={() => setAddMemberTo(g)}>
                        <Plus size={14} strokeWidth={2} color={colors.brand} />
                        <Text style={styles.addMemberText}>{i18n.t('modalsClient:addGroupMember.title', { defaultValue: 'הוספת חבר/ה' })}</Text>
                      </Pressable>
                    </View>
                  ) : null}
                </Card>
              )
            }) : <Card padded={false}><Text style={styles.empty}>{D('groups.emptyShort', { defaultValue: 'אין קבוצות בפרויקט זה' })}</Text></Card>}
          </View>

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
      <AddGroupModal open={addingGroup} project={project} onClose={() => setAddingGroup(false)} onSave={addGroup} />
      <AddGroupModal
        open={!!editGroup}
        group={editGroup}
        project={project}
        onClose={() => setEditGroup(null)}
        onSave={(patch) => updateGroup(editGroup.id, patch)}
        onDelete={() => { removeGroup(editGroup.id); setEditGroup(null) }}
      />
      <AddGroupMemberModal
        open={!!addMemberTo}
        group={addMemberTo}
        availableClients={addMemberTo ? availableFor(addMemberTo.id) : []}
        onClose={() => setAddMemberTo(null)}
        onSave={addMember}
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
  content: { paddingHorizontal: 20, paddingBottom: 96, gap: 16 },
  error: { color: colors.danger, fontSize: 13 },

  headWrap: { paddingHorizontal: 16, paddingBottom: 12 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, paddingHorizontal: 14 },
  hcolor: { width: 13, height: 13, borderRadius: 7 },
  hname: { flex: 1, fontSize: 17, fontWeight: '600', color: colors.text, letterSpacing: -0.3 },
  hmeta: { fontSize: 11, color: colors.textSub, marginTop: 2 },
  hedit: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },

  stats: { flexDirection: 'row', paddingVertical: 16, paddingHorizontal: 8 },
  stat: { flex: 1, alignItems: 'center', gap: 4 },
  statDivided: { borderLeftWidth: StyleSheet.hairlineWidth, borderRightWidth: StyleSheet.hairlineWidth, borderColor: colors.divider },
  statV: { fontSize: 18, fontWeight: '600', color: colors.text },
  statL: { fontSize: 11, color: colors.textSub },

  section: { gap: 8 },
  secHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 2 },
  secTitle: { fontSize: 14, fontWeight: '600', color: colors.textSub, flex: 1 },
  secCount: { fontSize: 13, color: colors.textFaint },
  secBody: {},
  addChip: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.brandSoft },
  gcard: { padding: 0 },
  grow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, paddingHorizontal: 14 },
  gdot: { width: 11, height: 11, borderRadius: 6 },
  gname: { fontSize: 15, fontWeight: '600', color: colors.text },
  gsub: { fontSize: 12, color: colors.textFaint, marginTop: 1 },
  gbody: { paddingHorizontal: 14, paddingBottom: 12, gap: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.divider, paddingTop: 10 },
  mrow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  mname: { flex: 1, fontSize: 14, color: colors.text },
  mEmpty: { fontSize: 12, color: colors.textFaint },
  addMember: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6 },
  addMemberText: { fontSize: 13, fontWeight: '500', color: colors.brand },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, paddingHorizontal: 16 },
  rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.divider },
  sdot: { width: 9, height: 9, borderRadius: 5 },
  rowName: { flex: 1, fontSize: 14, color: colors.text },
  rowSub: { fontSize: 12, color: colors.textFaint },
  empty: { fontSize: 13, color: colors.textFaint, textAlign: 'center', paddingVertical: 18 },
})
