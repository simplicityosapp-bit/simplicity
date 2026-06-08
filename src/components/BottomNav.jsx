import { useLocation, useNavigate } from 'react-router-dom'
import { Users, ClipboardList, Home, Wallet, Menu } from 'lucide-react'
import { BOTTOM_NAV } from '../lib/nav'
import { screenKeyFromPath } from '../lib/nav'
import './BottomNav.css'

const ICONS = { Users, ClipboardList, Home, Wallet }

/* Fixed 5-slot tab bar: 4 quick screens + "תפריט" which opens the drawer.
   The active item is colored via CSS that matches the .app[data-screen]
   attribute (set on the app root) against each item's data-screen. We
   also surface the active state to assistive tech via aria-current. */
export default function BottomNav({ onOpenMenu }) {
  const navigate = useNavigate()
  const location = useLocation()
  const screen = screenKeyFromPath(location.pathname)
  /* Screens reached only via the drawer (reports/moon/insights/trash/
     connections/settings/…) match no bottom tab — mark "תפריט" active so the
     bar never reads as "nowhere". */
  const onMenuScreen = !BOTTOM_NAV.some((i) => i.key === screen)

  return (
    <nav className="mg-bottombar" aria-label="ניווט תחתון">
      {BOTTOM_NAV.map((item) => {
        const Icon = ICONS[item.icon]
        const active = item.key === screen
        return (
          <button
            key={item.key}
            className="mg-bottombar-item"
            data-screen={item.key}
            aria-current={active ? 'page' : undefined}
            onClick={() => navigate(item.to)}
          >
            <span className="mg-bottombar-chip" aria-hidden="true">
              <Icon size={22} strokeWidth={1.6} />
            </span>
            <span>{item.label}</span>
          </button>
        )
      })}
      <button
        className={`mg-bottombar-item${onMenuScreen ? ' is-active' : ''}`}
        data-screen="menu"
        aria-current={onMenuScreen ? 'page' : undefined}
        onClick={onOpenMenu}
      >
        <span className="mg-bottombar-chip" aria-hidden="true">
          <Menu size={22} strokeWidth={1.6} />
        </span>
        <span>תפריט</span>
      </button>
    </nav>
  )
}
