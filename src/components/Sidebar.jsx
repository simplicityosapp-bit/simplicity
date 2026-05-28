import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Home, Users, Heart, Wallet, Folder, ClipboardList, Target, Calendar, Settings,
  Sun, Moon, LogOut, BarChart3, MoreHorizontal, Trash2, Sparkles,
} from 'lucide-react'
import { DRAWER_NAV } from '../lib/nav'
import { ROUTES } from '../lib/routes'
import { useAuth } from '../auth/AuthContext'
import './Sidebar.css'

const ICONS = { Home, Users, Heart, Wallet, Folder, ClipboardList, Target, Calendar, Settings }

/* Extras — screens that aren't in the main bottom-nav set. Lives
   under a collapsible "עוד" section at the bottom of the sidebar.
   `placeholder: true` items aren't routed yet — they show a soft
   "soon" alert so the user can see what's planned. */
const EXTRAS = [
  { key: 'moon',     label: 'מבט על',         icon: Moon,       to: ROUTES.MOON_GLANCE },
  { key: 'reports',  label: 'דוחות',          icon: BarChart3,  to: ROUTES.REPORTS },
  { key: 'insights', label: 'מה איתך היום?',  icon: Sparkles,   to: ROUTES.INSIGHTS },
  { key: 'trash',    label: 'זבל',            icon: Trash2,     to: ROUTES.TRASH },
]

/* ════════════════════════════════════════════════════════════════
   Sidebar — desktop-only nav (≥768px). Collapsed by default; the
   sidebar is a narrow rail of icon-chips coloured by the per-screen
   brand palette. Hovering the rail expands it into a labelled menu.
   Background is a vertical blend of all five brand colours under a
   heavy blur, echoing the bottom-nav language on mobile.
   ════════════════════════════════════════════════════════════════ */
export default function Sidebar({ screen, isDark, onToggleTheme }) {
  const navigate = useNavigate()
  const { signOut } = useAuth()
  const [extrasOpen, setExtrasOpen] = useState(false)

  return (
    <aside className="mg-sidebar" aria-label="ניווט ראשי">
      <p className="mg-sidebar-brand">Simplicity</p>
      <p className="mg-sidebar-tag">Practice OS</p>

      <nav className="mg-sidebar-nav">
        {DRAWER_NAV.map((item) => {
          const Icon = ICONS[item.icon] || Home
          const active = item.key === screen
          return (
            <button
              key={item.key}
              type="button"
              className={`mg-sidebar-link${active ? ' on' : ''}`}
              data-screen={item.key}
              onClick={() => navigate(item.to)}
              title={item.label}
            >
              <span className="mg-sidebar-link-chip" aria-hidden="true">
                <Icon size={22} strokeWidth={2} />
              </span>
              <span className="mg-sidebar-link-text">{item.label}</span>
            </button>
          )
        })}

        {/* "עוד" — expansion submenu for screens not in the main set */}
        <button
          type="button"
          className={`mg-sidebar-link mg-sidebar-more${extrasOpen ? ' is-open' : ''}`}
          data-screen="more"
          onClick={() => setExtrasOpen((v) => !v)}
          aria-expanded={extrasOpen}
          title="עוד"
        >
          <span className="mg-sidebar-link-chip" aria-hidden="true">
            <MoreHorizontal size={22} strokeWidth={2} />
          </span>
          <span className="mg-sidebar-link-text">עוד</span>
        </button>
        {extrasOpen && (
          <div className="mg-sidebar-extras">
            {EXTRAS.map((item) => {
              const Icon = item.icon
              const active = item.key === screen
              const handleClick = item.placeholder
                ? () => window.alert(item.soon || 'בקרוב')
                : () => navigate(item.to)
              return (
                <button
                  key={item.key}
                  type="button"
                  className={`mg-sidebar-link mg-sidebar-sub${active ? ' on' : ''}${item.placeholder ? ' placeholder' : ''}`}
                  data-screen={item.key}
                  onClick={handleClick}
                  title={item.label}
                >
                  <span className="mg-sidebar-link-chip" aria-hidden="true">
                    <Icon size={18} strokeWidth={2} />
                  </span>
                  <span className="mg-sidebar-link-text">{item.label}</span>
                </button>
              )
            })}
          </div>
        )}
      </nav>

      <div className="mg-sidebar-foot">
        <button type="button" className="mg-sidebar-util" onClick={onToggleTheme} title={isDark ? 'מצב יום' : 'מצב לילה'}>
          {isDark
            ? <Sun size={16} strokeWidth={1.6} aria-hidden="true" />
            : <Moon size={16} strokeWidth={1.6} aria-hidden="true" />}
          <span>{isDark ? 'מצב יום' : 'מצב לילה'}</span>
        </button>
        <button type="button" className="mg-sidebar-util" onClick={signOut} title="יציאה">
          <LogOut size={16} strokeWidth={1.6} aria-hidden="true" />
          <span>יציאה</span>
        </button>
      </div>
    </aside>
  )
}
