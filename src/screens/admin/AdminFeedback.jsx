import { useState, useMemo } from 'react'
import { Bug, Lightbulb, Heart, MessageCircle } from 'lucide-react'
import { useAdminQuery, callAdmin } from '../../hooks/useAdmin'
import { useT } from '../../i18n/useT'
import { Box, Txt, Btn } from '../../components/ui'

const TYPE_META = {
  bug:    { icon: Bug },
  idea:   { icon: Lightbulb },
  praise: { icon: Heart },
  other:  { icon: MessageCircle },
}
const STATUS_KEYS = ['new', 'in_progress', 'done']
const TYPE_FILTER_KEYS = ['all', ...Object.keys(TYPE_META)]
const STATUS_FILTER_KEYS = ['all', ...STATUS_KEYS]

function fmtDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

export default function AdminFeedback() {
  const { t } = useT('admin')
  const { data, loading, error } = useAdminQuery('feedback_list')
  const [statusOverride, setStatusOverride] = useState({}) // id → optimistic status
  const [typeF, setTypeF] = useState('all')
  const [statusF, setStatusF] = useState('all')

  // Derive the list from the fetch + any optimistic status edits — no
  // effect-syncing of fetched data into state (avoids cascading renders).
  const items = useMemo(
    () => (data?.items || []).map((it) => ({ ...it, status: statusOverride[it.id] ?? it.status })),
    [data, statusOverride],
  )

  const changeStatus = async (id, status) => {
    const prev = statusOverride[id]
    setStatusOverride((o) => ({ ...o, [id]: status })) // optimistic
    try {
      await callAdmin('feedback_update_status', { id, status })
    } catch {
      setStatusOverride((o) => ({ ...o, [id]: prev })) // roll back (undefined → original)
    }
  }

  const filtered = useMemo(() => items.filter((it) => {
    if (typeF !== 'all' && (it.type || 'other') !== typeF) return false
    if (statusF !== 'all' && (it.status || 'new') !== statusF) return false
    return true
  }), [items, typeF, statusF])

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
          </Box>

          <Box className="admin-fb-list">
            {filtered.length === 0 && <Box className="admin-state">{t('feedback.empty')}</Box>}
            {filtered.map((it) => {
              const meta = TYPE_META[it.type]
              const Icon = meta?.icon
              return (
                <Box className="admin-card admin-fb-card" key={it.id}>
                  <Box className="admin-fb-top">
                    <Txt className="admin-fb-from" dir="ltr">{it.email || t('feedback.unknownUser')}</Txt>
                    <Txt className="admin-fb-date">{fmtDate(it.created_at)}</Txt>
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
                          onClick={() => changeStatus(it.id, k)}
                        >
                          {t(`feedback.statuses.${k}`)}
                        </Btn>
                      ))}
                    </Box>
                  </Box>
                  <Txt as="p" className="admin-fb-msg">{it.message}</Txt>
                </Box>
              )
            })}
          </Box>
        </>
      )}
    </>
  )
}
