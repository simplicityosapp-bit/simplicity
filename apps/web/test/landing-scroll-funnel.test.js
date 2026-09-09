/* ════════════════════════════════════════════════════════════════
   LANDING SCROLL FUNNEL — the depth thresholds must mean a real read.
   ════════════════════════════════════════════════════════════════
   The landing screen evaluated scroll depth on every frame INCLUDING the
   first call, which happens at mount. At that moment the page is routinely
   still shorter than it will be — images unloaded, reveal blocks not yet
   expanded — so (scrollY + viewportH) / docH lands at or near 1 with nobody
   having scrolled, and scroll_50/75/100 all fire in the same millisecond.

   It was not theoretical. Across 366 real sessions, 42% of scroll_50 and
   38% of scroll_100 were recorded within one second of the view event;
   readers who genuinely reach the bottom take 44 seconds on average. The
   dedupe worked perfectly and faithfully preserved one wrong reading per
   visitor.

   These cases pin the two guards that fix it, so a later refactor of the
   scroll handler cannot quietly reintroduce a page that reads itself.
   Run: npm test
   ════════════════════════════════════════════════════════════════ */
import { describe, it, expect } from 'vitest'
import { scrollDepthEvents } from '../src/lib/api/landingEvents'

/* A realistic long landing page: ~8000px of content in a 900px viewport. */
const TALL = { viewportH: 900, docH: 8000 }

describe('scroll depth events', () => {
  it('reports nothing before the visitor has actually scrolled', () => {
    /* The exact mount case: sitting at the bottom by arithmetic, because the
       page has not grown to its full height yet. */
    expect(scrollDepthEvents({ scrollY: 0, viewportH: 900, docH: 900, hasScrolled: false })).toEqual([])
    /* And even genuinely at the bottom of a tall page, an unscrolled mount
       is not a read. */
    expect(scrollDepthEvents({ ...TALL, scrollY: 7100, hasScrolled: false })).toEqual([])
  })

  it('reports nothing on a page that cannot meaningfully scroll', () => {
    /* docH within MIN_SCROLLABLE_PX of the viewport: one screen of content,
       so "read to the bottom" carries no information. */
    expect(scrollDepthEvents({ scrollY: 0, viewportH: 900, docH: 900, hasScrolled: true })).toEqual([])
    expect(scrollDepthEvents({ scrollY: 0, viewportH: 900, docH: 1050, hasScrolled: true })).toEqual([])
  })

  it('counts a short page once it is genuinely taller than the viewport', () => {
    expect(scrollDepthEvents({ scrollY: 800, viewportH: 900, docH: 1700, hasScrolled: true }))
      .toEqual(['scroll_50', 'scroll_75', 'scroll_100'])
  })

  it('crosses one threshold at a time on the way down', () => {
    const at = (scrollY) => scrollDepthEvents({ ...TALL, scrollY, hasScrolled: true })
    expect(at(0)).toEqual([])                                  // 11% — top of the page
    expect(at(3000)).toEqual([])                               // 48.75% — just under
    expect(at(3200)).toEqual(['scroll_50'])                    // 51.25% — just over
    expect(at(5200)).toEqual(['scroll_50', 'scroll_75'])       // 76%
    expect(at(7100)).toEqual(['scroll_50', 'scroll_75', 'scroll_100']) // 100%
  })

  it('does not fire the bottom threshold just short of the bottom', () => {
    /* 90% down a tall page is not a full read. */
    expect(scrollDepthEvents({ ...TALL, scrollY: 6300, hasScrolled: true }))
      .toEqual(['scroll_50', 'scroll_75'])
  })
})
