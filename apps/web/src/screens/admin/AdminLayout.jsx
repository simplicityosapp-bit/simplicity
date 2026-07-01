import { useEffect, useRef, useState } from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, Users, MessageSquare, BarChart3, ArrowRight, MessageSquarePlus,
} from 'lucide-react'
import { ROUTES } from '../../lib/routes'
import FeedbackModal from '../../modals/FeedbackModal'
import { useT } from '../../i18n/useT'
import './admin.css'
import { Box, Txt, Btn } from '../../components/ui'

/* Admin nav — four read-only screens. `end` on the dashboard link so it
   isn't kept "active" while on the nested /admin/* routes. */
const NAV = [
  { to: ROUTES.ADMIN,           key: 'nav.dashboard', icon: LayoutDashboard, end: true },
  { to: ROUTES.ADMIN_USERS,     key: 'nav.users',     icon: Users },
  { to: ROUTES.ADMIN_FEEDBACK,  key: 'nav.feedback',  icon: MessageSquare },
  { to: ROUTES.ADMIN_ANALYTICS, key: 'nav.analytics', icon: BarChart3 },
]

/* ════════════════════════════════════════════════════════════════
   AdminLayout — the console shell. A right-hand nav rail (RTL) + a
   header strip with a "back to app" exit, wrapping the active screen.
   Deliberately its own world: none of the main app's Sidebar /
   BottomNav / tours / widgets. If this breaks, regular users feel
   nothing.
   ════════════════════════════════════════════════════════════════ */
export default function AdminLayout({ children }) {
  const { t } = useT('admin')
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const rootRef = useRef(null)
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  // .admin-root is the scroll container. React Router keeps its scroll offset
  // across route changes, so switching screens used to land mid-page — the
  // content appeared to start at a "random" distance from the top. Reset to
  // the top whenever the admin path changes.
  useEffect(() => {
    rootRef.current?.scrollTo({ top: 0 })
  }, [pathname])
  return (
    <Box className="admin-root" data-admin ref={rootRef}>
      <Box as="aside" className="admin-nav" aria-label={t('nav.label')}>
        <Box className="admin-nav-brand">
          <Txt className="admin-nav-dot" aria-hidden="true" />
          <Box>
            <Txt as="p" className="admin-nav-title">{t('nav.title')}</Txt>
            <Txt as="p" className="admin-nav-sub">Simplicity</Txt>
          </Box>
        </Box>

        <Box as="nav" className="admin-nav-list">
          {NAV.map(({ to, key, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) => `admin-nav-link${isActive ? ' on' : ''}`}
            >
              <Icon size={18} strokeWidth={1.8} aria-hidden="true" />
              <Txt>{t(key)}</Txt>
            </NavLink>
          ))}
        </Box>

        <Btn
          type="button"
          className="admin-nav-link admin-nav-action"
          onClick={() => setFeedbackOpen(true)}
          title={t('nav.sendFeedback')}
        >
          <MessageSquarePlus size={18} strokeWidth={1.8} aria-hidden="true" />
          <Txt>{t('nav.feedbackAction')}</Txt>
        </Btn>

        <Btn
          type="button"
          className="admin-nav-exit"
          onClick={() => navigate(ROUTES.HOME)}
          title={t('nav.backToApp')}
        >
          <ArrowRight size={16} strokeWidth={1.8} aria-hidden="true" />
          <Txt>{t('nav.backToApp')}</Txt>
        </Btn>
      </Box>

      <Box as="main" className="admin-main">{children}</Box>

      {/* Reuses the app's feedback flow — inserts a row + emails the team via
          send-feedback, which stamps the sender (the owner's email), so it's
          clearly identified as coming from the admin account. */}
      <FeedbackModal open={feedbackOpen} onClose={() => setFeedbackOpen(false)} />
    </Box>
  )
}
