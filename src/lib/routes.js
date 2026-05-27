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

  // Dynamic routes
  CLIENT: '/clients/:id',
  PROJECT: '/projects/:id',
}

export const DEFAULT_ROUTE = ROUTES.HOME

/* Helper לבניית נתיב דינמי.
   שימוש: buildRoute(ROUTES.CLIENT, { id: '123' }) → '/clients/123' */
export const buildRoute = (route, params) => {
  return Object.entries(params).reduce(
    (path, [key, value]) => path.replace(`:${key}`, value),
    route
  )
}
