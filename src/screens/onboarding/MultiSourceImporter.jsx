import { useMemo } from 'react'
import { CheckCircle2, AlertTriangle, FileSpreadsheet, X } from 'lucide-react'
import { repivotSource, flattenAllSources, sourcesMissingYear } from '../../lib/multiImport'
import { isr } from '../../lib/finance'
import './MultiSourceImporter.css'

/* ════════════════════════════════════════════════════════════════
   MULTI SOURCE IMPORTER — one editable card per file/sheet.
   ════════════════════════════════════════════════════════════════
   Renders every detected matrix source (a sheet within a file). Each
   card lets the user:
     - rename the resolved YEAR (auto from sheet name),
     - set each ROW's type (income / expense / skip),
     - drop the whole source.
   A merged footer previews the total transactions across all sources.

   Props:
     - sources:  array of pivot-source descriptors (from readManyFiles).
     - onChange(nextSources): writes back the edited source list.
   ════════════════════════════════════════════════════════════════ */

const THIS_YEAR = new Date().getFullYear()
const YEARS = [THIS_YEAR - 3, THIS_YEAR - 2, THIS_YEAR - 1, THIS_YEAR, THIS_YEAR + 1]
const HE_MONTHS_SHORT = { 1: 'ינו', 2: 'פבר', 3: 'מרץ', 4: 'אפר', 5: 'מאי', 6: 'יונ', 7: 'יול', 8: 'אוג', 9: 'ספט', 10: 'אוק', 11: 'נוב', 12: 'דצמ' }

export default function MultiSourceImporter({ sources, onChange }) {
  const live = (sources || []).filter((s) => !s.removed)

  const patchSource = (id, patch) => {
    onChange((sources || []).map((s) => (s.id === id ? repivotSource(s, patch) : s)))
  }
  const removeSource = (id) => {
    onChange((sources || []).map((s) => (s.id === id ? { ...s, removed: true } : s)))
  }

  const setRowType = (src, rowIdx, type) => {
    const rowTypes = { ...(src.config.rowTypes || {}) }
    if (type === 'skip') {
      const skipRows = Array.from(new Set([...(src.config.skipRows || []), rowIdx]))
      patchSource(src.id, { skipRows })
      return
    }
    /* un-skip + set type */
    const skipRows = (src.config.skipRows || []).filter((i) => i !== rowIdx)
    rowTypes[rowIdx] = type
    patchSource(src.id, { skipRows, rowTypes })
  }

  const setYear = (src, year) => patchSource(src.id, { year: year ? Number(year) : null })
  const setLabelKind = (src, labelKind) => patchSource(src.id, { labelKind })

  const merged = useMemo(() => flattenAllSources(live), [live])
  const missingYear = useMemo(() => sourcesMissingYear(live), [live])
  const incomeCount = merged.transactions.filter((t) => t.type === 'income').length
  const expenseCount = merged.transactions.filter((t) => t.type === 'expense').length
  const projCount = merged.projects.length
  const clientCount = merged.clients.length

  if (!live.length) return null

  return (
    <div className="msi">
      {live.map((src) => {
        const skip = new Set(src.config.skipRows || [])
        const rowTypes = src.config.rowTypes || {}
        const hasMonths = (src.config.periodCols || []).some((c) => c.month)
        const needsYear = hasMonths && !src.config.year
        const labelCol = src.config.labelCol
        return (
          <div className="msi-card" key={src.id}>
            <div className="msi-card-head">
              <span className="msi-card-ic"><FileSpreadsheet size={15} strokeWidth={1.7} aria-hidden="true" /></span>
              <div className="msi-card-id">
                <p className="msi-card-name">{src.fileName}</p>
                {src.sheetName && <p className="msi-card-sheet">גיליון: {src.sheetName}</p>}
              </div>
              <button type="button" className="msi-card-x" onClick={() => removeSource(src.id)} aria-label="הסר מקור">
                <X size={14} strokeWidth={2} aria-hidden="true" />
              </button>
            </div>

            {/* Year */}
            {hasMonths && (
              <div className="msi-field">
                <label className="msi-label">שנה{src.yearFromName ? ' (זוהתה מהגיליון)' : ''}</label>
                <select className="msi-select" value={src.config.year || ''} onChange={(e) => setYear(src, e.target.value)}>
                  <option value="">בחר/י שנה</option>
                  {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
            )}
            {needsYear && (
              <p className="msi-warn"><AlertTriangle size={12} strokeWidth={2} aria-hidden="true" /> יש לבחור שנה כדי שהחודשים יהפכו לתאריכים.</p>
            )}

            {/* What the row labels are — drives project/client creation. */}
            <div className="msi-field">
              <label className="msi-label">השורות הן{src.headers?.[labelCol] ? ` ("${src.headers[labelCol]}")` : ''}</label>
              <div className="msi-seg">
                <button type="button" className={`msi-seg-btn${(src.config.labelKind || 'category') === 'project' ? ' on' : ''}`} onClick={() => setLabelKind(src, 'project')}>פרויקטים</button>
                <button type="button" className={`msi-seg-btn${(src.config.labelKind || 'category') === 'client' ? ' on' : ''}`} onClick={() => setLabelKind(src, 'client')}>לקוחות</button>
                <button type="button" className={`msi-seg-btn${(src.config.labelKind || 'category') === 'category' ? ' on' : ''}`} onClick={() => setLabelKind(src, 'category')}>קטגוריות</button>
              </div>
              <p className="msi-hint">
                {(src.config.labelKind || 'category') === 'project' ? 'כל שורת הכנסה תיצור פרויקט, והתנועות יקושרו אליו.'
                  : (src.config.labelKind || 'category') === 'client' ? 'כל שורת הכנסה תיצור לקוח, והתנועות יקושרו אליו.'
                  : 'השורות הן קטגוריות — ייווצרו רק תנועות, בלי פרויקט/לקוח.'}
              </p>
            </div>

            {/* Period columns summary */}
            <p className="msi-periods">
              עמודות תקופה: {src.config.periodCols.map((c) => c.month ? HE_MONTHS_SHORT[c.month] : c.period).join(' · ')}
            </p>

            {/* Rows with per-row type */}
            <div className="msi-rows">
              {src.rows.map((r, rowIdx) => {
                const label = String(r[labelCol] == null ? '' : r[labelCol]).trim()
                if (!label) return null
                const isSkip = skip.has(rowIdx)
                const type = rowTypes[rowIdx] || 'income'
                return (
                  <div className={`msi-row${isSkip ? ' skip' : ''}`} key={rowIdx}>
                    <span className="msi-row-label">{label}</span>
                    <div className="msi-row-types">
                      <button type="button" className={`msi-rt${!isSkip && type === 'income' ? ' on income' : ''}`} onClick={() => setRowType(src, rowIdx, 'income')}>הכנסה</button>
                      <button type="button" className={`msi-rt${!isSkip && type === 'expense' ? ' on expense' : ''}`} onClick={() => setRowType(src, rowIdx, 'expense')}>הוצאה</button>
                      <button type="button" className={`msi-rt${isSkip ? ' on skip' : ''}`} onClick={() => setRowType(src, rowIdx, 'skip')}>דלג</button>
                    </div>
                  </div>
                )
              })}
            </div>

            <p className="msi-card-count">{(src.transactions || []).length} תנועות מהמקור הזה</p>
          </div>
        )
      })}

      {/* Merged preview */}
      <div className="msi-summary">
        {missingYear.length > 0 && (
          <p className="msi-warn"><AlertTriangle size={12} strokeWidth={2} aria-hidden="true" /> {missingYear.length} מקורות עדיין ללא שנה.</p>
        )}
        <p className="msi-summary-line">
          סה״כ ייווצרו <strong>{merged.transactions.length}</strong> תנועות
          {' '}(<span className="msi-inc">{incomeCount} הכנסה</span> · <span className="msi-exp">{expenseCount} הוצאה</span>)
          {projCount > 0 && <> · <strong>{projCount}</strong> פרויקטים</>}
          {clientCount > 0 && <> · <strong>{clientCount}</strong> לקוחות</>}
          {' '}מ-<strong>{live.length}</strong> מקורות.
        </p>
      </div>
    </div>
  )
}
