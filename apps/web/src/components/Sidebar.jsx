import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Home, Users, Heart, Wallet, Folder, ClipboardList, Target, Calendar, Settings,
  Sun, Moon, LogOut, BarChart3, MoreHorizontal, Trash2, Sparkles, X, MessageSquarePlus, Shield, Plug, FileText, LayoutTemplate,
  MessagesSquare,
} from 'lucide-react'
import { DRAWER_NAV } from '../lib/nav'
import { ROUTES } from '../lib/routes'
import { isAdminUser } from '../lib/admin'
import { roleLabel } from '../lib/preferences'
import { useAuth } from '../auth/AuthContext'
import { useUserPreferences } from '../hooks/useUserPreferences'
import { useProfileHealth } from '../hooks/useProfileHealth'
import { useT } from '../i18n/useT'
import ProfileHealthModal from '../modals/ProfileHealthModal'
import './Sidebar.css'
import { Box, Txt, Btn } from './ui'

const ICONS = { Home, Users, Heart, Wallet, Folder, ClipboardList, Target, Calendar, Settings, Plug, Moon }

const initial = (name) => name?.trim()?.[0] ?? '·'
const RING_R = 18
const RING_C = 2 * Math.PI * RING_R

/* Extras — screens that aren't in the main bottom-nav set. Surface
   from a slide-up panel anchored over the "עוד" button. */
const EXTRAS = [
  { key: 'sitePages', labelKey: 'extras.sitePages', icon: LayoutTemplate, to: ROUTES.SITE_PAGES },
  /* → the room, not the profile gate: the gate redirects itself when needed. */
  { key: 'community', labelKey: 'extras.community', icon: MessagesSquare, to: ROUTES.COMMUNITY_CHAT, beta: true },
  { key: 'reports',  labelKey: 'extras.reports',  icon: BarChart3,  to: ROUTES.REPORTS },
  { key: 'insights', labelKey: 'extras.insights', icon: Sparkles,   to: ROUTES.INSIGHTS },
  /* connections demoted here from the main grid (owner call 2026-07-19); reuses
     the existing items.connections label. מבט על took its grid slot. */
  { key: 'connections', labelKey: 'items.connections', icon: Plug,  to: ROUTES.CONNECTIONS },
  { key: 'trash',    labelKey: 'extras.trash',    icon: Trash2,     to: ROUTES.TRASH },
  { key: 'legal',    labelKey: 'extras.legal',    icon: FileText,   to: ROUTES.LEGAL },
]

/* ════════════════════════════════════════════════════════════════
   Sidebar — desktop-only nav (≥768px). Collapsed by default; the
   sidebar is a narrow rail of icon-chips coloured by the per-screen
   brand palette. Hovering the rail expands it into a labelled menu.
   Background is a vertical blend of all five brand colours under a
   heavy blur, echoing the bottom-nav language on mobile.
   ════════════════════════════════════════════════════════════════ */
export default function Sidebar({ screen, isDark, onToggleTheme, onOpenFeedback }) {
  const { t } = useT('nav')
  const navigate = useNavigate()
  const { signOut, user } = useAuth()
  const { prefs } = useUserPreferences()
  const isAdmin = isAdminUser(user)
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
    <Box as="aside" className="mg-sidebar" aria-label={t('ariaMainNav')} ref={sidebarRef} onMouseEnter={() => setProfileLive(true)}>
      <Box className="mg-sidebar-brand-row">
        <img
          className="mg-sidebar-logo"
          src="/logo-light.png"
          alt=""
          aria-hidden="true"
        />
        <Box className="mg-sidebar-brand-text">
          <Txt as="p" className="mg-sidebar-brand">Simplicity</Txt>
          <Txt as="p" className="mg-sidebar-tag">Business OS</Txt>
        </Box>
      </Box>

      <Box as="nav" className="mg-sidebar-nav">
        {DRAWER_NAV.map((item) => {
          const Icon = ICONS[item.icon] || Home
          const active = item.key === screen
          return (
            <Btn
              key={item.key}
              type="button"
              className={`mg-sidebar-link${active ? ' on' : ''}`}
              data-screen={item.key}
              onClick={() => navigate(item.to)}
              title={t(`items.${item.key}`)}
            >
              <Txt className="mg-sidebar-link-chip" aria-hidden="true">
                <Icon size={22} strokeWidth={1.5} />
              </Txt>
              <Txt className="mg-sidebar-link-text">{t(`items.${item.key}`)}</Txt>
            </Btn>
          )
        })}

        {/* "עוד" — opens the slide-up extras panel */}
        <Btn
          type="button"
          className={`mg-sidebar-link mg-sidebar-more${extrasOpen ? ' is-open' : ''}`}
          data-screen="more"
          onClick={(e) => { e.stopPropagation(); setExtrasOpen((v) => !v) }}
          aria-expanded={extrasOpen}
          title={t('more')}
        >
          <Txt className="mg-sidebar-link-chip" aria-hidden="true">
            <MoreHorizontal size={22} strokeWidth={1.5} />
          </Txt>
          <Txt className="mg-sidebar-link-text">{t('more')}</Txt>
        </Btn>
      </Box>

      {/* Slide-up panel — sits over the nav area, anchored to the
          bottom of the sidebar so it appears to rise out of "עוד".
          Glass styling lets the icons beneath show through. */}
      <Box
        className={`mg-sidebar-extras${extrasOpen ? ' open' : ''}`}
        role="menu"
        aria-hidden={!extrasOpen}
      >
        <Box className="mg-sidebar-extras-head">
          <Txt>{t('more')}</Txt>
          <Btn
            type="button"
            className="mg-sidebar-extras-close"
            onClick={() => setExtrasOpen(false)}
            aria-label={t('close')}
          >
            <X size={14} strokeWidth={1.7} aria-hidden="true" />
          </Btn>
        </Box>
        <Box className="mg-sidebar-extras-list">
          {EXTRAS.map((item) => {
            const Icon = item.icon
            const active = item.key === screen
            return (
              <Btn
                key={item.key}
                type="button"
                className={`mg-sidebar-link mg-sidebar-sub${active ? ' on' : ''}`}
                data-screen={item.key}
                onClick={() => { setExtrasOpen(false); navigate(item.to) }}
                title={t(item.labelKey)}
              >
                <Txt className="mg-sidebar-link-chip" aria-hidden="true">
                  <Icon size={18} strokeWidth={1.5} />
                </Txt>
                <Txt className="mg-sidebar-link-text">
                  {t(item.labelKey)}
                  {item.beta && <Txt as="span" className="mg-nav-beta">beta</Txt>}
                </Txt>
              </Btn>
            )
          })}

          {/* Feedback — an action, not a route. */}
          <Btn
            type="button"
            className="mg-sidebar-link mg-sidebar-sub"
            data-screen="feedback"
            onClick={() => { setExtrasOpen(false); onOpenFeedback?.() }}
            title={t('feedback')}
          >
            <Txt className="mg-sidebar-link-chip" aria-hidden="true">
              <MessageSquarePlus size={18} strokeWidth={1.5} />
            </Txt>
            <Txt className="mg-sidebar-link-text">{t('feedback')}</Txt>
          </Btn>
        </Box>
      </Box>

      <Box className="mg-sidebar-foot">
        {profileLive
          ? <SidebarProfileLive name={name} role={role} email={user?.email} />
          : <SidebarProfileStatic name={name} role={role} email={user?.email} />}
        {isAdmin && (
          <Btn type="button" className="mg-sidebar-util mg-sidebar-admin" onClick={() => navigate(ROUTES.ADMIN)} title={t('admin.console')}>
            <Shield size={16} strokeWidth={1.6} aria-hidden="true" />
            <Txt>{t('admin.label')}</Txt>
          </Btn>
        )}
        <Btn type="button" className="mg-sidebar-util" onClick={onToggleTheme} title={isDark ? t('theme.toLight') : t('theme.toDark')}>
          {isDark
            ? <Sun size={16} strokeWidth={1.6} aria-hidden="true" />
            : <Moon size={16} strokeWidth={1.6} aria-hidden="true" />}
          <Txt>{isDark ? t('theme.toLight') : t('theme.toDark')}</Txt>
        </Btn>
        <Btn type="button" className="mg-sidebar-util" onClick={signOut} title={t('logout')}>
          <LogOut size={16} strokeWidth={1.6} aria-hidden="true" />
          <Txt>{t('logout')}</Txt>
        </Btn>
      </Box>
    </Box>
  )
}

/* ── Desktop profile-health chip ───────────────────────────────────
   Shared markup. `health` is null in the static (pre-hover) variant;
   when present it paints a tier-coloured ring around the avatar + a
   "ציון פרופיל NN%" line that fades in with the expanded rail. */
function SidebarProfileChipInner({ name, role, email, health, loading, onClick }) {
  const { t } = useT('nav')
  const score = health?.score ?? 0
  const tier = health?.tier
  const showScore = !!health && !loading
  return (
    <Btn
      type="button"
      className="mg-sidebar-profile"
      onClick={onClick}
      title={name || t('profile.myProfile')}
      aria-label={health ? (showScore ? t('profile.healthAriaWithScore', { score }) : t('profile.healthAria')) : (name || t('profile.myProfile'))}
    >
      <Txt className="mg-sidebar-profile-avatar-wrap">
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
        <Txt className="mg-sidebar-profile-avatar">{initial(name)}</Txt>
      </Txt>
      <Txt className="mg-sidebar-profile-text">
        <Txt className="mg-sidebar-profile-name">{name || t('profile.myProfile')}</Txt>
        {health
          ? (
            <Txt className="mg-sidebar-profile-score">
              {t('profile.score')}{' '}
              <Txt className="mg-sidebar-profile-score-num" style={tier ? { color: tier.color } : undefined}>
                {loading ? '··' : `${score}%`}
              </Txt>
            </Txt>
          )
          : <Txt className="mg-sidebar-profile-meta">{role || email || ''}</Txt>}
      </Txt>
    </Btn>
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
