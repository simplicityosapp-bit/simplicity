import { CheckCircle2, HelpCircle } from 'lucide-react'
import { columnsForStep, fieldsForStep, remapColumn, FIELD_LABEL, CSV_FIELDS } from '../../lib/csvImport'
import { useT } from '../../i18n/useT'

/* ════════════════════════════════════════════════════════════════
   CSV MAPPING EDITOR — shared per-step column→field confirmation.
   ════════════════════════════════════════════════════════════════
   Mounted inside Step 2 (leftover / non-onboarding fields + unmapped
   columns), Step 3 (the `project` column) and Step 4 (name / sessions
   / price). Each instance shows only the columns relevant to its step
   (columnsForStep) and offers only that step's fields in the dropdown
   (fieldsForStep). Editing writes back through remapColumn → the
   entities re-derive and every other screen stays in sync.
   Renders null when there's no CSV or no relevant column, so callers can
   mount it unconditionally.
   Props: `parsed` (the parsed_data object) + `onChange(nextParsed)`.
   Used by onboarding steps (parsed=ob.state.parsed_data,
   onChange=ob.setParsedData) AND the in-app import modal (local state).
   ════════════════════════════════════════════════════════════════ */

export default function CsvMappingEditor({ parsed, onChange: onParsedChange, stepKey, title }) {
  const { t } = useT('onboarding')
  if (!parsed || parsed.kind !== 'csv' || !Array.isArray(parsed.rows) || parsed.rows.length === 0) return null

  const columns = columnsForStep(parsed, stepKey)
  if (columns.length === 0) return null
  /* Step 2 + the in-app 'all' view are catch-alls: they must let an
     UNrecognised column be assigned to ANY field (incl.
     name/project/sessions/price) — else a missed "name" column would be
     unmappable and 0 clients import. Steps 3/4 stay scoped. */
  const allowed = (stepKey === 'data_import' || stepKey === 'all')
    ? CSV_FIELDS.map((f) => f.key)
    : fieldsForStep(stepKey)

  const onChange = (colIdx, field) => {
    onParsedChange(remapColumn(parsed, colIdx, field || null))
  }

  const detected = columns.filter((c) => c.field).length
  const unmapped = columns.length - detected

  return (
    <div className="ob-field ob-map">
      <p className="ob-label">
        {title || t('csvMap.title')}
      </p>
      <p className="ob-map-sub">
        {detected > 0 && t('csvMap.detected', { count: detected })}
        {unmapped > 0
          ? t('csvMap.someUnmapped', { count: unmapped })
          : t('csvMap.allMapped')}
      </p>

      <div className="ob-map-rows">
        {columns.map(({ colIdx, header, field, sample }) => (
          <div className="ob-map-row" key={colIdx}>
            <div className="ob-map-col">
              <span className="ob-map-col-name">
                {field
                  ? <CheckCircle2 size={13} strokeWidth={2} aria-hidden="true" />
                  : <HelpCircle size={13} strokeWidth={2} aria-hidden="true" />}
                <bdi>{header || `עמודה ${colIdx + 1}`}</bdi>
              </span>
              {sample && <span className="ob-map-sample" title={sample}>לדוגמה: <bdi>{sample}</bdi></span>}
            </div>
            <select
              className="ob-select ob-map-select"
              value={field || ''}
              onChange={(e) => onChange(colIdx, e.target.value)}
              aria-label={`מיפוי לעמודה ${header}`}
            >
              <option value="">— התעלם</option>
              {allowed.map((f) => (
                <option key={f} value={f}>{FIELD_LABEL[f]}</option>
              ))}
            </select>
          </div>
        ))}
      </div>
    </div>
  )
}
