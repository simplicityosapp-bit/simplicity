/* ════════════════════════════════════════════════════════════════
   HELP — the manual's shape, its reading order, and its search.
   ════════════════════════════════════════════════════════════════
   The content itself is i18n (`help` namespace, four languages) and has
   always been shared. What was not shared were the rules ABOUT it: which
   chapters the guide lists and in what order, which are owner-only, and
   how a query is matched across the guide and the global FAQ.

   apps/mobile now shows the same manual, so those rules move here rather
   than being written a second time. A reading order that disagreed between
   the two apps would not fail anywhere — it would just quietly be a
   different manual.
   ════════════════════════════════════════════════════════════════ */

import i18n from '../i18n'

export interface HelpFaqItem { q: string; a: string }
export interface HelpFeature { title: string; body: string }

export interface HelpChapter {
  title: string
  intro?: string
  features?: HelpFeature[]
  tips?: string[]
  faq?: HelpFaqItem[]
}

export interface HelpFaqCategory { category: string; items: HelpFaqItem[] }

/* Reading order for the guide. Deliberate, not raw key order — but the
   list is not the gate. It was, and three screens with a written chapter
   in four languages were simply absent from the manual: the page builder,
   the booking pages and the community. Nothing failed; the guide opened
   promising "a full explanation of every screen" and quietly had holes.
   Anything documented and not listed here is APPENDED rather than dropped. */
const GUIDE_ORDER = [
  'home', 'clients', 'leads', 'sitePages', 'finance', 'projects', 'tasks',
  'calendar', 'bookingPages', 'goals', 'insights', 'moon', 'reports',
  'connections', 'community', 'settings', 'trash',
]

/* Owner-only. Documented for whoever maintains the console, never in the
   manual a coach reads. */
export const GUIDE_EXCLUDED = new Set(['admin'])

const asObject = (v: unknown): Record<string, unknown> | null =>
  (v && typeof v === 'object' && !Array.isArray(v)) ? (v as Record<string, unknown>) : null

/* One chapter, or null. `fallback` is for apps that carry raw copy of
   their own against a missing bundle; without one, a missing chapter is
   simply absent rather than a crash. */
export function getHelpScreen(key: string, fallback: HelpChapter | null = null): HelpChapter | null {
  const s = asObject(i18n.t('help:screens.' + key, { returnObjects: true }))
  if (s && typeof s.title === 'string') return s as unknown as HelpChapter
  return fallback
}

/* Every documented chapter, in reading order, owner-only ones removed. */
export function guideOrder(fallbackKeys: string[] = []): string[] {
  const screens = asObject(i18n.t('help:screens', { returnObjects: true }))
  const documented = screens ? Object.keys(screens) : fallbackKeys
  const known = documented.filter((k) => !GUIDE_EXCLUDED.has(k))
  const listed = GUIDE_ORDER.filter((k) => known.includes(k))
  const rest = known.filter((k) => !GUIDE_ORDER.includes(k))
  return [...listed, ...rest]
}

export function getGlobalFaq(fallback: HelpFaqCategory[] = []): HelpFaqCategory[] {
  const f = i18n.t('help:globalFaq', { returnObjects: true })
  return Array.isArray(f) ? (f as HelpFaqCategory[]) : fallback
}

/* ── Search ──────────────────────────────────────────────────────
   The manual is seventeen chapters and the clients one alone runs to
   ~1,700 words. Finding "how do I change a client's status" meant opening
   chapters one at a time. Worse, the same question could be filed in two
   places: every chapter carries its own FAQ, and there is a separate
   global one. A reader had two lists and no way to know which held it.

   One query searches both. Matching is deliberately dumb — substring over
   folded text — because the corpus is small, the reader is typing a word
   they saw on screen, and anything cleverer is a stemmer nobody can debug
   in four languages.

   These take DATA, not i18n keys: the caller has already resolved the
   content for rendering and hands it over, which keeps this a pure filter. */

export interface SearchedChapter extends HelpChapter {
  key: string
  whole: boolean
  intro: string
  features: HelpFeature[]
  tips: string[]
  faq: HelpFaqItem[]
}

export interface HelpSearchResults {
  active: boolean
  guide: SearchedChapter[]
  faq: HelpFaqCategory[]
  count: number
}

/* Latin lowercases; Hebrew has no case, so folding is mostly about stray
   whitespace and the quotation marks people paste in from a label. */
const fold = (s: unknown): string => String(s || '').toLowerCase().trim()
const hit = (text: unknown, q: string): boolean => fold(text).includes(q)

function filterChapter(key: string, chapter: HelpChapter | null, q: string): SearchedChapter | null {
  if (!chapter) return null

  /* A chapter whose TITLE matches comes back whole — asking for "clients"
     means the chapter, not the three paragraphs repeating the word. */
  if (hit(chapter.title, q)) {
    return {
      key,
      title: chapter.title,
      whole: true,
      intro: chapter.intro || '',
      features: chapter.features || [],
      tips: chapter.tips || [],
      faq: chapter.faq || [],
    }
  }

  const features = (chapter.features || []).filter((f) => hit(f.title, q) || hit(f.body, q))
  const tips = (chapter.tips || []).filter((tip) => hit(tip, q))
  const faq = (chapter.faq || []).filter((item) => hit(item.q, q) || hit(item.a, q))
  const intro = hit(chapter.intro, q) ? (chapter.intro || '') : ''
  if (!intro && !features.length && !tips.length && !faq.length) return null
  return { key, title: chapter.title, whole: false, intro, features, tips, faq }
}

/* How many separate answers a chapter is offering. The intro counts as one
   when it is the reason the chapter is here. */
export function chapterHits(c: SearchedChapter): number {
  return (c.intro ? 1 : 0) + c.features.length + c.tips.length + c.faq.length
}

/* `chapters` is [{ key, chapter }] in reading order. An empty query returns
   `active: false`, which is how a screen tells "browsing" from "searched
   and found nothing" — two states that must not look alike. */
export function searchHelp(
  chapters: { key: string; chapter: HelpChapter | null }[],
  faqCategories: HelpFaqCategory[],
  query: string,
): HelpSearchResults {
  const q = fold(query)
  if (!q) return { active: false, guide: [], faq: [], count: 0 }

  const guide = (chapters || [])
    .map(({ key, chapter }) => filterChapter(key, chapter, q))
    .filter((c): c is SearchedChapter => c !== null)

  const faq = (faqCategories || [])
    .map((cat) => ({
      category: cat.category,
      items: (cat.items || []).filter((item) => hit(item.q, q) || hit(item.a, q)),
    }))
    .filter((cat) => cat.items.length > 0)

  const count = guide.reduce((n, c) => n + chapterHits(c), 0)
    + faq.reduce((n, cat) => n + cat.items.length, 0)

  return { active: true, guide, faq, count }
}
