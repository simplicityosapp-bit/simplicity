import { useSearchParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext'
import { getLegal, LEGAL_LANGS } from './legalI18n'
import './LegalModal.css' // reuse the legal-document typography (.legal-h / .legal-h2 / .legal-p / .legal-meta)
import './LegalPage.css'
import { Box, Txt, Btn } from '../ui'

/* ════════════════════════════════════════════════════════════════
   LEGAL PAGE — public, full-viewport legal documents (no app shell).
   Reachable without login at /legal (+ /privacy and /terms redirect
   here). Three tabs — privacy · terms · DPA — driven by ?tab=, and a
   language switcher (he/en/es/fr) driven by ?lang= (default Hebrew).
   Text direction follows the language (RTL for Hebrew, LTR otherwise).
   Onboarding background under a glass sheet; "back to app" shows only
   when a session exists.
   ════════════════════════════════════════════════════════════════ */
function renderBlocks(blocks) {
  return blocks.map((b, i) => {
    if (b.h) return <Txt as="h3" key={i} className="legal-h">{b.h}</Txt>
    if (b.h2) return <Txt as="h4" key={i} className="legal-h2">{b.h2}</Txt>
    return <Txt as="p" key={i} className="legal-p">{b.t}</Txt>
  })
}

export default function LegalPage() {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const { session } = useAuth()

  const requestedLang = params.get('lang')
  const lang = LEGAL_LANGS.some((l) => l.code === requestedLang) ? requestedLang : 'he'
  const { dir, brand, backLabel, docsAria, langAria, tabs } = getLegal(lang)

  const requested = params.get('tab')
  const active = tabs.some((t) => t.key === requested) ? requested : 'privacy'
  const tab = tabs.find((t) => t.key === active) || tabs[0]

  const setParam = (patch) => setParams((prev) => {
    const next = new URLSearchParams(prev)
    Object.entries(patch).forEach(([k, v]) => next.set(k, v))
    return next
  }, { replace: true })

  return (
    <Box className="legal-page" dir={dir}>
      <Box className="legal-page-sheet">
        <Box as="header" className="legal-page-head">
          <Box className="legal-page-brand">
            {/* Theme-aware: dark mark on the light sheet, light mark on the dark sheet. */}
            <img src="/logo-dark.png" className="legal-page-logo legal-page-logo-day" alt="" aria-hidden="true" />
            <img src="/logo-light.png" className="legal-page-logo legal-page-logo-night" alt="" aria-hidden="true" />
            <Txt className="legal-page-name">{brand}</Txt>
            <Box className="legal-page-langs" role="group" aria-label={langAria}>
              {LEGAL_LANGS.map((l) => (
                <Btn
                  key={l.code}
                  type="button"
                  lang={l.code}
                  aria-pressed={l.code === lang}
                  className={`legal-page-lang${l.code === lang ? ' on' : ''}`}
                  onClick={() => setParam({ lang: l.code })}
                >
                  {l.name}
                </Btn>
              ))}
            </Box>
          </Box>
          <Box as="nav" className="legal-page-tabs" role="tablist" aria-label={docsAria}>
            {tabs.map((t) => (
              <Btn
                key={t.key}
                type="button"
                role="tab"
                id={`legal-tab-${t.key}`}
                aria-controls="legal-tabpanel"
                aria-selected={t.key === active}
                className={`legal-page-tab${t.key === active ? ' on' : ''}`}
                onClick={() => setParam({ tab: t.key })}
              >
                {t.label}
              </Btn>
            ))}
          </Box>
        </Box>

        <Box className="legal-page-body" role="tabpanel" id="legal-tabpanel" aria-labelledby={`legal-tab-${active}`} tabIndex={0}>
          {tab.meta && <Txt as="p" className="legal-meta">{tab.meta}</Txt>}
          {renderBlocks(tab.blocks)}
        </Box>

        {session && (
          <Box as="footer" className="legal-page-foot">
            <Btn type="button" className="legal-page-back" onClick={() => navigate('/')}>
              {backLabel}
            </Btn>
          </Box>
        )}
      </Box>
    </Box>
  )
}
