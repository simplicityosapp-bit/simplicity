import { useEffect, useState } from 'react'
import Modal from './Modal'
import { Download, FileSpreadsheet } from 'lucide-react'
import './ExportDataModal.css'

/* Consolidates every export into one window: a single "all data" Excel file
   (a sheet per entity) plus the individual re-importable CSVs. Replaces the
   three loose buttons that used to sit on the Settings → data section.

   Sensitive categories (sessions/goals/daily answers/reflections) are opt-in
   checkboxes — OFF by default — that add extra sheets to the "all data" file.
   These fields are stored plaintext at rest; the export simply includes the
   extra sensitive columns. */
const SENSITIVE = [
  { key: 'sessions',     label: 'סשנים',         sub: 'הערות וסיכומי פגישות' },
  { key: 'goals',        label: 'יעדים',          sub: 'יעדים ורישומי התקדמות' },
  { key: 'dailyAnswers', label: 'תשובות יומיות',  sub: 'תשובות לשאלות היומיות' },
  { key: 'moon',         label: 'רפלקציות',       sub: 'רפלקציות יומיות (מפוענחות)' },
]

export default function ExportDataModal({
  open, onClose,
  onExportAll, onExportTransactions, onExportClients, onExportProjects,
  hasTransactions, hasClients, hasProjects,
}) {
  const [sel, setSel] = useState({})   // category key → included?
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(false)

  /* Reset the opt-in sensitive selections each time the modal opens — they
     export decrypted PII and must never silently carry over from a prior open. */
  useEffect(() => { if (open) { setSel({}); setErr(false) } }, [open])

  const toggle = (key) => setSel((s) => ({ ...s, [key]: !s[key] }))

  /* The "all data" export now fetches the checked sensitive categories, so it
     is async — guard against double-clicks and surface a failure. */
  const runAll = async () => {
    if (busy) return
    setBusy(true); setErr(false)
    try {
      await onExportAll(sel)
    } catch (e) {
      console.error('[export] failed', e)
      setErr(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="ייצוא נתונים">
      <p className="m-hint">
        כל הנתונים יחד יורדים כקובץ Excel אחד עם גיליון לכל סוג; הייצואים הבודדים הם קובצי CSV נפרדים.
      </p>

      <button type="button" className="set-data-action" onClick={runAll} disabled={busy}>
        <FileSpreadsheet size={15} strokeWidth={1.7} aria-hidden="true" />
        {busy ? 'מייצא…' : 'ייצוא כל הנתונים (Excel)'}
      </button>
      <p className="set-data-hint">
        קובץ אחד עם גיליון לכל סוג: תנועות, לקוחות, פרויקטים, לידים, משימות, קטגוריות.
      </p>

      <div className="export-sens">
        <p className="export-sens-h">לכלול גם נתונים רגישים?</p>
        <p className="export-sens-sub">
          לא נכלל כברירת מחדל. הנתונים הרגישים מיוצאים כטקסט גלוי — שמרו את הקובץ במקום בטוח.
        </p>
        <div className="export-cats">
          {SENSITIVE.map((o) => (
            <label key={o.key} className={`export-cat${busy ? ' is-disabled' : ''}`}>
              <span className="export-cat-text">
                {o.label}
                <span className="export-cat-sub">{o.sub}</span>
              </span>
              <input
                type="checkbox"
                className="export-cat-checkbox"
                checked={!!sel[o.key]}
                disabled={busy}
                onChange={() => toggle(o.key)}
              />
            </label>
          ))}
        </div>
      </div>

      {err && <p className="export-err">הייצוא נכשל. נסו/י שוב.</p>}

      <button type="button" className="set-data-action" onClick={onExportTransactions} disabled={!hasTransactions || busy} style={{ marginTop: 12 }}>
        <Download size={15} strokeWidth={1.7} aria-hidden="true" />
        ייצוא תנועות (CSV)
      </button>
      <button type="button" className="set-data-action" onClick={onExportClients} disabled={!hasClients || busy} style={{ marginTop: 10 }}>
        <Download size={15} strokeWidth={1.7} aria-hidden="true" />
        ייצוא לקוחות (CSV)
      </button>
      <button type="button" className="set-data-action" onClick={onExportProjects} disabled={!hasProjects || busy} style={{ marginTop: 10 }}>
        <Download size={15} strokeWidth={1.7} aria-hidden="true" />
        ייצוא פרויקטים (CSV)
      </button>
      <p className="set-data-hint">
        קבצי הלקוחות והפרויקטים נשמרים בפורמט שניתן לייבא בחזרה (אותן כותרות שהמערכת מזהה).
      </p>

      <div className="m-actions">
        <button type="button" className="m-btn-cancel" onClick={onClose} disabled={busy}>סגירה</button>
      </div>
    </Modal>
  )
}
