import { useState, useRef } from 'react'
import { X, AlertTriangle } from 'lucide-react'
import UnifiedSheetImporter from './UnifiedSheetImporter'
import OnboardingReviewWizard from './OnboardingReviewWizard'
import { finalizeOnboardingImport } from '../../lib/onboardingImport'
import { buildReviewFromSheets } from '../../lib/importFlow'
import { useT } from '../../i18n/useT'
import './OnboardingScreen.css'        /* ob-* primitives (btn / map / input) */
import './OnboardingReviewWizard.css'  /* obrw-* modal shell */

/* ════════════════════════════════════════════════════════════════
   IN-APP IMPORT MODAL — Settings → data. Now the SAME engine as
   onboarding: one editable card per sheet (entity type + column
   mapping + matrix), then the shared review wizard. So a returning
   user gets multi-sheet, matrix (months-as-columns), leads & sessions
   — exactly what onboarding offers — instead of a single flat sheet.
   Reuses UnifiedSheetImporter + buildReviewFromSheets + finalizeOnboardingImport.
   ════════════════════════════════════════════════════════════════ */

export default function ImportDataModal({ parsed: initialParsed, onClose, onImported }) {
  const { t } = useT('onboarding')
  const [parsed, setParsed] = useState(initialParsed) /* { kind:'csv', file_name, sheets } */
  const [phase, setPhase] = useState('map') /* 'map' | 'review' */
  const [review, setReview] = useState(null)
  const summaryRef = useRef(null)

  const liveSheets = (parsed?.sheets || []).filter((s) => !s.removed)
  const reviewObj = buildReviewFromSheets(parsed)
  const yearMissing = liveSheets.some((s) => s.type === 'matrix' && (s.pivot?.periodCols || []).some((c) => c.month) && !s.pivot?.year)
  const truncated = liveSheets.some((s) => s.truncated)

  const onSheetsChange = (nextSheets) => setParsed((p) => ({ ...p, sheets: nextSheets }))

  const handleConfirm = async (payload) => {
    const summary = await finalizeOnboardingImport(payload)
    summaryRef.current = summary
    return summary
  }
  const handleComplete = () => {
    onImported?.(summaryRef.current)
    onClose()
  }

  if (phase === 'review') {
    return (
      <OnboardingReviewWizard
        parsed={review}
        onConfirm={handleConfirm}
        onComplete={handleComplete}
        onCancel={() => setPhase('map')}
      />
    )
  }

  /* ── Mapping phase ── */
  return (
    <div className="obrw-back" role="dialog" aria-modal="true" aria-label={t('modal.dialogAria')}>
      <div className="obrw-panel">
        <header className="obrw-head">
          <div>
            <p className="obrw-title">{t('modal.title')}</p>
            <p className="obrw-sub">
              {parsed?.file_name ? <><strong>{parsed.file_name}</strong> · </> : null}
              {liveSheets.length > 1 ? t('modal.subSheets', { count: liveSheets.length }) : ''}
              {t('modal.subBody')}
            </p>
          </div>
          <button type="button" className="obrw-x" onClick={onClose} aria-label={t('modal.closeAria')}>
            <X size={18} strokeWidth={1.8} aria-hidden="true" />
          </button>
        </header>

        <div className="obrw-body">
          {liveSheets.length > 0 ? (
            <UnifiedSheetImporter sheets={parsed.sheets} onChange={onSheetsChange} />
          ) : (
            <p className="obrw-loading-txt" style={{ textAlign: 'center', padding: '32px 0' }}>
              {t('modal.noData')}
            </p>
          )}
          {truncated && (
            <p className="obrw-warn" style={{ marginTop: 10 }}>
              <AlertTriangle size={12} strokeWidth={2} aria-hidden="true" />
              {t('modal.truncated')}
            </p>
          )}
        </div>

        <footer className="obrw-foot">
          <p className="obrw-summary">
            {reviewObj ? t('modal.ready') : t('modal.notReady')}
          </p>
          <div className="obrw-actions">
            <button type="button" className="ob-btn ghost" onClick={onClose}>{t('common.cancel')}</button>
            <button type="button" className="ob-btn primary" disabled={!reviewObj || yearMissing}
              onClick={() => { setReview(reviewObj); setPhase('review') }}>
              {yearMissing ? t('modal.pickYear') : t('modal.toReview')}
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}
