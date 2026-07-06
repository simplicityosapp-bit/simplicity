import { useMemo, useState } from 'react'
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, ActivityIndicator, RefreshControl } from 'react-native'
import { Search, Wallet, CheckCircle2, Clock, CircleSlash, CircleDashed } from 'lucide-react-native'
import { clientBalance, effectiveClientMeta, isr } from '@simplicity/core'
import i18n from '../lib/i18n'
import Screen from '../components/Screen'
import Card from '../components/Card'
import AddClientModal from '../modals/AddClientModal'
import ClientDrawer from '../drawers/ClientDrawer'
import { useFormOptions } from '../lib/formOptions'
import { colors } from '../theme/theme'
import { useClientsList } from '../hooks/useClientsList'

const TABS = [
  { key: 'active', icon: CheckCircle2 },
  { key: 'wandering', icon: Clock },
  { key: 'past', icon: CircleSlash },
  { key: 'no_status', icon: CircleDashed },
]
const STATUS_PILL = {
  active: 'rgba(139,168,136,0.16)',
  wandering: 'rgba(212,165,116,0.18)',
  past: 'rgba(42,37,32,0.06)',
  no_status: 'rgba(42,37,32,0.06)',
}
const statusKey = (m) => (m === 'no_status' ? 'noStatus' : m)
const initials = (name) => (name || '').split(' ').map((w) => w[0] || '').join('').slice(0, 2).toUpperCase()

// Clients screen — mirrors the web: right-aligned screen head + add, status tabs
// (with counts), search + open-balance filter, a per-tab summary hero, then rich
// client CARDS (avatar + name + status + project + sessions/paid/balance). Tap a
// card to open the client drawer in place.
export default function ClientsScreen() {
  const { clients, transactions, sessions, members, groups, loading, error, refetch, addClient, addTransaction, updateClient, deleteClient } = useClientsList()
  const { projects } = useFormOptions()
  const [adding, setAdding] = useState(false)
  const [openId, setOpenId] = useState(null)
  const [tab, setTab] = useState('active')
  const [query, setQuery] = useState('')
  const [balanceOnly, setBalanceOnly] = useState(false)

  // One pass: derive each client's effective status + balance.
  const enriched = useMemo(
    () => clients.map((c) => ({ c, meta: effectiveClientMeta(c, members, groups), bal: clientBalance(c, transactions, sessions, members, groups) })),
    [clients, transactions, sessions, members, groups],
  )
  const counts = useMemo(() => {
    const g = { active: 0, wandering: 0, past: 0, no_status: 0 }
    enriched.forEach((e) => { g[e.meta] = (g[e.meta] || 0) + 1 })
    return g
  }, [enriched])
  const openBalanceCount = useMemo(() => enriched.filter((e) => e.bal.balance > 0).length, [enriched])

  const shown = useMemo(() => {
    const q = query.trim()
    return enriched.filter((e) => {
      if (balanceOnly) return e.bal.balance > 0 && (!q || (e.c.name || '').includes(q))
      return e.meta === tab && (!q || (e.c.name || '').includes(q))
    })
  }, [enriched, tab, query, balanceOnly])

  // Per-tab hero totals (cumulative): sessions done/allot, paid, open balance.
  const hero = useMemo(() => {
    const set = balanceOnly ? shown : enriched.filter((e) => e.meta === tab)
    const done = set.reduce((s, e) => s + (e.bal.personalDone || 0), 0)
    const allot = set.reduce((s, e) => s + (e.bal.personalQuota || 0), 0)
    const paid = set.reduce((s, e) => s + (e.bal.paid || 0), 0)
    const balance = set.reduce((s, e) => s + (e.bal.balance || 0), 0)
    return { sessions: `${done}/${allot}`, paid: isr(paid), balance: isr(balance) }
  }, [enriched, shown, tab, balanceOnly])

  const total = counts.active + counts.wandering + counts.past + counts.no_status

  return (
    <Screen name="clients">
      {/* Screen head — meta + tagline + big title, with the add button */}
      <View style={styles.head}>
        <View style={styles.headText}>
          <View style={styles.headMeta}>
            <Text style={styles.metaLbl}>{i18n.t('clients:countLabel', { count: total, defaultValue: `${total} לקוחות` })}</Text>
            <Text style={styles.metaDot}>·</Text>
            <Text style={styles.metaLbl}>{i18n.t('clients:summary', { defaultValue: 'סיכום' })}</Text>
          </View>
          <Text style={styles.tagline}>{i18n.t('clients:tagline', { defaultValue: 'בניית קשרים יוצרת תוצאות.' })}</Text>
          <Text style={styles.title}>{i18n.t('clients:title', { defaultValue: 'לקוחות' })}</Text>
        </View>
        <Pressable style={styles.cta} onPress={() => setAdding(true)}>
          <Text style={styles.ctaText}>+ {i18n.t('clients:empty.addClient', { defaultValue: 'לקוח' })}</Text>
        </Pressable>
      </View>

      {loading && !clients.length ? (
        <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={refetch} tintColor={colors.brand} />}
        >
          {error ? <Text style={styles.error}>{error}</Text> : null}

          {/* Status tabs */}
          {!balanceOnly ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
              {TABS.map(({ key, icon: Icon }) => {
                if (key === 'no_status' && !counts.no_status) return null
                const on = tab === key
                return (
                  <Pressable key={key} style={[styles.tab, on && styles.tabOn]} onPress={() => setTab(key)}>
                    <Icon size={14} strokeWidth={1.7} color={on ? colors.onBrand : colors.textSub} />
                    <Text style={[styles.tabText, on && styles.tabTextOn]}>{i18n.t(`clients:status.${statusKey(key)}`)}</Text>
                    <Text style={[styles.tabCount, on && styles.tabTextOn]}>{counts[key] || 0}</Text>
                  </Pressable>
                )
              })}
            </ScrollView>
          ) : null}

          {/* Search + open-balance filter */}
          <View style={styles.searchRow}>
            <View style={styles.search}>
              <Search size={16} strokeWidth={1.6} color={colors.textFaint} />
              <TextInput
                style={styles.searchInput}
                value={query}
                onChangeText={setQuery}
                placeholder={i18n.t('clients:search', { defaultValue: 'חיפוש לקוח…' })}
                placeholderTextColor={colors.textFaint}
              />
            </View>
            <Pressable style={[styles.balFilter, balanceOnly && styles.balFilterOn]} onPress={() => setBalanceOnly((v) => !v)}>
              <Wallet size={13} strokeWidth={1.8} color={balanceOnly ? colors.onBrand : colors.textSub} />
              <Text style={[styles.balFilterText, balanceOnly && styles.tabTextOn]}>
                {i18n.t('clients:balanceFilter', { defaultValue: 'יתרה פתוחה' })}{openBalanceCount > 0 ? ` · ${openBalanceCount}` : ''}
              </Text>
            </Pressable>
          </View>

          {/* Per-tab hero summary */}
          {total > 0 ? (
            <Card padded={false} contentStyle={styles.hero}>
              <Text style={styles.heroTitle}>{i18n.t(`clients:hero.${statusKey(tab)}`, { defaultValue: i18n.t('clients:summary', { defaultValue: 'סיכום' }) })}</Text>
              <View style={styles.heroGrid}>
                <HeroStat label={i18n.t('clients:hero.sessions', { defaultValue: 'פגישות' })} value={hero.sessions} />
                <HeroStat label={i18n.t('clients:hero.paid', { defaultValue: 'שולם' })} value={hero.paid} divided />
                <HeroStat label={i18n.t('clients:hero.openBalance', { defaultValue: 'יתרה פתוחה' })} value={hero.balance} />
              </View>
            </Card>
          ) : null}

          {/* Client cards */}
          {shown.length ? (
            shown.map(({ c, meta, bal }) => {
              const project = projects.find((p) => p.id === c.project_id)
              const sessLabel = bal.hasPersonal
                ? `${bal.personalDone}/${bal.personalQuota || 0}`
                : `${bal.groupSessions.reduce((s, g) => s + g.held, 0)}/${bal.groupSessions.reduce((s, g) => s + (g.quota || 0), 0) || 0}`
              return (
                <Pressable key={c.id} onPress={() => setOpenId(c.id)}>
                  <Card padded={false} contentStyle={[styles.cc, meta === 'past' && styles.ccPast]}>
                    <View style={styles.ccHead}>
                      <View style={styles.ccAv}><Text style={styles.ccAvText}>{initials(c.name)}</Text></View>
                      <View style={styles.ccId}>
                        <Text style={styles.ccName} numberOfLines={1}>{c.name || ''}</Text>
                        <View style={styles.ccMeta}>
                          <View style={[styles.ccStatus, { backgroundColor: STATUS_PILL[meta] || STATUS_PILL.no_status }]}>
                            <Text style={styles.ccStatusText}>{i18n.t(`clients:status.${statusKey(meta)}`, { defaultValue: '' })}</Text>
                          </View>
                          {project ? <Text style={styles.ccProj} numberOfLines={1}>{project.name}</Text> : null}
                        </View>
                      </View>
                    </View>
                    <View style={styles.ccStats}>
                      <CardStat label={i18n.t('clients:card.sessions', { defaultValue: 'פגישות' })} value={sessLabel} />
                      <CardStat label={i18n.t('clients:card.paid', { defaultValue: 'שולם' })} value={isr(bal.paid)} divided />
                      <CardStat label={i18n.t('clients:card.balance', { defaultValue: 'יתרה' })} value={isr(bal.balance)} />
                    </View>
                  </Card>
                </Pressable>
              )
            })
          ) : (
            <Text style={styles.empty}>
              {query || balanceOnly
                ? i18n.t('clients:empty.noSearchResults', { defaultValue: 'לא נמצאו לקוחות.' })
                : (total ? i18n.t('clients:empty.noneInCategory', { defaultValue: 'אין לקוחות בקטגוריה זו.' }) : i18n.t('clients:empty.firstClient', { defaultValue: 'עדיין אין לקוחות.' }))}
            </Text>
          )}
        </ScrollView>
      )}

      <AddClientModal open={adding} onClose={() => setAdding(false)} onSave={addClient} />
      <ClientDrawer
        clientId={openId}
        clients={clients}
        transactions={transactions}
        sessions={sessions}
        members={members}
        groups={groups}
        onClose={() => setOpenId(null)}
        updateClient={updateClient}
        deleteClient={deleteClient}
        addTransaction={addTransaction}
      />
    </Screen>
  )
}

function HeroStat({ label, value, divided }) {
  return (
    <View style={[styles.heroStat, divided && styles.heroStatDivided]}>
      <Text style={styles.heroStatL}>{label}</Text>
      <Text style={styles.heroStatV} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
    </View>
  )
}
function CardStat({ label, value, divided }) {
  return (
    <View style={[styles.ccStat, divided && styles.ccStatDivided]}>
      <Text style={styles.ccStatL}>{label}</Text>
      <Text style={styles.ccStatV} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: 20, paddingBottom: 40, gap: 12 },
  error: { color: colors.danger, fontSize: 13 },
  empty: { color: colors.textFaint, fontSize: 14, textAlign: 'center', marginTop: 24, lineHeight: 20 },

  // Screen head
  head: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', paddingTop: 56, paddingBottom: 10, paddingHorizontal: 20, gap: 12 },
  headText: { flex: 1, alignItems: 'flex-end' },
  headMeta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metaLbl: { fontSize: 12, color: colors.textSub },
  metaDot: { fontSize: 12, color: colors.textFaint },
  tagline: { fontSize: 11, color: colors.textFaint, marginTop: 2 },
  title: { fontSize: 28, fontWeight: '600', color: colors.text, marginTop: 4 },
  cta: { marginTop: 6, paddingVertical: 10, paddingHorizontal: 16, borderRadius: 999, backgroundColor: colors.brand },
  ctaText: { fontSize: 14, fontWeight: '600', color: colors.onBrand },

  // Tabs
  tabs: { flexDirection: 'row', gap: 8, paddingVertical: 2 },
  tab: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 7, paddingHorizontal: 14, borderRadius: 20, borderWidth: 0.5, borderColor: colors.border, backgroundColor: colors.card },
  tabOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  tabText: { fontSize: 12, fontWeight: '500', color: colors.textSub },
  tabCount: { fontSize: 11, color: colors.textSub, opacity: 0.8 },
  tabTextOn: { color: colors.onBrand, fontWeight: '600' },

  // Search
  searchRow: { flexDirection: 'row', alignItems: 'stretch', gap: 8 },
  search: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, height: 42, paddingHorizontal: 14, borderRadius: 14, borderWidth: 0.5, borderColor: colors.border, backgroundColor: colors.card },
  searchInput: { flex: 1, fontSize: 14, color: colors.text },
  balFilter: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, borderRadius: 999, borderWidth: 0.5, borderColor: colors.border, backgroundColor: colors.card },
  balFilterOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  balFilterText: { fontSize: 12, fontWeight: '500', color: colors.textSub },

  // Hero
  hero: { paddingVertical: 16, paddingHorizontal: 12, gap: 12 },
  heroTitle: { fontSize: 11, fontWeight: '500', color: colors.textSub, letterSpacing: 0.4, textAlign: 'center' },
  heroGrid: { flexDirection: 'row' },
  heroStat: { flex: 1, alignItems: 'center', gap: 4 },
  heroStatDivided: { borderLeftWidth: StyleSheet.hairlineWidth, borderRightWidth: StyleSheet.hairlineWidth, borderColor: colors.divider },
  heroStatL: { fontSize: 9, fontWeight: '500', color: colors.textSub, letterSpacing: 0.4, textTransform: 'uppercase' },
  heroStatV: { fontSize: 22, fontWeight: '500', color: colors.text },

  // Client card
  cc: { padding: 16, gap: 14 },
  ccPast: { opacity: 0.62 },
  ccHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  ccAv: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  ccAvText: { fontSize: 14, fontWeight: '600', color: colors.onBrand },
  ccId: { flex: 1, minWidth: 0 },
  ccName: { fontSize: 15, fontWeight: '600', color: colors.text },
  ccMeta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4, flexWrap: 'wrap' },
  ccStatus: { paddingVertical: 2, paddingHorizontal: 9, borderRadius: 10 },
  ccStatusText: { fontSize: 10, fontWeight: '500', color: colors.text },
  ccProj: { fontSize: 10, color: colors.textSub, paddingVertical: 2, paddingHorizontal: 9, borderRadius: 10, borderWidth: 0.5, borderColor: colors.border, backgroundColor: 'rgba(42,37,32,0.05)' },
  ccStats: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.divider, paddingTop: 12 },
  ccStat: { flex: 1, alignItems: 'center', gap: 4 },
  ccStatDivided: { borderLeftWidth: StyleSheet.hairlineWidth, borderRightWidth: StyleSheet.hairlineWidth, borderColor: colors.divider },
  ccStatL: { fontSize: 9, fontWeight: '500', color: colors.textSub, letterSpacing: 0.4, textTransform: 'uppercase' },
  ccStatV: { fontSize: 17, fontWeight: '500', color: colors.text },
})

HeroStat.displayName = 'HeroStat'
CardStat.displayName = 'CardStat'
