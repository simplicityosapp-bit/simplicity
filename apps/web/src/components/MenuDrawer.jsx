import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Home, Users, Heart, Wallet, Folder, ClipboardList, Target, Calendar, Settings,
  Moon, Activity, BarChart3, Trash2, Sun, X, Pencil, LogOut, MessageSquarePlus, Shield, Plug, LayoutTemplate,
  MessagesSquare, Gem,
} from 'lucide-react'
import { DRAWER_NAV } from '../lib/nav'
import { ROUTES } from '../lib/routes'
import { COMMUNITY_ENABLED } from '../lib/community'
import { isAdminUser } from '../lib/admin'
import { roleLabel } from '../lib/preferences'
import { useUserPreferences } from '../hooks/useUserPreferences'
import { useProfileHealth } from '../hooks/useProfileHealth'
import { useAuth } from '../auth/AuthContext'
import { useT } from '../i18n/useT'
import ProfileHealthModal from '../modals/ProfileHealthModal'
import './MenuDrawer.css'
import { Box, Txt, Btn } from './ui'

const GRID_ICONS = { Home, Users, Heart, Wallet, Folder, ClipboardList, Target, Calendar, Settings, Plug, Moon }

function initial(name) {
  return name?.trim()?.[0] ?? '·'
}

export default function MenuDrawer({ open, onClose, screen, isDark, onToggleTheme, onOpenFeedback }) {
  const { t } = useT('nav')
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

  const isAdmin = isAdminUser(user)

  const profile = prefs?.profile || {}
  const name = profile.full_name || ''
  const role = profile.role === 'other'
    ? (profile.role_other || '')
    : roleLabel(profile.role, prefs?.design?.gender)

  return (
    <>
      <Box
        className={`drawer-overlay${open ? ' open' : ''}`}
        onClick={onClose}
        aria-hidden="true"
      />
      <Box as="aside"
        className={`drawer-panel${open ? ' open' : ''}`}
        aria-label={t('ariaDrawerNav')}
        aria-hidden={!open}
      >
        <Box className="drawer-title">
          <Txt>{t('more')}</Txt>
          <Btn className="drawer-close" onClick={onClose} aria-label={t('close')}>
            <X size={16} strokeWidth={1.5} />
          </Btn>
        </Box>
        <Txt as="p" className="drawer-title-sub">{t('drawerSubtitle')}</Txt>

        {/* Profile chip → opens the profile-health breakdown. The score
            (and the data hooks behind it) is computed lazily: ProfileChipLive
            only mounts while the drawer is open, so nothing fetches on app
            load. While closed we show a static placeholder chip. */}
        {open
          ? <ProfileChipLive name={name} role={role} email={user?.email} onNavigate={navTo} />
          : <ProfileChipStatic name={name} role={role} email={user?.email} />}

        {/* Screen grid — every reachable screen */}
        <Box as="nav" className="drawer-nav-mobile" aria-label={t('ariaScreensNav')}>
          {DRAWER_NAV.map((item) => {
            const Icon = GRID_ICONS[item.icon] || Settings
            return (
              <Btn
                key={item.key}
                className={`dnav-item${screen === item.key ? ' active' : ''}`}
                onClick={() => goTo(item.to)}
              >
                <Icon size={20} strokeWidth={1.5} aria-hidden="true" />
                <Txt>{t(`items.${item.key}`)}</Txt>
              </Btn>
            )
          })}
        </Box>

        {/* Owner-only admin console entry — hidden for everyone else. */}
        {isAdmin && (
          <>
            <Txt as="p" className="drawer-section-lbl">{t('admin.label')}</Txt>
            <Btn className="drawer-link" onClick={() => goTo(ROUTES.ADMIN)}>
              <Txt className="drawer-link-icon"><Shield size={18} strokeWidth={1.5} /></Txt>
              <Txt className="drawer-link-text">
                {t('admin.console')}
                <Txt className="drawer-link-text-sub">{t('admin.consoleSub')}</Txt>
              </Txt>
            </Btn>
          </>
        )}

        <Txt as="p" className="drawer-section-lbl">{t('sections.personal')}</Txt>

        <Btn className="drawer-link" onClick={() => goTo(ROUTES.SITE_PAGES)}>
          <Txt className="drawer-link-icon"><LayoutTemplate size={18} strokeWidth={1.5} /></Txt>
          <Txt className="drawer-link-text">
            {t('extras.sitePages')}
            <Txt className="drawer-link-text-sub">{t('items.sitePagesSub')}</Txt>
          </Txt>
        </Btn>

        {/* → the room. A user with no profile is bounced to the gate by the
            chat screen itself, so nav never has to know about that step.
            Hidden while COMMUNITY_ENABLED is false — the route stays open. */}
        {COMMUNITY_ENABLED && (
          <Btn className="drawer-link" onClick={() => goTo(ROUTES.COMMUNITY_CHAT)}>
            <Txt className="drawer-link-icon"><MessagesSquare size={18} strokeWidth={1.5} /></Txt>
            <Txt className="drawer-link-text">
              <Txt as="span" className="drawer-link-title">
                {t('extras.community')}<Txt as="span" className="mg-nav-beta">beta</Txt>
              </Txt>
              <Txt className="drawer-link-text-sub">{t('items.communitySub')}</Txt>
            </Txt>
          </Btn>
        )}

        {/* המנוי של המשתמש — מסלול Simplicity שלו (הועבר מ"הגדרות"). */}
        <Btn className="drawer-link" onClick={() => goTo(ROUTES.SUBSCRIPTION)}>
          <Txt className="drawer-link-icon"><Gem size={18} strokeWidth={1.5} /></Txt>
          <Txt className="drawer-link-text">
            {t('extras.subscription')}
            <Txt className="drawer-link-text-sub">{t('items.subscriptionSub')}</Txt>
          </Txt>
        </Btn>

        <Btn className="drawer-link tint-purple" onClick={() => goTo(ROUTES.INSIGHTS)}>
          <Txt className="drawer-link-icon"><Activity size={18} strokeWidth={1.5} /></Txt>
          <Txt className="drawer-link-text">
            {t('extras.insights')}
            <Txt className="drawer-link-text-sub">{t('items.insightsSub')}</Txt>
          </Txt>
        </Btn>

        {/* מבט על now lives in the screen grid above; connections was moved out
            of the grid to here (owner call 2026-07-19). */}
        <Btn className="drawer-link" onClick={() => goTo(ROUTES.CONNECTIONS)}>
          <Txt className="drawer-link-icon"><Plug size={18} strokeWidth={1.5} /></Txt>
          <Txt className="drawer-link-text">
            {t('items.connections')}
          </Txt>
        </Btn>

        <Btn className="drawer-link" onClick={() => goTo(ROUTES.REPORTS)}>
          <Txt className="drawer-link-icon"><BarChart3 size={18} strokeWidth={1.5} /></Txt>
          <Txt className="drawer-link-text">
            {t('extras.reports')}
            <Txt className="drawer-link-text-sub">{t('items.reportsSub')}</Txt>
          </Txt>
        </Btn>

        <Txt as="p" className="drawer-section-lbl">{t('sections.settings')}</Txt>

        <Btn className="drawer-link tint-purple" onClick={() => { onClose(); onOpenFeedback?.() }}>
          <Txt className="drawer-link-icon"><MessageSquarePlus size={18} strokeWidth={1.5} /></Txt>
          <Txt className="drawer-link-text">
            {t('feedback')}
            <Txt className="drawer-link-text-sub">{t('items.feedbackSub')}</Txt>
          </Txt>
        </Btn>

        <Btn className="drawer-link tint-amber" onClick={() => goTo(ROUTES.TRASH)}>
          <Txt className="drawer-link-icon"><Trash2 size={18} strokeWidth={1.5} /></Txt>
          <Txt className="drawer-link-text">
            {t('extras.trash')}
            <Txt className="drawer-link-text-sub">{t('items.trashSub')}</Txt>
          </Txt>
        </Btn>

        {/* Theme toggle — sun/moon slider switch */}
        <Btn className="drawer-link drawer-theme" onClick={onToggleTheme}>
          <Txt className="theme-switch" aria-hidden="true">
            <Txt className="theme-switch-icon theme-switch-sun"><Sun size={16} strokeWidth={1.5} /></Txt>
            <Txt className="theme-switch-icon theme-switch-moon"><Moon size={16} strokeWidth={1.5} /></Txt>
            <Txt className="theme-switch-thumb" />
          </Txt>
          <Txt className="drawer-link-text">
            {isDark ? t('theme.toLight') : t('theme.toDarkAlt')}
            <Txt className="drawer-link-text-sub">{t('theme.sub')}</Txt>
          </Txt>
        </Btn>

        {/* Logout */}
        <Btn
          className="drawer-link tint-amber"
          onClick={() => { onClose(); signOut() }}
        >
          <Txt className="drawer-link-icon"><LogOut size={18} strokeWidth={1.5} /></Txt>
          <Txt className="drawer-link-text">
            {t('signOut')}
            <Txt className="drawer-link-text-sub">{user?.email || ''}</Txt>
          </Txt>
        </Btn>
      </Box>
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
  const { t } = useT('nav')
  const score = health?.score ?? 0
  const tier = health?.tier
  const showScore = !!health && !loading
  return (
    <Btn
      className="drawer-profile"
      onClick={onClick}
      aria-label={health ? (showScore ? t('profile.healthAriaWithScore', { score }) : t('profile.healthAria')) : undefined}
    >
      <Txt className="drawer-profile-avatar-wrap">
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
        <Txt className="drawer-profile-avatar">{initial(name)}</Txt>
      </Txt>
      <Txt className="drawer-profile-text">
        <Txt className="drawer-profile-name">{name || t('profile.myProfile')}</Txt>
        <Txt className="drawer-profile-meta">{role || email || ''}</Txt>
      </Txt>
      {health
        ? (
          <Txt className="drawer-profile-score" style={tier ? { color: tier.color } : undefined}>
            <Txt className="drawer-profile-score-lbl">{t('profile.score')}</Txt>
            <Txt className="drawer-profile-score-val">{loading ? '··' : `${score}%`}</Txt>
          </Txt>
        )
        : (
          <Txt className="drawer-profile-edit" aria-hidden="true">
            <Pencil size={16} strokeWidth={1.5} />
          </Txt>
        )}
    </Btn>
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
