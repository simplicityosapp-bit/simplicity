/* ════════════════════════════════════════════════════════════════
   PRERENDER ROUTES — which public URLs get static content baked in.
   ════════════════════════════════════════════════════════════════
   Simplicity is a client-rendered SPA on purpose: everything behind the
   login is a private app, nothing crawls it, and SSR would buy nothing.
   Two routes are the exception — they are the only pages an outsider
   (a search engine, or Google's OAuth verification reviewer) is ever
   asked to read:

     /       the marketing landing — "what does this product do"
     /legal  the privacy policy, terms, and DPA

   Google rejected the OAuth verification precisely here: a reviewer with
   no JavaScript saw `<div id="root"></div>` and reported "privacy policy
   insufficient content" and "home page doesn't explain purpose". Both
   were true of the HTML, and false of the app.

   Each entry below is rendered to static HTML at build time (see
   build.js) into dist/<out>. Every OTHER path still falls through to the
   empty shell and stays a pure SPA.

   ── Why "/" is written to index.html and the shell moved to app.html ──
   Vercel applies vercel.json `rewrites` only AFTER the filesystem misses.
   "/legal" is not a file, so its rewrite fires; "/" resolves to
   dist/index.html on the filesystem and never reaches the rewrite table
   at all. Measured in production, not guessed: with a `{"source": "/"}`
   rewrite in place, all five legal URLs served their prerendered pages
   and "/" alone kept serving the empty shell.

   So the homepage cannot be routed to — it has to BE index.html. The
   empty shell it displaced becomes SPA_SHELL, which the catch-all rewrite
   points at, and deep links keep getting a blank root to mount into
   rather than a flash of the landing page.
   ════════════════════════════════════════════════════════════════ */

const SITE = 'https://simplicity-os.com'

/* The untouched empty shell, for the "/(.*)" catch-all. Deep routes
   (/clients, /settings …) are rewritten here. */
export const SPA_SHELL = 'app.html'

export const PRERENDER_ROUTES = [
  {
    /* Served straight off the filesystem — see the header. No rewrite
       exists for it, and none would ever run. */
    out: 'index.html',
    rewrite: false,
    kind: 'landing',
    location: '/',
    /* No meta overrides: index.html's own title/description/canonical are
       already written for the homepage. Only the body is filled in. */
  },
  {
    out: 'prerender/legal-privacy.html',
    kind: 'legal',
    location: '/legal?tab=privacy',
    legalTab: 'privacy',
    /* `title` is the <title> tag and leads with the Latin brand, matching
       the OAuth consent screen's App name (see index.html). `socialTitle`
       is what og:title and twitter:title get — Hebrew, unchanged, because a
       shared link should still look Hebrew to whoever receives it. Omit
       socialTitle and the social tags keep index.html's own values. */
    title: 'Simplicity | מדיניות פרטיות',
    socialTitle: 'מדיניות פרטיות — סימפליסיטי',
    description:
      'מדיניות הפרטיות של סימפליסיטי: אילו נתונים נאספים, איפה הם נשמרים, מי ניגש אליהם, וכיצד לייצא או למחוק אותם.',
    canonical: `${SITE}/legal?tab=privacy`,
  },
  {
    out: 'prerender/legal-terms.html',
    kind: 'legal',
    location: '/legal?tab=terms',
    legalTab: 'terms',
    title: 'Simplicity | תנאי שימוש',
    socialTitle: 'תנאי שימוש — סימפליסיטי',
    description:
      'תנאי השימוש בסימפליסיטי: רישום וחשבון, שימוש מותר ואסור, תשלום ומנוי, קניין רוחני, הגבלת אחריות, מחיקת חשבון ודין חל.',
    canonical: `${SITE}/legal?tab=terms`,
  },
  {
    out: 'prerender/legal-dpa.html',
    kind: 'legal',
    location: '/legal?tab=dpa',
    legalTab: 'dpa',
    title: 'Simplicity | הסכם עיבוד נתונים (DPA)',
    socialTitle: 'הסכם עיבוד נתונים (DPA) — סימפליסיטי',
    description:
      'הסכם עיבוד הנתונים בין סימפליסיטי למשתמשי השירות: מטרת העיבוד, התחייבויות המעבד והלקוח, זכויות בעל המאגר ותקופת ההסכם.',
    canonical: `${SITE}/legal?tab=dpa`,
  },
]

/* The language every prerendered page is rendered in. Hebrew is both
   DEFAULT_LANG and the fallback, and it is the only bundle the i18n engine
   loads eagerly — a visitor who has chosen another language gets it from
   localStorage the moment React mounts, exactly as today. Crawlers get he. */
export const PRERENDER_LANG = 'he'

/* A rendered page shorter than this is a failed render dressed up as a
   success (an empty root, an error boundary, a component that bailed).
   The real pages are ~30 KB and ~90 KB of markup. */
export const MIN_HTML_BYTES = 4000
