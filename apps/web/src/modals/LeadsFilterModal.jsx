import SelectMenu from '../components/SelectMenu'
import Modal from './Modal'
import { useT } from '../i18n/useT'
import { Box, Txt, Btn } from '../components/ui'

/* "סינון לידים" — consolidates every leads-board filter into one sheet
   (replacing the old inline sub-status pills + sort button). Controlled:
   the parent persists the selection in prefs.leadsFilter and feeds it back
   through `filter`; each control reports via onChange(key, value). Special
   select values: '' = all, '__none__' = unassigned (no project/group/source). */
const PERIODS = ['all', 'month', 'last30', 'lastMonth']
const SORTS = ['', 'new', 'old']

export default function LeadsFilterModal({
  open, onClose, filter = {}, onChange, onClear,
  projects = [], groups = [], statuses = [], sources = [],
}) {
  const { t } = useT('leads')

  /* Groups are project-scoped: once a concrete project is picked, only its
     groups make sense; otherwise list them all. */
  const groupOpts = filter.project && filter.project !== '__none__'
    ? groups.filter((g) => g.project_id === filter.project && !g.deleted_at)
    : groups.filter((g) => !g.deleted_at)

  /* Every picker in the sheet gets the app's styled menu. The two special rows
     ("all" / "unassigned") stay exactly where they were — they are values, not
     placeholders, and the board reads '' and '__none__' from them. */
  const withSpecials = (rows) => [
    { value: '', label: t('filter.all') },
    { value: '__none__', label: t('filter.unassigned') },
    ...rows,
  ]
  const projectOptions = withSpecials(projects.map((p) => ({ value: p.id, label: p.name })))
  const groupOptions = withSpecials(groupOpts.map((g) => ({ value: g.id, label: g.name })))
  const sourceOptions = withSpecials(sources.map((s) => ({ value: s.id, label: s.name })))
  /* No "unassigned" row: a lead with no sub-status is not a meaningful filter
     here — the column already says that. Mirrors the old markup. */
  const statusOptions = [
    { value: '', label: t('filter.all') },
    ...statuses.map((s) => ({ value: s.id, label: `${s.icon ? `${s.icon} ` : ''}${s.display_name}` })),
  ]

  return (
    <Modal open={open} onClose={onClose} title={t('filter.title')}>
      <Txt as="p" className="m-hint">{t('filter.hint')}</Txt>

      <Box className="m-field">
        <Box as="label" className="m-label">{t('filter.period')}</Box>
        <Box className="lf-seg" role="group" aria-label={t('filter.period')}>
          {PERIODS.map((p) => (
            <Btn
              key={p}
              type="button"
              className={`lf-seg-btn${(filter.period || 'all') === p ? ' on' : ''}`}
              onClick={() => onChange?.('period', p)}
            >
              {t(`filter.period_${p}`)}
            </Btn>
          ))}
        </Box>
      </Box>

      <Box className="m-field">
        <Box as="label" className="m-label">{t('filter.project')}</Box>
        <SelectMenu value={filter.project || ''} onChange={(v) => onChange?.('project', v)} options={projectOptions} ariaLabel={t('filter.project')} />
      </Box>

      {groupOpts.length > 0 && (
        <Box className="m-field">
          <Box as="label" className="m-label">{t('filter.group')}</Box>
          <SelectMenu value={filter.group || ''} onChange={(v) => onChange?.('group', v)} options={groupOptions} ariaLabel={t('filter.group')} />
        </Box>
      )}

      {statuses.length > 0 && (
        <Box className="m-field">
          <Box as="label" className="m-label">{t('filter.status')}</Box>
          <SelectMenu value={filter.status || ''} onChange={(v) => onChange?.('status', v)} options={statusOptions} ariaLabel={t('filter.status')} />
        </Box>
      )}

      <Box className="m-field">
        <Box as="label" className="m-label">{t('filter.source')}</Box>
        <SelectMenu value={filter.source || ''} onChange={(v) => onChange?.('source', v)} options={sourceOptions} ariaLabel={t('filter.source')} />
      </Box>

      <Box className="m-field">
        <Box as="label" className="m-label">{t('filter.sort')}</Box>
        <Box className="lf-seg" role="group" aria-label={t('filter.sort')}>
          {SORTS.map((s) => (
            <Btn
              key={s || 'none'}
              type="button"
              className={`lf-seg-btn${(filter.sort || '') === s ? ' on' : ''}`}
              onClick={() => onChange?.('sort', s)}
            >
              {t(`filter.sort_${s || 'none'}`)}
            </Btn>
          ))}
        </Box>
      </Box>

      <Box className="m-actions">
        <Btn type="button" className="m-btn-cancel" onClick={onClear}>{t('filter.clear')}</Btn>
        <Btn type="button" className="m-btn-save" onClick={onClose}>{t('filter.close')}</Btn>
      </Box>
    </Modal>
  )
}
