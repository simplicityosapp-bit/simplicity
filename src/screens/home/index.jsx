import { useUserPreferences } from '../../hooks/useUserPreferences'
import { useClients } from '../../hooks/useClients'
import HomeWelcome from '../../components/HomeWelcome'
import QuoteWidget from './widgets/QuoteWidget'
import MoonWidget from './widgets/MoonWidget'
import InsightsWidget from './widgets/InsightsWidget'
import QuickRow from './widgets/QuickRow'
import AttentionWidget from './widgets/AttentionWidget'
import RemindersWidget from './widgets/RemindersWidget'
import NextTasksWidget from './widgets/NextTasksWidget'
import ChipsWidget from './widgets/ChipsWidget'
import FeedbackCard from '../../components/FeedbackCard'
import './HomeScreen.css'

const WIDGET_COMPONENTS = {
  'quote':            QuoteWidget,
  'moon':             MoonWidget,
  'insights':         InsightsWidget,
  'quick-row':        QuickRow,
  'attention':        AttentionWidget,
  'reminders':        RemindersWidget,
  'next-tasks':       NextTasksWidget,
  'chips':            ChipsWidget,
}

/* Build a `<div class="home-widget">` wrapper around the widget body.
   Lifted out so we can render it both inline (default stack) and
   inside the special top row (quote + moon side-by-side). */
function renderWidget(w, globalDensity) {
  const Comp = WIDGET_COMPONENTS[w.id]
  if (!Comp) return null
  const density = w.density || globalDensity
  const className = `home-widget${w.compact ? ' compact' : ''}`
  /* --widget-accent is resolved in CSS from data-accent (HomeScreen.css), so
     it can remap per theme — a light-mode hex no longer leaks into dark. */
  return (
    <div
      key={w.id}
      className={className}
      data-widget-id={w.id}
      data-density={density}
      data-accent={w.accent}
    >
      <Comp compact={w.compact} />
    </div>
  )
}

/* Home dashboard — glance, not content. The moon-chip is pinned to
   the right; if the quote widget is also enabled it sits to its
   left, shrinking to fit the remaining width. The rest of the
   widgets follow the user's order in a vertical stack. */
export default function HomeScreen({ onOpenFeedback }) {
  const { prefs, update: updatePrefs } = useUserPreferences()
  const { clients, loading: clientsLoading } = useClients()
  const showWelcome = !clientsLoading && (clients?.length || 0) === 0 && !prefs?.homeWelcomeDismissed
  const widgetsCfg = prefs?.widgets || { global: {}, list: [] }
  const globalDensity = widgetsCfg.global?.density || 'comfortable'
  const cardStyle    = widgetsCfg.global?.cardStyle    || 'frosted'
  const textStrength = widgetsCfg.global?.textStrength || 'normal'

  const enabledList = (widgetsCfg.list || []).filter((w) => w.enabled !== false)
  const quoteCfg = enabledList.find((w) => w.id === 'quote')
  const moonCfg  = enabledList.find((w) => w.id === 'moon')
  const restList = enabledList.filter((w) => w.id !== 'quote' && w.id !== 'moon')

  return (
    <div
      className="screen home-screen"
      data-card-style={cardStyle}
      data-text-strength={textStrength}
      data-density={globalDensity}
    >
      <div className="home-stack">
        {showWelcome && <HomeWelcome onDismiss={() => updatePrefs({ homeWelcomeDismissed: true })} />}
        {(quoteCfg || moonCfg) && (
          <div className="home-row-top">
            {moonCfg  && renderWidget(moonCfg, globalDensity)}
            {quoteCfg && renderWidget(quoteCfg, globalDensity)}
          </div>
        )}
        {restList.map((w) => renderWidget(w, globalDensity))}
        <FeedbackCard onOpenFeedback={onOpenFeedback} />
      </div>
    </div>
  )
}
