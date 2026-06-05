import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Users, MessageSquare, BarChart3, ArrowRight, MessageSquarePlus,
} from 'lucide-react'
import { ROUTES } from '../../lib/routes'
import FeedbackModal from '../../modals/FeedbackModal'
import './admin.css'

/* Admin nav — four read-only screens. `end` on the dashboard link so it
   isn't kept "active" while on the nested /admin/* routes. */
const NAV = [
  { to: ROUTES.ADMIN,           label: 'דשבורד',    icon: LayoutDashboard, end: true },
  { to: ROUTES.ADMIN_USERS,     label: 'משתמשים',   icon: Users },
  { to: ROUTES.ADMIN_FEEDBACK,  label: 'פידבקים',   icon: MessageSquare },
  { to: ROUTES.ADMIN_ANALYTICS, label: 'אנליטיקס',  icon: BarChart3 },
]

/* ════════════════════════════════════════════════════════════════
   AdminLayout — the console shell. A right-hand nav rail (RTL) + a
   header strip with a "back to app" exit, wrapping the active screen.
   Deliberately its own world: none of the main app's Sidebar /
   BottomNav / tours / widgets. If this breaks, regular users feel
   nothing.
   ════════════════════════════════════════════════════════════════ */
export default function AdminLayout({ children }) {
  const navigate = useNavigate()
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  return (
    <div className="admin-root" data-admin>
      <aside className="admin-nav" aria-label="ניווט ניהול">
        <div className="admin-nav-brand">
          <span className="admin-nav-dot" aria-hidden="true" />
          <div>
            <p className="admin-nav-title">ניהול</p>
            <p className="admin-nav-sub">Simplicity</p>
          </div>
        </div>

        <nav className="admin-nav-list">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) => `admin-nav-link${isActive ? ' on' : ''}`}
            >
              <Icon size={18} strokeWidth={1.8} aria-hidden="true" />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        <button
          type="button"
          className="admin-nav-link admin-nav-action"
          onClick={() => setFeedbackOpen(true)}
          title="שליחת פידבק"
        >
          <MessageSquarePlus size={18} strokeWidth={1.8} aria-hidden="true" />
          <span>פידבק</span>
        </button>

        <button
          type="button"
          className="admin-nav-exit"
          onClick={() => navigate(ROUTES.HOME)}
          title="חזרה לאפליקציה"
        >
          <ArrowRight size={16} strokeWidth={1.8} aria-hidden="true" />
          <span>חזרה לאפליקציה</span>
        </button>
      </aside>

      <main className="admin-main">{children}</main>

      {/* Reuses the app's feedback flow — inserts a row + emails the team via
          send-feedback, which stamps the sender (the owner's email), so it's
          clearly identified as coming from the admin account. */}
      <FeedbackModal open={feedbackOpen} onClose={() => setFeedbackOpen(false)} />
    </div>
  )
}
