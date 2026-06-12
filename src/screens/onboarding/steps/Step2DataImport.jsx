import { useEffect, useRef, useState } from 'react'
import { Upload, FileSpreadsheet } from 'lucide-react'
import { ROW_CAP } from '../../../lib/csvImport'
import { projectSheet } from '../../../lib/sheetMapper'
import { buildSheetsFromFiles, ACCEPT } from '../../../lib/importFlow'
import { useUserPreferences } from '../../../hooks/useUserPreferences'
import { addressUser } from '../../../lib/address'
import UnifiedSheetImporter from '../UnifiedSheetImporter'

/* Step 2 — paths A (import) vs B (start fresh). Path A reads EVERY file
   the user picks (multiple) and EVERY sheet inside each (one per year).
   Matrix sheets (months as columns) become editable "sources"; flat
   sheets fall back to the column-mapping editor. The result is stashed
   in ob.parsed_data so downstream steps + the review wizard can use it. */

export default function Step2DataImport({ ob, setCTA, onReviewFromStep }) {
  const { prefs } = useUserPreferences()
  const gender = prefs?.design?.gender || 'neutral'
  const fileRef = useRef(null)
  const initial = ob.state.answers?.data_import || {}
  const [mode, setMode] = useState(initial.mode || null) // 'A' | 'B' | null
  const [fileName, setFileName] = useState(initial.file_name || '')
  const [, setRowCount] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  /* Handle one or more picked files. Reads every sheet of every file;
     matrix sheets become editable sources, a single flat file keeps the
     legacy column-mapping flow. */
  const handleFiles = async (fileList) => {
    const files = Array.from(fileList || [])
    if (!files.length) return
    /* Catch an unsupported file BEFORE trying to parse it, so the user gets
       a clear "export to CSV" path instead of a generic "couldn't read". */
    const UNSUPPORTED = ['pdf', 'numbers', 'pages', 'png', 'jpg', 'jpeg', 'gif', 'heic', 'webp', 'doc', 'docx', 'gsheet']
    const bad = files.find((f) => UNSUPPORTED.includes((f.name.split('.').pop() || '').toLowerCase()))
    if (bad) {
      setErr('הפורמט הזה לא נתמך לייבוא. אפשר לייבא CSV או Excel (xlsx/xls) — אם הקובץ בנאמברס או בגוגל-שיטס, אפשר לייצא אותו ל-CSV ולנסות שוב.')
      return
    }
    setBusy(true); setErr('')
    try {
      /* Read EVERY sheet of EVERY file into a unified list of editable sheet
         descriptors (the same engine the in-app import now uses). */
      const { sheets, names } = await buildSheetsFromFiles(files)
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
    } catch {
      setErr('הקובץ לא נקרא — ' + addressUser(gender, { male: 'ודא', female: 'ודאי', neutral: 'ודא/י' })
        + ' שזה CSV או Excel תקין ושאינו פתוח כרגע בתוכנה אחרת, או שאפשר להתחיל מאפס.')
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
    /* Path A → open the APPROVAL review here: the user reviews/edits/excludes
       and approves, but NOTHING is written yet. The approval is recorded and
       the FINAL creation happens once, at step 9 (which leans on it). If the
       wizard opens it owns advancing; otherwise advance normally. */
    if (finalMode === 'A') {
      /* Guard against a silent no-op advance: if the file was read but the
         current typing/mapping yields zero entities, keep the user on the
         step (cards stay visible) with a clear, fixable nudge instead of
         slipping past with nothing imported. */
      const live = (ob.state.parsed_data?.sheets || []).filter((s) => !s.removed)
      let total = 0
      live.forEach((s) => {
        if (s.type === 'matrix') { total += (s.pivotTransactions || []).length; return }
        if (s.type === 'ignore') return
        const p = projectSheet(s)
        total += p.clients.length + p.projects.length + p.leads.length + p.transactions.length + (p.sessions?.length || 0)
      })
      if (fileName && total === 0) {
        setErr(addressUser(gender, {
          male:    'קראנו את הקובץ אבל לא זיהינו ממנו לקוחות, פרויקטים או תנועות. כדאי לבדוק שהסוג נכון לכל טבלה ושעמודת השם/הסכום ממופה — או לבחור "מתחיל מאפס".',
          female:  'קראנו את הקובץ אבל לא זיהינו ממנו לקוחות, פרויקטים או תנועות. כדאי לבדוק שהסוג נכון לכל טבלה ושעמודת השם/הסכום ממופה — או לבחור "מתחילה מאפס".',
          neutral: 'קראנו את הקובץ אבל לא זיהינו ממנו לקוחות, פרויקטים או תנועות. כדאי לבדוק שהסוג נכון לכל טבלה ושעמודת השם/הסכום ממופה — או לבחור "מתחיל/ה מאפס".',
        }))
        return
      }
      if (onReviewFromStep?.()) return
    }
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
      <p className="ob-intro">{addressUser(gender, {
        male:    'יש לך נתונים שאתה רוצה להעלות?',
        female:  'יש לך נתונים שאת רוצה להעלות?',
        neutral: 'יש לך נתונים שאת/ה רוצה להעלות?',
      })}</p>
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
          <p className="ob-option-card-sub">CSV או Excel — אפשר כמה קבצים יחד, נזהה את העמודות ותמיד תעברו על הכול לפני שמשהו נשמר.</p>
        </button>
        <button
          type="button"
          className={`ob-option-card${mode === 'B' ? ' on' : ''}`}
          onClick={onPickPathB}
        >
          <span className="ob-option-card-l">
            <Upload size={16} strokeWidth={1.7} aria-hidden="true" /> {addressUser(gender, {
              male:    'לא, מתחיל מאפס',
              female:  'לא, מתחילה מאפס',
              neutral: 'לא, מתחיל/ה מאפס',
            })}
          </span>
          <p className="ob-option-card-sub">אין בעיה — נבנה את הכול יחד, צעד אחר צעד, בקצב שלך.</p>
        </button>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept={ACCEPT}
        multiple
        aria-label="בחירת קובץ CSV או Excel לייבוא"
        style={{ display: 'none' }}
        onChange={(e) => handleFiles(e.target.files)}
      />

      <div aria-live="polite" aria-atomic="true">
        {busy && <p className="ob-empty-hint" role="status">מעבד את הקובץ…</p>}
        {err && <p className="ob-empty-hint" role="alert" style={{ color: 'var(--clay)' }}>{err}</p>}
      </div>

      {/* One editable card per sheet: detected entity type + column
          mapping. Anything unrecognised is surfaced for the user to set. */}
      {sheets.length > 0 && (
        <>
          <UnifiedSheetImporter sheets={ob.state.parsed_data.sheets} onChange={onSheetsChange} gender={gender} />
          <p className="ob-intro-sub" style={{ textAlign: 'center' }}>
            {addressUser(gender, {
              male:    'רק קראנו את הקובץ — שום דבר עוד לא נשמר. בשלב הבא תעבור על הכול ותאשר.',
              female:  'רק קראנו את הקובץ — שום דבר עוד לא נשמר. בשלב הבא תעברי על הכול ותאשרי.',
              neutral: 'רק קראנו את הקובץ — שום דבר עוד לא נשמר. בשלב הבא תעברו על הכול ותאשרו.',
            })}
          </p>
        </>
      )}

      {/* File read OK but nothing to import (empty / all sheets ignored). */}
      {mode === 'A' && fileName && !busy && !err && sheets.length === 0 && (
        <p className="ob-empty-hint" role="status">
          הקובץ נקרא אבל לא נמצאו בו נתונים לייבוא. אם זה הקובץ הנכון, אפשר לייצא אותו מחדש כ-CSV — או שנמשיך יחד מאפס.
        </p>
      )}

      {ob.state.parsed_data?.sheets?.some((s) => s.truncated) && (
        <p className="ob-empty-hint" style={{ color: 'var(--amber-warn)' }}>
          חלק מהטבלאות נקטעו ל-{ROW_CAP} השורות הראשונות כדי לשמור על ביצועים. אפשר לייבא את השאר בנפרד בהמשך.
        </p>
      )}

    </>
  )
}
