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
        <select className="m-select" value={filter.project || ''} onChange={(e) => onChange?.('project', e.target.value)}>
          <option value="">{t('filter.all')}</option>
          <option value="__none__">{t('filter.unassigned')}</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </Box>

      {groupOpts.length > 0 && (
        <Box className="m-field">
          <Box as="label" className="m-label">{t('filter.group')}</Box>
          <select className="m-select" value={filter.group || ''} onChange={(e) => onChange?.('group', e.target.value)}>
            <option value="">{t('filter.all')}</option>
            <option value="__none__">{t('filter.unassigned')}</option>
            {groupOpts.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </Box>
      )}

      {statuses.length > 0 && (
        <Box className="m-field">
          <Box as="label" className="m-label">{t('filter.status')}</Box>
          <select className="m-select" value={filter.status || ''} onChange={(e) => onChange?.('status', e.target.value)}>
            <option value="">{t('filter.all')}</option>
            {statuses.map((s) => (
              <option key={s.id} value={s.id}>{s.icon ? `${s.icon} ` : ''}{s.display_name}</option>
            ))}
          </select>
        </Box>
      )}

      <Box className="m-field">
        <Box as="label" className="m-label">{t('filter.source')}</Box>
        <select className="m-select" value={filter.source || ''} onChange={(e) => onChange?.('source', e.target.value)}>
          <option value="">{t('filter.all')}</option>
          <option value="__none__">{t('filter.unassigned')}</option>
          {sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
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
