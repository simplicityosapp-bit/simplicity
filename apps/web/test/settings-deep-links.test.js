/* ════════════════════════════════════════════════════════════════
   SETTINGS — a deep link has to actually open something.
   ════════════════════════════════════════════════════════════════
   The screen nests sections inside collapsible GROUPS, and a section
   renders only while its group is open. Callers, though, only ever knew
   which section they wanted: HelpFab asked for `about`, every
   profile-health row asked for `profile`, and neither named a group — so
   both landed the user on a settings screen with all five groups shut and
   nothing to show for the click.

   The group is now derived from the section. What this suite pins is that
   the derivation stays total: every section belongs to a group, and every
   section a caller asks for by name still resolves.

   Also here: the sort_order a new lead stage is created with. It used to
   be omitted, taking the column's DB default of 0 — which sorts ahead of
   the existing 10/20/30, so a stage jumped to the FRONT of the group it
   had just been added to.
   ════════════════════════════════════════════════════════════════ */
import { readFileSync } from 'node:fs'
import { describe, it, expect, afterEach } from 'vitest'
import { SETTINGS_TREE, formatDateAs, formatTimeAs, fmtDateInput, fmtTime, setDateTimeFormat } from '@simplicity/core'
import { ROUTES } from '../src/lib/routes'
import { SECTION_DEFS, SECTION_GROUPS, groupOfSection, soleSectionOf } from '../src/screens/settings/sections'
import { matches, searchTree } from '../src/screens/settings/searchSettings'
import { nextSortOrder } from '../src/lib/api/leadStatuses'
import { pushNote, pushUndo, performUndo, getSnapshot, dismiss } from '../src/lib/undo'

/* Sections named by a deep link somewhere in the app. Keep in step with
   the `openSection` call sites (HelpFab, lib/profileHealth,
   ProfileHealthModal, hooks/useSetupTasks). */
const DEEP_LINKED = ['about', 'profile', 'data', 'questions']

describe('settings deep links', () => {
  it('resolves every section to exactly one group', () => {
    Object.keys(SECTION_DEFS).forEach((key) => {
      const owners = SECTION_GROUPS.filter((g) => g.items.includes(key))
      expect(owners, `section "${key}"`).toHaveLength(1)
      expect(groupOfSection(key)).toBe(owners[0].key)
    })
  })

  it('resolves every section a caller links to', () => {
    DEEP_LINKED.forEach((key) => {
      expect(SECTION_DEFS[key], `unknown section "${key}"`).toBeTruthy()
      expect(groupOfSection(key), `no group holds "${key}"`).toBeTruthy()
    })
  })

  it('lists no section that belongs to no one', () => {
    const grouped = SECTION_GROUPS.flatMap((g) => g.items)
    expect(grouped.slice().sort()).toEqual(Object.keys(SECTION_DEFS).sort())
  })

  it('answers null for a missing or unknown section', () => {
    expect(groupOfSection(undefined)).toBeNull()
    expect(groupOfSection('')).toBeNull()
    expect(groupOfSection('nope')).toBeNull()
  })
})

/* ── The regrouped tree ───────────────────────────────────────────
   The old five groups split the appearance settings in half: "עיצוב" was
   filed under "אישי" while the group subtitled "עיצוב המסך" held the
   widgets. What's pinned here is the property that broke — every setting
   about how the app LOOKS reachable from one group — plus the naming rule
   that keeps a group and one of its own sections from sharing a name. */
describe('the settings tree', () => {
  const groupOf = (key) => SECTION_GROUPS.find((g) => g.key === key)

  it('keeps every appearance setting in one group', () => {
    /* design carries theme/background/text size AND the card trio; home is
       the widget list; payments is the number and date formats. */
    expect(groupOf('appearance').items).toEqual(['design', 'home', 'payments'])
    expect(groupOfSection('design')).toBe('appearance')
    expect(groupOfSection('home')).toBe('appearance')
  })

  it('gives the irreversible actions a section of their own', () => {
    /* Erasing everything used to be the bottom of the export/import scroll. */
    expect(groupOf('account').items).toContain('reset')
    expect(groupOfSection('reset')).toBe('account')
    expect(groupOfSection('data')).toBe('account')
    expect(SECTION_DEFS.reset.key).not.toBe('account')
  })

  it('never names a section after the group that holds it', () => {
    /* "החשבון שלי" as both a group and one of its sections would read as a
       loop; the section is איפוס ומחיקה, which also says what it does. */
    SECTION_GROUPS.forEach((g) => {
      expect(g.items, `group "${g.key}"`).not.toContain(g.key)
    })
  })

  it('prices meetings in a section of their own', () => {
    /* Promoted out of the client-statuses section, which becomes a link. */
    expect(groupOfSection('meetingTypes')).toBe('work')
  })
})

describe('a group holding one section', () => {
  it('is reported so the screen can skip the inner accordion', () => {
    const personal = SECTION_GROUPS.find((g) => g.key === 'personal')
    expect(personal.items).toHaveLength(1)
    expect(soleSectionOf(personal)).toBe(SECTION_DEFS.profile)
  })

  it('is not reported for a group holding several', () => {
    SECTION_GROUPS.filter((g) => g.items.length > 1).forEach((g) => {
      expect(soleSectionOf(g), `group "${g.key}"`).toBeNull()
    })
  })

  it('shrugs off a missing group', () => {
    expect(soleSectionOf(null)).toBeNull()
    expect(soleSectionOf({})).toBeNull()
  })
})

describe('a new lead stage lands last, not first', () => {
  it('sorts after the group it joins', () => {
    const group = [{ sort_order: 10 }, { sort_order: 20 }, { sort_order: 30 }]
    const next = nextSortOrder(group)
    expect(next).toBeGreaterThan(30)
    expect([...group.map((s) => s.sort_order), next].sort((a, b) => a - b).at(-1)).toBe(next)
  })

  it('beats the DB default of 0 even in an empty group', () => {
    /* The bug in one line: 0 is what the column defaults to, and 0 sorts
       first. A first stage must not be created with it either, or the
       second one added would land ahead of it. */
    expect(nextSortOrder([])).toBeGreaterThan(0)
  })

  it('ignores rows with a missing or unusable sort_order', () => {
    expect(nextSortOrder([{ sort_order: null }, { sort_order: 40 }, {}])).toBeGreaterThan(40)
    expect(nextSortOrder(undefined)).toBeGreaterThan(0)
  })
})

/* ── The save confirmation ────────────────────────────────────────
   Settings wrote to the DB in total silence, so a working control and a
   dead one looked the same. The confirmation borrows the undo toast's slot
   rather than adding a second one, which makes one thing worth pinning:
   it must not look undoable. `performUndo` acts only in the 'offer' phase,
   so a note has to sit in a phase of its own — otherwise "ההגדרה נשמרה"
   would come with a בטל button wired to whatever was deleted last. */
describe('saved-setting confirmation', () => {
  afterEach(() => dismiss())

  it('announces itself without offering an undo', () => {
    pushNote('ההגדרה נשמרה')
    const s = getSnapshot()
    expect(s.phase).toBe('note')
    expect(s.label).toBe('ההגדרה נשמרה')
    expect(s.duration).toBeGreaterThan(0)
  })

  it('is not undoable — Ctrl+Z during one does nothing', async () => {
    pushNote('ההגדרה נשמרה')
    await performUndo()
    expect(getSnapshot().phase).toBe('note')
  })

  it('drops a pending undo instead of leaving it wired to the wrong label', async () => {
    /* The toast shows ONE thing. If a note arrived while a deletion was
       still undoable, the old action must not survive behind the new
       label — pressing בטל would then reverse something the user was no
       longer being told about. */
    let undone = false
    pushUndo({ label: 'תת-הסטטוס נמחק', undo: () => { undone = true }, redo: () => {} })
    expect(getSnapshot().phase).toBe('offer')

    pushNote('ההגדרה נשמרה')
    await performUndo()
    expect(undone).toBe(false)
  })

  it('leaves the store idle once dismissed', () => {
    pushNote('ההגדרה נשמרה')
    dismiss()
    expect(getSnapshot().phase).toBe('idle')
  })
})

/* ── Every heading the tree asks for actually exists ──────────────
   This is the bug that got away. Web regrouped its settings; mobile kept
   its own copy of the old tree while reading its titles from the SAME
   shared namespace — so every heading it asked for had been retired
   underneath it, and the screen rendered raw keys like "workflow" as
   headings. Nothing threw. Nothing failed. The only way to see it was to
   open the screen, on a platform that has no device to open it on.

   The structure now comes from one place, which stops the two trees
   disagreeing. What this suite adds is the other half: the tree may not
   name a section or group that the copy cannot title — in ANY of the four
   languages, since a key present only in Hebrew fails exactly the same
   way for everyone else. */
const LOCALES = ['he', 'en', 'es', 'fr']
const strings = (lang) => JSON.parse(
  readFileSync(new URL(`../../../packages/core/src/i18n/locales/${lang}/settings.json`, import.meta.url), 'utf8'),
)

describe('the tree can be spoken in every language', () => {
  const filled = (s) => typeof s === 'string' && s.trim().length > 0

  LOCALES.forEach((lang) => {
    it(`titles every group and section in ${lang}`, () => {
      const j = strings(lang)
      SETTINGS_TREE.forEach((group) => {
        expect(filled(j.groups?.[group.key]?.title), `groups.${group.key}.title in ${lang}`).toBe(true)
        expect(filled(j.groups?.[group.key]?.sub), `groups.${group.key}.sub in ${lang}`).toBe(true)
        group.items.forEach((key) => {
          expect(filled(j.sections?.[key]?.title), `sections.${key}.title in ${lang}`).toBe(true)
          expect(filled(j.sections?.[key]?.sub), `sections.${key}.sub in ${lang}`).toBe(true)
        })
      })
    })
  })

  it('gives web an icon for every section and group in the tree', () => {
    /* A missing icon falls back rather than crashing, but a section drawn
       with the wrong glyph is a silent regression of the same family. */
    SETTINGS_TREE.forEach((group) => {
      expect(SECTION_GROUPS.find((g) => g.key === group.key)?.icon, `group "${group.key}"`).toBeTruthy()
      group.items.forEach((key) => {
        expect(SECTION_DEFS[key]?.icon, `section "${key}"`).toBeTruthy()
      })
    })
  })
})

/* ── Rows that leave settings ─────────────────────────────────────
   The leads section here was a second, weaker copy of what the leads
   SCREEN already does — no ordering, no rename, and a colour picker that
   only ever coloured the next thing you added. It became a row pointing
   at the real one, which is only safe while the destination genuinely
   holds the feature. That is the assertion worth keeping: a link must
   never be the only place a thing lived. */
describe('link rows', () => {
  const linksOf = (key) => SECTION_GROUPS.find((g) => g.key === key)?.links || []

  it('sends both taxonomies to the screens that use them', () => {
    expect(linksOf('work').map((l) => l.key)).toEqual(['clients', 'leads'])
    /* And neither survives as a section — two editors for one taxonomy is
       the bug this replaced. */
    expect(groupOfSection('leads')).toBeNull()
    expect(groupOfSection('clients')).toBeNull()
    expect(SECTION_DEFS.leads).toBeUndefined()
    expect(SECTION_DEFS.clients).toBeUndefined()
  })

  it('only links to a screen that can actually host the editor', () => {
    /* The rule these rows kept breaking. `clients` stayed a SECTION through
       a whole stage because the clients screen could only READ statuses —
       settings was the one place in the app able to create or delete one, so
       the row would have removed the feature rather than moved it. It became
       a link the moment ClientStatusesModal existed. Same for lead sources on
       mobile (LeadSourcesPanel).

       Read this as: before turning any section into a link, open the
       destination and find the editor. */
    expect(linksOf('work').map((l) => l.to)).toEqual([ROUTES.CLIENTS, ROUTES.LEADS])
  })

  it('offers the neighbouring screens settings used to dead-end on', () => {
    expect(linksOf('account').map((l) => l.key)).toEqual(['connections', 'trash', 'subscription'])
  })

  it('gives every link a destination and an icon', () => {
    SECTION_GROUPS.flatMap((g) => g.links).forEach((link) => {
      expect(link.to, `link "${link.key}"`).toBeTruthy()
      expect(link.icon, `link "${link.key}"`).toBeTruthy()
    })
  })

  it('titles every link in every language', () => {
    const keys = SECTION_GROUPS.flatMap((g) => g.links).map((l) => l.key)
    LOCALES.forEach((lang) => {
      const j = strings(lang)
      keys.forEach((key) => {
        expect(j.links?.[key]?.title, `links.${key}.title in ${lang}`).toBeTruthy()
        expect(j.links?.[key]?.sub, `links.${key}.sub in ${lang}`).toBeTruthy()
      })
    })
  })
})

/* ── The format examples ──────────────────────────────────────────
   The date and time pills read "DD/MM/YY" and "12h (AM/PM)" — the pattern
   strings out of the code, shown to a coach as a choice. They now render
   a real moment formatted each way.

   What matters is that the example and the result come from ONE function:
   an example computed separately would be free to drift from what the app
   then prints, which is worse than the notation it replaced, because it
   looks trustworthy. */
describe('date and time options show a result, not a pattern', () => {
  /* A moment that reads differently under all three date patterns and
     lands in the afternoon, so 24h and 12h can't coincide. */
  const M = new Date(2026, 6, 28, 13, 58)

  it('formats the same moment under each date pattern', () => {
    expect(formatDateAs('DD/MM/YY', M)).toBe('28/07/26')
    expect(formatDateAs('MM/DD/YY', M)).toBe('07/28/26')
    expect(formatDateAs('YYYY-MM-DD', M)).toBe('2026-07-28')
  })

  it('formats the same moment under each clock', () => {
    expect(formatTimeAs('24h', M)).toBe('13:58')
    expect(formatTimeAs('12h', M)).toBe('1:58 PM')
  })

  it('gives every option a distinct example, or the choice reads as a no-op', () => {
    const dates = ['DD/MM/YY', 'MM/DD/YY', 'YYYY-MM-DD'].map((p) => formatDateAs(p, M))
    expect(new Set(dates).size).toBe(dates.length)
    expect(formatTimeAs('24h', M)).not.toBe(formatTimeAs('12h', M))
  })

  it('falls back to the day-first pattern for anything unknown', () => {
    /* Older prefs blobs and future values must not render blank pills. */
    expect(formatDateAs('nonsense', M)).toBe('28/07/26')
    expect(formatTimeAs('nonsense', M)).toBe('13:58')
  })

  it('is the same function the app formats with', () => {
    /* fmtDateInput reads the saved preference and delegates here; if that
       delegation is ever unpicked, the example starts lying. */
    setDateTimeFormat({ date_format: 'MM/DD/YY', time_format: '12h' })
    expect(fmtDateInput(M)).toBe(formatDateAs('MM/DD/YY', M))
    expect(fmtTime(M)).toBe(formatTimeAs('12h', M))
    setDateTimeFormat({ date_format: 'DD/MM/YY', time_format: '24h' })
  })
})

/* ── Search ───────────────────────────────────────────────────────
   The tree is small enough to browse and still large enough that someone
   wanting ONE thing has to guess its heading: the currency lives under
   "מראה ותצוגה", with the date and time formats — obvious only once you
   already know.

   Titles and subtitles match on their own. What's pinned here is the
   SYNONYM index, because that is the half that can silently rot: nobody
   types "מטבע" when the word in their head is "שקל", and a keyword list
   that exists in Hebrew but not in French leaves those users with the
   guessing game the field was added to end. */
const tFor = (lang) => {
  const j = strings(lang)
  return (key, opts = {}) => {
    const val = key.split('.').reduce((node, part) => (node == null ? undefined : node[part]), j)
    return typeof val === 'string' ? val : (opts.defaultValue ?? key)
  }
}

/* A word a user would plausibly type, and the section it must reach. */
const SYNONYMS = {
  he: [['שקל', 'payments'], ['פונט', 'design'], ['גיבוי', 'data'], ['יומן', 'connections'], ['מחירון', 'meetingTypes']],
  en: [['shekel', 'payments'], ['font', 'design'], ['backup', 'data'], ['calendar', 'connections'], ['rate', 'meetingTypes']],
  es: [['shekel', 'payments'], ['fuente', 'design'], ['copia', 'data'], ['calendario', 'connections'], ['tarifa', 'meetingTypes']],
  fr: [['shekel', 'payments'], ['police', 'design'], ['sauvegarde', 'data'], ['agenda', 'connections'], ['tarif', 'meetingTypes']],
}

describe('settings search', () => {
  const LINK_KEYS = new Set(SECTION_GROUPS.flatMap((g) => g.links).map((l) => l.key))
  const kindOf = (key) => (LINK_KEYS.has(key) ? 'links' : 'sections')

  LOCALES.forEach((lang) => {
    it(`finds a setting by a word the user would actually type — ${lang}`, () => {
      const t = tFor(lang)
      SYNONYMS[lang].forEach(([word, key]) => {
        expect(matches(t, kindOf(key), key, word), `"${word}" should reach ${key} in ${lang}`).toBe(true)
      })
    })

    it(`gives every section and link a synonym list — ${lang}`, () => {
      const j = strings(lang)
      const keys = [...SETTINGS_TREE.flatMap((g) => g.items), ...LINK_KEYS]
      keys.forEach((key) => {
        const list = j.search?.keywords?.[key]
        expect(typeof list === 'string' && list.trim().length > 0, `search.keywords.${key} in ${lang}`).toBe(true)
      })
    })
  })

  it('narrows the tree to the group that holds the answer', () => {
    const t = tFor('he')
    const found = searchTree(SECTION_GROUPS, t, 'שקל')
    expect(found).toHaveLength(1)
    expect(found[0].group.key).toBe('appearance')
    expect(found[0].items).toEqual(['payments'])
  })

  it('finds a row that leaves settings, not just a section', () => {
    const t = tFor('he')
    const found = searchTree(SECTION_GROUPS, t, 'יומן')
    expect(found.flatMap((e) => e.links.map((l) => l.key))).toContain('connections')
    expect(found.flatMap((e) => e.items)).toHaveLength(0)
  })

  it('returns nothing for a word that is in no list', () => {
    expect(searchTree(SECTION_GROUPS, tFor('he'), 'zzzz')).toHaveLength(0)
  })

  it('returns the whole tree, untouched, for an empty query', () => {
    const t = tFor('he')
    for (const q of ['', '   ']) {
      const all = searchTree(SECTION_GROUPS, t, q)
      expect(all).toHaveLength(SECTION_GROUPS.length)
      expect(all.map((e) => e.items)).toEqual(SECTION_GROUPS.map((g) => g.items))
    }
  })

  it('matches the title and subtitle without needing a synonym', () => {
    const t = tFor('he')
    expect(matches(t, 'sections', 'about', 'אודות')).toBe(true)
    /* From the subtitle — "גרסה, פרטיות ותנאי שימוש". */
    expect(matches(t, 'sections', 'about', 'פרטיות')).toBe(true)
  })
})
