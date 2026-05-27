import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronDown, ChevronUp, ArrowLeft } from 'lucide-react'
import { ROUTES } from '../../../lib/routes'
import { moonGetData, moonGetCategories, moonReflection } from '../../../lib/moon'
import { upsertMoonSnapshot } from '../../../lib/api/moonSnapshots'
import { useGoals } from '../../../hooks/useGoals'
import { useGoalCategories } from '../../../hooks/useGoalCategories'
import { useGoalEntries } from '../../../hooks/useGoalEntries'
import { useTransactions } from '../../../hooks/useTransactions'
import { useClients } from '../../../hooks/useClients'
import { useLeads } from '../../../hooks/useLeads'
import { useSessions } from '../../../hooks/useSessions'
import { useDailyAnswers } from '../../../hooks/useDailyAnswers'
import InfoPopover from '../../../components/InfoPopover'

/* Moon-glance mini — a single chip with the pace-based confidence
   percentage inside a soft circular ring. The progress arc itself
   is blurred so it reads as a glow, not a hard line; its color
   follows the widget's accent (sage by default, can be re-tinted
   via the home customize panel).

   Tap the chip → toggle inline expansion. The expanded card shows
   per-category bars + a one-line reflection + a "פירוט מלא ←" link
   for the full /moon screen. Empty-state (no goals) still routes
   straight to /goals because there's nothing to expand. */
const RADIUS = 42
const CIRCUMFERENCE = 2 * Math.PI * RADIUS   /* ~263.89 */

export default function MoonWidget() {
  const navigate = useNavigate()
  const { goals } = useGoals()
  const { categories } = useGoalCategories()
  const { entries } = useGoalEntries()
  const { transactions } = useTransactions()
  const { clients } = useClients()
  const { leads } = useLeads()
  const { sessions } = useSessions()
  const { answers } = useDailyAnswers()
  const [expanded, setExpanded] = useState(false)

  const data = useMemo(
    () => ({ goals, categories, entries, transactions, sessions, clients, leads, answers }),
    [goals, categories, entries, transactions, sessions, clients, leads, answers],
  )
  const { overall } = useMemo(() => moonGetData(new Date(), data), [data])
  const cats = useMemo(() => (expanded ? moonGetCategories(new Date(), data) : []), [expanded, data])

  /* Persist today's moon-glance score as a daily snapshot. Upserts on
     (user_id, date) so multiple recomputes within a day just overwrite
     today's row. Fire-and-forget — never blocks the UI. */
  useEffect(() => {
    if (!overall) return
    upsertMoonSnapshot({
      score: overall.pure,
      paced: overall.paced,
      confidence: overall.confidence,
    }).catch(() => { /* non-fatal */ })
  }, [overall])

  const conf = overall?.confidence ?? 0
  const pure = overall?.pure
  const hasGoals = !!overall
  const dash = (Math.min(100, Math.max(0, conf)) / 100) * CIRCUMFERENCE

  const label = hasGoals
    ? (pure != null ? `${pure}% מהיעד` : 'מבט על')
    : 'הגדר/י יעד ←'

  /* Empty-state — go straight to /goals; no expansion available. */
  if (!hasGoals) {
    return (
      <div
        className="moon-chip moon-chip-empty"
        role="button"
        tabIndex={0}
        onClick={() => navigate(ROUTES.GOALS)}
        aria-label="הגדר יעד"
      >
        <svg className="moon-svg" viewBox="0 0 100 100" aria-hidden="true">
          <circle className="moon-track" cx="50" cy="50" r={RADIUS} />
        </svg>
        <div className="moon-chip-num mono">—</div>
        <div className="moon-chip-label">{label}</div>
      </div>
    )
  }

  return (
    <div className={`moon-block${expanded ? ' expanded' : ''}`}>
      <div
        className="moon-chip"
        role="button"
        tabIndex={0}
        onClick={() => setExpanded((v) => !v)}
        aria-label={`מבט על ${conf}%`}
        aria-expanded={expanded}
      >
        <svg className="moon-svg" viewBox="0 0 100 100" aria-hidden="true">
          <circle className="moon-track" cx="50" cy="50" r={RADIUS} />
          <circle
            className="moon-arc"
            cx="50"
            cy="50"
            r={RADIUS}
            strokeDasharray={`${dash} ${CIRCUMFERENCE}`}
          />
        </svg>
        <div className="moon-chip-num mono">{`${conf}%`}</div>
        <div className="moon-chip-label">
          {label}
          <InfoPopover
            label="הסבר מבט על"
            text="הציון המשוקלל של כל היעדים החודש, מודע-לקצב — כמה מהיעד היומי הצפוי כיסית עד עכשיו. 100% = בדיוק בקצב."
          />
        </div>
        <button
          type="button"
          className="moon-chip-toggle"
          onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v) }}
          aria-label={expanded ? 'כיווץ' : 'הרחבה'}
        >
          {expanded
            ? <ChevronUp size={14} strokeWidth={1.8} aria-hidden="true" />
            : <ChevronDown size={14} strokeWidth={1.8} aria-hidden="true" />}
        </button>
      </div>

      {expanded && (
        <div className="moon-expanded">
          <p className="moon-expanded-reflection">{moonReflection(conf)}</p>
          {cats.length === 0 ? (
            <p className="moon-expanded-empty">אין עדיין יעדים פעילים עם נתונים החודש.</p>
          ) : (
            <div className="moon-expanded-cats">
              {cats.map((c) => (
                <div key={c.category.id} className="moon-expanded-cat">
                  <div className="moon-expanded-cat-head">
                    <span className="moon-expanded-cat-dot" style={{ background: c.category.color || 'var(--sage)' }} />
                    <span className="moon-expanded-cat-name">{c.category.name}</span>
                    <span className="moon-expanded-cat-pct mono">{c.confidence}%</span>
                  </div>
                  <div className="moon-expanded-cat-bar">
                    <div
                      className="moon-expanded-cat-fill"
                      style={{ width: `${Math.min(c.confidence, 100)}%`, background: c.category.color || 'var(--sage)' }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
          <button type="button" className="moon-expanded-link" onClick={() => navigate(ROUTES.MOON_GLANCE)}>
            פירוט מלא <ArrowLeft size={13} strokeWidth={1.8} aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  )
}
