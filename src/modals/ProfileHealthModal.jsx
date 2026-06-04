import {
  User, Wallet, Sparkles, Users, Repeat, Folder,
  ClipboardList, Bell, Target, Heart, ChevronLeft, Pencil, CheckCircle2,
} from 'lucide-react'
import Modal from './Modal'
import { ROUTES } from '../lib/routes'
import './ProfileHealthModal.css'

/* gap.icon key → Lucide component. Keys come from lib/profileHealth. */
const ICONS = {
  user: User, wallet: Wallet, sparkles: Sparkles, users: Users,
  repeat: Repeat, folder: Folder, tasks: ClipboardList, bell: Bell,
  target: Target, leads: Heart,
}

/* One encouraging line per tier — frames gaps as opportunity, not failure. */
function leadLine(score, tier) {
  if (score >= 100) return 'הכול מנוצל — הוצאת מהמערכת את המקסימום. 🎉'
  if (tier.key === 'high') return 'כמעט הכול במקום. עוד נגיעה קטנה ואתה שם.'
  if (tier.key === 'mid') return 'אתה בדרך הנכונה — כמה צעדים והפרופיל מלא.'
  return 'יש כאן הזדמנות אמיתית להפיק יותר מהמערכת.'
}

/* ════════════════════════════════════════════════════════════════
   ProfileHealthModal — bottom-sheet breakdown of the profile-health
   score. A progress ring up top, then one actionable row per gap, and
   an "edit profile" shortcut at the bottom. onNavigate(route, state)
   is wired by the caller to navigate AND close the menu drawer.
   ════════════════════════════════════════════════════════════════ */
export default function ProfileHealthModal({ open, onClose, health, loading, onNavigate }) {
  const ready = !loading && !!health
  const score = health?.score ?? 0
  const tier = health?.tier ?? { key: 'low', color: 'var(--clay)' }
  const gaps = health?.gaps ?? []

  /* Ring geometry — a single stroked circle, dash length = progress.
     While the data is still loading the score is computed from empty
     arrays (artificially low), so hold the ring + number until ready. */
  const R = 46
  const C = 2 * Math.PI * R
  const dash = C * ((ready ? score : 0) / 100)

  return (
    <Modal open={open} onClose={onClose} title="בריאות הפרופיל">
      <div className="ph-body">
        <div className="ph-ring-wrap">
          <svg className="ph-ring" viewBox="0 0 120 120" aria-hidden="true">
            <circle className="ph-ring-track" cx="60" cy="60" r={R} />
            <circle
              className="ph-ring-fill"
              cx="60" cy="60" r={R}
              style={{ color: tier.color }}
              strokeDasharray={`${dash} ${C}`}
              strokeLinecap="round"
            />
          </svg>
          <div className="ph-ring-center">
            <span className="ph-score" style={{ color: ready ? tier.color : 'var(--stone)' }}>
              {ready ? score : '··'}
            </span>
            <span className="ph-score-pct">%</span>
          </div>
        </div>

        <p className="ph-lead">{ready ? leadLine(score, tier) : 'רגע, מחשבים את הציון…'}</p>

        {!ready ? (
          <p className="ph-loading">טוען את הנתונים שלך…</p>
        ) : gaps.length === 0 ? (
          <div className="ph-done">
            <CheckCircle2 size={22} strokeWidth={1.6} aria-hidden="true" />
            <span>אין פערים פתוחים — הכול מנוצל.</span>
          </div>
        ) : (
          <ul className="ph-gaps">
            {gaps.map((g) => {
              const Icon = ICONS[g.icon] || Sparkles
              return (
                <li key={g.id} className={`ph-gap ph-gap-${g.group}`}>
                  <span className="ph-gap-icon"><Icon size={18} strokeWidth={1.6} aria-hidden="true" /></span>
                  <span className="ph-gap-label">{g.label}</span>
                  <button
                    type="button"
                    className="ph-gap-action"
                    onClick={() => onNavigate(g.action.route, g.action.state)}
                  >
                    {g.action.label}
                    <ChevronLeft size={15} strokeWidth={1.8} aria-hidden="true" />
                  </button>
                </li>
              )
            })}
          </ul>
        )}

        <button
          type="button"
          className="ph-edit"
          onClick={() => onNavigate(ROUTES.SETTINGS, { openSection: 'profile' })}
        >
          <Pencil size={16} strokeWidth={1.6} aria-hidden="true" />
          עריכת הפרופיל
        </button>
      </div>
    </Modal>
  )
}
