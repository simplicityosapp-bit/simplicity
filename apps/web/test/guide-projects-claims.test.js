/* ════════════════════════════════════════════════════════════════
   THE PROJECTS GUIDE MUST NOT PROMISE CONTROLS THAT ARE NOT THERE.
   ════════════════════════════════════════════════════════════════
   guide-matches-the-app.test.js checks the guide's STRUCTURE — that its
   two Hebrew copies agree, that every routable screen is documented, that
   "Settings → X" paths resolve. It passed happily while the projects
   entry:

     · offered an "עדכון יעד" button on the project's quick-add row. That
       button was deliberately removed — goal entries are written through
       a hook ProjectMoonRing never saw, so an update made from that row
       left the ring stale — and the prose kept offering it.
     · never mentioned four of the screen's six sections (משימות, לידים,
       דפי נחיתה) or the מבט על ring at all.
     · stated flatly that projects have no status and cannot be filtered.

   Prose has no compiler. These are the properties that would have caught
   each one, in all four languages — a guide that rots in French only is
   the same bug wearing a different accent.
   ════════════════════════════════════════════════════════════════ */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { describe, it, expect } from 'vitest'

const LOCALES = ['he', 'en', 'es', 'fr']
const load = (lang, ns) => JSON.parse(
  readFileSync(new URL(`../../../packages/core/src/i18n/locales/${lang}/${ns}.json`, import.meta.url), 'utf8'),
)

/* Everything the projects entry says, as one searchable blob. */
const guideText = (lang) => {
  const p = load(lang, 'help').screens.projects
  return [
    p.title, p.intro,
    ...p.features.flatMap((f) => [f.title, f.body]),
    ...(p.tips || []),
    ...(p.faq || []).flatMap((f) => [f.q, f.a]),
  ].join('\n')
}

/* Every source file under the two project screens + the quick row. */
const srcFiles = (() => {
  const out = []
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const full = `${dir}/${name}`
      if (statSync(full).isDirectory()) walk(full)
      else if (/\.(jsx?|tsx?)$/.test(name)) out.push(readFileSync(full, 'utf8'))
    }
  }
  walk(new URL('../src/screens/projects', import.meta.url).pathname.replace(/^\//, ''))
  walk(new URL('../src/screens/project-detail', import.meta.url).pathname.replace(/^\//, ''))
  return out.join('\n')
})()

describe('the guide does not offer controls the screen does not render', () => {
  /* The general property: a label under detail.quick.* that NO source file
     references is a control that does not exist — and its text must not
     appear in the guide. This is what "עדכון יעד" violated for months. */
  it('every quick-add label it names is one a screen actually renders', () => {
    const quick = load('he', 'projects').detail.quick
    for (const key of Object.keys(quick)) {
      const referenced = srcFiles.includes(`detail.quick.${key}`)
      if (referenced) continue
      for (const lang of LOCALES) {
        const label = load(lang, 'projects').detail.quick[key]
        expect(
          guideText(lang),
          `${lang}: the guide names "${label}", but nothing renders detail.quick.${key}`,
        ).not.toContain(label)
      }
    }
  })

  it('the removed goal-update button is gone from all four guides', () => {
    /* Named explicitly too: the general check above only fires while the
       orphaned KEY still exists, and someone tidying the key away would
       silently disarm it while the prose lived on. */
    expect(srcFiles).not.toContain('detail.quick.updateGoal')
    for (const lang of LOCALES) {
      const label = load(lang, 'projects').detail.quick.updateGoal
      expect(guideText(lang), `${lang} still offers "${label}"`).not.toContain(label)
    }
  })
})

describe('every section of the project screen is documented', () => {
  /* The six accordions the screen renders. Their headings come from these
     keys, so the guide can be checked against the same source the UI uses. */
  const SECTIONS = ['groups', 'clients', 'tasks', 'reminders', 'leads', 'leadPages']

  LOCALES.forEach((lang) => {
    it(`${lang} names all six`, () => {
      const detail = load(lang, 'projects').detail
      const text = guideText(lang)
      for (const key of SECTIONS) {
        const title = detail[key].title
        expect(text, `${lang}: section "${title}" (${key}) is undocumented`).toContain(title)
      }
    })
  })
})

describe('the guide describes the status feature that now exists', () => {
  it('no longer claims projects have no status', () => {
    /* The old Hebrew FAQ answer opened "לפרויקט עצמו אין סטטוס, ואי אפשר
       לסנן לפי סטטוס" and called the card tag fixed and meaningless. */
    const he = guideText('he')
    expect(he).not.toContain('לפרויקט עצמו אין סטטוס')
    expect(he).not.toContain('אי אפשר לסנן לפי סטטוס')
  })

  LOCALES.forEach((lang) => {
    it(`${lang} names the two statuses and the filter`, () => {
      const text = guideText(lang)
      const projects = load(lang, 'projects')
      const modals = load(lang, 'modalsData')
      expect(text).toContain(modals.editProject.statusEnded)
      expect(text).toContain(projects.scope.active)
      expect(text).toContain(projects.card.ended)
    })
  })

  it('says the summary keeps counting finished projects', () => {
    /* The one rule a reader cannot infer from the screen, and the reason
       the filter does not touch the totals. */
    expect(guideText('he')).toContain('סיכום פרויקטים')
    expect(guideText('en').toLowerCase()).toContain('keeps counting')
  })
})

describe('the guide describes the overview ring', () => {
  LOCALES.forEach((lang) => {
    it(`${lang} says where the goals behind it are made`, () => {
      /* The ring renders NOTHING when the project has no goals, so a reader
         who has none sees no trace of the feature. The guide's job is to say
         it exists and where to create the goals that summon it — checked
         against the Goals screen's own name rather than against the ring's
         micro-label ("מהקצב" / "of pace"), which prose paraphrases. */
      const text = guideText(lang)
      const goalsScreen = load(lang, 'goals').title
      expect(text, `${lang}: the ring's feature never points at "${goalsScreen}"`)
        .toContain(goalsScreen)
    })
  })
})
