import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import { DEFAULT_LANG, LANG_CODES } from './config'

/* ════════════════════════════════════════════════════════════════
   I18N INIT — react-i18next setup.
   ════════════════════════════════════════════════════════════════
   The active UI language is owned by i18next and cached in
   localStorage ('mg-lang') so it survives reloads and works BOTH
   pre-auth (login/landing) and post-auth. For signed-in users the
   persisted preference (prefs.design.language) reconciles into this
   via <I18nSync/>. Gender is applied per-call as i18next `context`
   (see useT.js). Add a namespace? import its 4 JSONs + register below.
   ════════════════════════════════════════════════════════════════ */

import heCommon from './locales/he/common.json'
import enCommon from './locales/en/common.json'
import esCommon from './locales/es/common.json'
import frCommon from './locales/fr/common.json'
import heAuth from './locales/he/auth.json'
import enAuth from './locales/en/auth.json'
import esAuth from './locales/es/auth.json'
import frAuth from './locales/fr/auth.json'
/* English-first rollout namespaces — he (source) + en only; es/fr fall back
   to he (fallbackLng) until their language pass fills the JSON. */
import heNav from './locales/he/nav.json'
import enNav from './locales/en/nav.json'
import heGoals from './locales/he/goals.json'
import enGoals from './locales/en/goals.json'
import heTrash from './locales/he/trash.json'
import enTrash from './locales/en/trash.json'
import heHome from './locales/he/home.json'
import enHome from './locales/en/home.json'
import heClients from './locales/he/clients.json'
import enClients from './locales/en/clients.json'
import heFinance from './locales/he/finance.json'
import enFinance from './locales/en/finance.json'
import heCalendar from './locales/he/calendar.json'
import enCalendar from './locales/en/calendar.json'
import heLeads from './locales/he/leads.json'
import enLeads from './locales/en/leads.json'
import heProjects from './locales/he/projects.json'
import enProjects from './locales/en/projects.json'
import heTasks from './locales/he/tasks.json'
import enTasks from './locales/en/tasks.json'
import heConnections from './locales/he/connections.json'
import enConnections from './locales/en/connections.json'
import heAdmin from './locales/he/admin.json'
import enAdmin from './locales/en/admin.json'
import heLanding from './locales/he/landing.json'
import enLanding from './locales/en/landing.json'
import heInsights from './locales/he/insights.json'
import enInsights from './locales/en/insights.json'
import heReports from './locales/he/reports.json'
import enReports from './locales/en/reports.json'
import heMoon from './locales/he/moon.json'
import enMoon from './locales/en/moon.json'
import heComponents from './locales/he/components.json'
import enComponents from './locales/en/components.json'
import heOnboarding from './locales/he/onboarding.json'
import enOnboarding from './locales/en/onboarding.json'
import heOnboardingSteps from './locales/he/onboardingSteps.json'
import enOnboardingSteps from './locales/en/onboardingSteps.json'

export const NAMESPACES = ['common', 'auth', 'nav', 'goals', 'trash', 'home', 'clients', 'finance', 'calendar', 'leads', 'projects', 'tasks', 'connections', 'admin', 'landing', 'insights', 'reports', 'moon', 'components', 'onboarding', 'onboardingSteps']

const resources = {
  he: { common: heCommon, auth: heAuth, nav: heNav, goals: heGoals, trash: heTrash, home: heHome, clients: heClients, finance: heFinance, calendar: heCalendar, leads: heLeads, projects: heProjects, tasks: heTasks, connections: heConnections, admin: heAdmin, landing: heLanding, insights: heInsights, reports: heReports, moon: heMoon, components: heComponents, onboarding: heOnboarding, onboardingSteps: heOnboardingSteps },
  en: { common: enCommon, auth: enAuth, nav: enNav, goals: enGoals, trash: enTrash, home: enHome, clients: enClients, finance: enFinance, calendar: enCalendar, leads: enLeads, projects: enProjects, tasks: enTasks, connections: enConnections, admin: enAdmin, landing: enLanding, insights: enInsights, reports: enReports, moon: enMoon, components: enComponents, onboarding: enOnboarding, onboardingSteps: enOnboardingSteps },
  es: { common: esCommon, auth: esAuth },
  fr: { common: frCommon, auth: frAuth },
}

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: DEFAULT_LANG,
    supportedLngs: LANG_CODES,
    ns: NAMESPACES,
    defaultNS: 'common',
    interpolation: { escapeValue: false }, // React already escapes
    returnEmptyString: false,
    detection: {
      order: ['localStorage'],            // saved choice only; new visitors get fallback (he)
      caches: ['localStorage'],
      lookupLocalStorage: 'mg-lang',
    },
  })

/* DEV aid: expose the instance for console/preview debugging. Guarded by
   import.meta.env.DEV, so it's tree-shaken out of production builds. */
if (import.meta.env.DEV) {
  try { window.i18n = i18n } catch { /* noop */ }
}

export default i18n
