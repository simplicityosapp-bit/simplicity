import Modal from './Modal'
import { Download, FileSpreadsheet } from 'lucide-react'

/* Consolidates every export into one window: a single "all data" Excel file
   (a sheet per entity) plus the individual re-importable CSVs. Replaces the
   three loose buttons that used to sit on the Settings → data section. */
export default function ExportDataModal({
  open, onClose,
  onExportAll, onExportTransactions, onExportClients, onExportProjects,
  hasTransactions, hasClients, hasProjects,
}) {
  return (
    <Modal open={open} onClose={onClose} title="ייצוא נתונים">
      <p className="m-hint">
        כל הנתונים יחד יורדים כקובץ Excel אחד עם גיליון לכל סוג; הייצואים הבודדים הם קובצי CSV נפרדים.
      </p>

      <button type="button" className="set-data-action" onClick={onExportAll}>
        <FileSpreadsheet size={15} strokeWidth={1.7} aria-hidden="true" />
        ייצוא כל הנתונים (Excel)
      </button>
      <p className="set-data-hint">
        קובץ אחד עם גיליון לכל סוג: תנועות, לקוחות, פרויקטים, לידים, משימות, קטגוריות.
      </p>

      <button type="button" className="set-data-action" onClick={onExportTransactions} disabled={!hasTransactions} style={{ marginTop: 12 }}>
        <Download size={15} strokeWidth={1.7} aria-hidden="true" />
        ייצוא תנועות (CSV)
      </button>
      <button type="button" className="set-data-action" onClick={onExportClients} disabled={!hasClients} style={{ marginTop: 10 }}>
        <Download size={15} strokeWidth={1.7} aria-hidden="true" />
        ייצוא לקוחות (CSV)
      </button>
      <button type="button" className="set-data-action" onClick={onExportProjects} disabled={!hasProjects} style={{ marginTop: 10 }}>
        <Download size={15} strokeWidth={1.7} aria-hidden="true" />
        ייצוא פרויקטים (CSV)
      </button>
      <p className="set-data-hint">
        קבצי הלקוחות והפרויקטים נשמרים בפורמט שניתן לייבא בחזרה (אותן כותרות שהמערכת מזהה).
      </p>

      <div className="m-actions">
        <button type="button" className="m-btn-cancel" onClick={onClose}>סגירה</button>
      </div>
    </Modal>
  )
}
