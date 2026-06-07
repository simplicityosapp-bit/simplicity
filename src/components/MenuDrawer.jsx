import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Home, Users, Heart, Wallet, Folder, ClipboardList, Target, Calendar, Settings,
  Sparkles, Moon, BarChart3, Trash2, Sun, X, Pencil, LogOut, MessageSquarePlus, Shield,
} from 'lucide-react'
import { DRAWER_NAV } from '../lib/nav'
import { ROUTES, ADMIN_EMAIL } from '../lib/routes'
import { useUserPreferences } from '../hooks/useUserPreferences'
import { useProfileHealth } from '../hooks/useProfileHealth'
import { useAuth } from '../auth/AuthContext'
import ProfileHealthModal from '../modals/ProfileHealthModal'
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
  const { prefs } = useUserPreferences()

  /* Close on Escape while open — but defer to an open modal layered above
     the drawer (the profile-health sheet). Its own Esc handler closes it
     first; the next Esc then closes the drawer. */
  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      if (e.key === 'Escape' && !document.querySelector('.m-sheet.open')) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const goTo = (to) => {
    navigate(to)
    onClose()
  }

  /* Navigate with optional router state (e.g. settings → open profile
     section), then close the drawer. Used by the profile-health rows. */
  const navTo = (to, state) => {
    navigate(to, state ? { state } : undefined)
    onClose()
  }

  const isAdmin = (user?.email || '').toLowerCase() === ADMIN_EMAIL

  const profile = prefs?.profile || {}
  const name = profile.full_name || ''
  const role = profile.role === 'other'
    ? (profile.role_other || '')
    : (ROLE_LABELS[profile.role] || '')

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

        {/* Profile chip → opens the profile-health breakdown. The score
            (and the data hooks behind it) is computed lazily: ProfileChipLive
            only mounts while the drawer is open, so nothing fetches on app
            load. While closed we show a static placeholder chip. */}
        {open
          ? <ProfileChipLive name={name} role={role} email={user?.email} onNavigate={navTo} />
          : <ProfileChipStatic name={name} role={role} email={user?.email} />}

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

        {/* Owner-only admin console entry — hidden for everyone else. */}
        {isAdmin && (
          <>
            <p className="drawer-section-lbl">ניהול</p>
            <button className="drawer-link" onClick={() => goTo(ROUTES.ADMIN)}>
              <span className="drawer-link-icon"><Shield size={18} strokeWidth={1.5} /></span>
              <span className="drawer-link-text">
                קונסולת ניהול
                <span className="drawer-link-text-sub">משתמשים · פידבקים · אנליטיקס</span>
              </span>
            </button>
          </>
        )}

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

/* ── Profile chip ─────────────────────────────────────────────────
   Shared markup for the menu's profile chip. `health` is null in the
   static (drawer-closed) variant; when present it paints a tier-coloured
   progress ring around the avatar and a trailing score badge. */
const RING_R = 18
const RING_C = 2 * Math.PI * RING_R

function ProfileChipInner({ name, role, email, health, loading, onClick }) {
  const score = health?.score ?? 0
  const tier = health?.tier
  const showScore = !!health && !loading
  return (
    <button
      className="drawer-profile"
      onClick={onClick}
      aria-label={health ? `בריאות הפרופיל${showScore ? ` ${score} אחוז` : ''} — פתיחת פירוט` : undefined}
    >
      <span className="drawer-profile-avatar-wrap">
        {showScore && (
          <svg className="drawer-profile-ring" viewBox="0 0 40 40" aria-hidden="true">
            <circle className="dp-ring-track" cx="20" cy="20" r={RING_R} />
            <circle
              className="dp-ring-fill"
              cx="20" cy="20" r={RING_R}
              style={{ color: tier.color }}
              strokeDasharray={`${RING_C * (score / 100)} ${RING_C}`}
              strokeLinecap="round"
            />
          </svg>
        )}
        <span className="drawer-profile-avatar">{initial(name)}</span>
      </span>
      <span className="drawer-profile-text">
        <span className="drawer-profile-name">{name || 'הפרופיל שלי'}</span>
        <span className="drawer-profile-meta">{role || email || ''}</span>
      </span>
      {health
        ? (
          <span className="drawer-profile-score" style={tier ? { color: tier.color } : undefined}>
            <span className="drawer-profile-score-lbl">ציון פרופיל</span>
            <span className="drawer-profile-score-val">{loading ? '··' : `${score}%`}</span>
          </span>
        )
        : (
          <span className="drawer-profile-edit" aria-hidden="true">
            <Pencil size={16} strokeWidth={1.5} />
          </span>
        )}
    </button>
  )
}

/* Drawer-closed placeholder — no score, no data hooks. */
function ProfileChipStatic({ name, role, email }) {
  return <ProfileChipInner name={name} role={role} email={email} health={null} onClick={undefined} />
}

/* Drawer-open variant — computes health on mount and owns the breakdown
   modal. Local modal state resets to closed on every remount (i.e. each
   time the drawer re-opens). The drawer's Escape handler defers to the
   open sheet via a DOM check, so no lifting is needed. Unmounts (and stops
   fetching) when the drawer closes. */
function ProfileChipLive({ name, role, email, onNavigate }) {
  const { health, loading } = useProfileHealth()
  const [modalOpen, setModalOpen] = useState(false)
  return (
    <>
      <ProfileChipInner
        name={name} role={role} email={email}
        health={health} loading={loading}
        onClick={() => setModalOpen(true)}
      />
      <ProfileHealthModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        health={health}
        loading={loading}
        onNavigate={onNavigate}
      />
    </>
  )
}
