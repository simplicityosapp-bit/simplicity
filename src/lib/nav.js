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
  return 'home'
}

/* Bottom tab bar — 4 quick screens + the menu button (handled separately).
   Order chosen 25.05.26 (matches the prototype's .mg-bottombar). */
export const BOTTOM_NAV = [
  { key: 'clients', label: 'לקוחות', icon: 'Users', to: ROUTES.CLIENTS },
  { key: 'tasks', label: 'משימות', icon: 'ClipboardList', to: ROUTES.TASKS },
  { key: 'home', label: 'בית', icon: 'Home', to: ROUTES.HOME },
  { key: 'finance', label: 'כסף', icon: 'Wallet', to: ROUTES.FINANCE },
]

/* Drawer nav grid — every reachable screen (the bottom bar only holds 4).
   Order matches the prototype drawer grid. */
export const DRAWER_NAV = [
  { key: 'home', label: 'בית', icon: 'Home', to: ROUTES.HOME },
  { key: 'clients', label: 'לקוחות', icon: 'Users', to: ROUTES.CLIENTS },
  { key: 'leads', label: 'לידים', icon: 'Heart', to: ROUTES.LEADS },
  { key: 'finance', label: 'כסף', icon: 'Wallet', to: ROUTES.FINANCE },
  { key: 'projects', label: 'פרויקטים', icon: 'Folder', to: ROUTES.PROJECTS },
  { key: 'tasks', label: 'משימות', icon: 'ClipboardList', to: ROUTES.TASKS },
  { key: 'goals', label: 'יעדים', icon: 'Target', to: ROUTES.GOALS },
  { key: 'calendar', label: 'יומן', icon: 'Calendar', to: ROUTES.CALENDAR },
  { key: 'connections', label: 'חיבורים', icon: 'Plug', to: ROUTES.CONNECTIONS },
  { key: 'settings', label: 'הגדרות', icon: 'Settings', to: ROUTES.SETTINGS },
]
