import { useNavigate } from 'react-router-dom'
import {
  Home, Users, Heart, Wallet, Folder, ClipboardList, Target, Calendar, Settings,
  Sun, Moon, LogOut,
} from 'lucide-react'
import { DRAWER_NAV } from '../lib/nav'
import { useAuth } from '../auth/AuthContext'
import './Sidebar.css'

const ICONS = { Home, Users, Heart, Wallet, Folder, ClipboardList, Target, Calendar, Settings }

/* ════════════════════════════════════════════════════════════════
   Sidebar — desktop-only vertical nav (≥768px).
   ════════════════════════════════════════════════════════════════
   Hidden on mobile via CSS `display: none`. On desktop it sits on
   the RTL start edge (right) of the app frame, replacing the
   bottom-nav + menu drawer. Active item gets a glass chip in its
   per-screen brand color. Bottom of the sidebar holds the theme
   toggle and a sign-out link.
   ════════════════════════════════════════════════════════════════ */
export default function Sidebar({ screen, isDark, onToggleTheme }) {
  const navigate = useNavigate()
  const { signOut } = useAuth()

  return (
    <aside className="mg-sidebar" aria-label="ניווט ראשי">
      <p className="mg-sidebar-brand">Mångata</p>
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
            >
              <span className="mg-sidebar-link-chip" aria-hidden="true">
                <Icon size={18} strokeWidth={1.6} />
              </span>
              <span className="mg-sidebar-link-text">{item.label}</span>
            </button>
          )
        })}
      </nav>

      <div className="mg-sidebar-foot">
        <button type="button" className="mg-sidebar-util" onClick={onToggleTheme}>
          {isDark
            ? <Sun size={16} strokeWidth={1.6} aria-hidden="true" />
            : <Moon size={16} strokeWidth={1.6} aria-hidden="true" />}
          <span>{isDark ? 'מצב יום' : 'מצב לילה'}</span>
        </button>
        <button type="button" className="mg-sidebar-util" onClick={signOut}>
          <LogOut size={16} strokeWidth={1.6} aria-hidden="true" />
          <span>יציאה</span>
        </button>
      </div>
    </aside>
  )
}
