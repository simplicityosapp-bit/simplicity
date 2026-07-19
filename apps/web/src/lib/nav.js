/* ════════════════════════════════════════════════════════════════
   NAV CONFIG — single source for the screen key + nav item lists.
   ════════════════════════════════════════════════════════════════
   The "screen key" drives data-screen on the .app root (per-screen tint
   + nav active state). It is derived from the route path.
   ════════════════════════════════════════════════════════════════ */

import { ROUTES } from './routes'

/* Map a pathname to its screen key. */
export function screenKeyFromPath(pathname) {
  if (pathname.startsWith('/clients')) return 'clients'
  if (pathname.startsWith('/finance')) return 'finance'
  if (pathname.startsWith('/tasks')) return 'tasks'
  /* /leads/pages is a distinct screen (its own help + tour); check it
     before the /leads prefix so it doesn't inherit the leads guidance. */
  if (pathname.startsWith('/leads/pages')) return 'leadPages'
  if (pathname.startsWith('/leads')) return 'leads'
  /* /bookings/pages mirrors leadPages: its own frosted-glass screen so the
     config cards' backdrop-filter has a photo to blur (see index.css). */
  if (pathname.startsWith('/bookings/pages')) return 'bookingPages'
  /* /pages — the unified page-builder hub (its own screen key for tint/help). */
  if (pathname.startsWith('/pages')) return 'sitePages'
  if (pathname.startsWith('/calendar')) return 'calendar'
  if (pathname.startsWith('/goals')) return 'goals'
  if (pathname.startsWith('/moon')) return 'moon'
  if (pathname.startsWith('/reports')) return 'reports'
  if (pathname.startsWith('/settings')) return 'settings'
  if (pathname.startsWith('/projects')) return 'projects'
  if (pathname.startsWith('/trash')) return 'trash'
  if (pathname.startsWith('/insights')) return 'insights'
  if (pathname.startsWith('/connections')) return 'connections'
  if (pathname.startsWith('/onboarding')) return 'onboarding'
  /* One key for the whole /community/* feature (profile gate today, the room
     next), the way 'connections' covers its sub-screens rather than each one
     claiming a key. Single word, so no camelCase question — cf. leadPages /
     bookingPages / sitePages. Its look is wired in index.css, deliberately
     pointing at home's art for now; changing it is a rule change there, not a
     code change here. */
  if (pathname.startsWith('/community')) return 'community'
  return 'home'
}

/* Bottom tab bar — 4 quick screens + the menu button (handled separately).
   Order chosen 25.05.26 (matches the prototype's .mg-bottombar). Display
   labels resolve via i18n at the call site (nav:items.<key>). */
export const BOTTOM_NAV = [
  { key: 'clients', icon: 'Users', to: ROUTES.CLIENTS },
  { key: 'tasks', icon: 'ClipboardList', to: ROUTES.TASKS },
  { key: 'home', icon: 'Home', to: ROUTES.HOME },
  { key: 'finance', icon: 'Wallet', to: ROUTES.FINANCE },
]

/* Drawer nav grid — every reachable screen (the bottom bar only holds 4).
   Order matches the prototype drawer grid. Display labels resolve via i18n
   at the call site (nav:items.<key>). */
export const DRAWER_NAV = [
  { key: 'home', icon: 'Home', to: ROUTES.HOME },
  { key: 'clients', icon: 'Users', to: ROUTES.CLIENTS },
  { key: 'leads', icon: 'Heart', to: ROUTES.LEADS },
  { key: 'finance', icon: 'Wallet', to: ROUTES.FINANCE },
  { key: 'projects', icon: 'Folder', to: ROUTES.PROJECTS },
  { key: 'tasks', icon: 'ClipboardList', to: ROUTES.TASKS },
  { key: 'goals', icon: 'Target', to: ROUTES.GOALS },
  { key: 'calendar', icon: 'Calendar', to: ROUTES.CALENDAR },
  /* מבט על promoted to the main grid (owner call 2026-07-19); connections moved
     to the "עוד" extras panel / mobile personal section. */
  { key: 'moon', icon: 'Moon', to: ROUTES.MOON_GLANCE },
  { key: 'settings', icon: 'Settings', to: ROUTES.SETTINGS },
]
