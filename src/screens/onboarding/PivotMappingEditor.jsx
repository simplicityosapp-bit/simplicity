import { CheckCircle2, AlertTriangle } from 'lucide-react'
import { repivot } from '../../lib/csvImport'
import { classifyPeriodHeader } from '../../lib/pivotImport'
import './PivotMappingEditor.css'

/* ════════════════════════════════════════════════════════════════
   PIVOT MAPPING EDITOR — matrix (cross-tab) import control surface.
   ════════════════════════════════════════════════════════════════
   Shown when a sheet is detected as a matrix (months/periods as
   columns). Gives the user FULL manual control over how it's read:
     - Layout toggle: treat as matrix, or fall back to row-per-record.
     - Type: income / expense (whole sheet).
     - Year: which year the period columns belong to (months need it
       to become real dates).
     - Per-column role: each header is either the LABEL column, a
       PERIOD column, or ignored. Auto-detected but fully editable.
     - Per-row skip: summary rows (סהכ / רווח) are pre-checked to skip;
       any row can be toggled.
   A live preview shows how many transactions will be created.

   Props:
     - parsed:   parsed_data with a `pivot` block.
     - onChange(nextParsed): writes back (repivot re-derives the flat
       transactions).
     - onLayoutChange(layout): 'matrix' | 'flat' — lets the parent flip
       back to the normal column-mapping editor.
   ════════════════════════════════════════════════════════════════ */

const THIS_YEAR = new Date().getFullYear() /* current app year; user can change */
const YEARS = [THIS_YEAR - 2, THIS_YEAR - 1, THIS_YEAR, THIS_YEAR + 1]

export default function PivotMappingEditor({ parsed, onChange, onLayoutChange }) {
  if (!parsed?.pivot) return null
  const p = parsed.pivot
  const headers = parsed.headers || []
  const rows = parsed.rows || []
  const periodIdx = new Set(p.periodCols.map((c) => c.idx))
  const skip = new Set(p.skipRows || [])
  const txns = p.transactions || []

  /* Column role: 'label' | 'period' | 'ignore'. */
  const roleOf = (idx) => (idx === p.labelCol ? 'label' : periodIdx.has(idx) ? 'period' : 'ignore')

  const setRole = (idx, role) => {
    let labelCol = p.labelCol
    let periodCols = p.periodCols.slice()
    /* remove idx from period list first */
    periodCols = periodCols.filter((c) => c.idx !== idx)
    if (role === 'label') {
      labelCol = idx
    } else if (role === 'period') {
      const cls = classifyPeriodHeader(headers[idx]) || { period: headers[idx], month: null }
      periodCols.push({ idx, period: cls.period, month: cls.month })
      periodCols.sort((a, b) => a.idx - b.idx)
      /* if this column was the label, move label to the first non-period col */
      if (labelCol === idx) labelCol = headers.findIndex((h, i) => i !== idx && !periodCols.some((c) => c.idx === i))
    }
    onChange(repivot(parsed, { labelCol, periodCols }))
  }

  const toggleSkip = (rowIdx) => {
    const next = new Set(skip)
    if (next.has(rowIdx)) next.delete(rowIdx); else next.add(rowIdx)
    onChange(repivot(parsed, { skipRows: Array.from(next) }))
  }

  const setYear = (year) => onChange(repivot(parsed, { year: Number(year) }))
  const setType = (type) => onChange(repivot(parsed, { type }))

  /* Months present but no year chosen → dates can't be built. */
  const hasMonths = p.periodCols.some((c) => c.month)
  const needsYear = hasMonths && !p.year

  return (
    <div className="pv">
      <div className="pv-head">
        <p className="pv-title">
          <CheckCircle2 size={14} strokeWidth={2} aria-hidden="true" />
          זוהתה טבלת חודשים
        </p>
        <p className="pv-sub">
          הקובץ בנוי כטבלה צולבת — שורה לכל פריט, עמודה לכל חודש. נהפוך כל תא לתנועה.
        </p>
      </div>

      {/* Layout: matrix vs flat */}
      <div className="pv-field">
        <p className="pv-label">איך לקרוא את הקובץ?</p>
        <div className="pv-seg">
          <button type="button" className="pv-seg-btn on">טבלת חודשים</button>
          <button type="button" className="pv-seg-btn" onClick={() => onLayoutChange?.('flat')}>רשימה רגילה</button>
        </div>
      </div>

      {/* Type + year */}
      <div className="pv-row2">
        <div className="pv-field">
          <p className="pv-label">סוג התנועות</p>
          <div className="pv-seg">
            <button type="button" className={`pv-seg-btn${p.type === 'income' ? ' on' : ''}`} onClick={() => setType('income')}>הכנסות</button>
            <button type="button" className={`pv-seg-btn${p.type === 'expense' ? ' on' : ''}`} onClick={() => setType('expense')}>הוצאות</button>
          </div>
        </div>
        {hasMonths && (
          <div className="pv-field">
            <p className="pv-label">שנה</p>
            <select className="pv-select" value={p.year || ''} onChange={(e) => setYear(e.target.value)}>
              <option value="">בחר/י שנה</option>
              {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        )}
      </div>

      {needsYear && (
        <p className="pv-warn">
          <AlertTriangle size={13} strokeWidth={1.9} aria-hidden="true" />
          יש לבחור שנה כדי שהחודשים יהפכו לתאריכים.
        </p>
      )}

      {/* Column roles */}
      <div className="pv-field">
        <p className="pv-label">תפקיד כל עמודה</p>
        <div className="pv-cols">
          {headers.map((h, idx) => (
            <div className="pv-col" key={idx}>
              <span className="pv-col-name" title={h}>{h || `עמודה ${idx + 1}`}</span>
              <select
                className="pv-select pv-col-select"
                value={roleOf(idx)}
                onChange={(e) => setRole(idx, e.target.value)}
                aria-label={`תפקיד עמודה ${h}`}
              >
                <option value="label">שם הפריט</option>
                <option value="period">חודש / תקופה</option>
                <option value="ignore">התעלם</option>
              </select>
            </div>
          ))}
        </div>
      </div>

      {/* Rows — skip toggles, summary rows pre-checked */}
      <div className="pv-field">
        <p className="pv-label">שורות לייבוא</p>
        <div className="pv-rows">
          {rows.map((r, rowIdx) => {
            const label = String(r[p.labelCol] == null ? '' : r[p.labelCol]).trim()
            if (!label) return null
            const included = !skip.has(rowIdx)
            return (
              <label className={`pv-row-item${included ? '' : ' off'}`} key={rowIdx}>
                <input type="checkbox" checked={included} onChange={() => toggleSkip(rowIdx)} />
                <span className="pv-row-label">{label}</span>
              </label>
            )
          })}
        </div>
      </div>

      <p className="pv-preview">
        ייווצרו <strong>{txns.length}</strong> תנועות{p.type === 'expense' ? ' (הוצאה)' : ' (הכנסה)'} מהטבלה.
      </p>
    </div>
  )
}
