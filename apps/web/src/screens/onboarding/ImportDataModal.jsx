import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X, AlertTriangle, Sparkles, RotateCcw } from 'lucide-react'
import UnifiedSheetImporter from './UnifiedSheetImporter'
import RecognitionWizard from './RecognitionWizard'
import OnboardingReviewWizard from './OnboardingReviewWizard'
import { finalizeOnboardingImport } from '../../lib/onboardingImport'
import { buildReviewFromSheets } from '../../lib/importFlow'
import { sheetRecognitionInfo, unmappedColumnCount } from '../../lib/sheetMapper'
import { acquireModalLock } from '../../lib/modalLock'
import { useT } from '../../i18n/useT'
import './OnboardingScreen.css'        /* ob-* primitives (btn / map / input) */
import './OnboardingReviewWizard.css'
import { Box, Txt, Btn } from '../../components/ui'  /* obrw-* modal shell */

/* ════════════════════════════════════════════════════════════════
   IN-APP IMPORT MODAL — Settings → data. Now the SAME engine as
   onboarding: one editable card per sheet (entity type + column
   mapping + matrix), then the shared review wizard. So a returning
   user gets multi-sheet, matrix (months-as-columns), leads & sessions
   — exactly what onboarding offers — instead of a single flat sheet.
   Reuses UnifiedSheetImporter + buildReviewFromSheets + finalizeOnboardingImport.

   The RecognitionWizard — "here's what we found in your file, correct us
   before you go further" — opened automatically here too when the flow
   moved out of onboarding. It was the one part of that step worth
   keeping: a plain-language summary in front of the column-by-column
   mapping, so a user who only needs to confirm never has to read the
   detailed editor at all.

   All three phases go out through ONE portal to <body> (see below), so
   this is also the single place that holds the scroll lock.
   ════════════════════════════════════════════════════════════════ */

export default function ImportDataModal({ parsed: initialParsed, onClose, onImported }) {
  const { t } = useT('onboarding')
  const [parsed, setParsed] = useState(initialParsed) /* { kind:'csv', file_name, sheets } */
  const [phase, setPhase] = useState('map') /* 'map' | 'review' */
  const [review, setReview] = useState(null)
  /* Shown first, ahead of the mapping cards, whenever there's anything to
     recognise. Re-openable from the mapping phase. */
  const [showRecognition, setShowRecognition] = useState(() => (initialParsed?.sheets || []).some((s) => !s.removed))
  const summaryRef = useRef(null)

  const liveSheets = (parsed?.sheets || []).filter((s) => !s.removed)
  const reviewObj = buildReviewFromSheets(parsed)
  const yearMissing = liveSheets.some((s) => s.type === 'matrix' && (s.pivot?.periodCols || []).some((c) => c.month) && !s.pivot?.year)
  const truncated = liveSheets.some((s) => s.truncated)

  const onSheetsChange = (nextSheets) => setParsed((p) => ({ ...p, sheets: nextSheets }))
  const removedAny = (parsed?.sheets || []).some((s) => s.removed)
  const restoreSheets = () => onSheetsChange((parsed?.sheets || []).map((s) => ({ ...s, removed: false })))

  const goToReview = () => { setReview(reviewObj); setPhase('review') }

  /* Is there anything in this file the user actually has to settle before we
     can show them the result? A sheet that would produce nothing, a months
     matrix with no year, or nothing reviewable at all. If not, "נראה טוב"
     means what it says and goes to the review.

     It used to land on the column-mapping editor — the same screen as
     "עריכה מתקדמת", the one the recognition step exists to spare people.
     Answering "yes, that's my file" and being handed a table of dropdowns
     reads as the app not having listened. */
  const needsAttention = !reviewObj || yearMissing
    || liveSheets.some((s) => sheetRecognitionInfo(s).empty)

  /* onProgress comes from the wizard, which owns the bar — the importer
     writes one row at a time and reports each one, so a long file shows
     movement instead of a button that has said "יוצר…" for a minute. */
  const handleConfirm = async (payload, { onProgress } = {}) => {
    const summary = await finalizeOnboardingImport({ ...payload, onProgress })
    summaryRef.current = summary
    return summary
  }
  const handleComplete = () => {
    onImported?.(summaryRef.current)
    onClose()
  }

  /* Freeze the screen behind us — the same lock every other modal takes, so
     touch scrolling can't bleed through to the settings page underneath. */
  useEffect(() => acquireModalLock(), [])

  /* Every phase paints through ONE portal to <body>. These dialogs used to
     render in place, inside `.screen` — which sets `isolation: isolate`
     (index.css), so their z-index:720 was sealed inside the screen's own
     layer and `.mg-bottombar` (a sibling of .screen, z-index 200) painted
     straight over them. On a phone that left "אישור ויצירה" half-buried
     under the nav bar. Out at <body> the 720 means what it says. */
  const layer = (node) => createPortal(node, document.body)

  if (phase === 'review') {
    return layer(
      <OnboardingReviewWizard
        parsed={review}
        onConfirm={handleConfirm}
        onComplete={handleComplete}
        onCancel={() => setPhase('map')}
      />
    )
  }

  if (showRecognition && liveSheets.length > 0) {
    return layer(
      <RecognitionWizard
        sheets={parsed.sheets}
        onChange={onSheetsChange}
        onConfirm={() => (needsAttention ? setShowRecognition(false) : goToReview())}
        onEditManually={() => setShowRecognition(false)}
        onClose={onClose}
        needsAttention={needsAttention}
        unmappedCount={liveSheets.reduce((n, s) => n + unmappedColumnCount(s), 0)}
      />
    )
  }

  /* ── Mapping phase ── */
  return layer(
    <Box className="obrw-back" role="dialog" aria-modal="true" aria-label={t('modal.dialogAria')}>
      <Box className="obrw-panel">
        <Box as="header" className="obrw-head">
          <Box>
            <Txt as="p" className="obrw-title">{t('modal.title')}</Txt>
            <Txt as="p" className="obrw-sub">
              {parsed?.file_name ? <><strong>{parsed.file_name}</strong> · </> : null}
              {liveSheets.length > 1 ? t('modal.subSheets', { count: liveSheets.length }) : ''}
              {t('modal.subBody')}
            </Txt>
          </Box>
          <Btn type="button" className="obrw-x" onClick={onClose} aria-label={t('modal.closeAria')}>
            <X size={18} strokeWidth={1.8} aria-hidden="true" />
          </Btn>
        </Box>

        <Box className="obrw-body">
          {liveSheets.length > 0 ? (
            <>
              <Btn type="button" className="ob-btn ghost" onClick={() => setShowRecognition(true)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, margin: '0 auto 12px' }}>
                <Sparkles size={14} strokeWidth={1.8} aria-hidden="true" /> {t('modal.reopenRecognize')}
              </Btn>
              <UnifiedSheetImporter sheets={parsed.sheets} onChange={onSheetsChange} />
            </>
          ) : (
            /* Two very different situations wore the same sentence. "We found
               nothing in your file" is right for an empty file — and wrong,
               and quietly accusing, right after someone taps the little × on
               a sheet card and empties the import themselves. Removal only
               sets `removed`, so the way back is still sitting in the array. */
            <Box className="obrw-empty">
              <Txt as="p" className="obrw-loading-txt">
                {removedAny ? t('modal.allRemoved') : t('modal.noData')}
              </Txt>
              {removedAny && (
                <Btn type="button" className="ob-btn ghost" onClick={restoreSheets}>
                  <RotateCcw size={14} strokeWidth={1.8} aria-hidden="true" /> {t('modal.restoreSheets')}
                </Btn>
              )}
            </Box>
          )}
          {truncated && (
            <Txt as="p" className="obrw-warn" style={{ marginTop: 10 }}>
              <AlertTriangle size={12} strokeWidth={2} aria-hidden="true" />
              {t('modal.truncated')}
            </Txt>
          )}
        </Box>

        <Box as="footer" className="obrw-foot">
          {/* With no live sheet there is nothing to type or map, so asking for
              it read as an instruction the screen gave no way to follow. */}
          <Txt as="p" className="obrw-summary">
            {reviewObj ? t('modal.ready') : liveSheets.length === 0 ? t('modal.nothingToImport') : t('modal.notReady')}
          </Txt>
          <Box className="obrw-actions">
            <Btn type="button" className="ob-btn ghost" onClick={onClose}>{t('common.cancel')}</Btn>
            <Btn type="button" className="ob-btn primary" disabled={!reviewObj || yearMissing}
              onClick={goToReview}>
              {yearMissing ? t('modal.pickYear') : t('modal.toReview')}
            </Btn>
          </Box>
        </Box>
      </Box>
    </Box>
  )
}
