import { useEffect, useRef, useState } from 'react'
import { Upload, FileSpreadsheet, Sparkles } from 'lucide-react'
import { ROW_CAP } from '../../../lib/csvImport'
import { projectSheet } from '../../../lib/sheetMapper'
import { buildSheetsFromFiles, ACCEPT } from '../../../lib/importFlow'
import { useUserPreferences } from '../../../hooks/useUserPreferences'
import { useT } from '../../../i18n/useT'
import UnifiedSheetImporter from '../UnifiedSheetImporter'
import RecognitionWizard from '../RecognitionWizard'
import { Box, Txt, Btn, Input } from '../../../components/ui'

/* Step 2 — paths A (import) vs B (start fresh). Path A reads EVERY file
   the user picks (multiple) and EVERY sheet inside each (one per year).
   Matrix sheets (months as columns) become editable "sources"; flat
   sheets fall back to the column-mapping editor. The result is stashed
   in ob.parsed_data so downstream steps + the review wizard can use it. */

export default function Step2DataImport({ ob, setCTA, onReviewFromStep }) {
  const { t } = useT('onboardingSteps')
  const { prefs } = useUserPreferences()
  const gender = prefs?.design?.gender || 'neutral'
  const fileRef = useRef(null)
  const initial = ob.state.answers?.data_import || {}
  const [mode, setMode] = useState(initial.mode || null) // 'A' | 'B' | null
  const [fileName, setFileName] = useState(initial.file_name || '')
  const [, setRowCount] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  /* The adaptive recognition wizard — a centered "what did we find?" dialog
     shown right after a file is read, before the detailed column mapping. */
  const [showWizard, setShowWizard] = useState(false)

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
      setErr(t('step2.errUnsupported'))
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
      /* Open the recognition wizard so the user confirms our reading before
         the detailed mapping — only when there's actually something to show. */
      if (sheets.length > 0) setShowWizard(true)
    } catch {
      setErr(t('step2.errReadFail', { verb: t('step2.errReadFailVerb') }))
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
        setErr(t('step2.errNoEntities'))
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
  const hint = yearMissing ? t('step2.hintYearMissing') : null
  useEffect(() => { setCTA({ onNext, canAdvance, busy, hint }) }, [mode, fileName, busy, canAdvance, hint]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <Txt as="p" className="ob-intro">{t('step2.intro')}</Txt>
      <Txt as="p" className="ob-intro-sub">{t('step2.introSub')}</Txt>

      <Box className="ob-card-options">
        <Btn
          type="button"
          className={`ob-option-card${mode === 'A' ? ' on' : ''}`}
          onClick={onPickPathA}
        >
          <Txt className="ob-option-card-l">
            <FileSpreadsheet size={16} strokeWidth={1.7} aria-hidden="true" /> {t('step2.pathAHas')}
          </Txt>
          <Txt as="p" className="ob-option-card-sub">{t('step2.pathASub')}</Txt>
        </Btn>
        <Btn
          type="button"
          className={`ob-option-card${mode === 'B' ? ' on' : ''}`}
          onClick={onPickPathB}
        >
          <Txt className="ob-option-card-l">
            <Upload size={16} strokeWidth={1.7} aria-hidden="true" /> {t('step2.pathBFresh')}
          </Txt>
          <Txt as="p" className="ob-option-card-sub">{t('step2.pathBSub')}</Txt>
        </Btn>
      </Box>

      <Input
        ref={fileRef}
        type="file"
        accept={ACCEPT}
        multiple
        aria-label={t('step2.filePickerAria')}
        style={{ display: 'none' }}
        onChange={(e) => handleFiles(e.target.files)}
      />

      <Box aria-live="polite" aria-atomic="true">
        {busy && <Txt as="p" className="ob-empty-hint" role="status">{t('step2.processing')}</Txt>}
        {err && <Txt as="p" className="ob-empty-hint" role="alert" style={{ color: 'var(--clay)' }}>{err}</Txt>}
      </Box>

      {/* One editable card per sheet: detected entity type + column
          mapping. Anything unrecognised is surfaced for the user to set.
          The recognition wizard sits above it as a confirm-first overlay. */}
      {sheets.length > 0 && (
        <>
          <Btn type="button" className="ob-btn ghost" onClick={() => setShowWizard(true)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, margin: '0 auto 12px' }}>
            <Sparkles size={14} strokeWidth={1.8} aria-hidden="true" /> {t('step2.reopenRecognize')}
          </Btn>
          <UnifiedSheetImporter sheets={ob.state.parsed_data.sheets} onChange={onSheetsChange} gender={gender} />
          <Txt as="p" className="ob-intro-sub" style={{ textAlign: 'center' }}>
            {t('step2.readNote')}
          </Txt>
        </>
      )}

      {showWizard && sheets.length > 0 && (
        <RecognitionWizard
          sheets={ob.state.parsed_data.sheets}
          onChange={onSheetsChange}
          onConfirm={() => setShowWizard(false)}
          onEditManually={() => setShowWizard(false)}
        />
      )}

      {/* File read OK but nothing to import (empty / all sheets ignored). */}
      {mode === 'A' && fileName && !busy && !err && sheets.length === 0 && (
        <Txt as="p" className="ob-empty-hint" role="status">
          {t('step2.noData')}
        </Txt>
      )}

      {ob.state.parsed_data?.sheets?.some((s) => s.truncated) && (
        <Txt as="p" className="ob-empty-hint" style={{ color: 'var(--amber-warn)' }}>
          {t('step2.truncated', { cap: ROW_CAP })}
        </Txt>
      )}

    </>
  )
}
