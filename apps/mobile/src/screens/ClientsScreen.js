import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, ActivityIndicator, RefreshControl } from 'react-native'
import { useRoute, useNavigation, useFocusEffect } from '@react-navigation/native'
import { Search, Wallet, ArrowUpDown, Check, X, Trash2, CheckCircle2, Clock, CircleSlash, CircleDashed, Tags, Plus } from 'lucide-react-native'
import { clientBalance, effectiveClientMeta, paidForClients, sessionsCountForClients, currentMonthRange, financeQuery, isr } from '@simplicity/core'
import i18n from '../lib/i18n'
import Screen from '../components/Screen'
import ScreenHead from '../components/ScreenHead'
import Card from '../components/Card'
import { Glass, GlassPressable } from '../components/Glass'
import Sheet from '../components/Sheet'
import AddClientModal from '../modals/AddClientModal'
import ClientDrawer from '../drawers/ClientDrawer'
import { useFormOptions } from '../lib/formOptions'
import { colors, shadow } from '../theme/theme'
import { useClientsList } from '../hooks/useClientsList'
import { usePreferences } from '../hooks/usePreferences'
import { useConfigTaxonomy } from '../hooks/useConfigTaxonomy'

const TABS = [
  { key: 'active', icon: CheckCircle2 },
  { key: 'wandering', icon: Clock },
  { key: 'past', icon: CircleSlash },
  { key: 'no_status', icon: CircleDashed },
]
const SORT_OPTIONS = ['name', 'balance', 'paid', 'sessions', 'created', 'oldest']
const STATUS_PILL = {
  active: 'rgba(139,168,136,0.14)',
  wandering: 'rgba(212,165,116,0.16)',
  past: colors.fill,
  no_status: colors.fill,
}
const statusKey = (m) => (m === 'no_status' ? 'noStatus' : m)
const initials = (name) => (name || '').split(' ').map((w) => w[0] || '').join('').slice(0, 2).toUpperCase()

function sortClients(arr, sort, paidByClient) {
  const dir = sort.dir === 'desc' ? -1 : 1
  return [...arr].sort((a, b) => {
    switch (sort.field) {
      case 'balance': return ((a.bal.balance || 0) - (b.bal.balance || 0)) * dir
      case 'sessions': return ((a.bal.sessionsPaid || 0) - (b.bal.sessionsPaid || 0)) * dir
      case 'paid': return ((paidByClient.get(a.c.id) || 0) - (paidByClient.get(b.c.id) || 0)) * dir
      case 'created': return (new Date(a.c.created_at || 0).getTime() - new Date(b.c.created_at || 0).getTime()) * dir
      case 'oldest': return new Date(a.c.created_at || 0).getTime() - new Date(b.c.created_at || 0).getTime()
      case 'name': default: return (a.c.name || '').localeCompare(b.c.name || '', 'he') * dir
    }
  })
}

// Clients screen — mirrors the web: right-aligned screen head + add, a controls
// row (sort + status/project group-by), status tabs (with counts), search +
// open-balance filter, a per-tab summary hero (monthly/cumulative toggle), then
// rich client CARDS (avatar + name + status + project + sessions/paid/balance).
// Tap a card to open the client drawer in place.
// Any effective meta outside the 4 known buckets falls into no_status (matches
// web) — otherwise it makes a phantom count key, is missing from the tab totals,
// and the client never matches a tab (invisible).
const bucketMeta = (m) => (m === 'active' || m === 'wandering' || m === 'past' ? m : 'no_status')

export default function ClientsScreen() {
  const {
    clients, transactions, sessions, members, groups, tasks, reminders, loading, error, refetch,
    addClient, addTransaction, addSession, updateClient, deleteClient,
    updateSession, deleteSession, updateTask, deleteTask, updateTransaction, deleteTransaction, restoreTransaction,
    updateReminder, deleteReminder, updateMember,
  } = useClientsList()
  const { projects } = useFormOptions()
  const { prefs, update: updatePrefs } = usePreferences()
  // Persistent tab: silently re-pull on every RE-focus so mutations made elsewhere
  // (a payment, a new client) show on return. Skip the mount focus (initial load
  // covers it); silent = no spinner, no blank (content is gated on !data.length).
  const firstFocus = useRef(true)
  useFocusEffect(useCallback(() => {
    if (firstFocus.current) { firstFocus.current = false; return }
    refetch(true)
  }, [refetch]))
  const [adding, setAdding] = useState(false)
  const [openId, setOpenId] = useState(null)
  // Deep-link: Home's "needs attention" people popup can navigate here asking
  // to open a specific client's drawer (openClientId param). Consume it once,
  // then clear the param so a back-and-return doesn't re-open it.
  const route = useRoute()
  const nav = useNavigation()
  useEffect(() => {
    const id = route.params?.openClientId
    if (id) {
      setOpenId(id)
      nav.setParams({ openClientId: undefined })
    }
  }, [route.params?.openClientId])
  const [tab, setTab] = useState('active')
  const [query, setQuery] = useState('')
  const [sortOpen, setSortOpen] = useState(false)
  const [statusesOpen, setStatusesOpen] = useState(false)
  const tax = useConfigTaxonomy()
  // Persisted controls (survive across sessions, like the web).
  const balanceOnly = !!prefs.clientsBalanceOnly
  const setBalanceOnly = (v) => updatePrefs({ clientsBalanceOnly: v })
  const sort = prefs.clientsSort || { field: 'name', dir: 'asc' }
  const setSort = (patch) => updatePrefs({ clientsSort: { ...sort, ...patch } })
  const groupBy = prefs.clientsGroupBy === 'project' ? 'project' : 'status'
  const setGroupBy = (g) => updatePrefs({ clientsGroupBy: g })
  const scope = prefs.clientsScope === 'cumulative' ? 'cumulative' : 'monthly'
  const setScope = (s) => updatePrefs({ clientsScope: s })
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const [bulkStatusOpen, setBulkStatusOpen] = useState(false)
  const [pendingBulkDelete, setPendingBulkDelete] = useState(false)

  const toggleSelect = (id) => setSelectedIds((prev) => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })
  const exitSelect = () => { setSelectMode(false); setSelectedIds(new Set()); setBulkStatusOpen(false); setPendingBulkDelete(false) }
  const bulkChangeMeta = (k) => {
    // Write the legacy `status` column too (web parity) so EditClientModal's
    // prefill and any raw-status reader stay consistent with status_meta.
    selectedIds.forEach((id) => updateClient(id, { status_meta: k, status: k, status_id: null, status_overridden: true }))
    setBulkStatusOpen(false)
    exitSelect()
  }
  const bulkDelete = () => {
    selectedIds.forEach((id) => deleteClient(id))
    exitSelect()
  }

  // One pass: derive each client's effective status + balance.
  const enriched = useMemo(
    () => clients.map((c) => ({ c, meta: effectiveClientMeta(c, members, groups), bal: clientBalance(c, transactions, sessions, members, groups) })),
    [clients, transactions, sessions, members, groups],
  )
  const paidByClient = useMemo(() => {
    const m = new Map()
    clients.forEach((c) => m.set(c.id, financeQuery({ type: 'income', clientId: c.id, source: transactions }).reduce((s, f) => s + f.amount, 0)))
    return m
  }, [clients, transactions])
  const counts = useMemo(() => {
    const g = { active: 0, wandering: 0, past: 0, no_status: 0 }
    enriched.forEach((e) => { g[bucketMeta(e.meta)] += 1 })
    return g
  }, [enriched])
  const openBalanceCount = useMemo(() => enriched.filter((e) => e.bal.balance > 0).length, [enriched])

  // Source list: project group-by and the balance filter are cross-status; the
  // status tabs apply only inside the status grouping.
  const shown = useMemo(() => {
    const q = query.trim()
    let filtered = enriched.filter((e) => {
      if (groupBy === 'project' || balanceOnly) return true
      return bucketMeta(e.meta) === tab
    })
    if (balanceOnly) filtered = filtered.filter((e) => e.bal.balance > 0)
    if (q) filtered = filtered.filter((e) => (e.c.name || '').includes(q))
    return sortClients(filtered, sort, paidByClient)
  }, [enriched, groupBy, tab, query, balanceOnly, sort, paidByClient])

  // Project-grouped view — one block per project (+ a "no project" bucket).
  const grouped = useMemo(() => {
    if (groupBy !== 'project') return []
    const map = new Map()
    shown.forEach((e) => {
      const pid = e.c.project_id || '__none'
      if (!map.has(pid)) map.set(pid, { project: projects.find((p) => p.id === e.c.project_id) || null, items: [] })
      map.get(pid).items.push(e)
    })
    return [...map.values()].sort((a, b) => (a.project ? 0 : 1) - (b.project ? 0 : 1))
  }, [groupBy, shown, projects])

  // Per-tab hero totals — monthly (count + range paid) or cumulative (done/allot).
  const hero = useMemo(() => {
    const tabClients = enriched.filter((e) => e.meta === tab).map((e) => e.c)
    // past/no_status are always cumulative (monthly paid reads ~0 there) — match web's effScope
    const effScope = (tab === 'past' || tab === 'no_status') ? 'cumulative' : scope
    const range = effScope === 'monthly' ? currentMonthRange() : {}
    const paid = paidForClients(tabClients, range, transactions)
    const balance = enriched.filter((e) => e.meta === tab).reduce((s, e) => s + (e.bal.balance || 0), 0)
    if (tab === 'past' || tab === 'no_status') {
      return [
        { l: i18n.t('clients:hero.clients', { defaultValue: 'לקוחות' }), v: String(tabClients.length) },
        { l: i18n.t('clients:hero.sessions', { defaultValue: 'פגישות' }), v: String(sessionsCountForClients(tabClients, range, sessions, members, groups)) },
        { l: i18n.t('clients:hero.paid', { defaultValue: 'שולם' }), v: isr(paid) },
      ]
    }
    let sessionsLabel
    if (effScope === 'monthly') {
      sessionsLabel = String(sessionsCountForClients(tabClients, range, sessions, members, groups))
    } else {
      const done = enriched.filter((e) => e.meta === tab).reduce((s, e) => s + (e.bal.sessionsPaid || 0), 0)
      /* Same source as `done` — the engine's sessionsTotal, not the raw
         clients.sessions column. Reading the column skipped every group
         quota and counted a per-session client's allotment as 0, both of
         which let this print more done than allotted. */
      const allot = enriched.filter((e) => e.meta === tab).reduce((s, e) => s + (e.bal.sessionsTotal || 0), 0)
      sessionsLabel = `${done}/${allot}`
    }
    return [
      { l: i18n.t('clients:hero.sessions', { defaultValue: 'פגישות' }), v: sessionsLabel },
      { l: i18n.t('clients:hero.paid', { defaultValue: 'שולם' }), v: isr(paid) },
      { l: i18n.t('clients:hero.openBalance', { defaultValue: 'יתרה פתוחה' }), v: isr(balance) },
    ]
  }, [enriched, tab, scope, transactions, sessions, members, groups])

  const total = counts.active + counts.wandering + counts.past + counts.no_status

  const renderCard = (e) => {
    const { c, meta, bal } = e
    const project = projects.find((p) => p.id === c.project_id)
    /* A per-session client has no quota — sessions stays 0 by design — so
       until the coach records how many meetings are booked ahead there is no
       denominator to print, and pairing the held count with a 0 read as "0 of
       0 done". Same rule the web card and the client file follow. */
    const sessLabel = bal.hasPersonal
      ? (bal.perSession && !bal.personalQuota
        ? `${bal.personalDone}`
        : `${bal.personalDone}/${bal.personalQuota || 0}`)
      : `${bal.groupSessions.reduce((s, g) => s + g.held, 0)}/${bal.groupSessions.reduce((s, g) => s + (g.quota || 0), 0) || 0}`
    const selected = selectedIds.has(c.id)
    return (
      <Pressable key={c.id} onPress={() => (selectMode ? toggleSelect(c.id) : setOpenId(c.id))}>
        <Card padded={false} contentStyle={[styles.cc, meta === 'past' && styles.ccPast, selected && styles.ccSelected]}>
          {selectMode ? (
            <View style={[styles.ccCheck, selected && styles.ccCheckOn]}>
              {selected ? <Check size={13} strokeWidth={2.4} color={colors.onBrand} /> : null}
            </View>
          ) : null}
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
  }

  return (
    <Screen name="clients">
      {loading && !clients.length ? (
        <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={refetch} tintColor={colors.brand} />}
        >
          <ScreenHead
            title={i18n.t('clients:title', { defaultValue: 'לקוחות' })}
            meta={[i18n.t('clients:countLabel', { count: total, defaultValue: `${total} לקוחות` }), i18n.t('clients:summary', { defaultValue: 'סיכום' })]}
            tagline={i18n.t('clients:tagline', { defaultValue: 'בניית קשרים יוצרת תוצאות.' })}
            onAdd={() => setAdding(true)}
            addLabel={i18n.t('clients:addClientAria', { defaultValue: 'הוספת לקוח' })}
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}

          {/* Controls — sort + group-by toggle + select (glass like the cards) */}
          <View style={styles.controls}>
            <GlassPressable radius={999} style={styles.sortBtn} onPress={() => setSortOpen(true)}>
              <ArrowUpDown size={14} strokeWidth={1.7} color={colors.textSub} />
              <Text style={styles.sortBtnText}>{i18n.t('clients:sort.label', { defaultValue: 'מיון' })}</Text>
            </GlassPressable>
            <Glass radius={999} style={styles.toggle}>
              <Pressable style={[styles.toggleBtn, groupBy === 'status' && styles.toggleOn]} onPress={() => setGroupBy('status')}>
                <Text style={[styles.toggleText, groupBy === 'status' && styles.toggleTextOn]}>{i18n.t('clients:groupBy.status', { defaultValue: 'סטטוס' })}</Text>
              </Pressable>
              <Pressable style={[styles.toggleBtn, groupBy === 'project' && styles.toggleOn]} onPress={() => setGroupBy('project')}>
                <Text style={[styles.toggleText, groupBy === 'project' && styles.toggleTextOn]}>{i18n.t('clients:groupBy.project', { defaultValue: 'פרויקט' })}</Text>
              </Pressable>
            </Glass>
            <GlassPressable radius={999} on={selectMode} onColor={colors.text} style={styles.selectBtn} onPress={() => (selectMode ? exitSelect() : setSelectMode(true))}>
              <Text style={[styles.selectBtnText, selectMode && styles.toggleTextOn]}>{selectMode ? i18n.t('clients:select.cancel', { defaultValue: 'בטל בחירה' }) : i18n.t('clients:select.enter', { defaultValue: 'בחר/י' })}</Text>
            </GlassPressable>
            {/* The sub-status editor. It lived in Settings, which was the only
                place on this platform that could create or delete one, while
                THIS screen named them on every card and filtered by them. */}
            <GlassPressable radius={999} style={styles.sortBtn} onPress={() => setStatusesOpen(true)}>
              <Tags size={14} strokeWidth={1.7} color={colors.textSub} />
              <Text style={styles.sortBtnText}>{i18n.t('clients:statuses.link', { defaultValue: 'תתי-סטטוסים' })}</Text>
            </GlassPressable>
          </View>

          {/* Status tabs (status mode only) */}
          {groupBy === 'status' && !balanceOnly ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
              {TABS.map(({ key, icon: Icon }) => {
                if (key === 'no_status' && !counts.no_status) return null
                const on = tab === key
                return (
                  <GlassPressable key={key} radius={20} on={on} style={styles.tab} onPress={() => setTab(key)}>
                    <Icon size={14} strokeWidth={1.7} color={on ? colors.onBrand : colors.textSub} />
                    <Text style={[styles.tabText, on && styles.tabTextOn]}>{i18n.t(`clients:status.${statusKey(key)}`)}</Text>
                    <Text style={[styles.tabCount, on && styles.tabTextOn]}>{counts[key] || 0}</Text>
                  </GlassPressable>
                )
              })}
            </ScrollView>
          ) : null}

          {/* Search + open-balance filter */}
          <View style={styles.searchRow}>
            <Glass radius={14} style={styles.search}>
              <Search size={16} strokeWidth={1.6} color={colors.textFaint} />
              <TextInput
                style={styles.searchInput}
                value={query}
                onChangeText={setQuery}
                placeholder={i18n.t('clients:search', { defaultValue: 'חיפוש לקוח…' })}
                placeholderTextColor={colors.textFaint}
              />
            </Glass>
            <GlassPressable radius={999} on={balanceOnly} style={styles.balFilter} onPress={() => setBalanceOnly(!balanceOnly)}>
              <Wallet size={13} strokeWidth={1.8} color={balanceOnly ? colors.onBrand : colors.textSub} />
              <Text style={[styles.balFilterText, balanceOnly && styles.tabTextOn]}>
                {i18n.t('clients:balanceFilter', { defaultValue: 'יתרה פתוחה' })}{openBalanceCount > 0 ? ` · ${openBalanceCount}` : ''}
              </Text>
            </GlassPressable>
          </View>

          {/* Per-tab hero summary with monthly/cumulative toggle (status mode) */}
          {groupBy === 'status' && total > 0 ? (
            <Card padded={false} contentStyle={styles.hero}>
              <View style={styles.heroTop}>
                <Text style={styles.heroTitle}>{i18n.t(`clients:hero.${statusKey(tab)}`, { defaultValue: i18n.t('clients:summary', { defaultValue: 'סיכום' }) })}</Text>
                {tab !== 'past' && tab !== 'no_status' ? (
                  <View style={styles.scopeToggle}>
                    <Pressable style={[styles.scopeBtn, scope === 'monthly' && styles.scopeOn]} onPress={() => setScope('monthly')}>
                      <Text style={[styles.scopeText, scope === 'monthly' && styles.scopeTextOn]}>{i18n.t('clients:hero.monthly', { defaultValue: 'חודשי' })}</Text>
                    </Pressable>
                    <Pressable style={[styles.scopeBtn, scope === 'cumulative' && styles.scopeOn]} onPress={() => setScope('cumulative')}>
                      <Text style={[styles.scopeText, scope === 'cumulative' && styles.scopeTextOn]}>{i18n.t('clients:hero.cumulative', { defaultValue: 'מצטבר' })}</Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>
              <View style={styles.heroGrid}>
                {hero.map((s, i) => <HeroStat key={s.l} label={s.l} value={s.v} divided={i === 1} />)}
              </View>
            </Card>
          ) : null}

          {/* Client cards — flat or project-grouped */}
          {shown.length ? (
            groupBy === 'project'
              ? grouped.map(({ project, items }) => (
                <View key={project?.id || '__none'} style={styles.projGroup}>
                  <View style={styles.projHead}>
                    <View style={[styles.projDot, { backgroundColor: project?.color || colors.textSub }]} />
                    <Text style={styles.projName} numberOfLines={1}>{project?.name || i18n.t('clients:project.none', { defaultValue: 'ללא פרויקט' })}</Text>
                    <Text style={styles.projCount}>{items.length}</Text>
                  </View>
                  {items.map(renderCard)}
                </View>
              ))
              : shown.map(renderCard)
          ) : (
            <Text style={styles.empty}>
              {query || balanceOnly
                ? i18n.t('clients:empty.noSearchResults', { defaultValue: 'לא נמצאו לקוחות.' })
                : (total ? i18n.t('clients:empty.noneInCategory', { defaultValue: 'אין לקוחות בקטגוריה זו.' }) : i18n.t('clients:empty.firstClient', { defaultValue: 'עדיין אין לקוחות.' }))}
            </Text>
          )}
        </ScrollView>
      )}

      {/* Bulk action bar */}
      {selectMode ? (
        <View style={[styles.bulkBar, { bottom: 16 }]}>
          <Text style={styles.bulkCount}>{i18n.t('clients:bulk.selected', { count: selectedIds.size, defaultValue: `${selectedIds.size} נבחרו` })}</Text>
          <View style={styles.bulkActions}>
            <Pressable style={[styles.bulkBtn, !selectedIds.size && styles.bulkBtnOff]} disabled={!selectedIds.size} onPress={() => setBulkStatusOpen(true)}>
              <Text style={styles.bulkBtnText}>{i18n.t('clients:bulk.changeStatus', { defaultValue: 'שינוי סטטוס' })}</Text>
            </Pressable>
            <Pressable style={[styles.bulkBtn, styles.bulkDanger, !selectedIds.size && styles.bulkBtnOff]} disabled={!selectedIds.size} onPress={() => setPendingBulkDelete(true)}>
              <Trash2 size={14} strokeWidth={1.8} color={colors.danger} />
            </Pressable>
            <Pressable style={styles.bulkClose} onPress={exitSelect}>
              <X size={16} strokeWidth={1.7} color={colors.textSub} />
            </Pressable>
          </View>
        </View>
      ) : null}

      {/* Bulk change-status sheet */}
      <Sheet open={bulkStatusOpen} onClose={() => setBulkStatusOpen(false)} title={i18n.t('clients:bulk.moveTo', { defaultValue: 'העברה ל-' })}>
        {TABS.map(({ key }) => (
          <Pressable key={key} style={styles.sortOpt} onPress={() => bulkChangeMeta(key)}>
            <Text style={styles.sortOptText}>{i18n.t(`clients:status.${statusKey(key)}`)}</Text>
          </Pressable>
        ))}
      </Sheet>

      {/* Bulk delete confirm sheet */}
      <Sheet open={pendingBulkDelete} onClose={() => setPendingBulkDelete(false)} title={i18n.t('clients:bulk.delete', { defaultValue: 'מחיקה' })}>
        <Text style={styles.confirmText}>{i18n.t('clients:bulk.selected', { count: selectedIds.size, defaultValue: `${selectedIds.size} נבחרו` })}</Text>
        <View style={styles.sortDir}>
          <Pressable style={styles.sortDirBtn} onPress={() => setPendingBulkDelete(false)}>
            <Text style={styles.sortDirText}>{i18n.t('modalsData:common.cancel', { defaultValue: 'ביטול' })}</Text>
          </Pressable>
          <Pressable style={[styles.sortDirBtn, styles.confirmDelete]} onPress={bulkDelete}>
            <Text style={styles.confirmDeleteText}>{i18n.t('clients:bulk.delete', { defaultValue: 'מחיקה' })}</Text>
          </Pressable>
        </View>
      </Sheet>

      {/* Sub-status editor */}
      <Sheet open={statusesOpen} onClose={() => setStatusesOpen(false)} title={i18n.t('clients:statuses.title', { defaultValue: 'ניהול תתי-סטטוסים' })}>
        <ClientStatusesPanel tax={tax} />
      </Sheet>

      {/* Sort sheet */}
      <Sheet open={sortOpen} onClose={() => setSortOpen(false)} title={i18n.t('clients:sort.heading', { defaultValue: 'מיין/י לפי' })}>
        {SORT_OPTIONS.map((f) => {
          const on = sort.field === f
          return (
            <Pressable key={f} style={styles.sortOpt} onPress={() => setSort({ field: f })}>
              <Text style={[styles.sortOptText, on && styles.sortOptOn]}>{i18n.t(`clients:sort.${f}`)}</Text>
              {on ? <Check size={16} strokeWidth={2} color={colors.brand} /> : null}
            </Pressable>
          )
        })}
        <View style={styles.sortDir}>
          <Pressable style={[styles.sortDirBtn, sort.dir === 'asc' && styles.sortDirOn]} onPress={() => setSort({ dir: 'asc' })}>
            <Text style={[styles.sortDirText, sort.dir === 'asc' && styles.toggleTextOn]}>{i18n.t('clients:sort.asc', { defaultValue: 'עולה' })}</Text>
          </Pressable>
          <Pressable style={[styles.sortDirBtn, sort.dir === 'desc' && styles.sortDirOn]} onPress={() => setSort({ dir: 'desc' })}>
            <Text style={[styles.sortDirText, sort.dir === 'desc' && styles.toggleTextOn]}>{i18n.t('clients:sort.desc', { defaultValue: 'יורד' })}</Text>
          </Pressable>
        </View>
      </Sheet>

      <AddClientModal open={adding} onClose={() => setAdding(false)} onSave={addClient} />
      <ClientDrawer
        clientId={openId}
        clients={clients}
        transactions={transactions}
        sessions={sessions}
        members={members}
        groups={groups}
        tasks={tasks}
        reminders={reminders}
        onClose={() => setOpenId(null)}
        updateClient={updateClient}
        deleteClient={deleteClient}
        addTransaction={addTransaction}
        addSession={addSession}
        updateSession={updateSession}
        deleteSession={deleteSession}
        updateTask={updateTask}
        deleteTask={deleteTask}
        updateTransaction={updateTransaction}
        deleteTransaction={deleteTransaction}
        restoreTransaction={restoreTransaction}
        updateReminder={updateReminder}
        deleteReminder={deleteReminder}
        updateMember={updateMember}
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

/* The client sub-status editor, moved here from Settings — which was the only
   place on this platform able to create or delete one, while this screen (the
   one that names them on every card, tabs by them and filters by them) could
   only read. Chips per meta group, a meta pill to choose where a new one
   lands, and an add row: the same shape the leads screen uses for its stages,
   so the two taxonomies are edited the same way.

   `no_status` is deliberately absent from the pills — it is the bucket for
   clients with no sub-status at all, so creating one inside it would be a
   contradiction. */
const STATUS_METAS = ['active', 'wandering', 'past']

function ClientStatusesPanel({ tax }) {
  const [name, setName] = useState('')
  const [meta, setMeta] = useState('active')
  const [busy, setBusy] = useState(false)
  const add = async () => {
    const v = name.trim(); if (!v || busy) return
    setBusy(true); try { await tax.addClientStatus(v, meta); setName('') } finally { setBusy(false) }
  }
  const live = (tax.clientStatuses || []).filter((s) => !s.deleted_at)
  return (
    <View style={{ gap: 10 }}>
      <Text style={styles.statusHint}>{i18n.t('clients:statuses.hint', { defaultValue: '' })}</Text>
      <View style={styles.statusChips}>
        {live.length ? live.map((s) => (
          <View key={s.id} style={styles.statusChip}>
            {s.icon ? <Text style={styles.statusChipIcon}>{s.icon}</Text> : null}
            <Text style={styles.statusChipText}>{s.display_name}</Text>
            {s.is_default ? null : (
              <Pressable onPress={() => tax.removeClientStatus(s.id)} hitSlop={6}>
                <X size={12} strokeWidth={2} color={colors.textFaint} />
              </Pressable>
            )}
          </View>
        )) : <Text style={styles.statusHint}>{i18n.t('clients:statuses.empty', { defaultValue: '—' })}</Text>}
      </View>
      <View style={styles.statusMetas}>
        {STATUS_METAS.map((m) => {
          const on = meta === m
          return (
            <Pressable key={m} style={[styles.statusMeta, on && styles.statusMetaOn]} onPress={() => setMeta(m)}>
              <Text style={[styles.statusMetaText, on && styles.statusMetaTextOn]}>{i18n.t(`clients:status.${m}`, { defaultValue: m })}</Text>
            </Pressable>
          )
        })}
      </View>
      <View style={styles.statusAddRow}>
        <TextInput
          style={styles.statusInput}
          value={name}
          onChangeText={setName}
          placeholder={i18n.t('clients:statuses.placeholder', { meta: i18n.t(`clients:status.${meta}`), defaultValue: 'סטטוס חדש…' })}
          placeholderTextColor={colors.textFaint}
          onSubmitEditing={add}
        />
        <Pressable style={styles.statusAddBtn} onPress={add} disabled={busy || !name.trim()}>
          <Plus size={18} strokeWidth={2} color={colors.onBrand} />
        </Pressable>
      </View>
    </View>
  )
}
ClientStatusesPanel.displayName = 'ClientStatusesPanel'

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: 20, paddingBottom: 96, gap: 12 },
  error: { color: colors.danger, fontSize: 13 },
  empty: { color: colors.textFaint, fontSize: 14, textAlign: 'center', marginTop: 24, lineHeight: 20 },

  // Controls row (glass backgrounds provided by <Glass>/<GlassPressable>)
  controls: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sortBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 7, paddingHorizontal: 12 },
  sortBtnText: { fontSize: 12, color: colors.text },
  toggle: { flexDirection: 'row', padding: 2 },
  toggleBtn: { paddingVertical: 6, paddingHorizontal: 14, borderRadius: 999 },
  toggleOn: { backgroundColor: colors.brand },
  toggleText: { fontSize: 12, color: colors.textSub },
  toggleTextOn: { color: colors.onBrand, fontWeight: '600' },
  selectBtn: { paddingVertical: 7, paddingHorizontal: 12 },
  selectBtnText: { fontSize: 12, color: colors.textSub },

  // Tabs
  tabs: { flexDirection: 'row', gap: 8, paddingVertical: 2 },
  tab: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 7, paddingHorizontal: 14 },
  tabText: { fontSize: 12, fontWeight: '500', color: colors.textSub },
  tabCount: { fontSize: 11, color: colors.textSub, opacity: 0.8 },
  tabTextOn: { color: colors.onBrand, fontWeight: '600' },

  // Search
  searchRow: { flexDirection: 'row', alignItems: 'stretch', gap: 8 },
  search: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, height: 42, paddingHorizontal: 14 },
  searchInput: { flex: 1, fontSize: 14, color: colors.text },
  balFilter: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14 },
  balFilterText: { fontSize: 12, fontWeight: '500', color: colors.textSub },

  // Hero
  hero: { paddingVertical: 16, paddingHorizontal: 12, gap: 12 },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  heroTitle: { flex: 1, fontSize: 11, fontWeight: '500', color: colors.textSub, letterSpacing: 0.4 },
  scopeToggle: { flexDirection: 'row', borderRadius: 999, borderWidth: 1, borderColor: colors.border, padding: 2 },
  scopeBtn: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 999 },
  scopeOn: { backgroundColor: colors.brand },
  scopeText: { fontSize: 11, color: colors.textSub },
  scopeTextOn: { color: colors.onBrand, fontWeight: '600' },
  heroGrid: { flexDirection: 'row' },
  heroStat: { flex: 1, alignItems: 'center', gap: 4 },
  heroStatDivided: { borderLeftWidth: StyleSheet.hairlineWidth, borderRightWidth: StyleSheet.hairlineWidth, borderColor: colors.divider },
  heroStatL: { fontSize: 9, fontWeight: '500', color: colors.textSub, letterSpacing: 0.4, textTransform: 'uppercase' },
  heroStatV: { fontSize: 22, fontWeight: '500', color: colors.text },

  // Project group
  projGroup: { gap: 12 },
  projHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4, marginBottom: 2, paddingHorizontal: 2 },
  projDot: { width: 10, height: 10, borderRadius: 5 },
  projName: { flex: 1, fontSize: 13, fontWeight: '600', color: colors.text },
  projCount: { fontSize: 12, fontWeight: '600', color: colors.textSub, backgroundColor: colors.fillStrong, paddingVertical: 2, paddingHorizontal: 8, borderRadius: 999, overflow: 'hidden' },

  // Client card
  cc: { padding: 16, gap: 14 },
  ccPast: { opacity: 0.62 },
  ccSelected: { borderWidth: 2, borderColor: colors.positive },
  ccCheck: { position: 'absolute', top: 10, start: 10, zIndex: 2, width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  ccCheckOn: { backgroundColor: colors.positive, borderColor: colors.positive },
  ccHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  ccAv: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  ccAvText: { fontSize: 14, fontWeight: '600', color: colors.onBrand },
  ccId: { flex: 1, minWidth: 0 },
  ccName: { fontSize: 15, fontWeight: '600', color: colors.text },
  ccMeta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4, flexWrap: 'wrap' },
  ccStatus: { paddingVertical: 2, paddingHorizontal: 9, borderRadius: 10 },
  ccStatusText: { fontSize: 10, fontWeight: '500', color: colors.text },
  ccProj: { fontSize: 10, color: colors.textSub, paddingVertical: 2, paddingHorizontal: 9, borderRadius: 10, borderWidth: 0.5, borderColor: colors.border, backgroundColor: colors.fill },
  ccStats: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.divider, paddingTop: 12 },
  ccStat: { flex: 1, alignItems: 'center', gap: 4 },
  ccStatDivided: { borderLeftWidth: StyleSheet.hairlineWidth, borderRightWidth: StyleSheet.hairlineWidth, borderColor: colors.divider },
  ccStatL: { fontSize: 9, fontWeight: '500', color: colors.textSub, letterSpacing: 0.4, textTransform: 'uppercase' },
  ccStatV: { fontSize: 17, fontWeight: '500', color: colors.text },

  // Sort sheet
  /* Sub-status editor (ClientStatusesPanel) */
  statusHint: { fontSize: 12.5, lineHeight: 18, color: colors.textSub },
  statusChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  statusChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, paddingHorizontal: 11, borderRadius: 999, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.divider },
  statusChipIcon: { fontSize: 13 },
  statusChipText: { fontSize: 13, color: colors.text },
  statusMetas: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  statusMeta: { paddingVertical: 5, paddingHorizontal: 12, borderRadius: 999, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.divider },
  statusMetaOn: { backgroundColor: colors.text, borderColor: colors.text },
  statusMetaText: { fontSize: 12.5, color: colors.textSub },
  statusMetaTextOn: { color: colors.onBrand },
  statusAddRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  /* No minWidth:0 — that's a CSS flexbox workaround; RN's flex has no such
     default and doesn't need it. */
  statusInput: { flex: 1, height: 44, paddingHorizontal: 12, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.divider, color: colors.text, fontSize: 14 },
  statusAddBtn: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.brand },

  sortOpt: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 13, paddingHorizontal: 4 },
  sortOptText: { fontSize: 15, color: colors.text },
  sortOptOn: { color: colors.brand, fontWeight: '600' },
  sortDir: { flexDirection: 'row', gap: 10, marginTop: 8 },
  sortDirBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  sortDirOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  sortDirText: { fontSize: 14, color: colors.textSub },
  confirmText: { fontSize: 14, color: colors.text },
  confirmDelete: { backgroundColor: colors.dangerFill, borderColor: colors.danger },
  confirmDeleteText: { fontSize: 14, fontWeight: '600', color: colors.onBrand },

  // Bulk bar
  bulkBar: { position: 'absolute', left: 12, right: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, ...shadow.card },
  bulkCount: { fontSize: 13, fontWeight: '600', color: colors.text },
  bulkActions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  bulkBtn: { paddingVertical: 7, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: colors.border },
  bulkBtnOff: { opacity: 0.4 },
  bulkBtnText: { fontSize: 12, color: colors.text },
  bulkDanger: { borderColor: 'rgba(181,99,78,0.35)' },
  bulkClose: { width: 28, height: 28, borderRadius: 14, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
})

HeroStat.displayName = 'HeroStat'
CardStat.displayName = 'CardStat'
