import { useNavigate } from 'react-router-dom'
import { Users, ClipboardList, Home, Wallet, Menu } from 'lucide-react'
import { BOTTOM_NAV } from '../lib/nav'
import './BottomNav.css'

const ICONS = { Users, ClipboardList, Home, Wallet }

/* Fixed 5-slot tab bar: 4 quick screens + "תפריט" which opens the drawer.
   The active item is colored via CSS that matches the .app[data-screen]
   attribute (set on the app root) against each item's data-screen. */
export default function BottomNav({ onOpenMenu }) {
  const navigate = useNavigate()

  return (
    <nav className="mg-bottombar" aria-label="ניווט תחתון">
      {BOTTOM_NAV.map((item) => {
        const Icon = ICONS[item.icon]
        return (
          <button
            key={item.key}
            className="mg-bottombar-item"
            data-screen={item.key}
            onClick={() => navigate(item.to)}
          >
            <span className="mg-bottombar-chip" aria-hidden="true">
              <Icon size={22} strokeWidth={1.6} />
            </span>
            <span>{item.label}</span>
          </button>
        )
      })}
      <button className="mg-bottombar-item" data-screen="menu" onClick={onOpenMenu}>
        <span className="mg-bottombar-chip" aria-hidden="true">
          <Menu size={22} strokeWidth={1.6} />
        </span>
        <span>תפריט</span>
      </button>
    </nav>
  )
}
