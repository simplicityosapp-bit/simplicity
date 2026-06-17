import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  HelpCircle, X, LayoutGrid, Lightbulb, MessageCircleQuestion,
  ChevronDown, BookOpen,
} from 'lucide-react'
import { HELP_SCREENS } from '../lib/helpContent'
import { ROUTES } from '../lib/routes'
import { useT } from '../i18n/useT'
import MG from './MG'
import './HelpFab.css'

/* ── Help FAB + bottom-sheet ──────────────────────────────────────
   A floating "?" button rendered once inside AppShell. It owns its own
   open/close state, so wiring it up is a single line. `screenKey` is the
   current screen (from screenKeyFromPath) — it selects which help entry
   to show. Falls back to the home entry for any unmapped screen. */

const TABS = [
  { key: 'features', labelKey: 'help.tabs.features', icon: LayoutGrid },
  { key: 'tips',     labelKey: 'help.tabs.tips',     icon: Lightbulb },
  { key: 'faq',      labelKey: 'help.tabs.faq',      icon: MessageCircleQuestion },
]

export default function HelpFab({ screenKey }) {
  const { t } = useT('components')
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const help = HELP_SCREENS[screenKey] || HELP_SCREENS.home

  /* Close on Escape while open. */
  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <>
      <button
        type="button"
        className="help-fab"
        onClick={() => setOpen(true)}
        aria-label={t('help.fabAria', { title: help.title })}
      >
        <HelpCircle size={22} strokeWidth={1.7} aria-hidden="true" />
      </button>

      <div
        className={`help-overlay${open ? ' open' : ''}`}
        onClick={() => setOpen(false)}
        aria-hidden="true"
      />

      <HelpSheet
        open={open}
        help={help}
        onClose={() => setOpen(false)}
        onOpenGuide={() => {
          setOpen(false)
          navigate(ROUTES.SETTINGS, { state: { openSection: 'about', aboutTab: 'guide' } })
        }}
      />
    </>
  )
}

function HelpSheet({ open, help, onClose, onOpenGuide }) {
  const { t } = useT('components')
  const [tab, setTab] = useState('features')

  /* Reset to the first tab each time the sheet re-opens (or the screen,
     hence the help entry, changes underneath it). */
  useEffect(() => {
    if (open) setTab('features')
  }, [open, help])

  const counts = {
    features: help.features?.length || 0,
    tips: help.tips?.length || 0,
    faq: help.faq?.length || 0,
  }

  return (
    <aside
      className={`help-sheet${open ? ' open' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label={t('help.fabAria', { title: help.title })}
      aria-hidden={!open}
    >
      <div className="help-grab" aria-hidden="true" />

      <div className="help-head">
        <div className="help-head-titles">
          <p className="help-head-eyebrow">
            <HelpCircle size={13} strokeWidth={1.8} aria-hidden="true" />
            {t('help.eyebrow')}
          </p>
          <h2 className="help-head-title"><MG text={help.title} /></h2>
          {help.intro && <p className="help-head-intro"><MG text={help.intro} /></p>}
        </div>
        <button type="button" className="help-close" onClick={onClose} aria-label={t('help.close')}>
          <X size={16} strokeWidth={1.6} aria-hidden="true" />
        </button>
      </div>

      <div className="help-tabs" role="tablist" aria-label={t('help.tabsAria')}>
        {TABS.map((tabDef) => {
          const Icon = tabDef.icon
          return (
            <button
              key={tabDef.key}
              type="button"
              role="tab"
              aria-selected={tab === tabDef.key}
              className={`help-tab${tab === tabDef.key ? ' on' : ''}`}
              onClick={() => setTab(tabDef.key)}
            >
              <Icon size={14} strokeWidth={1.7} aria-hidden="true" />
              {t(tabDef.labelKey)}
              {counts[tabDef.key] > 0 && <span className="help-tab-count">{counts[tabDef.key]}</span>}
            </button>
          )
        })}
      </div>

      <div className="help-body" role="tabpanel">
        {tab === 'features' && <FeaturesTab features={help.features} />}
        {tab === 'tips' && <TipsTab tips={help.tips} />}
        {tab === 'faq' && <FaqTab faq={help.faq} />}
      </div>

      <div className="help-foot">
        <button type="button" className="help-foot-link" onClick={onOpenGuide}>
          <BookOpen size={14} strokeWidth={1.7} aria-hidden="true" />
          {t('help.fullGuide')}
        </button>
      </div>
    </aside>
  )
}

function FeaturesTab({ features }) {
  const { t } = useT('components')
  if (!features?.length) return <p className="help-empty">{t('help.emptyFeatures')}</p>
  return (
    <div>
      {features.map((f, i) => (
        <details key={i} className="help-feature" open={i === 0}>
          <summary>
            <MG text={f.title} />
            <ChevronDown size={16} strokeWidth={1.7} className="help-feature-chev" aria-hidden="true" />
          </summary>
          <p className="help-feature-body"><MG text={f.body} /></p>
        </details>
      ))}
    </div>
  )
}

function TipsTab({ tips }) {
  const { t } = useT('components')
  if (!tips?.length) return <p className="help-empty">{t('help.emptyTips')}</p>
  return (
    <ul className="help-tips">
      {tips.map((tip, i) => (
        <li key={i} className="help-tip">
          <span className="help-tip-icon">
            <Lightbulb size={15} strokeWidth={1.7} aria-hidden="true" />
          </span>
          <MG text={tip} />
        </li>
      ))}
    </ul>
  )
}

function FaqTab({ faq }) {
  const { t } = useT('components')
  if (!faq?.length) return <p className="help-empty">{t('help.emptyFaq')}</p>
  return (
    <div>
      {faq.map((item, i) => (
        <details key={i} className="help-faq">
          <summary>
            <MessageCircleQuestion size={15} strokeWidth={1.7} className="help-faq-q-icon" aria-hidden="true" />
            <MG text={item.q} />
            <ChevronDown size={16} strokeWidth={1.7} className="help-faq-chev" aria-hidden="true" />
          </summary>
          <p className="help-faq-a"><MG text={item.a} /></p>
        </details>
      ))}
    </div>
  )
}
