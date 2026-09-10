import { useState, useMemo, useCallback, memo } from 'react'
import { View, Text, TextInput, ScrollView } from 'react-native'
import { Pressable } from '../../components/Pressable'
import { Bug, Lightbulb, Heart, MessageCircle, Search, Trash2, Check } from 'lucide-react-native'
import i18n from '../../lib/i18n'
import Card from '../../components/Card'
import Sheet from '../../components/Sheet'
import { useAdminQuery, callAdmin } from '../../hooks/useAdmin'
import { colors } from '../../theme/theme'
import { themed, themedMap } from '../../theme/themed'
import { AdminState } from './AdminBits'

const T = (k, o) => i18n.t(`admin:${k}`, o)

const TYPE_ICON = { bug: Bug, idea: Lightbulb, praise: Heart, other: MessageCircle }
const STATUS_KEYS = ['new', 'in_progress', 'waiting_decision', 'done', 'rejected']
const CLASSIFICATION_KEYS = ['bug', 'dev', 'unclear']
const SURFACE_KEYS = ['technical', 'design', 'both']

const TYPE_FILTER_KEYS = ['all', ...Object.keys(TYPE_ICON)]
const STATUS_FILTER_KEYS = ['all', ...STATUS_KEYS]
const CLASS_FILTER_KEYS = ['all', ...CLASSIFICATION_KEYS]

const STATUS_TONE = themedMap((c) => ({
  new: c.brand,
  in_progress: c.amberWarn,
  waiting_decision: c.moonDeep,
  done: c.positive,
  rejected: c.textFaint,
}))

function fmtDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

/* A row of choices rendered as chips. A phone has no <select>, and the
   vocabularies here are short enough (3-5) that chips are fewer taps than
   opening a picker — which is the point on a triage screen. */
function ChipRow({ label, keys, value, onPick, tKey }) {
  return (
    <View style={styles.chipRow}>
      {label ? <Text style={styles.chipRowLabel}>{label}</Text> : null}
      <View style={styles.chips}>
        {keys.map((k) => (
          <Pressable
            key={k}
            style={[styles.chip, value === k && styles.chipOn]}
            onPress={() => onPick(k)}
            accessibilityRole="button"
            accessibilityState={{ selected: value === k }}
          >
            <Text style={[styles.chipText, value === k && styles.chipTextOn]}>
              {k === 'all' ? T('feedback.filterAll') : T(`${tKey}.${k}`)}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  )
}

/* One triage card. Title and notes are local until blur so typing never
   round-trips; the chips patch immediately.

   memo for the same reason web memoises it: the board is unpaginated, and
   without this a keystroke in the search box re-renders every card. */
const FeedbackCard = memo(function FeedbackCard({ it, onPatch, selected, onToggleSelect, expanded, onToggleExpand }) {
  const [title, setTitle] = useState(it.title || '')
  const [notes, setNotes] = useState(it.notes || '')
  const Icon = TYPE_ICON[it.type] || MessageCircle

  const saveText = (field, value, original) => {
    if ((value || '') === (original || '')) return // unchanged — no write
    onPatch(it.id, field, value)
  }

  return (
    <Card style={[styles.fbCard, selected && styles.fbCardSel]}>
      <Pressable style={styles.fbTop} onPress={() => onToggleExpand(it.id)}>
        <Pressable
          style={[styles.check, selected && styles.checkOn]}
          onPress={() => onToggleSelect(it.id)}
          hitSlop={8}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: selected }}
          accessibilityLabel={T('feedback.selectAria')}
        >
          {selected ? <Check size={12} strokeWidth={3} color={colors.onBrand} /> : null}
        </Pressable>
        <Icon size={14} strokeWidth={1.8} color={colors.textSub} />
        <Text style={styles.fbFrom} numberOfLines={1}>{it.email || T('feedback.unknownUser')}</Text>
        <Text style={styles.fbDate}>{fmtDate(it.created_at)}</Text>
      </Pressable>

      <Text style={styles.fbMsg} numberOfLines={expanded ? undefined : 3}>{it.message}</Text>

      <View style={styles.statusRow}>
        {STATUS_KEYS.map((k) => (
          <Pressable
            key={k}
            style={[styles.statusBtn, it.status === k && { backgroundColor: STATUS_TONE[k] }]}
            onPress={() => onPatch(it.id, 'status', k)}
            accessibilityRole="button"
            accessibilityState={{ selected: it.status === k }}
          >
            <Text style={[styles.statusText, it.status === k && styles.statusTextOn]} numberOfLines={1}>
              {T(`feedback.statuses.${k}`)}
            </Text>
          </Pressable>
        ))}
      </View>

      {expanded ? (
        <View style={styles.fbDetail}>
          <ChipRow label={T('feedback.classificationLabel')} keys={CLASSIFICATION_KEYS} value={it.classification} onPick={(k) => onPatch(it.id, 'classification', k)} tKey="feedback.classifications" />
          <ChipRow label={T('feedback.surfaceLabel')} keys={SURFACE_KEYS} value={it.surface} onPick={(k) => onPatch(it.id, 'surface', k)} tKey="feedback.surfaces" />

          <TextInput
            style={styles.input}
            value={title}
            onChangeText={setTitle}
            onBlur={() => saveText('title', title, it.title)}
            placeholder={T('feedback.titlePlaceholder')}
            placeholderTextColor={colors.textFaint}
          />
          <TextInput
            style={[styles.input, styles.textarea]}
            value={notes}
            onChangeText={setNotes}
            onBlur={() => saveText('notes', notes, it.notes)}
            placeholder={T('feedback.notesPlaceholder')}
            placeholderTextColor={colors.textFaint}
            multiline
          />

          <View style={styles.metaRow}>
            {it.platform ? <Text style={styles.meta}>{T(`feedback.platforms.${it.platform}`)}</Text> : null}
            {it.source ? <Text style={styles.meta}>{T(`feedback.sources.${it.source}`, { defaultValue: it.source })}</Text> : null}
          </View>
        </View>
      ) : null}
    </Card>
  )
})

export default function AdminFeedback() {
  const { data, loading, error, refetch } = useAdminQuery('feedback_list')

  const [typeF, setTypeF] = useState('all')
  const [statusF, setStatusF] = useState('all')
  const [classF, setClassF] = useState('all')
  const [q, setQ] = useState('')
  const [selected, setSelected] = useState(() => new Set())
  const [expanded, setExpanded] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [busy, setBusy] = useState(false)

  /* Optimistic overlay: a triage tap has to feel instant on a phone, and
     the alternative — refetching the whole board per chip — is a second of
     dead screen each time. Keyed by id so a failed write can be rolled
     back without touching its neighbours. */
  const [patches, setPatches] = useState({})
  const [removed, setRemoved] = useState(() => new Set())

  const items = useMemo(() => (
    (data?.items || [])
      .filter((it) => !removed.has(it.id))
      .map((it) => (patches[it.id] ? { ...it, ...patches[it.id] } : it))
  ), [data, patches, removed])

  const onPatch = useCallback(async (id, field, value) => {
    const prev = patches[id]
    setPatches((p) => ({ ...p, [id]: { ...p[id], [field]: value } }))
    try {
      await callAdmin('feedback_update', { id, [field]: value })
    } catch {
      // Put the row back the way it was — a chip that silently did nothing
      // is worse than one that visibly springs back.
      setPatches((p) => ({ ...p, [id]: prev }))
    }
  }, [patches])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return items.filter((it) => {
      if (typeF !== 'all' && it.type !== typeF) return false
      if (statusF !== 'all' && (it.status || 'new') !== statusF) return false
      if (classF !== 'all' && it.classification !== classF) return false
      if (needle) {
        const hay = `${it.message || ''} ${it.email || ''} ${it.title || ''} ${it.notes || ''}`.toLowerCase()
        if (!hay.includes(needle)) return false
      }
      return true
    })
  }, [items, typeF, statusF, classF, q])

  const selectedIds = filtered.map((it) => it.id).filter((id) => selected.has(id))

  const toggleSelect = useCallback((id) => {
    setSelected((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })
  }, [])
  const toggleExpand = useCallback((id) => setExpanded((cur) => (cur === id ? null : id)), [])

  const doDelete = async () => {
    setBusy(true)
    const ids = selectedIds
    try {
      await callAdmin('feedback_delete', { ids })
      setRemoved((prev) => new Set([...prev, ...ids]))
      setSelected(new Set())
      setConfirmDelete(false)
    } catch {
      setConfirmDelete(false)
      await refetch() // resync — we do not know which of the batch landed
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <View style={styles.searchWrap}>
        <Search size={15} strokeWidth={1.8} color={colors.textFaint} />
        <TextInput
          style={styles.search}
          value={q}
          onChangeText={setQ}
          placeholder={T('feedback.searchPlaceholder')}
          placeholderTextColor={colors.textFaint}
        />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
        <ChipRow keys={TYPE_FILTER_KEYS} value={typeF} onPick={setTypeF} tKey="feedback.types" />
      </ScrollView>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
        <ChipRow keys={STATUS_FILTER_KEYS} value={statusF} onPick={setStatusF} tKey="feedback.statuses" />
      </ScrollView>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
        <ChipRow keys={CLASS_FILTER_KEYS} value={classF} onPick={setClassF} tKey="feedback.classifications" />
      </ScrollView>

      {selectedIds.length > 0 ? (
        <Pressable style={styles.bulk} onPress={() => setConfirmDelete(true)}>
          <Trash2 size={15} strokeWidth={1.8} color={colors.danger} />
          <Text style={styles.bulkText}>
            {T('feedback.deleteSelected', { count: selectedIds.length })}
          </Text>
        </Pressable>
      ) : null}

      <AdminState loading={loading} error={error} hasData={!!data} />

      {data && filtered.length === 0 ? (
        <Text style={styles.empty}>{T('feedback.empty')}</Text>
      ) : null}

      <View style={styles.list}>
        {filtered.map((it) => (
          <FeedbackCard
            key={it.id}
            it={it}
            onPatch={onPatch}
            selected={selected.has(it.id)}
            onToggleSelect={toggleSelect}
            expanded={expanded === it.id}
            onToggleExpand={toggleExpand}
          />
        ))}
      </View>

      <Sheet open={confirmDelete} onClose={() => setConfirmDelete(false)} title={T('feedback.deleteTitle')}>
        <Text style={styles.confirmText}>
          {T('feedback.deleteConfirm', { count: selectedIds.length })}
        </Text>
        <View style={styles.confirmRow}>
          <Pressable style={[styles.confirmBtn, styles.confirmCancel]} onPress={() => setConfirmDelete(false)} disabled={busy}>
            <Text style={styles.confirmCancelText}>{i18n.t('common:cancel')}</Text>
          </Pressable>
          <Pressable style={[styles.confirmBtn, styles.confirmDanger]} onPress={doDelete} disabled={busy}>
            <Text style={styles.confirmDangerText}>
              {busy ? T('feedback.deleteConfirmBtn') + '…' : T('feedback.deleteConfirmBtn')}
            </Text>
          </Pressable>
        </View>
      </Sheet>
    </>
  )
}

const styles = themed((c, t) => ({
  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12,
    borderRadius: 12, borderWidth: 1, borderColor: c.border, backgroundColor: c.inputBg, marginBottom: 8,
  },
  search: { flex: 1, paddingVertical: 10, fontSize: 14, color: c.text },

  filterScroll: { paddingBottom: 6 },
  chipRow: { gap: 4 },
  chipRowLabel: { ...t.micro, color: c.textFaint },
  chips: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  chip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: c.fill },
  chipOn: { backgroundColor: c.brand },
  chipText: { fontSize: 12, color: c.textSub, fontWeight: '500' },
  chipTextOn: { color: c.onBrand },

  bulk: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 10, borderRadius: 12, backgroundColor: 'rgba(181,99,78,0.12)', marginTop: 4,
  },
  bulkText: { ...t.caption, color: c.danger, fontWeight: '600' },

  empty: { ...t.caption, color: c.textFaint, textAlign: 'center', paddingVertical: 24 },
  list: { gap: 10, marginTop: 4 },

  fbCard: { gap: 8 },
  fbCardSel: { borderColor: c.brand, borderWidth: 1 },
  fbTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  check: {
    width: 18, height: 18, borderRadius: 5, borderWidth: 1, borderColor: c.border,
    alignItems: 'center', justifyContent: 'center',
  },
  checkOn: { backgroundColor: c.brand, borderColor: c.brand },
  fbFrom: { ...t.micro, color: c.textSub, flex: 1, writingDirection: 'ltr' },
  fbDate: { ...t.micro, color: c.textFaint },
  fbMsg: { ...t.body, fontSize: 14, lineHeight: 20 },

  statusRow: { flexDirection: 'row', gap: 4, flexWrap: 'wrap' },
  statusBtn: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, backgroundColor: c.fill },
  statusText: { fontSize: 11, color: c.textSub, fontWeight: '500' },
  statusTextOn: { color: c.onBrand, fontWeight: '700' },

  fbDetail: { gap: 8, borderTopWidth: 1, borderTopColor: c.divider, paddingTop: 8 },
  input: {
    borderWidth: 1, borderColor: c.border, borderRadius: 10, paddingHorizontal: 10,
    paddingVertical: 8, fontSize: 13, color: c.text, backgroundColor: c.inputBg,
  },
  textarea: { minHeight: 64, textAlignVertical: 'top' },
  metaRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  meta: { ...t.micro, color: c.textFaint },

  confirmText: { ...t.body, fontSize: 14, marginBottom: 14 },
  confirmRow: { flexDirection: 'row', gap: 10 },
  confirmBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center' },
  confirmCancel: { backgroundColor: c.fill },
  confirmCancelText: { ...t.caption, color: c.textSub, fontWeight: '600' },
  confirmDanger: { backgroundColor: c.dangerFill },
  confirmDangerText: { ...t.caption, color: '#FFFFFF', fontWeight: '600' },
}))
