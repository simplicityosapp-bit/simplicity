import { useEffect, useRef, useState } from 'react'
import { Upload, FileSpreadsheet, CheckCircle2 } from 'lucide-react'
import { parseCsvFile } from '../../../lib/csvImport'

/* Step 2 — paths A (import) vs B (start fresh). Path A runs a real
   header-aware CSV parser (lib/csvImport) and stashes the structured
   result in `ob.parsed_data` so downstream steps (esp. step 4 clients)
   can offer "extracted from your file" chips. Excel files are accepted
   by the picker but treated as a placeholder for now — xlsx parsing
   ships next. */

const ACCEPT = '.csv,.xlsx,.xls,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

export default function Step2DataImport({ ob, setCTA }) {
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
      const isCsv = /\.csv$/i.test(file.name) || file.type === 'text/csv'
      if (!isCsv) {
        /* Excel placeholder — same UX, but no chips downstream. */
        setFileName(file.name)
        setRowCount(null)
        await ob.setParsedData({
          kind: 'placeholder',
          file_name: file.name,
          received_at: new Date().toISOString(),
        })
        await ob.setAnswers('data_import', {
          mode: 'A',
          file_name: file.name,
          parsed_at: new Date().toISOString(),
          format: 'xlsx-placeholder',
        })
        return
      }
      const parsed = await parseCsvFile(file)
      setFileName(file.name)
      setRowCount(parsed.raw_rows)
      await ob.setParsedData({
        kind: 'csv',
        ...parsed,
        received_at: new Date().toISOString(),
      })
      await ob.setAnswers('data_import', {
        mode: 'A',
        file_name: file.name,
        parsed_at: new Date().toISOString(),
        format: 'csv',
        client_count: parsed.clients.length,
        project_count: parsed.projects.length,
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
  const hint = !canAdvance ? 'בחר/י "כן יש לי" + העלאת קובץ, או "מתחיל/ה מאפס".' : null
  useEffect(() => { setCTA({ onNext, canAdvance, busy, hint }) }, [mode, fileName, busy, canAdvance, hint]) // eslint-disable-line react-hooks/exhaustive-deps

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
          <div>
            התקבל: <strong>{fileName}</strong>
            {rowCount != null && <span style={{ color: 'var(--stone)' }}> · {rowCount} שורות</span>}
            {ob.state.parsed_data?.kind === 'csv' && (
              <div style={{ marginTop: 4, color: 'var(--stone)', fontSize: 11.5 }}>
                זוהו {ob.state.parsed_data.clients?.length || 0} לקוחות
                {ob.state.parsed_data.projects?.length ? ` · ${ob.state.parsed_data.projects.length} פרויקטים` : ''}
                {ob.state.parsed_data.unmapped_columns?.length ? ` · ${ob.state.parsed_data.unmapped_columns.length} עמודות לא זוהו` : ''}
              </div>
            )}
          </div>
        </div>
      )}

    </>
  )
}
