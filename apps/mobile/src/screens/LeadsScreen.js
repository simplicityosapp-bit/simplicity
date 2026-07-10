import { useMemo, useRef, useState, useEffect, useCallback } from 'react'
import { useFocusEffect } from '@react-navigation/native'
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, ActivityIndicator, RefreshControl, Dimensions, Animated, Linking, Alert, I18nManager } from 'react-native'
import { GestureDetector, Gesture } from 'react-native-gesture-handler'
import { Bell, Check, MessageCircle, ChevronLeft, ChevronUp, ChevronDown, Search, SlidersHorizontal, Plus, X } from 'lucide-react-native'
import { LEAD_META, statusMetaOfLead, metaTitle, metaColor, isPendingReview, isConvertedLead, fmtShortDate } from '@simplicity/core'
import Select from '../components/Select'
import { useConfigTaxonomy } from '../hooks/useConfigTaxonomy'
import i18n from '../lib/i18n'
import Screen from '../components/Screen'
import ScreenHead from '../components/ScreenHead'
import Card from '../components/Card'
import { Glass, GlassPressable } from '../components/Glass'
import Sheet from '../components/Sheet'
import LeadCard from './leads/LeadCard'
import AddLeadModal from '../modals/AddLeadModal'
import ConvertLeadModal from '../modals/ConvertLeadModal'
import { colors } from '../theme/theme'
import { useFormOptions } from '../lib/formOptions'
import { usePreferences } from '../lib/preferences'
import { useLeadsList } from '../hooks/useLeadsList'

const DEFAULT_FILTER = { period: 'all', project: '', group: '', status: '', source: '', sort: '' }

// Fallback column-dot colors when a meta has no default sub-status (metaColor
// then returns a CSS var, which RN can't use).
const META_COLOR = { in_process: '#D9A566', converted: colors.positive, not_relevant: '#b3a99c' }
const COL_W = Math.min(300, Math.round(Dimensions.get('window').width * 0.82))
const todayYmd = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Leads screen — a KANBAN board (mirrors web): horizontally-scrolling meta
// columns (in_process / converted / not_relevant), each with rich lead cards.
// Move a lead between stages via the card's move control (→ target column →
// sub-status picker); every sub-status change is logged (lead_status_log via
// updateLead's source). Pending public-page leads sit in a review strip above.
export default function LeadsScreen() {
  const { leads, loading, error, refetch, addLead, updateLead, deleteLead, addClient, addGroupMember } = useLeadsList()
  const confirmDeleteLead = (id, name) => {
    Alert.alert(
      i18n.t('leads:delete.title', { defaultValue: 'מחיקת ליד' }),
      i18n.t('leads:delete.message', { name: name || '', defaultValue: 'למחוק את הליד?' }),
      [
        { text: i18n.t('modalsData:common.cancel', { defaultValue: 'ביטול' }), style: 'cancel' },
        { text: i18n.t('leads:delete.confirm', { defaultValue: 'מחק' }), style: 'destructive', onPress: () => deleteLead(id) },
      ],
    )
  }
  const { leadSources = [], leadStatuses = [], projects = [], groups = [] } = useFormOptions()
  const tax = useConfigTaxonomy()
  const { prefs, update: updatePrefs } = usePreferences()
  // Persistent tab: silently re-pull leads on RE-focus (skip mount).
  const firstFocus = useRef(true)
  useFocusEffect(useCallback(() => {
    if (firstFocus.current) { firstFocus.current = false; return }
    refetch(true)
  }, [refetch]))
  const flip = (i18n.language || '').startsWith('he') && !I18nManager.isRTL
  // View + filter persist in prefs (mirror web prefs.leadsView / prefs.leadsFilter).
  const view = prefs.leadsView === 'statuses' ? 'statuses' : 'board'
  const setView = (v) => updatePrefs({ leadsView: v })
  const [editing, setEditing] = useState(null)
  const [adding, setAdding] = useState(false)
  const [converting, setConverting] = useState(null)
  // Tap-to-move flow: { lead, newMeta?, subs? } — first pick a target column,
  // then (if it has 2+ sub-statuses) a sub-status.
  const [movePicker, setMovePicker] = useState(null)
  const [showFollowups, setShowFollowups] = useState(false)
  const [query, setQuery] = useState('')
  const [showFilter, setShowFilter] = useState(false)
  const filter = useMemo(() => ({ ...DEFAULT_FILTER, ...(prefs.leadsFilter || {}) }), [prefs.leadsFilter])
  const setF = (k, v) => updatePrefs({ leadsFilter: k === 'project' ? { ...filter, project: v, group: '' } : { ...filter, [k]: v } })
  const clearFilter = () => updatePrefs({ leadsFilter: { ...DEFAULT_FILTER } })
  const activeFilterCount = (filter.period !== 'all' ? 1 : 0) + (filter.project ? 1 : 0) + (filter.group ? 1 : 0) + (filter.status ? 1 : 0) + (filter.source ? 1 : 0) + (filter.sort ? 1 : 0)

  const pending = useMemo(() => leads.filter((l) => !l.deleted_at && isPendingReview(l)), [leads])
  const official = useMemo(() => leads.filter((l) => !l.deleted_at && !isPendingReview(l)), [leads])
  // Header stats (mirrors web computeStats): new this month, converted this month,
  // and the cohort conversion rate for this month's new leads.
  const stats = useMemo(() => {
    const now = new Date()
    const inMonth = (d) => { if (!d) return false; const x = new Date(d); return x.getFullYear() === now.getFullYear() && x.getMonth() === now.getMonth() }
    const newThis = official.filter((l) => (l.inquiry_date ? inMonth(l.inquiry_date) : inMonth(l.created_at)))
    const convertedThisMonth = official.filter((l) => isConvertedLead(l) && inMonth(l.converted_at)).length
    const cohortConverted = newThis.filter(isConvertedLead).length
    return { newThisMonth: newThis.length, convertedThisMonth, convRate: newThis.length ? Math.round((cohortConverted / newThis.length) * 100) : null }
  }, [official])
  const buckets = useMemo(() => {
    const now = new Date()
    const inPeriod = (l) => {
      if (!filter.period || filter.period === 'all') return true
      const raw = l.inquiry_date || l.created_at
      if (!raw) return false
      const d = new Date(raw)
      if (filter.period === 'month') return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
      if (filter.period === 'last30') { const c = new Date(now); c.setDate(c.getDate() - 30); return d >= c }
      if (filter.period === 'lastMonth') { const lm = new Date(now.getFullYear(), now.getMonth() - 1, 1); return d.getFullYear() === lm.getFullYear() && d.getMonth() === lm.getMonth() }
      return true
    }
    const matchRef = (val, sel) => (!sel ? true : sel === '__none__' ? !val : val === sel)
    const q = query.trim()
    const g = {}
    LEAD_META.forEach((m) => { g[m.key] = [] })
    official
      .filter((l) => inPeriod(l)
        && (!q || (l.name || '').includes(q))
        && matchRef(l.project_id, filter.project)
        && matchRef(l.group_id, filter.group)
        && matchRef(l.source_id, filter.source)
        && (!filter.status || l.status_id === filter.status))
      .forEach((l) => { (g[statusMetaOfLead(l)] || g.in_process).push(l) })
    if (filter.sort) {
      const dir = filter.sort === 'old' ? 1 : -1
      const keyOf = (l) => String(l.inquiry_date || l.created_at || '')
      LEAD_META.forEach((m) => { g[m.key].sort((a, b) => keyOf(a).localeCompare(keyOf(b)) * dir) })
    }
    return g
  }, [official, filter, query])
  const total = LEAD_META.reduce((s, m) => s + (buckets[m.key]?.length || 0), 0)
  // Open follow-ups — due (date ≤ today) AND still in_process.
  const dueFollowups = useMemo(() => {
    const ymd = todayYmd()
    return official.filter((l) => l.status_meta === 'in_process' && l.follow_up_date && String(l.follow_up_date).slice(0, 10) <= ymd)
  }, [official])
  const waLead = (l) => Linking.openURL(`https://wa.me/${(l.phone || '').replace(/\D/g, '')}`)

  // Commit a column move (+ optional sub-status). status_id is set to a
  // sub-status that BELONGS to the target column (or null); moving OUT of
  // 'converted' clears the conversion stamp. source='manual_drag' logs it.
  const applyLeadMove = (leadId, newMeta, statusId) => {
    const next = {
      status_meta: newMeta,
      status_id: statusId ?? null,
      last_status_changed_at: new Date().toISOString(),
      ...(newMeta !== 'converted' ? { converted_at: null, converted_to_client_id: null } : {}),
    }
    updateLead(leadId, next, { source: 'manual_drag' }).catch(() => {})
  }

  // Move a lead to a chosen meta: 2+ sub-statuses → ask which; 1 → auto; 0 → none.
  const chooseMeta = (lead, newMeta) => {
    if (statusMetaOfLead(lead) === newMeta) { setMovePicker(null); return }
    const subs = leadStatuses.filter((s) => s.meta_category === newMeta && !s.deleted_at)
    if (subs.length >= 2) { setMovePicker({ lead, newMeta, subs }); return }
    applyLeadMove(lead.id, newMeta, subs.length === 1 ? subs[0].id : null)
    setMovePicker(null)
  }

  // ── Drag-and-drop (long-press to pick up) with horizontal edge auto-scroll ──
  const boardRef = useRef(null)
  const boardBox = useRef({ x: 0, width: Dimensions.get('window').width }) // screen coords
  const scrollX = useRef(0)
  const colX = useRef({}) // { metaKey: { x, width } } in board-content coords
  const overMeta = useRef(null)
  const edge = useRef({ dir: 0, timer: null })
  const ghost = useRef(new Animated.ValueXY()).current
  const [dragLead, setDragLead] = useState(null)

  const stopEdgeScroll = () => { if (edge.current.timer) { clearInterval(edge.current.timer); edge.current.timer = null } edge.current.dir = 0 }
  // Clear the edge-scroll interval if the screen unmounts mid-drag (navigating away
  // while auto-scrolling would otherwise leak the timer).
  useEffect(() => () => { if (edge.current.timer) clearInterval(edge.current.timer) }, [])
  const startEdgeScroll = (dir) => {
    if (edge.current.dir === dir) return
    stopEdgeScroll()
    edge.current.dir = dir
    edge.current.timer = setInterval(() => {
      const next = Math.max(0, scrollX.current + dir * 14)
      scrollX.current = next
      boardRef.current?.scrollTo({ x: next, animated: false })
    }, 16)
  }
  const hitMeta = (absX) => {
    const relX = absX - boardBox.current.x + scrollX.current
    for (const m of LEAD_META) { const c = colX.current[m.key]; if (c && relX >= c.x && relX <= c.x + c.width) return m.key }
    return null
  }
  const onDragMove = (absX, absY) => {
    ghost.setValue({ x: absX - COL_W / 2, y: absY - 28 })
    overMeta.current = hitMeta(absX)
    const local = absX - boardBox.current.x
    if (local < 52) startEdgeScroll(-1)
    else if (local > boardBox.current.width - 52) startEdgeScroll(1)
    else stopEdgeScroll()
  }
  const onDrop = (lead) => {
    stopEdgeScroll()
    const target = overMeta.current
    overMeta.current = null
    setDragLead(null)
    if (target && target !== statusMetaOfLead(lead)) chooseMeta(lead, target)
  }
  const makePan = (lead) => Gesture.Pan()
    .activateAfterLongPress(220)
    .runOnJS(true)
    .onStart((e) => { setDragLead(lead); ghost.setValue({ x: e.absoluteX - COL_W / 2, y: e.absoluteY - 28 }) })
    .onUpdate((e) => onDragMove(e.absoluteX, e.absoluteY))
    .onEnd(() => onDrop(lead))
    .onFinalize(() => { stopEdgeScroll(); setDragLead(null) })

  return (
    <Screen name="leads">
      {loading && !leads.length ? (
        <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={refetch} tintColor={colors.brand} />}
        >
          <ScreenHead
            title={i18n.t('leads:title', { defaultValue: 'לידים' })}
            meta={[i18n.t('leads:countLabel', { count: total, defaultValue: `${total} לידים` })]}
            tagline={i18n.t('leads:tagline', { defaultValue: 'טיפוח קשרים מוביל לתוצאות.' })}
            onAdd={() => setAdding(true)}
            addLabel={i18n.t('leads:newLeadAria', { defaultValue: 'ליד חדש' })}
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}

          <View style={styles.viewToggle}>
            <Pressable style={[styles.viewBtn, view === 'board' && styles.viewBtnOn]} onPress={() => setView('board')}>
              <Text style={[styles.viewBtnText, view === 'board' && styles.viewBtnTextOn]}>{i18n.t('leads:tabLeads', { defaultValue: 'לידים' })}</Text>
            </Pressable>
            <Pressable style={[styles.viewBtn, view === 'statuses' && styles.viewBtnOn]} onPress={() => setView('statuses')}>
              <Text style={[styles.viewBtnText, view === 'statuses' && styles.viewBtnTextOn]}>{i18n.t('leads:tabStatuses', { defaultValue: 'סטטוסים' })}</Text>
            </Pressable>
          </View>

          {view === 'statuses' ? (
            <LeadStatusesPanel leadStatuses={tax.leadStatuses} onAdd={tax.addLeadStatus} onRemove={tax.removeLeadStatus} onUpdate={tax.updateLeadStatus} />
          ) : (
          <>
          <View style={styles.statsRow}>
            <View style={styles.stat}><Text style={styles.statNum}>{stats.newThisMonth}</Text><Text style={styles.statLbl}>{i18n.t('leads:stats.newThisMonth', { defaultValue: 'חדשים החודש' })}</Text></View>
            <View style={styles.stat}><Text style={styles.statNum}>{stats.convertedThisMonth}</Text><Text style={styles.statLbl}>{i18n.t('leads:stats.converted', { defaultValue: 'הומרו החודש' })}</Text></View>
            <View style={styles.stat}><Text style={styles.statNum}>{stats.convRate == null ? '—' : `${stats.convRate}%`}</Text><Text style={styles.statLbl}>{i18n.t('leads:stats.convRate', { defaultValue: 'שיעור המרה' })}</Text></View>
          </View>
          {pending.length ? (
            <View style={styles.group}>
              <View style={[styles.groupHead, flip && styles.rowFlip]}>
                <View style={[styles.dot, { backgroundColor: colors.brand }]} />
                <Text style={[styles.groupTitle, flip && styles.txtRtl]}>{i18n.t('leads:pending.title', { defaultValue: 'ממתינים לאישור' })}</Text>
                <Text style={styles.count}>{pending.length}</Text>
              </View>
              <Card padded={false}>
                {pending.map((l, i) => (
                  <View key={l.id || i} style={[styles.pendRow, i > 0 && styles.rowBorder]}>
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

          {/* Open follow-ups banner */}
          <GlassPressable radius={20} style={[styles.banner, dueFollowups.length === 0 && styles.bannerMuted]} onPress={() => setShowFollowups(true)}>
            <Bell size={15} strokeWidth={1.8} color={dueFollowups.length ? colors.amberWarn : colors.textSub} />
            {dueFollowups.length ? <Text style={styles.bannerCount}>{dueFollowups.length}</Text> : null}
            <Text style={styles.bannerText}>{dueFollowups.length === 0 ? i18n.t('leads:followups.empty', { defaultValue: 'אין פולואו-אפים פתוחים להיום' }) : i18n.t('leads:followups.due', { defaultValue: 'פולואו-אפים להיום' })}</Text>
            <View style={{ flex: 1 }} />
            <ChevronLeft size={15} strokeWidth={1.7} color={colors.textFaint} />
          </GlassPressable>

          {/* Search + filter */}
          <View style={styles.filterbar}>
            <Glass radius={18} style={styles.searchBox}>
              <Search size={16} strokeWidth={1.6} color={colors.textFaint} />
              <TextInput style={styles.searchInput} value={query} onChangeText={setQuery} placeholder={i18n.t('leads:search', { defaultValue: 'חיפוש ליד…' })} placeholderTextColor={colors.textFaint} />
            </Glass>
            <GlassPressable radius={999} on={activeFilterCount > 0} onColor={colors.text} style={styles.filterBtn} onPress={() => setShowFilter(true)}>
              <SlidersHorizontal size={14} strokeWidth={1.7} color={activeFilterCount ? colors.onBrand : colors.textSub} />
              <Text style={[styles.filterBtnText, activeFilterCount > 0 && styles.filterBtnTextOn]}>{i18n.t('leads:filter.btn', { defaultValue: 'סינון' })}</Text>
              {activeFilterCount > 0 ? <Text style={styles.filterCount}>{activeFilterCount}</Text> : null}
            </GlassPressable>
          </View>

          {/* Kanban board — horizontally-scrolling meta columns. Long-press a
             card to pick it up and drag between columns (edge = auto-scroll);
             the ⇄ control is the tap-to-move fallback. */}
          <View
            onLayout={() => boardRef.current?.measureInWindow?.((x, y, w) => { boardBox.current = { x, width: w } })}
          >
            <ScrollView
              ref={boardRef}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.board}
              scrollEventThrottle={16}
              onScroll={(e) => { scrollX.current = e.nativeEvent.contentOffset.x }}
            >
              {LEAD_META.map((m) => {
                const raw = metaColor(m.key, leadStatuses)
                const dot = raw && String(raw).startsWith('#') ? raw : META_COLOR[m.key]
                const rows = buckets[m.key] || []
                const over = dragLead && overMeta.current === m.key
                return (
                  <View
                    key={m.key}
                    style={{ width: COL_W }}
                    onLayout={(e) => { colX.current[m.key] = { x: e.nativeEvent.layout.x, width: e.nativeEvent.layout.width } }}
                  >
                    <Card padded={false} style={over ? styles.colOver : undefined} contentStyle={styles.colFrame}>
                      <View style={styles.colHead}>
                        <View style={[styles.colDot, { backgroundColor: dot }]} />
                        <Text style={styles.colTitle}>{metaTitle(m.key)}</Text>
                        <Text style={styles.colCount}>{rows.length}</Text>
                      </View>
                      <View style={styles.colBody}>
                        {rows.length ? rows.map((l) => (
                          <GestureDetector key={l.id} gesture={makePan(l)}>
                            <LeadCard
                              lead={l}
                              onEdit={setEditing}
                              onConvert={setConverting}
                              onDelete={(lead) => confirmDeleteLead(lead.id, lead.name)}
                              onMove={(lead) => setMovePicker({ lead })}
                              sources={leadSources}
                              statuses={leadStatuses}
                              dragging={dragLead?.id === l.id}
                            />
                          </GestureDetector>
                        )) : <Text style={styles.colEmpty}>{i18n.t('leads:column.empty', { defaultValue: 'אין לידים בעמודה זו' })}</Text>}
                      </View>
                    </Card>
                  </View>
                )
              })}
            </ScrollView>
          </View>
          {/* Floating ghost of the lifted card */}
          {dragLead ? (
            <Animated.View pointerEvents="none" style={[styles.ghost, { width: COL_W, transform: ghost.getTranslateTransform() }]}>
              <LeadCard lead={dragLead} sources={leadSources} statuses={leadStatuses} />
            </Animated.View>
          ) : null}
          </>
          )}
        </ScrollView>
      )}

      <AddLeadModal open={adding} onClose={() => setAdding(false)} onSave={addLead} />
      <AddLeadModal
        open={!!editing}
        lead={editing}
        onClose={() => setEditing(null)}
        onSave={(patch) => updateLead(editing.id, patch)}
        onDelete={() => confirmDeleteLead(editing.id, editing.name)}
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

      {/* Move flow — pick target column, then sub-status if the column has 2+ */}
      <Sheet
        open={!!movePicker}
        onClose={() => setMovePicker(null)}
        title={movePicker?.newMeta ? i18n.t('leads:dropPicker.title', { defaultValue: 'לאיזה תת-סטטוס לשייך?' }) : i18n.t('leads:move.title', { defaultValue: 'העברה לשלב' })}
      >
        {movePicker && !movePicker.newMeta ? (
          LEAD_META.filter((m) => m.key !== statusMetaOfLead(movePicker.lead)).map((m) => {
            const raw = metaColor(m.key, leadStatuses)
            const dot = raw && String(raw).startsWith('#') ? raw : META_COLOR[m.key]
            return (
              <Pressable key={m.key} style={styles.opt} onPress={() => chooseMeta(movePicker.lead, m.key)}>
                <View style={[styles.optDot, { backgroundColor: dot }]} />
                <Text style={styles.optText}>{metaTitle(m.key)}</Text>
              </Pressable>
            )
          })
        ) : movePicker ? (
          <>
            {movePicker.subs.map((s) => (
              <Pressable key={s.id} style={styles.opt} onPress={() => { applyLeadMove(movePicker.lead.id, movePicker.newMeta, s.id); setMovePicker(null) }}>
                <View style={[styles.optDot, { backgroundColor: s.color || colors.textSub }]} />
                <Text style={styles.optText}>{s.icon ? `${s.icon} ` : ''}{s.display_name}</Text>
              </Pressable>
            ))}
            <Pressable style={styles.opt} onPress={() => { applyLeadMove(movePicker.lead.id, movePicker.newMeta, null); setMovePicker(null) }}>
              <Text style={[styles.optText, { color: colors.textSub }]}>{i18n.t('leads:dropPicker.none', { defaultValue: 'ללא תת-סטטוס' })}</Text>
            </Pressable>
          </>
        ) : null}
      </Sheet>

      {/* Open follow-ups list */}
      <Sheet open={showFollowups} onClose={() => setShowFollowups(false)} title={i18n.t('modalsTask:followups.title', { defaultValue: 'פולואו-אפים פתוחים' })}>
        {dueFollowups.length === 0 ? (
          <Text style={styles.fuEmpty}>{i18n.t('modalsTask:followups.empty', { defaultValue: 'אין פולואו-אפים פתוחים להיום.' })}</Text>
        ) : dueFollowups.map((l) => (
          <View key={l.id} style={styles.fuRow}>
            <Pressable style={styles.fuOpen} onPress={() => { setShowFollowups(false); setEditing(l) }}>
              <Text style={styles.fuName} numberOfLines={1}>{l.name}</Text>
              <Text style={styles.fuDate}>{fmtShortDate(l.follow_up_date)}</Text>
            </Pressable>
            <Pressable style={styles.fuIcon} onPress={() => waLead(l)} hitSlop={6}><MessageCircle size={16} strokeWidth={1.7} color={colors.positive} /></Pressable>
            <Pressable style={styles.fuDone} onPress={() => updateLead(l.id, { follow_up_date: null })} hitSlop={6}><Check size={16} strokeWidth={2} color={colors.onBrand} /></Pressable>
          </View>
        ))}
      </Sheet>

      {/* Filter board */}
      <Sheet open={showFilter} onClose={() => setShowFilter(false)} title={i18n.t('leads:filter.title', { defaultValue: 'סינון לידים' })}>
        <Text style={styles.filterLabel}>{i18n.t('leads:filter.period', { defaultValue: 'תקופה' })}</Text>
        <View style={styles.seg}>
          {['all', 'month', 'last30', 'lastMonth'].map((p) => {
            const on = (filter.period || 'all') === p
            return (
              <Pressable key={p} style={[styles.segBtn, on && styles.segOn]} onPress={() => setF('period', p)}>
                <Text style={[styles.segText, on && styles.segTextOn]}>{i18n.t(`leads:filter.period_${p}`)}</Text>
              </Pressable>
            )
          })}
        </View>
        <Select label={i18n.t('leads:filter.project')} value={filter.project} onChange={(v) => setF('project', v)} placeholder={i18n.t('leads:filter.all')}
          options={[{ value: '', label: i18n.t('leads:filter.all') }, { value: '__none__', label: i18n.t('leads:filter.unassigned') }, ...projects.map((p) => ({ value: p.id, label: p.name || '' }))]} />
        {(() => {
          const gopts = (filter.project && filter.project !== '__none__') ? groups.filter((g) => g.project_id === filter.project && !g.deleted_at) : groups.filter((g) => !g.deleted_at)
          return gopts.length ? (
            <Select label={i18n.t('leads:filter.group')} value={filter.group} onChange={(v) => setF('group', v)} placeholder={i18n.t('leads:filter.all')}
              options={[{ value: '', label: i18n.t('leads:filter.all') }, { value: '__none__', label: i18n.t('leads:filter.unassigned') }, ...gopts.map((g) => ({ value: g.id, label: g.name || '' }))]} />
          ) : null
        })()}
        {leadStatuses.length ? (
          <Select label={i18n.t('leads:filter.status')} value={filter.status} onChange={(v) => setF('status', v)} placeholder={i18n.t('leads:filter.all')}
            options={[{ value: '', label: i18n.t('leads:filter.all') }, ...leadStatuses.filter((s) => !s.deleted_at).map((s) => ({ value: s.id, label: `${s.icon ? s.icon + ' ' : ''}${s.display_name || ''}` }))]} />
        ) : null}
        {leadSources.length ? (
          <Select label={i18n.t('leads:filter.source')} value={filter.source} onChange={(v) => setF('source', v)} placeholder={i18n.t('leads:filter.all')}
            options={[{ value: '', label: i18n.t('leads:filter.all') }, { value: '__none__', label: i18n.t('leads:filter.unassigned') }, ...leadSources.map((s) => ({ value: s.id, label: s.name || '' }))]} />
        ) : null}
        <Text style={styles.filterLabel}>{i18n.t('leads:filter.sort', { defaultValue: 'מיון לפי תאריך' })}</Text>
        <View style={styles.seg}>
          {[['', 'sort_none'], ['new', 'sort_new'], ['old', 'sort_old']].map(([v, k]) => {
            const on = (filter.sort || '') === v
            return (
              <Pressable key={k} style={[styles.segBtn, on && styles.segOn]} onPress={() => setF('sort', v)}>
                <Text style={[styles.segText, on && styles.segTextOn]}>{i18n.t(`leads:filter.${k}`)}</Text>
              </Pressable>
            )
          })}
        </View>
        {activeFilterCount > 0 ? (
          <Pressable style={styles.clearBtn} onPress={clearFilter}>
            <Text style={styles.clearText}>{i18n.t('leads:filter.clear', { defaultValue: 'נקה הכל' })}</Text>
          </Pressable>
        ) : null}
      </Sheet>
    </Screen>
  )
}

// Sub-status manager (view === 'statuses') — chips per meta group + add/remove +
// reorder. Web reorders by drag; mobile uses compact ▲▼ (earlier/later) which is
// reliable on a wrapped chip layout. Renumbers sort_order (10,20,…) on each move.
function LeadStatusesPanel({ leadStatuses, onAdd, onRemove, onUpdate }) {
  return (
    <View style={{ gap: 16 }}>
      <Text style={styles.panelIntro}>{i18n.t('leads:statusesPanel.intro', { defaultValue: 'ניהול תתי-סטטוסים תחת כל קטגוריית-על.' })}</Text>
      {LEAD_META.map((m) => (
        <StatusGroup
          key={m.key}
          meta={m.key}
          title={metaTitle(m.key)}
          statuses={(leadStatuses || []).filter((s) => s.meta_category === m.key && !s.deleted_at)}
          onAdd={onAdd}
          onRemove={onRemove}
          onUpdate={onUpdate}
        />
      ))}
    </View>
  )
}

function StatusGroup({ meta, title, statuses, onAdd, onRemove, onUpdate }) {
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const add = async () => {
    const v = draft.trim(); if (!v || busy) return
    setBusy(true); try { await onAdd(v, meta); setDraft('') } finally { setBusy(false) }
  }
  const sorted = [...statuses].sort((a, b) => (a.sort_order ?? 1e9) - (b.sort_order ?? 1e9))
  const move = (i, dir) => {
    const j = i + dir
    if (j < 0 || j >= sorted.length || !onUpdate) return
    const next = [...sorted]
    const [m] = next.splice(i, 1); next.splice(j, 0, m)
    next.forEach((s, idx) => { const so = (idx + 1) * 10; if (s.sort_order !== so) onUpdate(s.id, { sort_order: so }) })
  }
  const canReorder = sorted.length > 1 && !!onUpdate
  return (
    <View style={styles.sgroup}>
      <Text style={styles.sgroupTitle}>{title}</Text>
      <View style={styles.chips}>
        {sorted.length ? sorted.map((s, i) => (
          <View key={s.id} style={styles.chip}>
            {canReorder ? (
              <View style={styles.reorder}>
                <Pressable onPress={() => move(i, -1)} disabled={i === 0} hitSlop={4}><ChevronUp size={11} strokeWidth={2} color={i === 0 ? colors.border : colors.textSub} /></Pressable>
                <Pressable onPress={() => move(i, 1)} disabled={i === sorted.length - 1} hitSlop={4}><ChevronDown size={11} strokeWidth={2} color={i === sorted.length - 1 ? colors.border : colors.textSub} /></Pressable>
              </View>
            ) : null}
            {s.icon ? <Text style={styles.chipIcon}>{s.icon}</Text> : null}
            {s.color ? <View style={[styles.chipDot, { backgroundColor: s.color }]} /> : null}
            <Text style={styles.chipText}>{s.display_name}</Text>
            {s.is_default ? null : <Pressable onPress={() => onRemove(s.id)} hitSlop={6}><X size={12} strokeWidth={2} color={colors.textFaint} /></Pressable>}
          </View>
        )) : <Text style={styles.chipEmpty}>—</Text>}
      </View>
      <View style={styles.addRow}>
        <TextInput style={styles.addInput} value={draft} onChangeText={setDraft} placeholder={i18n.t('leads:statusesPanel.addPlaceholder', { meta: title })} placeholderTextColor={colors.textFaint} onSubmitEditing={add} />
        <Pressable style={styles.addBtn} onPress={add} disabled={busy || !draft.trim()}><Plus size={18} strokeWidth={2} color={colors.onBrand} /></Pressable>
      </View>
    </View>
  )
}
LeadStatusesPanel.displayName = 'LeadStatusesPanel'
StatusGroup.displayName = 'StatusGroup'

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  viewToggle: { flexDirection: 'row', gap: 8, backgroundColor: colors.cardFlat, borderRadius: 999, padding: 4 },
  viewBtn: { flex: 1, paddingVertical: 8, borderRadius: 999, alignItems: 'center' },
  viewBtnOn: { backgroundColor: colors.text },
  viewBtnText: { fontSize: 14, color: colors.textSub },
  // Inverse of the colors.text fill so the active tab label reads in both themes.
  viewBtnTextOn: { color: colors.bg, fontWeight: '600' },
  panelIntro: { fontSize: 13, color: colors.textSub, lineHeight: 18 },
  sgroup: { gap: 8 },
  sgroupTitle: { fontSize: 14, fontWeight: '600', color: colors.text },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.cardFlat },
  reorder: { marginInlineEnd: 1, marginInlineStart: -2 },
  chipIcon: { fontSize: 12 },
  chipDot: { width: 8, height: 8, borderRadius: 4 },
  chipText: { fontSize: 13, color: colors.text },
  chipEmpty: { fontSize: 12, color: colors.textFaint },
  addRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  addInput: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 14, fontSize: 14, color: colors.text, backgroundColor: colors.card },
  addBtn: { width: 44, height: 44, borderRadius: 12, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: 20, paddingBottom: 96, gap: 18 },
  error: { color: colors.danger, fontSize: 13 },
  group: { gap: 8 },
  groupHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowFlip: { flexDirection: 'row-reverse' },
  txtRtl: { textAlign: 'right' },
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 4 },
  stat: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 16, backgroundColor: colors.cardFlat, borderWidth: 1, borderColor: colors.border },
  statNum: { fontSize: 20, fontWeight: '700', color: colors.text },
  statLbl: { fontSize: 11, color: colors.textFaint, marginTop: 2 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  groupTitle: { fontSize: 14, fontWeight: '600', color: colors.textSub, flex: 1 },
  count: { fontSize: 13, color: colors.textFaint },
  pendRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, paddingHorizontal: 16 },
  rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.divider },
  info: { flex: 1, gap: 2 },
  name: { fontSize: 15, color: colors.text },
  phone: { fontSize: 12, color: colors.textFaint },
  approve: { paddingVertical: 7, paddingHorizontal: 12, borderRadius: 999, backgroundColor: colors.positive },
  approveText: { fontSize: 13, fontWeight: '600', color: colors.onBrand },
  reject: { paddingVertical: 7, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: colors.border },
  rejectText: { fontSize: 13, color: colors.textSub },

  board: { gap: 12, paddingBottom: 4 },
  colFrame: { padding: 12, minHeight: 96 },
  colOver: { borderColor: colors.positive, borderWidth: 1.5 },
  ghost: { position: 'absolute', top: 0, left: 0, zIndex: 999, opacity: 0.96, shadowColor: '#2A2520', shadowOpacity: 0.2, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 12 },
  colHead: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingBottom: 10, marginBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider },
  colDot: { width: 10, height: 10, borderRadius: 5 },
  colTitle: { fontSize: 14, fontWeight: '600', color: colors.text, flex: 1 },
  colCount: { fontSize: 13, fontWeight: '600', color: colors.textSub, backgroundColor: colors.cardFlat, minWidth: 22, textAlign: 'center', borderRadius: 999, paddingVertical: 1, paddingHorizontal: 7, overflow: 'hidden' },
  colBody: { gap: 10 },
  colEmpty: { fontSize: 12, color: colors.textFaint, textAlign: 'center', paddingVertical: 24 },

  opt: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 14, paddingHorizontal: 4, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider },
  optDot: { width: 10, height: 10, borderRadius: 5 },
  optText: { fontSize: 15, color: colors.text },

  banner: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 11, paddingHorizontal: 14 },
  bannerMuted: { opacity: 0.7 },
  bannerCount: { fontSize: 12, fontWeight: '700', color: colors.onBrand, backgroundColor: colors.amberWarn, minWidth: 20, textAlign: 'center', borderRadius: 999, paddingVertical: 1, paddingHorizontal: 6, overflow: 'hidden' },
  bannerText: { fontSize: 13, fontWeight: '500', color: colors.text },

  fuEmpty: { fontSize: 13, color: colors.textFaint, paddingVertical: 8 },
  fuRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider },
  fuOpen: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  fuName: { fontSize: 15, color: colors.text, flex: 1 },
  fuDate: { fontSize: 13, color: colors.textSub },
  fuIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.cardFlat },
  fuDone: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.positive },

  filterbar: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  searchBox: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12 },
  searchInput: { flex: 1, paddingVertical: 10, fontSize: 14, color: colors.text },
  filterBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 10, paddingHorizontal: 14 },
  filterBtnOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  filterBtnText: { fontSize: 13, color: colors.textSub },
  filterBtnTextOn: { color: colors.onBrand, fontWeight: '600' },
  filterCount: { fontSize: 11, fontWeight: '700', color: colors.brand, backgroundColor: colors.onBrand, minWidth: 18, textAlign: 'center', borderRadius: 999, paddingHorizontal: 5, overflow: 'hidden' },
  filterLabel: { fontSize: 13, color: colors.textSub, marginTop: 4 },
  seg: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  segBtn: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.cardFlat },
  segOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  segText: { fontSize: 13, color: colors.textSub },
  segTextOn: { color: colors.onBrand, fontWeight: '600' },
  clearBtn: { paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.border, alignItems: 'center', marginTop: 4 },
  clearText: { fontSize: 14, color: colors.textSub },
})
