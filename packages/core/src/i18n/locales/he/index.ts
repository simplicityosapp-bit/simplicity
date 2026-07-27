/* ════════════════════════════════════════════════════════════════
   HE resource bundle — every main namespace for one language.
   ════════════════════════════════════════════════════════════════
   One file per language so each becomes its own chunk. he is imported
   statically by ../../index.ts (it is the default AND the fallback, so it
   must always be present); en/es/fr are reached only through the dynamic
   import in loadLanguage(), and never ship to a user who doesn't pick them.
   Adding a namespace? Add it here in all four languages + to NAMESPACES.
   ════════════════════════════════════════════════════════════════ */
import common from './common.json'
import auth from './auth.json'
import nav from './nav.json'
import goals from './goals.json'
import settings from './settings.json'
import trash from './trash.json'
import home from './home.json'
import clients from './clients.json'
import finance from './finance.json'
import calendar from './calendar.json'
import leads from './leads.json'
import projects from './projects.json'
import tasks from './tasks.json'
import connections from './connections.json'
import admin from './admin.json'
import landing from './landing.json'
import insights from './insights.json'
import reports from './reports.json'
import moon from './moon.json'
import components from './components.json'
import onboarding from './onboarding.json'
import onboardingSteps from './onboardingSteps.json'
import modalsClient from './modalsClient.json'
import modalsData from './modalsData.json'
import modalsTask from './modalsTask.json'
import modalsSystem from './modalsSystem.json'
import questions from './questions.json'
import help from './help.json'
import cookies from './cookies.json'
import subscription from './subscription.json'
import community from './community.json'

const bundle = { common, auth, nav, goals, settings, trash, home, clients, finance, calendar, leads, projects, tasks, connections, admin, landing, insights, reports, moon, components, onboarding, onboardingSteps, modalsClient, modalsData, modalsTask, modalsSystem, questions, help, cookies, subscription, community }

export default bundle
