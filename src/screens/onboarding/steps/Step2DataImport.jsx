import { useRef, useState } from 'react'
import { Upload, FileSpreadsheet, CheckCircle2 } from 'lucide-react'

/* Step 2 — paths A (import) vs B (start fresh). Path A uses a stubbed
   parser: we accept the file, count its rows, and stash a placeholder
   `parsed_data` blob so downstream steps know "the user uploaded".
   Real entity extraction (mapping headers → clients / projects /
   transactions) is deep work — see open follow-ups. */

const ACCEPT = '.csv,.xlsx,.xls,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

export default function Step2DataImport({ ob }) {
  const fileRef = useRef(null)
  const initial = ob.state.answers?.data_import || {}
  const [mode, setMode] = useState(initial.mode || null) // 'A' | 'B' | null
  const [fileName, setFileName] = useState(initial.file_name || '')
  const [rowCount, setRowCount] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const handleFile = async (file) => {
    if (!file) return
    setBusy(true); setErr('')
    try {
      /* Best-effort parse: only handles CSV here; Excel parsing is a
         heavier dependency (xlsx) — we mark it as "received" and let
         the deep-import follow-up handle it properly. */
      const isCsv = /\.csv$/i.test(file.name) || file.type === 'text/csv'
      let parsedRows = 0
      if (isCsv) {
        const text = await file.text()
        parsedRows = text.split(/\r?\n/).filter((l) => l.trim().length > 0).length - 1 // minus header
        if (parsedRows < 0) parsedRows = 0
      }
      setFileName(file.name)
      setRowCount(parsedRows)
      await ob.setParsedData({
        kind: 'placeholder',
        file_name: file.name,
        approx_rows: parsedRows,
        received_at: new Date().toISOString(),
      })
      await ob.setAnswers('data_import', {
        mode: 'A',
        file_name: file.name,
        parsed_at: new Date().toISOString(),
      })
    } catch (e) {
      setErr('הקובץ לא נקרא — נסה/י שוב או בחר/י להתחיל מאפס.')
    } finally {
      setBusy(false)
    }
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
    await ob.advance()
  }

  const canAdvance = mode === 'B' || (mode === 'A' && !!fileName)

  return (
    <>
      <p className="ob-intro">יש לך דאטה קיימת שאת/ה רוצה להעלות?</p>
      <p className="ob-intro-sub">לא חובה. אם יש — נמלא את השלבים הבאים בהצעות מהקובץ, ותוכל/י לאשר כל אחד.</p>

      <div className="ob-card-options">
        <button
          type="button"
          className={`ob-option-card${mode === 'A' ? ' on' : ''}`}
          onClick={onPickPathA}
        >
          <span className="ob-option-card-l">
            <FileSpreadsheet size={16} strokeWidth={1.7} aria-hidden="true" /> כן, יש לי
          </span>
          <p className="ob-option-card-sub">CSV או Excel — נעלה ונחלץ ממנו מה שאפשר.</p>
        </button>
        <button
          type="button"
          className={`ob-option-card${mode === 'B' ? ' on' : ''}`}
          onClick={onPickPathB}
        >
          <span className="ob-option-card-l">
            <Upload size={16} strokeWidth={1.7} aria-hidden="true" /> לא, מתחיל/ה מאפס
          </span>
          <p className="ob-option-card-sub">המסכים הבאים יהיו ריקים — תמלא/י ידנית כל אחד.</p>
        </button>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept={ACCEPT}
        style={{ display: 'none' }}
        onChange={(e) => handleFile(e.target.files?.[0])}
      />

      {busy && <p className="ob-empty-hint">מעבד את הקובץ…</p>}
      {err && <p className="ob-empty-hint" style={{ color: 'var(--clay)' }}>{err}</p>}

      {mode === 'A' && fileName && (
        <div className="ob-pre-fill-banner">
          <CheckCircle2 size={15} strokeWidth={1.8} aria-hidden="true" />
          התקבל: <strong>{fileName}</strong>
          {rowCount != null && <span style={{ color: 'var(--stone)' }}>· ~{rowCount} שורות</span>}
        </div>
      )}

      <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'flex-end' }}>
        <button
          type="button"
          className="ob-btn primary"
          onClick={onNext}
          disabled={!canAdvance || busy}
        >
          הלאה
        </button>
      </div>
    </>
  )
}
