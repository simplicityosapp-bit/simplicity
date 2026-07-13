import { useState, useMemo } from 'react'
import { Bug, Lightbulb, Heart, MessageCircle, Search, Trash2 } from 'lucide-react'
import { useAdminQuery, callAdmin } from '../../hooks/useAdmin'
import { useT } from '../../i18n/useT'
import { showToast } from '../../lib/toast'
import ConfirmModal from '../../modals/ConfirmModal'
import { Box, Txt, Btn, Input, Textarea } from '../../components/ui'

const TYPE_META = {
  bug:    { icon: Bug },
  idea:   { icon: Lightbulb },
  praise: { icon: Heart },
  other:  { icon: MessageCircle },
}
const STATUS_KEYS = ['new', 'in_progress', 'waiting_decision', 'done', 'rejected']
const CLASSIFICATION_KEYS = ['bug', 'dev', 'unclear']
const SURFACE_KEYS = ['technical', 'design', 'both']
const PLATFORM_KEYS = ['mobile', 'desktop', 'both', 'unknown']

const TYPE_FILTER_KEYS = ['all', ...Object.keys(TYPE_META)]
const STATUS_FILTER_KEYS = ['all', ...STATUS_KEYS]
const CLASS_FILTER_KEYS = ['all', ...CLASSIFICATION_KEYS]

function fmtDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

/* One triage card. Holds local text state for title/notes (saved on blur) so
   typing never round-trips; selects + status buttons patch immediately. */
function FeedbackCard({ it, t, onPatch, checked, onToggle, onDelete }) {
  const [title, setTitle] = useState(it.title || '')
  const [notes, setNotes] = useState(it.notes || '')
  const meta = TYPE_META[it.type]
  const Icon = meta?.icon

  const saveText = (field, value, original) => {
    if ((value || '') === (original || '')) return // unchanged — no write
    onPatch(it.id, field, value)
  }

  return (
    <Box className={`admin-card admin-fb-card${checked ? ' sel' : ''}`}>
      <Box className="admin-fb-top">
        <input
          type="checkbox"
          className="admin-fb-check"
          checked={checked}
          onChange={() => onToggle(it.id)}
          aria-label={t('feedback.selectAria')}
        />
        <Txt className="admin-fb-from" dir="ltr">{it.email || t('feedback.unknownUser')}</Txt>
        <Txt className="admin-fb-date">{fmtDate(it.created_at)}</Txt>
        {it.source && it.source !== 'app' && (
          <Txt className="admin-chip admin-fb-source">{t(`feedback.sources.${it.source}`)}</Txt>
        )}
        {meta && (
          <Txt className={`admin-chip type-${it.type}`}>
            {Icon && <Icon size={12} strokeWidth={1.9} aria-hidden="true" />}{t(`feedback.types.${it.type}`)}
          </Txt>
        )}
        <Box className="admin-status-row" role="group" aria-label={t('feedback.statusGroupAria')}>
          {STATUS_KEYS.map((k) => (
            <Btn
              key={k}
              className={(it.status || 'new') === k ? 'on' : ''}
              onClick={() => onPatch(it.id, 'status', k)}
            >
              {t(`feedback.statuses.${k}`)}
            </Btn>
          ))}
        </Box>
        <Btn type="button" className="admin-fb-del" onClick={() => onDelete([it.id])} aria-label={t('feedback.deleteOneAria')}>
          <Trash2 size={15} strokeWidth={1.8} aria-hidden="true" />
        </Btn>
      </Box>

      <Input
        className="admin-fb-title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={() => saveText('title', title.trim(), it.title)}
        placeholder={t('feedback.titlePlaceholder')}
      />

      <Txt as="p" className="admin-fb-msg">{it.message}</Txt>

      <Box className="admin-fb-triage">
        <label className="admin-fb-tfield">
          <Txt className="admin-fb-tlabel">{t('feedback.classificationLabel')}</Txt>
          <select className="admin-fb-select" value={it.classification || ''} onChange={(e) => onPatch(it.id, 'classification', e.target.value)}>
            <option value="">{t('feedback.unset')}</option>
            {CLASSIFICATION_KEYS.map((k) => <option key={k} value={k}>{t(`feedback.classifications.${k}`)}</option>)}
          </select>
        </label>
        <label className="admin-fb-tfield">
          <Txt className="admin-fb-tlabel">{t('feedback.surfaceLabel')}</Txt>
          <select className="admin-fb-select" value={it.surface || ''} onChange={(e) => onPatch(it.id, 'surface', e.target.value)}>
            <option value="">{t('feedback.unset')}</option>
            {SURFACE_KEYS.map((k) => <option key={k} value={k}>{t(`feedback.surfaces.${k}`)}</option>)}
          </select>
        </label>
        <label className="admin-fb-tfield">
          <Txt className="admin-fb-tlabel">{t('feedback.platformLabel')}</Txt>
          <select className="admin-fb-select" value={it.platform || ''} onChange={(e) => onPatch(it.id, 'platform', e.target.value)}>
            <option value="">{t('feedback.unset')}</option>
            {PLATFORM_KEYS.map((k) => <option key={k} value={k}>{t(`feedback.platforms.${k}`)}</option>)}
          </select>
        </label>
      </Box>

      <Textarea
        className="admin-fb-notes"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        onBlur={() => saveText('notes', notes, it.notes)}
        placeholder={t('feedback.notesPlaceholder')}
        rows={2}
      />
    </Box>
  )
}

export default function AdminFeedback() {
  const { t } = useT('admin')
  const { data, loading, error } = useAdminQuery('feedback_list')
  const [edits, setEdits] = useState({}) // id → { field: value } optimistic overrides
  const [removed, setRemoved] = useState(() => new Set()) // ids deleted this session (optimistic)
  const [selected, setSelected] = useState(() => new Set()) // ids checked for bulk actions
  const [confirm, setConfirm] = useState(null) // { ids } pending delete confirmation
  const [typeF, setTypeF] = useState('all')
  const [statusF, setStatusF] = useState('all')
  const [classF, setClassF] = useState('all')
  const [q, setQ] = useState('')

  // Derive the list from the fetch + optimistic edits, minus deleted rows.
  const items = useMemo(
    () => (data?.items || []).filter((it) => !removed.has(it.id)).map((it) => ({ ...it, ...(edits[it.id] || {}) })),
    [data, edits, removed],
  )

  /* Patch one field via the admin edge, optimistic with per-row rollback. */
  const patchField = async (id, field, value) => {
    const prev = edits[id]
    setEdits((e) => ({ ...e, [id]: { ...(e[id] || {}), [field]: value } }))
    try {
      await callAdmin('feedback_update', { id, [field]: value })
    } catch {
      setEdits((e) => ({ ...e, [id]: prev })) // roll back this row's edits
    }
  }

  const needle = q.trim().toLowerCase()
  const filtered = useMemo(() => items.filter((it) => {
    if (typeF !== 'all' && (it.type || 'other') !== typeF) return false
    if (statusF !== 'all' && (it.status || 'new') !== statusF) return false
    if (classF !== 'all' && (it.classification || '') !== classF) return false
    if (needle) {
      const hay = `${it.message || ''} ${it.title || ''} ${it.notes || ''} ${it.email || ''}`.toLowerCase()
      if (!hay.includes(needle)) return false
    }
    return true
  }), [items, typeF, statusF, classF, needle])

  const toggleOne = (id) => setSelected((s) => {
    const next = new Set(s)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })

  // "Select all" acts on the currently-filtered rows. If all are already
  // selected it clears them, otherwise it selects them all.
  const filteredIds = filtered.map((it) => it.id)
  const allSelected = filteredIds.length > 0 && filteredIds.every((id) => selected.has(id))
  const toggleAll = () => setSelected((s) => {
    const next = new Set(s)
    if (allSelected) filteredIds.forEach((id) => next.delete(id))
    else filteredIds.forEach((id) => next.add(id))
    return next
  })

  const selectedCount = filteredIds.filter((id) => selected.has(id)).length

  const doDelete = async (ids) => {
    try {
      await callAdmin('feedback_delete', { ids })
      setRemoved((r) => { const next = new Set(r); ids.forEach((id) => next.add(id)); return next })
      setSelected((s) => { const next = new Set(s); ids.forEach((id) => next.delete(id)); return next })
      showToast(t('feedback.deletedToast', { count: ids.length }))
    } catch {
      showToast(t('feedback.deleteError'), 'error')
    }
  }

  return (
    <>
      <Box as="header" className="admin-head">
        <Txt as="h1">{t('feedback.title')}</Txt>
        <Txt as="p">{t('feedback.subtitle')}</Txt>
      </Box>

      {loading && <Box className="admin-state">{t('state.loading')}</Box>}
      {error && <Box className="admin-state err">{t('state.loadError')}</Box>}

      {data && (
        <>
          <Box className="admin-fb-search">
            <Search size={15} strokeWidth={1.9} aria-hidden="true" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('feedback.searchPlaceholder')} />
          </Box>

          <Box className="admin-fb-filters">
            <Box className="admin-range">
              {TYPE_FILTER_KEYS.map((k) => (
                <Btn key={k} className={typeF === k ? 'on' : ''} onClick={() => setTypeF(k)}>{k === 'all' ? t('feedback.filterAll') : t(`feedback.types.${k}`)}</Btn>
              ))}
            </Box>
            <Box className="admin-range">
              {STATUS_FILTER_KEYS.map((k) => (
                <Btn key={k} className={statusF === k ? 'on' : ''} onClick={() => setStatusF(k)}>{k === 'all' ? t('feedback.filterAll') : t(`feedback.statuses.${k}`)}</Btn>
              ))}
            </Box>
            <Box className="admin-range">
              {CLASS_FILTER_KEYS.map((k) => (
                <Btn key={k} className={classF === k ? 'on' : ''} onClick={() => setClassF(k)}>{k === 'all' ? t('feedback.filterAll') : t(`feedback.classifications.${k}`)}</Btn>
              ))}
            </Box>
          </Box>

          {filtered.length > 0 && (
            <Box className="admin-fb-bulkbar">
              <label className="admin-fb-selall">
                <input type="checkbox" className="admin-fb-check" checked={allSelected} onChange={toggleAll} />
                <Txt>{t('feedback.selectAll')}</Txt>
              </label>
              {selectedCount > 0 && (
                <>
                  <Txt className="admin-fb-selcount">{t('feedback.selectedCount', { count: selectedCount })}</Txt>
                  <Btn
                    type="button"
                    className="admin-fb-bulkdel"
                    onClick={() => setConfirm({ ids: filteredIds.filter((id) => selected.has(id)) })}
                  >
                    <Trash2 size={14} strokeWidth={1.9} aria-hidden="true" /> {t('feedback.deleteSelected', { count: selectedCount })}
                  </Btn>
                </>
              )}
            </Box>
          )}

          <Box className="admin-fb-list">
            {filtered.length === 0 && <Box className="admin-state">{t('feedback.empty')}</Box>}
            {filtered.map((it) => (
              <FeedbackCard
                key={it.id}
                it={it}
                t={t}
                onPatch={patchField}
                checked={selected.has(it.id)}
                onToggle={toggleOne}
                onDelete={(ids) => setConfirm({ ids })}
              />
            ))}
          </Box>
        </>
      )}

      <ConfirmModal
        open={!!confirm}
        onClose={() => setConfirm(null)}
        title={t('feedback.deleteTitle')}
        message={t('feedback.deleteConfirm', { count: confirm?.ids.length || 0 })}
        confirmLabel={t('feedback.deleteConfirmBtn')}
        danger
        onConfirm={() => confirm && doDelete(confirm.ids)}
      />
    </>
  )
}
