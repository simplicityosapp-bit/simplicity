import { useState, useMemo } from 'react'
import { Bug, Lightbulb, Heart, MessageCircle, Search } from 'lucide-react'
import { useAdminQuery, callAdmin } from '../../hooks/useAdmin'
import { useT } from '../../i18n/useT'
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
function FeedbackCard({ it, t, onPatch }) {
  const [title, setTitle] = useState(it.title || '')
  const [notes, setNotes] = useState(it.notes || '')
  const meta = TYPE_META[it.type]
  const Icon = meta?.icon

  const saveText = (field, value, original) => {
    if ((value || '') === (original || '')) return // unchanged — no write
    onPatch(it.id, field, value)
  }

  return (
    <Box className="admin-card admin-fb-card">
      <Box className="admin-fb-top">
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
  const [typeF, setTypeF] = useState('all')
  const [statusF, setStatusF] = useState('all')
  const [classF, setClassF] = useState('all')
  const [q, setQ] = useState('')

  // Derive the list from the fetch + any optimistic edits — no effect-syncing
  // of fetched data into state (avoids cascading renders).
  const items = useMemo(
    () => (data?.items || []).map((it) => ({ ...it, ...(edits[it.id] || {}) })),
    [data, edits],
  )

  /* Patch one field via the admin edge, optimistic with per-row rollback. */
  const patchField = async (id, field, value) => {
    const prev = edits[id]
    setEdits((e) => ({ ...e, [id]: { ...(e[id] || {}), [field]: value } }))
    try {
      await callAdmin('feedback_update', { id, [field]: value })
    } catch {
      setEdits((e) => ({ ...e, [id]: prev })) // roll back this row's edits (undefined → back to fetched)
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

          <Box className="admin-fb-list">
            {filtered.length === 0 && <Box className="admin-state">{t('feedback.empty')}</Box>}
            {filtered.map((it) => (
              <FeedbackCard key={it.id} it={it} t={t} onPatch={patchField} />
            ))}
          </Box>
        </>
      )}
    </>
  )
}
