import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { DEFAULT_LANG, LANG_CODES } from './config'

/* Re-export the language config so consumers get the whole i18n surface
   (APP_LANGS, dirFor, isLang, LANGUAGE_OPTIONS, DEFAULT_LANG, LANG_CODES)
   from a single '@simplicity/core/i18n' entry point. */
export * from './config'

/* ════════════════════════════════════════════════════════════════
   I18N ENGINE — platform-agnostic (shared by apps/web + apps/mobile).
   ════════════════════════════════════════════════════════════════
   Owns the i18next singleton + all main-namespace resources. It does
   NOT decide the active language or persist it — that is platform glue:
   each app calls initI18n({ lng, dev, onMissingKey }) once at startup
   (web reads localStorage; mobile reads the device locale). For signed-in
   users the persisted preference (prefs.design.language) reconciles in
   via the app-side <I18nSync/>. Gender is applied per-call as i18next
   `context` (see the app-side useT hook).

   The 7 dynamic namespaces (quotes/guidance/export/presets/reflections/
   booking/siteBuilder) are self-registered via addResourceBundle by the
   web libs that own them, and migrate here when those features move.
   Add a main namespace? import its 4 JSONs + register below.
   ════════════════════════════════════════════════════════════════ */

import heCommon from './locales/he/common.json'
import enCommon from './locales/en/common.json'
import esCommon from './locales/es/common.json'
import frCommon from './locales/fr/common.json'
import heAuth from './locales/he/auth.json'
import enAuth from './locales/en/auth.json'
import esAuth from './locales/es/auth.json'
import frAuth from './locales/fr/auth.json'
/* Public cookie banner — fully translated in all four languages. */
import heCookies from './locales/he/cookies.json'
import enCookies from './locales/en/cookies.json'
import esCookies from './locales/es/cookies.json'
import frCookies from './locales/fr/cookies.json'
/* Rollout namespaces — he (source) + en, now also FULLY translated to es and fr.
   All four languages cover every active namespace below. (The 3 dynamically
   registered namespaces — guidance/presets/reflections — live in their libs.) */
import heNav from './locales/he/nav.json'
import enNav from './locales/en/nav.json'
import heGoals from './locales/he/goals.json'
import enGoals from './locales/en/goals.json'
import heSettings from './locales/he/settings.json'
import enSettings from './locales/en/settings.json'
import esSettings from './locales/es/settings.json'
import frSettings from './locales/fr/settings.json'
import heQuestions from './locales/he/questions.json'
import enQuestions from './locales/en/questions.json'
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
import esComponents from './locales/es/components.json'
import frComponents from './locales/fr/components.json'
import heOnboarding from './locales/he/onboarding.json'
import enOnboarding from './locales/en/onboarding.json'
import heOnboardingSteps from './locales/he/onboardingSteps.json'
import enOnboardingSteps from './locales/en/onboardingSteps.json'
import heModalsClient from './locales/he/modalsClient.json'
import enModalsClient from './locales/en/modalsClient.json'
import heModalsData from './locales/he/modalsData.json'
import enModalsData from './locales/en/modalsData.json'
import heModalsTask from './locales/he/modalsTask.json'
import enModalsTask from './locales/en/modalsTask.json'
import heModalsSystem from './locales/he/modalsSystem.json'
import enModalsSystem from './locales/en/modalsSystem.json'
import heHelp from './locales/he/help.json'
import enHelp from './locales/en/help.json'
/* Spanish (es) — full language pass: every active namespace translated.
   (common/auth/cookies/settings/components are imported above with their pairs.) */
import esNav from './locales/es/nav.json'
import esGoals from './locales/es/goals.json'
import esQuestions from './locales/es/questions.json'
import esTrash from './locales/es/trash.json'
import esHome from './locales/es/home.json'
import esClients from './locales/es/clients.json'
import esFinance from './locales/es/finance.json'
import esCalendar from './locales/es/calendar.json'
import esLeads from './locales/es/leads.json'
import esProjects from './locales/es/projects.json'
import esTasks from './locales/es/tasks.json'
import esConnections from './locales/es/connections.json'
import esAdmin from './locales/es/admin.json'
import esLanding from './locales/es/landing.json'
import esInsights from './locales/es/insights.json'
import esReports from './locales/es/reports.json'
import esMoon from './locales/es/moon.json'
import esOnboarding from './locales/es/onboarding.json'
import esOnboardingSteps from './locales/es/onboardingSteps.json'
import esModalsClient from './locales/es/modalsClient.json'
import esModalsData from './locales/es/modalsData.json'
import esModalsTask from './locales/es/modalsTask.json'
import esModalsSystem from './locales/es/modalsSystem.json'
import esHelp from './locales/es/help.json'
/* French (fr) — full language pass: every active namespace translated.
   (common/auth/cookies/settings/components are imported above with their pairs.) */
import frNav from './locales/fr/nav.json'
import frGoals from './locales/fr/goals.json'
import frQuestions from './locales/fr/questions.json'
import frTrash from './locales/fr/trash.json'
import frHome from './locales/fr/home.json'
import frClients from './locales/fr/clients.json'
import frFinance from './locales/fr/finance.json'
import frCalendar from './locales/fr/calendar.json'
import frLeads from './locales/fr/leads.json'
import frProjects from './locales/fr/projects.json'
import frTasks from './locales/fr/tasks.json'
import frConnections from './locales/fr/connections.json'
import frAdmin from './locales/fr/admin.json'
import frLanding from './locales/fr/landing.json'
import frInsights from './locales/fr/insights.json'
import frReports from './locales/fr/reports.json'
import frMoon from './locales/fr/moon.json'
import frOnboarding from './locales/fr/onboarding.json'
import frOnboardingSteps from './locales/fr/onboardingSteps.json'
import frModalsClient from './locales/fr/modalsClient.json'
import frModalsData from './locales/fr/modalsData.json'
import frModalsTask from './locales/fr/modalsTask.json'
import frModalsSystem from './locales/fr/modalsSystem.json'
import frHelp from './locales/fr/help.json'
/* Subscription / billing tiers — full four-language pass. */
import heSubscription from './locales/he/subscription.json'
import enSubscription from './locales/en/subscription.json'
import esSubscription from './locales/es/subscription.json'
import frSubscription from './locales/fr/subscription.json'
import heCommunity from './locales/he/community.json'
import enCommunity from './locales/en/community.json'
import esCommunity from './locales/es/community.json'
import frCommunity from './locales/fr/community.json'

export const NAMESPACES: string[] = ['common', 'auth', 'nav', 'goals', 'settings', 'trash', 'home', 'clients', 'finance', 'calendar', 'leads', 'projects', 'tasks', 'connections', 'admin', 'landing', 'insights', 'reports', 'moon', 'components', 'onboarding', 'onboardingSteps', 'modalsClient', 'modalsData', 'modalsTask', 'modalsSystem', 'questions', 'help', 'cookies', 'subscription', 'community']

const resources = {
  he: { common: heCommon, auth: heAuth, nav: heNav, goals: heGoals, settings: heSettings, trash: heTrash, home: heHome, clients: heClients, finance: heFinance, calendar: heCalendar, leads: heLeads, projects: heProjects, tasks: heTasks, connections: heConnections, admin: heAdmin, landing: heLanding, insights: heInsights, reports: heReports, moon: heMoon, components: heComponents, onboarding: heOnboarding, onboardingSteps: heOnboardingSteps, modalsClient: heModalsClient, modalsData: heModalsData, modalsTask: heModalsTask, modalsSystem: heModalsSystem, questions: heQuestions, help: heHelp, cookies: heCookies, subscription: heSubscription, community: heCommunity },
  en: { common: enCommon, auth: enAuth, nav: enNav, goals: enGoals, settings: enSettings, trash: enTrash, home: enHome, clients: enClients, finance: enFinance, calendar: enCalendar, leads: enLeads, projects: enProjects, tasks: enTasks, connections: enConnections, admin: enAdmin, landing: enLanding, insights: enInsights, reports: enReports, moon: enMoon, components: enComponents, onboarding: enOnboarding, onboardingSteps: enOnboardingSteps, modalsClient: enModalsClient, modalsData: enModalsData, modalsTask: enModalsTask, modalsSystem: enModalsSystem, questions: enQuestions, help: enHelp, cookies: enCookies, subscription: enSubscription, community: enCommunity },
  es: { common: esCommon, auth: esAuth, nav: esNav, goals: esGoals, settings: esSettings, trash: esTrash, home: esHome, clients: esClients, finance: esFinance, calendar: esCalendar, leads: esLeads, projects: esProjects, tasks: esTasks, connections: esConnections, admin: esAdmin, landing: esLanding, insights: esInsights, reports: esReports, moon: esMoon, components: esComponents, onboarding: esOnboarding, onboardingSteps: esOnboardingSteps, modalsClient: esModalsClient, modalsData: esModalsData, modalsTask: esModalsTask, modalsSystem: esModalsSystem, questions: esQuestions, help: esHelp, cookies: esCookies, subscription: esSubscription, community: esCommunity },
  fr: { common: frCommon, auth: frAuth, nav: frNav, goals: frGoals, settings: frSettings, trash: frTrash, home: frHome, clients: frClients, finance: frFinance, calendar: frCalendar, leads: frLeads, projects: frProjects, tasks: frTasks, connections: frConnections, admin: frAdmin, landing: frLanding, insights: frInsights, reports: frReports, moon: frMoon, components: frComponents, onboarding: frOnboarding, onboardingSteps: frOnboardingSteps, modalsClient: frModalsClient, modalsData: frModalsData, modalsTask: frModalsTask, modalsSystem: frModalsSystem, questions: frQuestions, help: frHelp, cookies: frCookies, subscription: frSubscription, community: frCommunity },
}

export interface InitI18nOptions {
  /** Initial UI language. Falls back to DEFAULT_LANG (he) when omitted. */
  lng?: string
  /** Dev mode → surface unresolved keys via onMissingKey (no-op in prod). */
  dev?: boolean
  /** Called for any unresolved key when `dev` is true. */
  onMissingKey?: (lngs: readonly string[] | undefined, ns: string, key: string) => void
}

let started = false

/* ════════════════════════════════════════════════════════════════
   initI18n — build + init the shared i18next singleton. Idempotent.
   Called once per app at startup with platform-specific glue:
     web    → initI18n({ lng: localStorage['mg-lang'], dev: import.meta.env.DEV })
     mobile → initI18n({ lng: deviceLocale })
   ════════════════════════════════════════════════════════════════ */
export function initI18n(opts: InitI18nOptions = {}): typeof i18n {
  if (started) return i18n
  started = true
  i18n
    .use(initReactI18next)
    .init({
      resources,
      lng: opts.lng,
      fallbackLng: DEFAULT_LANG,
      supportedLngs: LANG_CODES,
      ns: NAMESPACES,
      defaultNS: 'common',
      interpolation: { escapeValue: false }, // React already escapes
      returnEmptyString: false,
      saveMissing: !!opts.dev,
      missingKeyHandler: opts.onMissingKey
        ? (lngs, ns, key) => opts.onMissingKey!(lngs, ns, key)
        : undefined,
    })
  return i18n
}

export default i18n
