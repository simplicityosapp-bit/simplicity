import { useEffect, useRef, useState } from 'react'
import { Upload, FileSpreadsheet } from 'lucide-react'
import { parseXlsxSheets, parseCsvFile } from '../../../lib/csvImport'
import { buildSheetMapping } from '../../../lib/sheetMapper'
import { buildPivotConfig, detectMatrix, flattenMatrix, yearFromSheetName } from '../../../lib/pivotImport'
import UnifiedSheetImporter from '../UnifiedSheetImporter'

/* Step 2 — paths A (import) vs B (start fresh). Path A reads EVERY file
   the user picks (multiple) and EVERY sheet inside each (one per year).
   Matrix sheets (months as columns) become editable "sources"; flat
   sheets fall back to the column-mapping editor. The result is stashed
   in ob.parsed_data so downstream steps + the review wizard can use it. */

const ACCEPT = '.csv,.xlsx,.xls,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

export default function Step2DataImport({ ob, setCTA }) {
  const fileRef = useRef(null)
  const initial = ob.state.answers?.data_import || {}
  const [mode, setMode] = useState(initial.mode || null) // 'A' | 'B' | null
  const [fileName, setFileName] = useState(initial.file_name || '')
  const [rowCount, setRowCount] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  /* Handle one or more picked files. Reads every sheet of every file;
     matrix sheets become editable sources, a single flat file keeps the
     legacy column-mapping flow. */
  const handleFiles = async (fileList) => {
    const files = Array.from(fileList || [])
    if (!files.length) return
    setBusy(true); setErr('')
    try {
      /* Read EVERY sheet of EVERY file into a unified list. Each sheet
         becomes one editable mapping (entity type + columns); matrix
         sheets also carry a pivot config. The user confirms/fixes each. */
      const sheets = []
      for (const file of files) {
        const isCsv = /\.(csv|tsv|txt)$/i.test(file.name) || file.type === 'text/csv'
        // eslint-disable-next-line no-await-in-loop
        const raw = isCsv
          ? [{ sheetName: null, rows: [(await parseCsvFile(file)).headers, ...((await parseCsvFile(file)).rows || [])] }]
          : await parseXlsxSheets(file)
        raw.forEach(({ sheetName, rows }) => {
          const sheet = buildSheetMapping(file.name, sheetName, rows)
          if (sheet.type === 'matrix') {
            const headers = sheet.headers
            const det = detectMatrix(headers)
            const year = yearFromSheetName(sheetName) || yearFromSheetName(file.name)
            sheet.pivot = buildPivotConfig(headers, sheet.rows, det, year)
            sheet.pivotTransactions = flattenMatrix(sheet.rows, { ...sheet.pivot, skipRows: new Set(sheet.pivot.skipRows) })
          }
          sheets.push(sheet)
        })
      }
      const names = files.map((f) => f.name).join(', ')
      setFileName(names)
      setRowCount(sheets.reduce((s, sh) => s + (sh.rows?.length || 0), 0))
      await ob.setParsedData({
        kind: 'csv',
        file_name: names,
        sheets,
        clients: [], projects: [], transactions: [],
        received_at: new Date().toISOString(),
      })
      await ob.setAnswers('data_import', {
        mode: 'A', file_name: names, parsed_at: new Date().toISOString(), sheet_count: sheets.length,
      })
    } catch (e) {
      setErr('הקובץ לא נקרא — ודא/י שזה CSV או Excel תקין, או בחר/י להתחיל מאפס.')
    } finally {
      setBusy(false)
    }
  }

  /* Update the editable sheet mappings in place (from UnifiedSheetImporter). */
  const onSheetsChange = (nextSheets) => {
    const pd = ob.state.parsed_data || {}
    ob.setParsedData({ ...pd, sheets: nextSheets })
  }

  const onPickPathA = () => {
    setMode('A')
    fileRef.current?.click()
  }
  const onPickPathB = async () => {
    setMode('B')
    setFileName('')
    setRowCount(null)
    await ob.setParsedData(null)
    await ob.setAnswers('data_import', { mode: 'B', file_name: null, parsed_at: null })
  }

  const onNext = async () => {
    /* If user picked path A but didn't actually upload, fall back to B. */
    const finalMode = mode === 'A' && !fileName ? 'B' : (mode || 'B')
    await ob.setAnswers('data_import', { mode: finalMode })
    /* Just advance — NOTHING is created here. The column mapping the user
       did above is already saved in parsed_data.sheets and flows to the
       FINAL review at step 9, which is the single source of truth: data is
       created exactly once, and an item excluded there is never created.
       (Importing here too would double-run and, worse, make a step-2
       inclusion impossible to undo at step 9.) */
    await ob.advance()
  }

  /* Block advancing while any matrix sheet still needs a year. */
  const sheets = (ob.state.parsed_data?.sheets || []).filter((s) => !s.removed)
  const yearMissing = sheets.some((s) => s.type === 'matrix' && (s.pivot?.periodCols || []).some((c) => c.month) && !s.pivot?.year)
  const canAdvance = (mode === 'B' || (mode === 'A' && !!fileName)) && !yearMissing
  const hint = yearMissing ? 'יש לבחור שנה לכל טבלת חודשים לפני שממשיכים.' : null
  useEffect(() => { setCTA({ onNext, canAdvance, busy, hint }) }, [mode, fileName, busy, canAdvance, hint]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <p className="ob-intro">יש לך דאטה שאתה רוצה להעלות?</p>
      <p className="ob-intro-sub">אם יש נעבור על זה יחד ונכניס למערכת — אם לא נמשיך יחד בצעדים קטנים :)</p>

      <div className="ob-card-options">
        <button
          type="button"
          className={`ob-option-card${mode === 'A' ? ' on' : ''}`}
          onClick={onPickPathA}
        >
          <span className="ob-option-card-l">
            <FileSpreadsheet size={16} strokeWidth={1.7} aria-hidden="true" /> כן, יש לי
          </span>
          <p className="ob-option-card-sub">CSV או Excel — אפשר כמה קבצים יחד, נחלץ מהם מה שאפשר.</p>
        </button>
        <button
          type="button"
          className={`ob-option-card${mode === 'B' ? ' on' : ''}`}
          onClick={onPickPathB}
        >
          <span className="ob-option-card-l">
            <Upload size={16} strokeWidth={1.7} aria-hidden="true" /> לא, מתחיל/ה מאפס
          </span>
        </button>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept={ACCEPT}
        multiple
        style={{ display: 'none' }}
        onChange={(e) => handleFiles(e.target.files)}
      />

      {busy && <p className="ob-empty-hint">מעבד את הקובץ…</p>}
      {err && <p className="ob-empty-hint" style={{ color: 'var(--clay)' }}>{err}</p>}

      {busy && <p className="ob-empty-hint">מעבד את הקבצים…</p>}

      {/* One editable card per sheet: detected entity type + column
          mapping. Anything unrecognised is surfaced for the user to set. */}
      {ob.state.parsed_data?.sheets?.length > 0 && (
        <UnifiedSheetImporter sheets={ob.state.parsed_data.sheets} onChange={onSheetsChange} />
      )}

    </>
  )
}
