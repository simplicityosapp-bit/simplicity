import i18n from '../i18n'
import heGuidance from '../i18n/locales/he/guidance.json'
import enGuidance from '../i18n/locales/en/guidance.json'

/* ════════════════════════════════════════════════════════════════
   Guided tour registry — per-screen, multi-step spotlight walkthrough.
   ════════════════════════════════════════════════════════════════
   On first visit to a screen, <ScreenTour> walks these steps in order,
   spotlighting each target element with a warm one-liner. Steps whose
   `target` selector isn't present in the DOM (e.g. a widget the user
   disabled) are skipped automatically. The last step of a screen that
   has an Add CTA spotlights that button — folding the single-button
   coachmark into the tour so there's no double glow.

   Step shape:
     - target:    CSS selector for the element to spotlight.
     - title:     i18n key (guidance ns) for the short heading.
     - body:      i18n key (guidance ns) for the one warm sentence.
                  Both are resolved by <ScreenTour> via i18n.t with the
                  user's gender as i18next `context` (gendered bodies
                  live in the he JSON as _male/_female variants).
     - radius:    optional spotlight corner radius (default 16px;
                  '50%' for the round CTA).
     - accent:    'sage' to tint the spotlight ring sage instead of
                  terracotta (used for the final CTA step). Optional.

   The 'guidance' namespace is registered here (not in i18n/index.js)
   so this lib stays self-contained; coachmarks.js registers the same.
   ════════════════════════════════════════════════════════════════ */

i18n.addResourceBundle('he', 'guidance', heGuidance, true, false)
i18n.addResourceBundle('en', 'guidance', enGuidance, true, false)

/* The home dashboard reuses the existing data-widget-id hooks as tour
   targets — no extra markup needed. Order follows top-to-bottom layout;
   missing widgets are skipped at runtime. */
const HOME_TOUR = [
  { target: '[data-widget-id="moon"]',      title: 'guidance:tour.home.moon.title',      body: 'guidance:tour.home.moon.body' },
  { target: '[data-widget-id="insights"]',  title: 'guidance:tour.home.insights.title',  body: 'guidance:tour.home.insights.body' },
  { target: '[data-widget-id="quick-row"]', title: 'guidance:tour.home.quick-row.title', body: 'guidance:tour.home.quick-row.body' },
  { target: '[data-widget-id="attention"]', title: 'guidance:tour.home.attention.title', body: 'guidance:tour.home.attention.body' },
  { target: '[data-widget-id="reminders"]', title: 'guidance:tour.home.reminders.title', body: 'guidance:tour.home.reminders.body' },
  { target: '[data-widget-id="next-tasks"]',title: 'guidance:tour.home.next-tasks.title',body: 'guidance:tour.home.next-tasks.body' },
  { target: '[data-widget-id="chips"]',     title: 'guidance:tour.home.chips.title',     body: 'guidance:tour.home.chips.body' },
]

/* Per-screen tours. Each ends on the round "+" CTA (radius 50%, sage
   ring) so the single-button coachmark folds into the walkthrough — no
   double glow. Steps whose target is absent are skipped at runtime. */
const CLIENTS_TOUR = [
  { target: '.c-tabs-row',    title: 'guidance:tour.clients.tabs.title',    body: 'guidance:tour.clients.tabs.body' },
  { target: '.c-groupby',     title: 'guidance:tour.clients.groupby.title', body: 'guidance:tour.clients.groupby.body' },
  { target: '.s-hero',        title: 'guidance:tour.clients.hero.title',    body: 'guidance:tour.clients.hero.body' },
  { target: '.c-select-btn',  title: 'guidance:tour.clients.select.title',  body: 'guidance:tour.clients.select.body' },
  { target: '.cta-add',       title: 'guidance:tour.clients.add.title',     body: 'guidance:tour.clients.add.body', radius: '50%', accent: 'sage' },
]

const TASKS_TOUR = [
  { target: '.t-view',   title: 'guidance:tour.tasks.view.title', body: 'guidance:tour.tasks.view.body' },
  { target: '.cta-add',  title: 'guidance:tour.tasks.add.title',  body: 'guidance:tour.tasks.add.body', radius: '50%', accent: 'sage' },
]

const LEADS_TOUR = [
  { target: '.l-view-toggle', title: 'guidance:tour.leads.toggle.title', body: 'guidance:tour.leads.toggle.body' },
  { target: '.l-stats',       title: 'guidance:tour.leads.stats.title',  body: 'guidance:tour.leads.stats.body' },
  { target: '.lead-board',    title: 'guidance:tour.leads.board.title',  body: 'guidance:tour.leads.board.body' },
  { target: '.cta-add',       title: 'guidance:tour.leads.add.title',    body: 'guidance:tour.leads.add.body', radius: '50%', accent: 'sage' },
]

const PROJECTS_TOUR = [
  { target: '.p-hero', title: 'guidance:tour.projects.hero.title', body: 'guidance:tour.projects.hero.body' },
  { target: '.p-list', title: 'guidance:tour.projects.list.title', body: 'guidance:tour.projects.list.body' },
  { target: '.cta-add', title: 'guidance:tour.projects.add.title', body: 'guidance:tour.projects.add.body', radius: '50%', accent: 'sage' },
]

const FINANCE_TOUR = [
  { target: '.f-chart',     title: 'guidance:tour.finance.chart.title',     body: 'guidance:tour.finance.chart.body' },
  { target: '.f-breakdown', title: 'guidance:tour.finance.breakdown.title', body: 'guidance:tour.finance.breakdown.body' },
  { target: '.rec-section', title: 'guidance:tour.finance.recurring.title', body: 'guidance:tour.finance.recurring.body' },
  { target: '.f-list',    title: 'guidance:tour.finance.list.title', body: 'guidance:tour.finance.list.body' },
  { target: '.cta-add',   title: 'guidance:tour.finance.add.title',  body: 'guidance:tour.finance.add.body', radius: '50%', accent: 'sage' },
]

export const TOURS = {
  home:     HOME_TOUR,
  clients:  CLIENTS_TOUR,
  tasks:    TASKS_TOUR,
  leads:    LEADS_TOUR,
  projects: PROJECTS_TOUR,
  finance:  FINANCE_TOUR,
}

export function tourFor(screenKey) {
  return TOURS[screenKey] || null
}
