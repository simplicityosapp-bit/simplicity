import { useMemo, useState } from 'react'
import { View, Text, Pressable, StyleSheet, ScrollView, ActivityIndicator, RefreshControl } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { FolderOpen, Users } from 'lucide-react-native'
import { financeQuery, isr, currentMonthRange } from '@simplicity/core'
import i18n from '../lib/i18n'
import Screen from '../components/Screen'
import ScreenHead from '../components/ScreenHead'
import Card from '../components/Card'
import AddProjectModal from '../modals/AddProjectModal'
import { colors } from '../theme/theme'
import { useProjectsData } from '../hooks/useProjectsData'

// Projects screen (mirrors web): monthly/cumulative hero (projects · assigned
// clients · income) + a card per project (clients / income / open tasks).
export default function ProjectsScreen() {
  const { projects, clients, transactions, tasks, groups, loading, error, refetch, addProject } = useProjectsData()
  const nav = useNavigation()
  const [view, setView] = useState('monthly')
  const [showAdd, setShowAdd] = useState(false)

  const { totals, cards } = useMemo(() => {
    const range = view === 'monthly' ? currentMonthRange() : {}
    const allIncome = financeQuery({ type: 'income', ...range, source: transactions })
    const projIdSet = new Set(projects.map((p) => p.id))
    const clientProjMap = new Map(clients.filter((c) => c.project_id).map((c) => [c.id, c.project_id]))
    const assignedClients = clients.filter((c) => c.project_id && projIdSet.has(c.project_id)).length
    const heroIncome = allIncome
      .filter((f) => projIdSet.has(f.project_id) || (f.client_id && clientProjMap.has(f.client_id)))
      .reduce((s, f) => s + f.amount, 0)
    const cards = projects.map((p) => {
      const projClientIds = new Set(clients.filter((c) => c.project_id === p.id).map((c) => c.id))
      const income = allIncome
        .filter((f) => f.project_id === p.id || (!f.project_id && f.client_id && projClientIds.has(f.client_id)))
        .reduce((s, f) => s + f.amount, 0)
      const openTasks = tasks.filter((t) => t.status !== 'done' && (t.project_id === p.id || (!t.project_id && t.client_id && projClientIds.has(t.client_id)))).length
      const groupsCount = groups.filter((g) => g.project_id === p.id).length
      return { project: p, clientsCount: projClientIds.size, income, openTasks, groupsCount }
    })
    return { totals: { assignedClients, heroIncome }, cards }
  }, [view, projects, clients, transactions, tasks, groups])

  const incomeLabel = i18n.t(view === 'monthly' ? 'projects:hero.incomeMonthly' : 'projects:hero.incomeCumulative')
  const cardIncomeLabel = i18n.t(view === 'monthly' ? 'projects:cardIncome.monthly' : 'projects:cardIncome.cumulative')

  return (
    <Screen name="clients">
      {loading && !projects.length ? (
        <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>
      ) : (
        <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={loading} onRefresh={refetch} tintColor={colors.brand} />}>
          <ScreenHead
            title={i18n.t('projects:title', { defaultValue: 'פרויקטים' })}
            meta={[i18n.t('projects:count', { count: projects.length, defaultValue: `${projects.length} פרויקטים` })]}
            tagline={i18n.t('projects:tagline', { defaultValue: 'מיקוד יוצר תוצאות.' })}
            onAdd={() => setShowAdd(true)}
            addLabel={i18n.t('projects:newAria', { defaultValue: 'פרויקט חדש' })}
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Card padded={false} contentStyle={styles.hero}>
            <View style={styles.toggle}>
              <Pressable style={[styles.toggleBtn, view === 'monthly' && styles.toggleOn]} onPress={() => setView('monthly')}>
                <Text style={[styles.toggleText, view === 'monthly' && styles.toggleTextOn]}>{i18n.t('projects:range.monthly', { defaultValue: 'חודשי' })}</Text>
              </Pressable>
              <Pressable style={[styles.toggleBtn, view === 'cumulative' && styles.toggleOn]} onPress={() => setView('cumulative')}>
                <Text style={[styles.toggleText, view === 'cumulative' && styles.toggleTextOn]}>{i18n.t('projects:range.cumulative', { defaultValue: 'מצטבר' })}</Text>
              </Pressable>
            </View>
            <Text style={styles.heroTitle}>{i18n.t('projects:hero.title', { defaultValue: 'סיכום פרויקטים' })}</Text>
            <View style={styles.heroGrid}>
              <HeroStat label={i18n.t('projects:hero.projects', { defaultValue: 'פרויקטים' })} value={projects.length} />
              <HeroStat label={i18n.t('projects:hero.clients', { defaultValue: 'לקוחות' })} value={totals.assignedClients} divided />
              <HeroStat label={incomeLabel} value={isr(totals.heroIncome)} />
            </View>
          </Card>

          {projects.length === 0 ? (
            <View style={styles.empty}>
              <FolderOpen size={34} strokeWidth={1.4} color={colors.textFaint} />
              <Text style={styles.emptyText}>{i18n.t('projects:empty.text', { defaultValue: 'אין עדיין פרויקטים.' })}</Text>
            </View>
          ) : (
            cards.map((c) => (
              <Pressable key={c.project.id} onPress={() => nav.navigate('ProjectDetail', { projectId: c.project.id })}>
                <Card contentStyle={styles.card}>
                  <View style={styles.cardHead}>
                    <View style={[styles.dot, { backgroundColor: c.project.color || colors.brand }]} />
                    <Text style={styles.cardName} numberOfLines={1}>{c.project.name}</Text>
                    {c.groupsCount ? (
                      <View style={styles.tag}><Users size={11} strokeWidth={1.6} color={colors.textSub} /><Text style={styles.tagText}>{c.groupsCount}</Text></View>
                    ) : (
                      <View style={styles.tag}><Text style={styles.tagText}>{i18n.t('projects:card.active', { defaultValue: 'פעילה' })}</Text></View>
                    )}
                  </View>
                  <View style={styles.cardStats}>
                    <CardStat label={i18n.t('projects:card.clients', { defaultValue: 'לקוחות' })} value={c.clientsCount} />
                    <CardStat label={cardIncomeLabel} value={isr(c.income)} divided />
                    <CardStat label={i18n.t('projects:card.tasks', { defaultValue: 'משימות' })} value={c.openTasks} />
                  </View>
                </Card>
              </Pressable>
            ))
          )}
        </ScrollView>
      )}

      <AddProjectModal open={showAdd} onClose={() => setShowAdd(false)} onSave={addProject} />
    </Screen>
  )
}

function HeroStat({ label, value, divided }) {
  return (
    <View style={[styles.heroStat, divided && styles.heroStatDivided]}>
      <Text style={styles.heroStatL}>{label}</Text>
      <Text style={styles.heroStatV}>{value}</Text>
    </View>
  )
}
function CardStat({ label, value, divided }) {
  return (
    <View style={[styles.cardStat, divided && styles.cardStatDivided]}>
      <Text style={styles.cardStatV}>{value}</Text>
      <Text style={styles.cardStatL}>{label}</Text>
    </View>
  )
}
HeroStat.displayName = 'HeroStat'
CardStat.displayName = 'CardStat'

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: 20, paddingBottom: 96, gap: 14 },
  error: { color: colors.danger, fontSize: 13 },

  hero: { paddingVertical: 16, paddingHorizontal: 16, gap: 14 },
  toggle: { flexDirection: 'row', gap: 6, backgroundColor: colors.cardFlat, borderRadius: 999, padding: 4, alignSelf: 'center' },
  toggleBtn: { paddingVertical: 7, paddingHorizontal: 20, borderRadius: 999 },
  toggleOn: { backgroundColor: colors.brand },
  toggleText: { fontSize: 13, color: colors.textSub },
  toggleTextOn: { color: colors.onBrand, fontWeight: '600' },
  heroTitle: { fontSize: 12, fontWeight: '600', color: colors.textSub, textAlign: 'center', letterSpacing: 0.3 },
  heroGrid: { flexDirection: 'row' },
  heroStat: { flex: 1, alignItems: 'center', gap: 4 },
  heroStatDivided: { borderLeftWidth: StyleSheet.hairlineWidth, borderRightWidth: StyleSheet.hairlineWidth, borderColor: colors.divider },
  heroStatL: { fontSize: 11, color: colors.textSub },
  heroStatV: { fontSize: 20, fontWeight: '600', color: colors.text },

  empty: { alignItems: 'center', gap: 12, paddingVertical: 50 },
  emptyText: { fontSize: 14, color: colors.textFaint, textAlign: 'center' },

  card: { padding: 16, gap: 12 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 12, height: 12, borderRadius: 6 },
  cardName: { fontSize: 16, fontWeight: '600', color: colors.text, flex: 1 },
  tag: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingVertical: 3, paddingHorizontal: 8, borderRadius: 999, backgroundColor: colors.fill },
  tagText: { fontSize: 11, fontWeight: '500', color: colors.textSub },
  cardStats: { flexDirection: 'row' },
  cardStat: { flex: 1, alignItems: 'center', gap: 3 },
  cardStatDivided: { borderLeftWidth: StyleSheet.hairlineWidth, borderRightWidth: StyleSheet.hairlineWidth, borderColor: colors.divider },
  cardStatV: { fontSize: 16, fontWeight: '600', color: colors.text },
  cardStatL: { fontSize: 11, color: colors.textSub },
})
