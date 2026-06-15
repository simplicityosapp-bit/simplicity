import { useSearchParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext'
import { PRIVACY_BLOCKS, PRIVACY_META, TERMS_BLOCKS, TERMS_META, DPA_BLOCKS, DPA_META } from './legalContent'
import './LegalModal.css' // reuse the legal-document typography (.legal-h / .legal-h2 / .legal-p / .legal-meta)
import './LegalPage.css'

/* ════════════════════════════════════════════════════════════════
   LEGAL PAGE — public, full-viewport legal documents (no app shell).
   Reachable without login at /legal (+ /privacy and /terms redirect
   here). Two tabs — privacy policy + terms of service — driven by the
   ?tab= query param so the redirect links land on the right document.
   Onboarding background under a glass sheet; "חזור לאפליקציה" shows
   only when a session exists.
   ════════════════════════════════════════════════════════════════ */
const TABS = [
  { key: 'privacy', label: 'מדיניות פרטיות', blocks: PRIVACY_BLOCKS, meta: PRIVACY_META },
  { key: 'terms',   label: 'תנאי שימוש',     blocks: TERMS_BLOCKS,   meta: TERMS_META },
  { key: 'dpa',     label: 'עיבוד נתונים',   blocks: DPA_BLOCKS,     meta: DPA_META },
]

function renderBlocks(blocks) {
  return blocks.map((b, i) => {
    if (b.h) return <h3 key={i} className="legal-h">{b.h}</h3>
    if (b.h2) return <h4 key={i} className="legal-h2">{b.h2}</h4>
    return <p key={i} className="legal-p">{b.t}</p>
  })
}

export default function LegalPage() {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const { session } = useAuth()
  const requested = params.get('tab')
  const active = TABS.some((t) => t.key === requested) ? requested : 'privacy'
  const tab = TABS.find((t) => t.key === active) || TABS[0]

  return (
    <div className="legal-page" dir="rtl">
      <div className="legal-page-sheet">
        <header className="legal-page-head">
          <div className="legal-page-brand">
            {/* Theme-aware: dark mark on the light sheet, light mark on the dark sheet. */}
            <img src="/logo-dark.png" className="legal-page-logo legal-page-logo-day" alt="" aria-hidden="true" />
            <img src="/logo-light.png" className="legal-page-logo legal-page-logo-night" alt="" aria-hidden="true" />
            <span className="legal-page-name">סימפליסיטי</span>
          </div>
          <nav className="legal-page-tabs" role="tablist" aria-label="מסמכים משפטיים">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                role="tab"
                id={`legal-tab-${t.key}`}
                aria-controls="legal-tabpanel"
                aria-selected={t.key === active}
                className={`legal-page-tab${t.key === active ? ' on' : ''}`}
                onClick={() => setParams({ tab: t.key }, { replace: true })}
              >
                {t.label}
              </button>
            ))}
          </nav>
        </header>

        <div className="legal-page-body" role="tabpanel" id="legal-tabpanel" aria-labelledby={`legal-tab-${active}`} tabIndex={0}>
          {tab.meta && <p className="legal-meta">{tab.meta}</p>}
          {renderBlocks(tab.blocks)}
        </div>

        {session && (
          <footer className="legal-page-foot">
            <button type="button" className="legal-page-back" onClick={() => navigate('/')}>
              חזור לאפליקציה
            </button>
          </footer>
        )}
      </div>
    </div>
  )
}
