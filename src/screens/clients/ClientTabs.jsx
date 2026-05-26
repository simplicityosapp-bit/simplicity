import { CheckCircle2, Clock, CircleSlash, CircleDashed } from 'lucide-react'

/* 4 status tabs. no_status only appears when it holds clients (D22). */
const TABS = [
  { key: 'active', label: 'פעילים', icon: CheckCircle2 },
  { key: 'wandering', label: 'ביניים', icon: Clock },
  { key: 'past', label: 'לשעבר', icon: CircleSlash },
  { key: 'no_status', label: 'ללא סטטוס', icon: CircleDashed },
]

export default function ClientTabs({ active, counts, showNoStatus, onChange }) {
  return (
    <div className="c-tabs-row" role="tablist" aria-label="סטטוס לקוחות">
      {TABS.map((t) => {
        if (t.key === 'no_status' && !showNoStatus) return null
        const Icon = t.icon
        const count = counts?.[t.key] ?? 0
        return (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={active === t.key}
            className={`c-tab${active === t.key ? ' on' : ''}`}
            onClick={() => onChange(t.key)}
          >
            <Icon size={15} strokeWidth={1.6} aria-hidden="true" />
            <span>{t.label}</span>
            <span className="c-tab-count">{count}</span>
          </button>
        )
      })}
    </div>
  )
}
