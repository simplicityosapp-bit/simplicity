/* ════════════════════════════════════════════════════════════════
   THE MANUAL HAS TO BE SEARCHABLE, AND HONEST ABOUT WHAT IT FOUND.
   ════════════════════════════════════════════════════════════════
   Seventeen chapters, the longest one ~1,700 words, and the same question
   possibly filed either in a chapter's own FAQ or in the global one. These
   pin the rules the screen leans on: one query covers both lists, a title
   match brings its whole chapter, anything else brings only the lines that
   matched, and the count matches what is actually rendered.
   ════════════════════════════════════════════════════════════════ */
import { describe, it, expect } from 'vitest'
import { searchHelp, chapterHits } from '../src/screens/help/searchHelp'

const CHAPTERS = [
  {
    key: 'clients',
    chapter: {
      title: 'לקוחות',
      intro: 'כאן מנהלים את כל הלקוחות.',
      features: [
        { title: 'הוספת לקוח', body: 'בכפתור + לקוח חדש נפתח טופס קצר.' },
        { title: 'סטטוסי לקוח', body: 'פעיל, בהפסקה, לשעבר וללא.' },
      ],
      tips: ['אפשר לסנן לפי סטטוס'],
      faq: [{ q: 'איך מוחקים לקוח?', a: 'מכרטיס הלקוח, והוא עובר לסל המיחזור.' }],
    },
  },
  {
    key: 'finance',
    chapter: {
      title: 'כסף',
      intro: 'ההכנסות וההוצאות של העסק.',
      features: [{ title: 'תנועה חדשה', body: 'סכום ותאריך זה כל מה שצריך.' }],
      tips: [],
      faq: [{ q: 'למה תנועה מחכה לאישור?', a: 'תאריך עתידי נשמר כממתין.' }],
    },
  },
]

const FAQ = [
  { category: 'כניסה וחשבון', items: [{ q: 'שכחתי סיסמה', a: 'אפשר לאפס מהמסך הראשון.' }] },
  { category: 'נתונים ופרטיות', items: [{ q: 'איפה הנתונים נשמרים?', a: 'בשרתים באירופה.' }] },
]

const run = (q) => searchHelp(CHAPTERS, FAQ, q)

describe('searchHelp', () => {
  it('is inactive for an empty query, so browsing is not a failed search', () => {
    for (const q of ['', '   ', null, undefined]) {
      const r = searchHelp(CHAPTERS, FAQ, q)
      expect(r.active, `query ${JSON.stringify(q)}`).toBe(false)
      expect(r.count).toBe(0)
      expect(r.guide).toEqual([])
      expect(r.faq).toEqual([])
    }
  })

  it('brings a whole chapter when its title is what was asked for', () => {
    const r = run('לקוחות')
    const clients = r.guide.find((c) => c.key === 'clients')
    expect(clients.whole).toBe(true)
    expect(clients.features).toHaveLength(2)
    expect(clients.tips).toHaveLength(1)
    expect(clients.faq).toHaveLength(1)
    expect(clients.intro).toBeTruthy()
  })

  it('brings only the lines that matched when the title did not', () => {
    const r = run('סטטוס')
    const clients = r.guide.find((c) => c.key === 'clients')
    expect(clients.whole).toBe(false)
    expect(clients.features.map((f) => f.title)).toEqual(['סטטוסי לקוח'])
    expect(clients.tips).toEqual(['אפשר לסנן לפי סטטוס'])
    expect(clients.faq).toEqual([])
    expect(clients.intro).toBe('')
  })

  it('matches a feature body, not just its title', () => {
    const r = run('סכום ותאריך')
    expect(r.guide.map((c) => c.key)).toEqual(['finance'])
    expect(r.guide[0].features.map((f) => f.title)).toEqual(['תנועה חדשה'])
  })

  it("searches a chapter's own questions and the global list in one go", () => {
    const r = run('סיסמה')
    expect(r.guide).toEqual([])
    expect(r.faq.map((c) => c.category)).toEqual(['כניסה וחשבון'])

    const both = run('נשמר')
    expect(both.guide.map((c) => c.key)).toEqual(['finance'])   /* chapter FAQ answer */
    expect(both.faq.map((c) => c.category)).toEqual(['נתונים ופרטיות'])
  })

  it('drops chapters and categories with nothing in them', () => {
    const r = run('שכחתי')
    expect(r.guide).toEqual([])
    expect(r.faq).toHaveLength(1)
    expect(r.faq[0].items).toHaveLength(1)
  })

  it('finds nothing gracefully, and says so through active + count', () => {
    const r = run('זפלין')
    expect(r.active).toBe(true)
    expect(r.count).toBe(0)
    expect(r.guide).toEqual([])
    expect(r.faq).toEqual([])
  })

  it('counts exactly what a reader will see', () => {
    const r = run('לקוח')
    const rendered = r.guide.reduce((n, c) => n + chapterHits(c), 0)
      + r.faq.reduce((n, cat) => n + cat.items.length, 0)
    expect(r.count).toBe(rendered)
  })

  it('ignores case and surrounding whitespace', () => {
    expect(run('  סטטוס  ').count).toBe(run('סטטוס').count)
    const lower = searchHelp([{ key: 'x', chapter: { title: 'Reports', features: [], tips: [], faq: [] } }], [], 'reports')
    expect(lower.guide).toHaveLength(1)
  })

  it('keeps the reading order it was given', () => {
    const r = run('ה')
    expect(r.guide.map((c) => c.key)).toEqual(['clients', 'finance'])
  })

  it('survives a chapter with missing sections', () => {
    const sparse = [{ key: 'trash', chapter: { title: 'סל מיחזור' } }]
    const r = searchHelp(sparse, null, 'סל')
    expect(r.guide).toHaveLength(1)
    expect(r.guide[0].features).toEqual([])
    expect(r.count).toBe(chapterHits(r.guide[0]))
  })
})
