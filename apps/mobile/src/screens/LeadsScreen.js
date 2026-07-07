import { useMemo, useRef, useState } from 'react'
import { View, Text, Pressable, StyleSheet, ScrollView, ActivityIndicator, RefreshControl, Dimensions, Animated } from 'react-native'
import { GestureDetector, Gesture } from 'react-native-gesture-handler'
import { LEAD_META, statusMetaOfLead, metaTitle, metaColor, isPendingReview } from '@simplicity/core'
import i18n from '../lib/i18n'
import Screen from '../components/Screen'
import ScreenHead from '../components/ScreenHead'
import Card from '../components/Card'
import Sheet from '../components/Sheet'
import LeadCard from './leads/LeadCard'
import AddLeadModal from '../modals/AddLeadModal'
import ConvertLeadModal from '../modals/ConvertLeadModal'
import { colors } from '../theme/theme'
import { useFormOptions } from '../lib/formOptions'
import { useLeadsList } from '../hooks/useLeadsList'

// Fallback column-dot colors when a meta has no default sub-status (metaColor
// then returns a CSS var, which RN can't use).
const META_COLOR = { in_process: '#D9A566', converted: colors.positive, not_relevant: '#b3a99c' }
const COL_W = Math.min(300, Math.round(Dimensions.get('window').width * 0.82))

// Leads screen — a KANBAN board (mirrors web): horizontally-scrolling meta
// columns (in_process / converted / not_relevant), each with rich lead cards.
// Move a lead between stages via the card's move control (→ target column →
// sub-status picker); every sub-status change is logged (lead_status_log via
// updateLead's source). Pending public-page leads sit in a review strip above.
export default function LeadsScreen() {
  const { leads, loading, error, refetch, addLead, updateLead, deleteLead, addClient, addGroupMember } = useLeadsList()
  const { leadSources = [], leadStatuses = [] } = useFormOptions()
  const [editing, setEditing] = useState(null)
  const [adding, setAdding] = useState(false)
  const [converting, setConverting] = useState(null)
  // Tap-to-move flow: { lead, newMeta?, subs? } — first pick a target column,
  // then (if it has 2+ sub-statuses) a sub-status.
  const [movePicker, setMovePicker] = useState(null)

  const pending = useMemo(() => leads.filter((l) => !l.deleted_at && isPendingReview(l)), [leads])
  const official = useMemo(() => leads.filter((l) => !l.deleted_at && !isPendingReview(l)), [leads])
  const buckets = useMemo(() => {
    const g = {}
    LEAD_META.forEach((m) => { g[m.key] = [] })
    official.forEach((l) => { (g[statusMetaOfLead(l)] || g.in_process).push(l) })
    return g
  }, [official])
  const total = LEAD_META.reduce((s, m) => s + (buckets[m.key]?.length || 0), 0)

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
      <ScreenHead
        title={i18n.t('leads:title', { defaultValue: 'לידים' })}
        meta={[i18n.t('leads:countLabel', { count: total, defaultValue: `${total} לידים` })]}
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

          {pending.length ? (
            <View style={styles.group}>
              <View style={styles.groupHead}>
                <View style={[styles.dot, { backgroundColor: colors.brand }]} />
                <Text style={styles.groupTitle}>{i18n.t('leads:pending.title', { defaultValue: 'ממתינים לאישור' })}</Text>
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
                    style={[styles.col, { width: COL_W }, over && styles.colOver]}
                    onLayout={(e) => { colX.current[m.key] = { x: e.nativeEvent.layout.x, width: e.nativeEvent.layout.width } }}
                  >
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
                            onDelete={deleteLead}
                            onMove={(lead) => setMovePicker({ lead })}
                            sources={leadSources}
                            statuses={leadStatuses}
                            dragging={dragLead?.id === l.id}
                          />
                        </GestureDetector>
                      )) : <Text style={styles.colEmpty}>{i18n.t('leads:column.empty', { defaultValue: 'אין לידים בעמודה זו' })}</Text>}
                    </View>
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
    </Screen>
  )
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: 20, paddingBottom: 40, gap: 18 },
  error: { color: colors.danger, fontSize: 13 },
  group: { gap: 8 },
  groupHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
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
  col: { gap: 10, borderRadius: 16, borderWidth: 1, borderColor: 'transparent', padding: 4 },
  colOver: { borderColor: colors.brand, backgroundColor: 'rgba(201,123,94,0.06)' },
  ghost: { position: 'absolute', top: 0, left: 0, zIndex: 999, opacity: 0.96, shadowColor: '#2A2520', shadowOpacity: 0.2, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 12 },
  colHead: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 2 },
  colDot: { width: 10, height: 10, borderRadius: 5 },
  colTitle: { fontSize: 14, fontWeight: '600', color: colors.text, flex: 1 },
  colCount: { fontSize: 13, fontWeight: '600', color: colors.textSub, backgroundColor: colors.cardFlat, minWidth: 22, textAlign: 'center', borderRadius: 999, paddingVertical: 1, paddingHorizontal: 7, overflow: 'hidden' },
  colBody: { gap: 10 },
  colEmpty: { fontSize: 12, color: colors.textFaint, textAlign: 'center', paddingVertical: 24 },

  opt: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 14, paddingHorizontal: 4, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider },
  optDot: { width: 10, height: 10, borderRadius: 5 },
  optText: { fontSize: 15, color: colors.text },
})
