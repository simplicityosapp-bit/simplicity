import { useRef, useState } from 'react'
import { X } from 'lucide-react'
import CsvMappingEditor from './CsvMappingEditor'
import OnboardingReviewWizard from './OnboardingReviewWizard'
import { finalizeOnboardingImport } from '../../lib/onboardingImport'
import './OnboardingScreen.css'        /* ob-* primitives (btn / map / input) */
import './OnboardingReviewWizard.css'  /* obrw-* modal shell */

/* ════════════════════════════════════════════════════════════════
   IN-APP IMPORT MODAL — Settings → data. Same engine as onboarding,
   but standalone: no wizard steps, so column mapping happens in ONE
   full-mapping screen (every column, every field), then the shared
   review wizard. On success it hands the summary back so the caller
   can refresh + confirm. Reuses csvImport + finalizeOnboardingImport.
   ════════════════════════════════════════════════════════════════ */

export default function ImportDataModal({ parsed: initialParsed, onClose, onImported }) {
  const [parsed, setParsed] = useState(initialParsed)
  const [phase, setPhase] = useState('map') /* 'map' | 'review' */
  const summaryRef = useRef(null)

  const counts = {
    clients: parsed?.clients?.length || 0,
    projects: parsed?.projects?.length || 0,
    transactions: parsed?.transactions?.length || 0,
  }
  const total = counts.clients + counts.projects + counts.transactions
  const hasRows = Array.isArray(parsed?.rows) && parsed.rows.length > 0

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
        parsed={parsed}
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
            <p className="obrw-title">ייבוא מקובץ CSV</p>
            <p className="obrw-sub">
              {parsed?.file_name ? <><strong>{parsed.file_name}</strong> · </> : null}
              התאימו את העמודות לשדות במערכת, ואז נעבור לסקירה לפני יצירה.
            </p>
          </div>
          <button type="button" className="obrw-x" onClick={onClose} aria-label="סגירה">
            <X size={18} strokeWidth={1.8} aria-hidden="true" />
          </button>
        </header>

        <div className="obrw-body">
          {hasRows ? (
            <CsvMappingEditor parsed={parsed} onChange={setParsed} stepKey="all" title="התאמת עמודות → שדות" />
          ) : (
            <p className="obrw-loading-txt" style={{ textAlign: 'center', padding: '32px 0' }}>
              לא זוהו שורות בקובץ — ודא/י שהקובץ אינו ריק ושנשמר כ-CSV.
            </p>
          )}
        </div>

        <footer className="obrw-foot">
          <p className="obrw-summary">
            זוהו: <strong>{counts.clients}</strong> לקוחות · <strong>{counts.projects}</strong> פרויקטים · <strong>{counts.transactions}</strong> תנועות
          </p>
          <div className="obrw-actions">
            <button type="button" className="ob-btn ghost" onClick={onClose}>ביטול</button>
            <button type="button" className="ob-btn primary" onClick={() => setPhase('review')} disabled={total === 0}>
              המשך לסקירה
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}
