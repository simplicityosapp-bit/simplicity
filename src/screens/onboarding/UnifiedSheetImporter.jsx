import { useMemo } from 'react'
import { FileSpreadsheet, X, AlertTriangle, CheckCircle2, HelpCircle } from 'lucide-react'
import {
  SHEET_TYPES, SHEET_TYPE_LABELS, ENTITY_FIELDS,
  setSheetType, remapSheetColumn, projectSheet,
} from '../../lib/sheetMapper'
import { flattenMatrix } from '../../lib/pivotImport'
import './UnifiedSheetImporter.css'

/* ════════════════════════════════════════════════════════════════
   UNIFIED SHEET IMPORTER — one card per sheet, "detect + ask".
   ════════════════════════════════════════════════════════════════
   Every sheet (from every file) gets a card:
     - ENTITY TYPE selector (clients / projects / leads / transactions /
       matrix / ignore) — auto-guessed, always changeable.
     - For flat entities: a column→field mapping where each header is a
       dropdown. UNRECOGNISED columns are highlighted so the user sets
       them (or leaves them ignored). Nothing is dropped silently.
     - For matrix sheets: year + per-row income/expense (reuses pivot).
   A footer previews the merged totals across all sheets.

   Props:
     - sheets:  array of sheet-mapping descriptors.
     - onChange(nextSheets): writes back.
   ════════════════════════════════════════════════════════════════ */

const THIS_YEAR = 2026
const YEARS = [THIS_YEAR - 3, THIS_YEAR - 2, THIS_YEAR - 1, THIS_YEAR, THIS_YEAR + 1]

export default function UnifiedSheetImporter({ sheets, onChange }) {
  const live = (sheets || []).filter((s) => !s.removed)

  const patch = (id, next) => onChange((sheets || []).map((s) => (s.id === id ? next : s)))
  const remove = (id) => onChange((sheets || []).map((s) => (s.id === id ? { ...s, removed: true } : s)))

  const changeType = (sheet, type) => patch(sheet.id, setSheetType(sheet, type))
  const changeColumn = (sheet, colIdx, field) => patch(sheet.id, remapSheetColumn(sheet, colIdx, field))

  /* Matrix helpers (year + per-row type). */
  const repivot = (sheet, cfgPatch) => {
    const pivot = { ...sheet.pivot, ...cfgPatch }
    const pivotTransactions = flattenMatrix(sheet.rows, { ...pivot, skipRows: new Set(pivot.skipRows || []) })
    return { ...sheet, pivot, pivotTransactions }
  }
  const setYear = (sheet, year) => patch(sheet.id, repivot(sheet, { year: year ? Number(year) : null }))
  const setRowType = (sheet, rowIdx, type) => {
    const rowTypes = { ...(sheet.pivot.rowTypes || {}) }
    let skipRows = sheet.pivot.skipRows || []
    if (type === 'skip') skipRows = Array.from(new Set([...skipRows, rowIdx]))
    else { skipRows = skipRows.filter((i) => i !== rowIdx); rowTypes[rowIdx] = type }
    patch(sheet.id, repivot(sheet, { rowTypes, skipRows }))
  }

  /* Merged preview across all live sheets. */
  const totals = useMemo(() => {
    let clients = 0; let projects = 0; let leads = 0; let txns = 0
    live.forEach((s) => {
      if (s.type === 'matrix') { txns += (s.pivotTransactions || []).length; return }
      const p = projectSheet(s)
      clients += p.clients.length; projects += p.projects.length; leads += p.leads.length; txns += p.transactions.length
    })
    return { clients, projects, leads, txns }
  }, [live])

  if (!live.length) return null

  return (
    <div className="usi">
      {live.map((sheet) => {
        const isFlat = sheet.type !== 'matrix' && sheet.type !== 'ignore'
        const fields = ENTITY_FIELDS[sheet.type] || []
        const sample = (colIdx) => {
          for (const r of sheet.rows) { const v = String(r[colIdx] ?? '').trim(); if (v) return v }
          return ''
        }
        return (
          <div className="usi-card" key={sheet.id}>
            <div className="usi-head">
              <span className="usi-ic"><FileSpreadsheet size={15} strokeWidth={1.7} aria-hidden="true" /></span>
              <div className="usi-id">
                <p className="usi-name">{sheet.sheetName || sheet.fileName}</p>
                {sheet.sheetName && <p className="usi-file">{sheet.fileName}</p>}
              </div>
              <button type="button" className="usi-x" onClick={() => remove(sheet.id)} aria-label="הסר גיליון"><X size={14} strokeWidth={2} aria-hidden="true" /></button>
            </div>

            {/* Raw preview — first rows exactly as read, so the user can
                spot a mis-read (wrong header row, shifted columns) before
                trusting the mapping. Collapsed by default. */}
            <button type="button" className="usi-toggle-cols" onClick={() => patch(sheet.id, { ...sheet, _showRaw: !sheet._showRaw })}>
              {sheet._showRaw ? 'הסתר' : 'הצג'} את הנתונים כפי שנקראו {sheet._showRaw ? '▲' : '▼'}
            </button>
            {sheet._showRaw && (
              <div className="usi-raw">
                <table className="usi-raw-table">
                  <thead>
                    <tr>{sheet.headers.map((h, i) => <th key={i}>{h || '—'}</th>)}</tr>
                  </thead>
                  <tbody>
                    {sheet.rows.slice(0, 3).map((r, ri) => (
                      <tr key={ri}>{sheet.headers.map((_, ci) => <td key={ci}>{String(r[ci] ?? '')}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Entity type */}
            <div className="usi-field">
              <label className="usi-label">מה יש בגיליון הזה?</label>
              <select className="usi-select" value={sheet.type} onChange={(e) => changeType(sheet, e.target.value)}>
                {SHEET_TYPES.map((t) => <option key={t} value={t}>{SHEET_TYPE_LABELS[t]}</option>)}
              </select>
            </div>

            {sheet.type === 'ignore' && (
              <p className="usi-hint">הגיליון הזה לא ייובא.</p>
            )}

            {/* Flat entity → column mapping. Unmapped columns are shown
                first and highlighted (they need the user); recognized ones
                collapse behind a toggle so a 15-column sheet isn't a wall. */}
            {isFlat && (() => {
              const colData = sheet.headers
                .map((h, colIdx) => ({ h, colIdx, field: sheet.mapping[colIdx] || '' }))
                .filter((c) => c.h)
              const unmapped = colData.filter((c) => !c.field)
              const recognized = colData.filter((c) => c.field)
              const showAll = !!sheet._showAllCols
              const renderCol = ({ h, colIdx, field }) => (
                <div className={`usi-col${field ? '' : ' unmapped'}`} key={colIdx}>
                  <span className="usi-col-name">
                    {field ? <CheckCircle2 size={12} strokeWidth={2} aria-hidden="true" /> : <HelpCircle size={12} strokeWidth={2} aria-hidden="true" />}
                    <span className="usi-col-h" title={h}>{h}</span>
                    {sample(colIdx) && <span className="usi-col-sample" title={sample(colIdx)}>לדוגמה: {sample(colIdx)}</span>}
                  </span>
                  <select className="usi-select usi-col-select" value={field} onChange={(e) => changeColumn(sheet, colIdx, e.target.value)}>
                    <option value="">— התעלם</option>
                    {fields.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                  </select>
                </div>
              )
              return (
                <div className="usi-cols">
                  <p className="usi-cols-intro">
                    הערך האפור הוא דוגמה מהשורה הראשונה. בשלב הבא תהיה סקירה מלאה של כל הנתונים לפני שמשהו נשמר.
                  </p>
                  {unmapped.length > 0 && (
                    <>
                      <p className="usi-ask"><AlertTriangle size={13} strokeWidth={1.9} aria-hidden="true" /> {unmapped.length} עמודות שלא זיהינו — בחר/י מה הן (או "התעלם").</p>
                      {unmapped.map(renderCol)}
                    </>
                  )}
                  {recognized.length > 0 && (
                    <>
                      <button type="button" className="usi-toggle-cols" onClick={() => patch(sheet.id, { ...sheet, _showAllCols: !showAll })}>
                        {showAll ? 'הסתר' : 'הצג'} {recognized.length} עמודות שזוהו אוטומטית {showAll ? '▲' : '▼'}
                      </button>
                      {showAll && recognized.map(renderCol)}
                    </>
                  )}
                </div>
              )
            })()}

            {/* Matrix → year + per-row type */}
            {sheet.type === 'matrix' && sheet.pivot && (() => {
              const skip = new Set(sheet.pivot.skipRows || [])
              const rowTypes = sheet.pivot.rowTypes || {}
              const hasMonths = (sheet.pivot.periodCols || []).some((c) => c.month)
              const labelCol = sheet.pivot.labelCol
              return (
                <>
                  {hasMonths && (
                    <div className="usi-field">
                      <label className="usi-label">שנה{sheet.pivot.year ? ' (זוהתה מהגיליון)' : ''}</label>
                      <select className="usi-select" value={sheet.pivot.year || ''} onChange={(e) => setYear(sheet, e.target.value)}>
                        <option value="">בחר/י שנה</option>
                        {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
                      </select>
                      {!sheet.pivot.year && <p className="usi-ask"><AlertTriangle size={13} strokeWidth={1.9} aria-hidden="true" /> יש לבחור שנה.</p>}
                    </div>
                  )}
                  <div className="usi-rows">
                    {sheet.rows.map((r, rowIdx) => {
                      const label = String(r[labelCol] ?? '').trim()
                      if (!label) return null
                      const isSkip = skip.has(rowIdx)
                      const type = rowTypes[rowIdx] || 'income'
                      return (
                        <div className={`usi-row${isSkip ? ' skip' : ''}`} key={rowIdx}>
                          <span className="usi-row-label">{label}</span>
                          <div className="usi-row-types">
                            <button type="button" className={`usi-rt${!isSkip && type === 'income' ? ' on income' : ''}`} onClick={() => setRowType(sheet, rowIdx, 'income')}>הכנסה</button>
                            <button type="button" className={`usi-rt${!isSkip && type === 'expense' ? ' on expense' : ''}`} onClick={() => setRowType(sheet, rowIdx, 'expense')}>הוצאה</button>
                            <button type="button" className={`usi-rt${isSkip ? ' on skip' : ''}`} onClick={() => setRowType(sheet, rowIdx, 'skip')}>דלג</button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </>
              )
            })()}
          </div>
        )
      })}

      <div className="usi-summary">
        <p className="usi-summary-line">
          סה״כ ייווצרו:
          {totals.clients > 0 && <> <strong>{totals.clients}</strong> לקוחות ·</>}
          {totals.projects > 0 && <> <strong>{totals.projects}</strong> פרויקטים ·</>}
          {totals.leads > 0 && <> <strong>{totals.leads}</strong> לידים ·</>}
          {' '}<strong>{totals.txns}</strong> תנועות
        </p>
      </div>
    </div>
  )
}
