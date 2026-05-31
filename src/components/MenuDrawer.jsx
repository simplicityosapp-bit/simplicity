import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Home, Users, Heart, Wallet, Folder, ClipboardList, Target, Calendar, Settings,
  Sparkles, Moon, BarChart3, Trash2, Sun, X, Pencil, LogOut, MessageSquarePlus,
} from 'lucide-react'
import { DRAWER_NAV } from '../lib/nav'
import { ROUTES } from '../lib/routes'
import { user_preferences } from '../data/mock'
import { useAuth } from '../auth/AuthContext'
import './MenuDrawer.css'

const GRID_ICONS = { Home, Users, Heart, Wallet, Folder, ClipboardList, Target, Calendar, Settings }

/* Hebrew role label (UI-only; PREF_ROLES has no Hebrew map in enums.js). */
const ROLE_LABELS = {
  therapist: 'מטפל/ת',
  coach: 'מאמן/ת',
  facilitator: 'מנחה',
  teacher: 'מורה',
  instructor: 'מדריך/ה',
  other: '',
}

function initial(name) {
  return name?.trim()?.[0] ?? '·'
}

export default function MenuDrawer({ open, onClose, screen, isDark, onToggleTheme, onOpenFeedback }) {
  const navigate = useNavigate()
  const { user, signOut } = useAuth()

  /* Close on Escape while open. */
  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const goTo = (to) => {
    navigate(to)
    onClose()
  }

  const name = user_preferences.full_name
  const role = ROLE_LABELS[user_preferences.role] ?? ''

  return (
    <>
      <div
        className={`drawer-overlay${open ? ' open' : ''}`}
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        className={`drawer-panel${open ? ' open' : ''}`}
        aria-label="תפריט נוסף"
        aria-hidden={!open}
      >
        <div className="drawer-title">
          <span>עוד</span>
          <button className="drawer-close" onClick={onClose} aria-label="סגור">
            <X size={16} strokeWidth={1.5} />
          </button>
        </div>
        <p className="drawer-title-sub">תפריט · העדפות וכלים אישיים</p>

        {/* Profile chip → settings */}
        <button className="drawer-profile" onClick={() => goTo(ROUTES.SETTINGS)}>
          <span className="drawer-profile-avatar">{initial(name)}</span>
          <span className="drawer-profile-text">
            <span className="drawer-profile-name">{name}</span>
            <span className="drawer-profile-meta">{user?.email || role}</span>
          </span>
          <span className="drawer-profile-edit" aria-hidden="true">
            <Pencil size={16} strokeWidth={1.5} />
          </span>
        </button>

        {/* Screen grid — every reachable screen */}
        <nav className="drawer-nav-mobile" aria-label="ניווט מסכים">
          {DRAWER_NAV.map((item) => {
            const Icon = GRID_ICONS[item.icon]
            return (
              <button
                key={item.key}
                className={`dnav-item${screen === item.key ? ' active' : ''}`}
                onClick={() => goTo(item.to)}
              >
                <Icon size={20} strokeWidth={1.5} aria-hidden="true" />
                <span>{item.label}</span>
              </button>
            )
          })}
        </nav>

        <p className="drawer-section-lbl">אישי</p>

        <button className="drawer-link tint-purple" onClick={() => goTo(ROUTES.INSIGHTS)}>
          <span className="drawer-link-icon"><Sparkles size={18} strokeWidth={1.5} /></span>
          <span className="drawer-link-text">
            מה איתך היום?
            <span className="drawer-link-text-sub">השאלות היומיות שלך + תובנות</span>
          </span>
        </button>

        <button className="drawer-link tint-moon" onClick={() => goTo(ROUTES.MOON_GLANCE)}>
          <span className="drawer-link-icon"><Moon size={18} strokeWidth={1.5} /></span>
          <span className="drawer-link-text">
            מבט על
            <span className="drawer-link-text-sub">הציון המשוקלל וההתקדמות שלך</span>
          </span>
        </button>

        <button className="drawer-link" onClick={() => goTo(ROUTES.REPORTS)}>
          <span className="drawer-link-icon"><BarChart3 size={18} strokeWidth={1.5} /></span>
          <span className="drawer-link-text">
            דוחות
            <span className="drawer-link-text-sub">מדדים לאורך תקופות</span>
          </span>
        </button>

        <p className="drawer-section-lbl">הגדרות</p>

        <button className="drawer-link tint-purple" onClick={() => { onClose(); onOpenFeedback?.() }}>
          <span className="drawer-link-icon"><MessageSquarePlus size={18} strokeWidth={1.5} /></span>
          <span className="drawer-link-text">
            דברו אלינו
            <span className="drawer-link-text-sub">מה עובד, מה חסר, ומה אפשר לשפר</span>
          </span>
        </button>

        <button className="drawer-link tint-amber" onClick={() => goTo(ROUTES.TRASH)}>
          <span className="drawer-link-icon"><Trash2 size={18} strokeWidth={1.5} /></span>
          <span className="drawer-link-text">
            זבל
            <span className="drawer-link-text-sub">שחזור פריטים שנמחקו · 30 יום</span>
          </span>
        </button>

        {/* Theme toggle — sun/moon slider switch */}
        <button className="drawer-link drawer-theme" onClick={onToggleTheme}>
          <span className="theme-switch" aria-hidden="true">
            <span className="theme-switch-icon theme-switch-sun"><Sun size={16} strokeWidth={1.5} /></span>
            <span className="theme-switch-icon theme-switch-moon"><Moon size={16} strokeWidth={1.5} /></span>
            <span className="theme-switch-thumb" />
          </span>
          <span className="drawer-link-text">
            {isDark ? 'מצב יום' : 'מצב כהה'}
            <span className="drawer-link-text-sub">החלף בין יום ולילה</span>
          </span>
        </button>

        {/* Logout */}
        <button
          className="drawer-link tint-amber"
          onClick={() => { onClose(); signOut() }}
        >
          <span className="drawer-link-icon"><LogOut size={18} strokeWidth={1.5} /></span>
          <span className="drawer-link-text">
            התנתקות
            <span className="drawer-link-text-sub">{user?.email || ''}</span>
          </span>
        </button>
      </aside>
    </>
  )
}
