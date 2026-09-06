/* ════════════════════════════════════════════════════════════════
   HELP SEARCH — answering "how do I …?" without knowing the chapter.
   ════════════════════════════════════════════════════════════════
   The manual is seventeen chapters and the clients one alone runs to
   ~1,700 words. Finding "how do I change a client's status" meant opening
   chapters one at a time and reading. Worse, the same question could be
   filed in two places: every chapter carries its own שאלות נפוצות, and
   there is a separate global FAQ of account-wide questions. A reader had
   two lists and no way to know which held the answer.

   One query searches both. Matching is deliberately dumb — substring over
   folded text, the same approach searchSettings.js takes — because the
   corpus is small, the reader is typing a word they saw on screen, and
   anything cleverer would be a stemmer nobody can debug in four languages.

   These functions take data, not i18n keys: the caller resolves the
   content (it already has it for rendering) and hands it over. That keeps
   the module free of the i18n singleton, so it can be tested as the pure
   filter it is.

   A chapter whose TITLE matches comes back whole — asking for "לקוחות"
   means the chapter, not the three paragraphs that happen to repeat the
   word. Anything else comes back as only the pieces that matched.
   ════════════════════════════════════════════════════════════════ */

/* Latin lowercases; Hebrew has no case, so folding is mostly about the
   stray whitespace and the quotation marks people paste in from a label. */
const fold = (s) => String(s || '').toLowerCase().trim()

const hit = (text, q) => fold(text).includes(q)

/* One chapter, filtered. Returns null when nothing in it matched. */
function filterChapter(key, chapter, q) {
  if (!chapter) return null
  const whole = hit(chapter.title, q)
  if (whole) {
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
  const intro = hit(chapter.intro, q) ? chapter.intro : ''
  if (!intro && !features.length && !tips.length && !faq.length) return null
  return { key, title: chapter.title, whole: false, intro, features, tips, faq }
}

/* How many separate answers a chapter is offering. The intro counts as one
   when it is the reason the chapter is here. */
export function chapterHits(c) {
  return (c.intro ? 1 : 0) + c.features.length + c.tips.length + c.faq.length
}

/* `chapters` is [{ key, chapter }] in reading order; `faqCategories` is the
   global FAQ as the screen already holds it. An empty query returns empty
   results and `active: false`, which is how the screen tells "browsing"
   from "searching and found nothing". */
export function searchHelp(chapters, faqCategories, query) {
  const q = fold(query)
  if (!q) return { active: false, guide: [], faq: [], count: 0 }

  const guide = (chapters || [])
    .map(({ key, chapter }) => filterChapter(key, chapter, q))
    .filter(Boolean)

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
