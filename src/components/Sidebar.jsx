import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Home, Users, Heart, Wallet, Folder, ClipboardList, Target, Calendar, Settings,
  Sun, Moon, LogOut, BarChart3, MoreHorizontal, Trash2, Sparkles, X, MessageSquarePlus, Shield, Plug,
} from 'lucide-react'
import { DRAWER_NAV } from '../lib/nav'
import { ROUTES, ADMIN_EMAIL } from '../lib/routes'
import { roleLabel } from '../lib/preferences'
import { useAuth } from '../auth/AuthContext'
import { useUserPreferences } from '../hooks/useUserPreferences'
import { useProfileHealth } from '../hooks/useProfileHealth'
import ProfileHealthModal from '../modals/ProfileHealthModal'
import './Sidebar.css'

const ICONS = { Home, Users, Heart, Wallet, Folder, ClipboardList, Target, Calendar, Settings, Plug }

const initial = (name) => name?.trim()?.[0] ?? '·'
const RING_R = 18
const RING_C = 2 * Math.PI * RING_R

/* Extras — screens that aren't in the main bottom-nav set. Surface
   from a slide-up panel anchored over the "עוד" button. */
const EXTRAS = [
  { key: 'moon',     label: 'מבט על',         icon: Moon,       to: ROUTES.MOON_GLANCE },
  { key: 'reports',  label: 'דוחות',          icon: BarChart3,  to: ROUTES.REPORTS },
  { key: 'insights', label: 'מה איתך היום?',  icon: Sparkles,   to: ROUTES.INSIGHTS },
  { key: 'trash',    label: 'סל מיחזור',      icon: Trash2,     to: ROUTES.TRASH },
]

/* ════════════════════════════════════════════════════════════════
   Sidebar — desktop-only nav (≥768px). Collapsed by default; the
   sidebar is a narrow rail of icon-chips coloured by the per-screen
   brand palette. Hovering the rail expands it into a labelled menu.
   Background is a vertical blend of all five brand colours under a
   heavy blur, echoing the bottom-nav language on mobile.
   ════════════════════════════════════════════════════════════════ */
export default function Sidebar({ screen, isDark, onToggleTheme, onOpenFeedback }) {
  const navigate = useNavigate()
  const { signOut, user } = useAuth()
  const { prefs } = useUserPreferences()
  const isAdmin = (user?.email || '').toLowerCase() === ADMIN_EMAIL
  const [extrasOpen, setExtrasOpen] = useState(false)
  const sidebarRef = useRef(null)
  /* Profile-health chip is lazy: useProfileHealth fans out ~11 fetches, so we
     only mount the live variant after the user first hovers the rail — never
     on app load (mirrors the menu-drawer's open-gated mount). */
  const [profileLive, setProfileLive] = useState(false)

  const profile = prefs?.profile || {}
  const name = profile.full_name || ''
  const role = profile.role === 'other'
    ? (profile.role_other || '')
    : roleLabel(profile.role, prefs?.design?.gender)

  /* Close the slide-up panel when the user clicks outside the
     sidebar or presses Escape. */
  useEffect(() => {
    if (!extrasOpen) return
    const onDown = (e) => {
      if (!sidebarRef.current?.contains(e.target)) setExtrasOpen(false)
    }
    const onKey = (e) => { if (e.key === 'Escape') setExtrasOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [extrasOpen])

  return (
    <aside className="mg-sidebar" aria-label="ניווט ראשי" ref={sidebarRef} onMouseEnter={() => setProfileLive(true)}>
      <div className="mg-sidebar-brand-row">
        <img
          className="mg-sidebar-logo"
          src="/logo-light.png"
          alt=""
          aria-hidden="true"
        />
        <div className="mg-sidebar-brand-text">
          <p className="mg-sidebar-brand">Simplicity</p>
          <p className="mg-sidebar-tag">Practice OS</p>
        </div>
      </div>

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

        {/* "עוד" — opens the slide-up extras panel */}
        <button
          type="button"
          className={`mg-sidebar-link mg-sidebar-more${extrasOpen ? ' is-open' : ''}`}
          data-screen="more"
          onClick={(e) => { e.stopPropagation(); setExtrasOpen((v) => !v) }}
          aria-expanded={extrasOpen}
          title="עוד"
        >
          <span className="mg-sidebar-link-chip" aria-hidden="true">
            <MoreHorizontal size={22} strokeWidth={2} />
          </span>
          <span className="mg-sidebar-link-text">עוד</span>
        </button>
      </nav>

      {/* Slide-up panel — sits over the nav area, anchored to the
          bottom of the sidebar so it appears to rise out of "עוד".
          Glass styling lets the icons beneath show through. */}
      <div
        className={`mg-sidebar-extras${extrasOpen ? ' open' : ''}`}
        role="menu"
        aria-hidden={!extrasOpen}
      >
        <div className="mg-sidebar-extras-head">
          <span>עוד</span>
          <button
            type="button"
            className="mg-sidebar-extras-close"
            onClick={() => setExtrasOpen(false)}
            aria-label="סגירה"
          >
            <X size={14} strokeWidth={1.7} aria-hidden="true" />
          </button>
        </div>
        <div className="mg-sidebar-extras-list">
          {EXTRAS.map((item) => {
            const Icon = item.icon
            const active = item.key === screen
            return (
              <button
                key={item.key}
                type="button"
                className={`mg-sidebar-link mg-sidebar-sub${active ? ' on' : ''}`}
                data-screen={item.key}
                onClick={() => { setExtrasOpen(false); navigate(item.to) }}
                title={item.label}
              >
                <span className="mg-sidebar-link-chip" aria-hidden="true">
                  <Icon size={18} strokeWidth={2} />
                </span>
                <span className="mg-sidebar-link-text">{item.label}</span>
              </button>
            )
          })}

          {/* Feedback — an action, not a route. */}
          <button
            type="button"
            className="mg-sidebar-link mg-sidebar-sub"
            data-screen="feedback"
            onClick={() => { setExtrasOpen(false); onOpenFeedback?.() }}
            title="דברו אלינו"
          >
            <span className="mg-sidebar-link-chip" aria-hidden="true">
              <MessageSquarePlus size={18} strokeWidth={2} />
            </span>
            <span className="mg-sidebar-link-text">דברו אלינו</span>
          </button>
        </div>
      </div>

      <div className="mg-sidebar-foot">
        {profileLive
          ? <SidebarProfileLive name={name} role={role} email={user?.email} />
          : <SidebarProfileStatic name={name} role={role} email={user?.email} />}
        {isAdmin && (
          <button type="button" className="mg-sidebar-util mg-sidebar-admin" onClick={() => navigate(ROUTES.ADMIN)} title="קונסולת ניהול">
            <Shield size={16} strokeWidth={1.6} aria-hidden="true" />
            <span>ניהול</span>
          </button>
        )}
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

/* ── Desktop profile-health chip ───────────────────────────────────
   Shared markup. `health` is null in the static (pre-hover) variant;
   when present it paints a tier-coloured ring around the avatar + a
   "ציון פרופיל NN%" line that fades in with the expanded rail. */
function SidebarProfileChipInner({ name, role, email, health, loading, onClick }) {
  const score = health?.score ?? 0
  const tier = health?.tier
  const showScore = !!health && !loading
  return (
    <button
      type="button"
      className="mg-sidebar-profile"
      onClick={onClick}
      title={name || 'הפרופיל שלי'}
      aria-label={health ? `בריאות הפרופיל${showScore ? ` ${score} אחוז` : ''} — פתיחת פירוט` : (name || 'הפרופיל שלי')}
    >
      <span className="mg-sidebar-profile-avatar-wrap">
        {showScore && (
          <svg className="mg-sidebar-profile-ring" viewBox="0 0 40 40" aria-hidden="true">
            <circle className="msp-ring-track" cx="20" cy="20" r={RING_R} />
            <circle
              className="msp-ring-fill"
              cx="20" cy="20" r={RING_R}
              style={{ color: tier.color }}
              strokeDasharray={`${RING_C * (score / 100)} ${RING_C}`}
              strokeLinecap="round"
            />
          </svg>
        )}
        <span className="mg-sidebar-profile-avatar">{initial(name)}</span>
      </span>
      <span className="mg-sidebar-profile-text">
        <span className="mg-sidebar-profile-name">{name || 'הפרופיל שלי'}</span>
        {health
          ? (
            <span className="mg-sidebar-profile-score">
              ציון פרופיל{' '}
              <span className="mg-sidebar-profile-score-num" style={tier ? { color: tier.color } : undefined}>
                {loading ? '··' : `${score}%`}
              </span>
            </span>
          )
          : <span className="mg-sidebar-profile-meta">{role || email || ''}</span>}
      </span>
    </button>
  )
}

/* Pre-hover placeholder — no score, no data hooks. */
function SidebarProfileStatic({ name, role, email }) {
  return <SidebarProfileChipInner name={name} role={role} email={email} health={null} />
}

/* Live variant — computes health on mount (only mounted after first rail
   hover) and owns the breakdown modal. */
function SidebarProfileLive({ name, role, email }) {
  const navigate = useNavigate()
  const { health, loading } = useProfileHealth()
  const [modalOpen, setModalOpen] = useState(false)
  const navTo = (to, state) => navigate(to, state ? { state } : undefined)
  return (
    <>
      <SidebarProfileChipInner
        name={name} role={role} email={email}
        health={health} loading={loading}
        onClick={() => setModalOpen(true)}
      />
      <ProfileHealthModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        health={health}
        loading={loading}
        onNavigate={navTo}
      />
    </>
  )
}
