import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  HelpCircle, X, LayoutGrid, Lightbulb, MessageCircleQuestion,
  ChevronDown, BookOpen,
} from 'lucide-react'
import { getHelpScreen } from '../lib/helpContent'
import { ROUTES } from '../lib/routes'
import { useT } from '../i18n/useT'
import MG from './MG'
import './HelpFab.css'
import { Box, Txt, Btn } from './ui'

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

/* Screens that deliberately show no help sheet — the "?" FAB is hidden for
   them entirely (e.g. subscription: a short, self-explanatory plan screen
   where generic help would just be noise). */
const NO_HELP_SCREENS = new Set(['subscription'])

/* Finds the current screen's header card so the "?" button can be portaled
   INTO it (and thus scroll with it) instead of floating over the viewport.
   The screen mounts async (lazy routes), so we poll a few frames until the
   header appears, then settle on 'found' or 'none' (e.g. home has no header).
   Returning a status — not just the node — lets the caller render nothing
   while searching, avoiding a flash of the fallback position on navigation. */
function useHeaderAnchor(pathname, screenKey) {
  const [state, setState] = useState({ status: 'searching', node: null })
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- reset the anchor state on route/screen change, then poll the DOM for the header node. */
    if (screenKey === 'home') { setState({ status: 'none', node: null }); return undefined }
    setState({ status: 'searching', node: null })
    /* eslint-enable react-hooks/set-state-in-effect */
    let raf
    let tries = 0
    const find = () => {
      const el = document.querySelector('.screen-head, .moon-head')
      if (el) { setState({ status: 'found', node: el }); return }
      if (tries++ > 90) { setState({ status: 'none', node: null }); return }
      raf = requestAnimationFrame(find)
    }
    find()
    return () => { if (raf) cancelAnimationFrame(raf) }
  }, [pathname, screenKey])
  return state
}

export default function HelpFab({ screenKey }) {
  const { t } = useT('components')
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()
  const skip = NO_HELP_SCREENS.has(screenKey)
  const help = skip ? null : (getHelpScreen(screenKey) || getHelpScreen('home'))
  const { status, node } = useHeaderAnchor(location.pathname, screenKey)

  /* Close on Escape while open. */
  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  /* Screens in NO_HELP_SCREENS render no FAB at all. Placed after every hook
     so the rules of hooks hold. */
  if (skip) return null

  const fab = (
    <Btn
      type="button"
      className={`help-fab${status === 'found' ? ' in-header' : ''}`}
      onClick={() => setOpen(true)}
      aria-label={t('help.fabAria', { title: help.title })}
    >
      <HelpCircle size={20} strokeWidth={1.7} aria-hidden="true" />
    </Btn>
  )

  return (
    <>
      {/* In the header card (portaled there so it scrolls with the card) when
          one exists; otherwise the fallback corner (e.g. home). Render nothing
          while still locating the header, to avoid a position flash. The
          isConnected guard skips a node detached mid-navigation. */}
      {status === 'found' && node && node.isConnected
        ? createPortal(fab, node)
        : status === 'none' ? fab : null}

      <Box
        className={`help-overlay${open ? ' open' : ''}`}
        onClick={() => setOpen(false)}
        aria-hidden="true"
      />

      <HelpSheet
        key={screenKey || 'home'}
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

  const counts = {
    features: help.features?.length || 0,
    tips: help.tips?.length || 0,
    faq: help.faq?.length || 0,
  }

  return (
    <Box as="aside"
      className={`help-sheet${open ? ' open' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label={t('help.fabAria', { title: help.title })}
      aria-hidden={!open}
    >
      <Box className="help-grab" aria-hidden="true" />

      <Box className="help-head">
        <Box className="help-head-titles">
          <Txt as="p" className="help-head-eyebrow">
            <HelpCircle size={13} strokeWidth={1.8} aria-hidden="true" />
            {t('help.eyebrow')}
          </Txt>
          <Txt as="h2" className="help-head-title"><MG text={help.title} /></Txt>
          {help.intro && <Txt as="p" className="help-head-intro"><MG text={help.intro} /></Txt>}
        </Box>
        <Btn type="button" className="help-close" onClick={onClose} aria-label={t('help.close')}>
          <X size={16} strokeWidth={1.6} aria-hidden="true" />
        </Btn>
      </Box>

      <Box className="help-tabs" role="tablist" aria-label={t('help.tabsAria')}>
        {TABS.map((tabDef) => {
          const Icon = tabDef.icon
          return (
            <Btn
              key={tabDef.key}
              type="button"
              role="tab"
              aria-selected={tab === tabDef.key}
              className={`help-tab${tab === tabDef.key ? ' on' : ''}`}
              onClick={() => setTab(tabDef.key)}
            >
              <Icon size={14} strokeWidth={1.7} aria-hidden="true" />
              {t(tabDef.labelKey)}
              {counts[tabDef.key] > 0 && <Txt className="help-tab-count">{counts[tabDef.key]}</Txt>}
            </Btn>
          )
        })}
      </Box>

      <Box className="help-body" role="tabpanel">
        {tab === 'features' && <FeaturesTab features={help.features} />}
        {tab === 'tips' && <TipsTab tips={help.tips} />}
        {tab === 'faq' && <FaqTab faq={help.faq} />}
      </Box>

      <Box className="help-foot">
        <Btn type="button" className="help-foot-link" onClick={onOpenGuide}>
          <BookOpen size={14} strokeWidth={1.7} aria-hidden="true" />
          {t('help.fullGuide')}
        </Btn>
      </Box>
    </Box>
  )
}

function FeaturesTab({ features }) {
  const { t } = useT('components')
  if (!features?.length) return <Txt as="p" className="help-empty">{t('help.emptyFeatures')}</Txt>
  return (
    <Box>
      {features.map((f, i) => (
        <Box as="details" key={i} className="help-feature" open={i === 0}>
          <Txt as="summary">
            <MG text={f.title} />
            <ChevronDown size={16} strokeWidth={1.7} className="help-feature-chev" aria-hidden="true" />
          </Txt>
          <Txt as="p" className="help-feature-body"><MG text={f.body} /></Txt>
        </Box>
      ))}
    </Box>
  )
}

function TipsTab({ tips }) {
  const { t } = useT('components')
  if (!tips?.length) return <Txt as="p" className="help-empty">{t('help.emptyTips')}</Txt>
  return (
    <Box as="ul" className="help-tips">
      {tips.map((tip, i) => (
        <Box as="li" key={i} className="help-tip">
          <Txt className="help-tip-icon">
            <Lightbulb size={15} strokeWidth={1.7} aria-hidden="true" />
          </Txt>
          <MG text={tip} />
        </Box>
      ))}
    </Box>
  )
}

function FaqTab({ faq }) {
  const { t } = useT('components')
  if (!faq?.length) return <Txt as="p" className="help-empty">{t('help.emptyFaq')}</Txt>
  return (
    <Box>
      {faq.map((item, i) => (
        <Box as="details" key={i} className="help-faq">
          <Txt as="summary">
            <MessageCircleQuestion size={15} strokeWidth={1.7} className="help-faq-q-icon" aria-hidden="true" />
            <MG text={item.q} />
            <ChevronDown size={16} strokeWidth={1.7} className="help-faq-chev" aria-hidden="true" />
          </Txt>
          <Txt as="p" className="help-faq-a"><MG text={item.a} /></Txt>
        </Box>
      ))}
    </Box>
  )
}
