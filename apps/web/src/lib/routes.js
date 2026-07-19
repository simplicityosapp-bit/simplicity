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
  LEAD_PAGES: '/leads/pages', // in-app builder + management for public lead pages
  BOOKING_PAGES: '/bookings/pages', // in-app builder + management for public booking pages
  SITE_PAGES: '/pages', // unified page-builder hub (3 tiles → dedicated sub-screens)
  SITE_PAGE_KIND: '/pages/:kind', // a kind's dedicated builder sub-screen (landing | lead)
  CALENDAR: '/calendar',
  GOALS: '/goals',
  MOON_GLANCE: '/moon',
  REPORTS: '/reports',
  SETTINGS: '/settings',
  SUBSCRIPTION: '/subscription', // the user's own Simplicity plan (promoted out of Settings)
  PROJECTS: '/projects',
  TRASH: '/trash',
  INSIGHTS: '/insights',
  CONNECTIONS: '/connections',
  CONNECTION_CALENDAR: '/connections/calendar', // sub-screen: Google Calendar
  CONNECTION_INVOICES: '/connections/invoices', // sub-screen: invoices (Green Invoice / SUMIT)
  CONNECTION_GROW: '/connections/grow', // sub-screen: Grow payment gateway (סליקה)
  CONNECTION_WHATSAPP: '/connections/whatsapp', // sub-screen: WhatsApp message templates

  // Community. COMMUNITY_CHAT is the room and the feature's entry point — it
  // is what nav links to. COMMUNITY_PROFILE is the display-name gate in front
  // of it: a community_profiles row is required before a first post (FK,
  // migration 0086), so the chat redirects here when there isn't one. Nav
  // deliberately points at the room, not the gate — the gate is a step, not a
  // destination, and it disappears for good once the row exists.
  COMMUNITY_CHAT: '/community/chat',
  COMMUNITY_PROFILE: '/community/profile',
  // The community calendar — a list of member-posted events, off the room's
  // header. Same gate as the room (a profile is needed to take part).
  COMMUNITY_EVENTS: '/community/events',

  // Admin console — owner-only (simplicity.os.app@gmail.com). A separate
  // world: gated by email in App.jsx, served by the `admin` edge function,
  // never touches the main app's chrome or RLS. Non-owners are bounced home.
  ADMIN: '/admin',
  ADMIN_USERS: '/admin/users',
  ADMIN_FEEDBACK: '/admin/feedback',
  ADMIN_ANALYTICS: '/admin/analytics',

  // Public lead-capture landing page — reachable WITHOUT login (served
  // before the auth gate, like /legal and /landing). The :pageId is the
  // lead_pages row uuid; the page talks only to the `lead-intake` edge fn.
  LEAD_PAGE: '/lead/:pageId',

  // Public appointment-booking page — reachable WITHOUT login (served before
  // the auth gate, like /lead). The :pageId is the booking_pages uuid OR its
  // custom slug; the page talks only to the `booking-intake` edge fn.
  BOOKING_PAGE: '/book/:pageId',

  // Public landing page (page-builder, kind='landing') — reachable WITHOUT
  // login. The :pageId is the site_pages uuid OR its custom slug.
  SITE_PAGE: '/p/:pageId',

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
