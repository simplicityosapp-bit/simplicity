import { useRef, useState } from 'react'
import { X, Pencil, EyeOff, Check } from 'lucide-react'
import { useUserPreferences } from '../../hooks/useUserPreferences'
import { useClients } from '../../hooks/useClients'
import { useHomeEdit } from '../../hooks/useHomeEdit'
import { visibleWidgets, hiddenWidgets } from '../../lib/preferences'
import HomeWelcome from '../../components/HomeWelcome'
import QuoteWidget from './widgets/QuoteWidget'
import MoonWidget from './widgets/MoonWidget'
import InsightsWidget from './widgets/InsightsWidget'
import QuickRow from './widgets/QuickRow'
import AttentionWidget from './widgets/AttentionWidget'
import NextTasksWidget from './widgets/NextTasksWidget'
import ChipsWidget from './widgets/ChipsWidget'
import FeedbackCard from '../../components/FeedbackCard'
import BetaExpiryBanner from '../../components/BetaExpiryBanner'
import HomeGenerators from './HomeGenerators'
import HiddenWidgetsModal from './HiddenWidgetsModal'
import { useT } from '../../i18n/useT'
import './HomeScreen.css'
import { Box, Txt, Btn } from '../../components/ui'

/* The quote and the moon chip always render in the fixed top row, whatever
   order the list is in — so they are not reorderable. Letting them be dragged
   (or dragged onto) would rewrite the list and change nothing on screen, which
   reads as the drag being broken. ✕ still hides them.
   Module scope, so the array identity is stable across renders. */
const PINNED_WIDGETS = ['quote', 'moon']

const WIDGET_COMPONENTS = {
  'quote':            QuoteWidget,
  'moon':             MoonWidget,
  'insights':         InsightsWidget,
  'quick-row':        QuickRow,
  'attention':        AttentionWidget,
  'next-tasks':       NextTasksWidget,
  'chips':            ChipsWidget,
}

/* Home dashboard. The moon chip and the quote share a fixed top row — the
   chip at the start side, the quote filling the rest. Everything else follows
   the user's order: a vertical stack on mobile, a four-column grid on desktop
   (see HomeScreen.css).

   Arranging happens HERE, on the screen being arranged: press and hold any
   widget to enter edit mode, drag to reorder, ✕ to hide. It used to mean a
   trip to Settings → widgets and a list of controls describing a screen you
   could not see at the time. See useHomeEdit for the gesture handling. */
export default function HomeScreen({ onOpenFeedback }) {
  const { t } = useT('home')
  const { prefs, update: updatePrefs } = useUserPreferences()
  const { clients, loading: clientsLoading } = useClients()
  const stackRef = useRef(null)
  const [showHidden, setShowHidden] = useState(false)

  const widgetsCfg = prefs?.widgets || { global: {}, list: [] }
  const globalDensity = widgetsCfg.global?.density || 'comfortable'
  const cardStyle    = widgetsCfg.global?.cardStyle    || 'frosted'
  const textStrength = widgetsCfg.global?.textStrength || 'normal'
  const list = widgetsCfg.list || []

  const edit = useHomeEdit({
    list,
    stackRef,
    pinnedIds: PINNED_WIDGETS,
    onChange: (next) => updatePrefs({ widgets: { list: next } }),
  })

  const showWelcome = !clientsLoading && (clients?.length || 0) === 0 && !prefs?.homeWelcomeDismissed
  /* Read through the hook: mid-drag this is the local draft, so the order
     follows the finger without a database write per pointermove. */
  const shown  = visibleWidgets(edit.list)
  const hidden = hiddenWidgets(edit.list)
  const quoteCfg = shown.find((w) => w.id === 'quote')
  const moonCfg  = shown.find((w) => w.id === 'moon')
  const restList = shown.filter((w) => w.id !== 'quote' && w.id !== 'moon')

  /* Build a `<div class="home-widget">` wrapper around the widget body.
     Rendered both inline (default stack) and inside the special top row
     (quote + moon side-by-side). In edit mode it also carries the drag
     handlers, the ✕, and a transparent shield so the widget's own controls
     can't fire while the layout is being rearranged. */
  const renderWidget = (w) => {
    const Comp = WIDGET_COMPONENTS[w.id]
    if (!Comp) return null
    const density = w.density || globalDensity
    const dragging = edit.draggingId === w.id
    const pinned = edit.isPinned(w.id)
    /* --widget-accent is resolved in CSS from data-accent (HomeScreen.css), so
       it can remap per theme — a light-mode hex no longer leaks into dark. */
    return (
      <Box
        key={w.id}
        className={`home-widget${edit.editing ? ' is-editing' : ''}${dragging ? ' is-dragging' : ''}${edit.editing && pinned ? ' is-pinned' : ''}`}
        data-widget-id={w.id}
        /* Read by useHomeEdit to exclude these from drop targeting. */
        data-pinned={pinned ? '' : undefined}
        data-density={density}
        data-accent={w.accent}
        {...edit.widgetProps(w.id)}
      >
        <Comp />
        {edit.editing && (
          <>
            <Box className="home-widget-shield" aria-hidden="true" />
            <Btn
              type="button"
              className="home-widget-hide"
              aria-label={t('edit.hideWidget', { name: t(`edit.names.${w.id}`) })}
              title={t('edit.hideWidget', { name: t(`edit.names.${w.id}`) })}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); edit.hide(w.id) }}
            >
              <X size={13} strokeWidth={2.4} aria-hidden="true" />
            </Btn>
          </>
        )}
      </Box>
    )
  }

  return (
    <Box
      className={`screen home-screen${edit.editing ? ' is-editing' : ''}`}
      data-card-style={cardStyle}
      data-text-strength={textStrength}
      data-density={globalDensity}
    >
      {/* Renders nothing — hosts the materialisation engines so they run
          whatever the user's widget configuration is. */}
      <HomeGenerators />
      <Box className="home-stack" ref={stackRef} onClickCapture={edit.onClickCapture}>
        {showWelcome && <HomeWelcome onDismiss={() => updatePrefs({ homeWelcomeDismissed: true })} />}
        <BetaExpiryBanner />
        {(quoteCfg || moonCfg) && (
          <Box className="home-row-top">
            {moonCfg  && renderWidget(moonCfg)}
            {quoteCfg && renderWidget(quoteCfg)}
          </Box>
        )}
        {restList.map((w) => renderWidget(w))}
        <FeedbackCard onOpenFeedback={onOpenFeedback} />
        {/* Deliberately the quietest thing on the screen — a text button at
            the very end, not a floating control competing with the widgets.
            The long-press gesture is the primary way in; this is the
            discoverable one. */}
        {!edit.editing && (
          <Btn type="button" className="home-edit-enter" onClick={edit.enter}>
            <Pencil size={13} strokeWidth={1.8} aria-hidden="true" />
            {t('edit.enter')}
          </Btn>
        )}
      </Box>

      {/* Edit bar — only while arranging. */}
      {edit.editing && (
        <Box className="home-edit-bar" role="toolbar" aria-label={t('edit.barLabel')}>
          <Txt className="home-edit-hint">{t('edit.hint')}</Txt>
          <Btn type="button" className="home-edit-hidden-btn" onClick={() => setShowHidden(true)}>
            <EyeOff size={14} strokeWidth={1.8} aria-hidden="true" />
            {t('edit.hiddenCount', { count: hidden.length })}
          </Btn>
          <Btn type="button" className="home-edit-done" onClick={edit.exit}>
            <Check size={14} strokeWidth={2.2} aria-hidden="true" />
            {t('edit.done')}
          </Btn>
        </Box>
      )}

      <HiddenWidgetsModal
        open={showHidden}
        onClose={() => setShowHidden(false)}
        hidden={hidden}
        onRestore={edit.show}
      />
    </Box>
  )
}
