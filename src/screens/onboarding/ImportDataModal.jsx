import { useState, useRef } from 'react'
import { X, AlertTriangle } from 'lucide-react'
import UnifiedSheetImporter from './UnifiedSheetImporter'
import OnboardingReviewWizard from './OnboardingReviewWizard'
import { finalizeOnboardingImport } from '../../lib/onboardingImport'
import { buildReviewFromSheets } from '../../lib/importFlow'
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

export default function ImportDataModal({ parsed: initialParsed, gender = 'neutral', onClose, onImported }) {
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
    <div className="obrw-back" role="dialog" aria-modal="true" aria-label="ייבוא מקובץ">
      <div className="obrw-panel">
        <header className="obrw-head">
          <div>
            <p className="obrw-title">ייבוא מקובץ</p>
            <p className="obrw-sub">
              {parsed?.file_name ? <><strong>{parsed.file_name}</strong> · </> : null}
              {liveSheets.length > 1 ? `${liveSheets.length} טבלאות. ` : ''}
              בחרו לכל טבלה מה יש בה והתאימו עמודות — ואז נעבור לסקירה לפני שמשהו נשמר.
            </p>
          </div>
          <button type="button" className="obrw-x" onClick={onClose} aria-label="סגירה">
            <X size={18} strokeWidth={1.8} aria-hidden="true" />
          </button>
        </header>

        <div className="obrw-body">
          {liveSheets.length > 0 ? (
            <UnifiedSheetImporter sheets={parsed.sheets} onChange={onSheetsChange} gender={gender} />
          ) : (
            <p className="obrw-loading-txt" style={{ textAlign: 'center', padding: '32px 0' }}>
              לא זוהו נתונים בקובץ — אפשר לוודא שהקובץ אינו ריק ושנשמר כ-CSV או Excel.
            </p>
          )}
          {truncated && (
            <p className="obrw-warn" style={{ marginTop: 10 }}>
              <AlertTriangle size={12} strokeWidth={2} aria-hidden="true" />
              חלק מהטבלאות נקטעו לשורות הראשונות כדי לשמור על ביצועים. אפשר לייבא את השאר בקובץ נפרד בהמשך.
            </p>
          )}
        </div>

        <footer className="obrw-foot">
          <p className="obrw-summary">
            {reviewObj ? 'מוכן לסקירה לפני יצירה.' : 'בחרו לכל טבלה מה יש בה ומפו את עמודות השם / הסכום.'}
          </p>
          <div className="obrw-actions">
            <button type="button" className="ob-btn ghost" onClick={onClose}>ביטול</button>
            <button type="button" className="ob-btn primary" disabled={!reviewObj || yearMissing}
              onClick={() => { setReview(reviewObj); setPhase('review') }}>
              {yearMissing ? 'בחרו שנה לכל טבלת חודשים' : 'המשך לסקירה'}
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}
