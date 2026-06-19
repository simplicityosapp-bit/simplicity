/* ════════════════════════════════════════════════════════════════
   ROUTES — Simplicity (single source of navigation paths)
   ════════════════════════════════════════════════════════════════
   drawers ומודאלים אינם מקבלים route — הם נפתחים מעל המסך הנוכחי.
   ════════════════════════════════════════════════════════════════ */

export const ROUTES = {
  // Auth (אימייל+סיסמה + Google, הוכרע 25.05.26)
  LOGIN: '/login',
  SIGNUP: '/signup', // נוסף — מסך הרשמה (החלטת auth)
  RESET_PASSWORD: '/reset-password', // נוסף — איפוס סיסמה (החלטת auth)
  UPDATE_PASSWORD: '/update-password', // יעד קישור-האיפוס: מסך בחירת סיסמה חדשה
  ONBOARDING: '/onboarding', // 9-step wizard, gates Home until completed

  // Public legal pages — reachable WITHOUT login (and crawlable). /privacy
  // and /terms redirect to /legal with the matching ?tab=.
  LEGAL: '/legal',
  PRIVACY: '/privacy',
  TERMS: '/terms',
  // Marketing landing — shown at "/" to logged-out visitors; ALSO reachable at
  // "/landing" by anyone (incl. logged-in users) to view it directly.
  LANDING: '/landing',

  // Main screens
  HOME: '/',
  CLIENTS: '/clients',
  FINANCE: '/finance',
  TASKS: '/tasks',
  LEADS: '/leads',
  CALENDAR: '/calendar',
  GOALS: '/goals',
  MOON_GLANCE: '/moon',
  REPORTS: '/reports',
  SETTINGS: '/settings',
  PROJECTS: '/projects',
  TRASH: '/trash',
  INSIGHTS: '/insights',
  CONNECTIONS: '/connections',
  CONNECTION_CALENDAR: '/connections/calendar', // sub-screen: Google Calendar
  CONNECTION_INVOICES: '/connections/invoices', // sub-screen: invoices (Green Invoice / SUMIT)
  CONNECTION_WHATSAPP: '/connections/whatsapp', // sub-screen: WhatsApp message templates

  // Admin console — owner-only (simplicity.os.app@gmail.com). A separate
  // world: gated by email in App.jsx, served by the `admin` edge function,
  // never touches the main app's chrome or RLS. Non-owners are bounced home.
  ADMIN: '/admin',
  ADMIN_USERS: '/admin/users',
  ADMIN_FEEDBACK: '/admin/feedback',
  ADMIN_ANALYTICS: '/admin/analytics',

  // Dynamic routes
  CLIENT: '/clients/:id',
  PROJECT: '/projects/:id',
}

/* The owner email allowed into /admin. Mirror of the server-side check in
   supabase/functions/admin — the client gate is only UX; the edge function
   is the real authority. */
export const ADMIN_EMAIL = 'simplicity.os.app@gmail.com'

export const DEFAULT_ROUTE = ROUTES.HOME

/* Helper לבניית נתיב דינמי.
   שימוש: buildRoute(ROUTES.CLIENT, { id: '123' }) → '/clients/123' */
export const buildRoute = (route, params) => {
  return Object.entries(params).reduce(
    (path, [key, value]) => path.replace(`:${key}`, value),
    route
  )
}
