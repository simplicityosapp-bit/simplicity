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
   build.js) into dist/prerender/<out>. vercel.json rewrites the public
   URL to that file; every OTHER path still falls through to the empty
   index.html and stays a pure SPA.

   `kind` picks the component to render (see entry.jsx). `location` is
   the URL the router is given, so ?tab= selects the legal document.
   The meta fields override index.html's homepage defaults — without
   them all three legal tabs would share the landing page's <title>.
   ════════════════════════════════════════════════════════════════ */

const SITE = 'https://simplicity-os.com'

export const PRERENDER_ROUTES = [
  {
    out: 'home.html',
    kind: 'landing',
    location: '/',
    /* No meta overrides: index.html's own title/description/canonical are
       already written for the homepage. Only the body is filled in. */
  },
  {
    out: 'legal-privacy.html',
    kind: 'legal',
    location: '/legal?tab=privacy',
    legalTab: 'privacy',
    title: 'מדיניות פרטיות — סימפליסיטי',
    description:
      'מדיניות הפרטיות של סימפליסיטי: אילו נתונים נאספים, היכן הם מאוחסנים (שרתי האיחוד האירופי באירלנד), מי ניגש אליהם, וכיצד לייצא או למחוק אותם.',
    canonical: `${SITE}/legal?tab=privacy`,
  },
  {
    out: 'legal-terms.html',
    kind: 'legal',
    location: '/legal?tab=terms',
    legalTab: 'terms',
    title: 'תנאי שימוש — סימפליסיטי',
    description:
      'תנאי השימוש בשירות סימפליסיטי — מערכת הפעלה לעסק למטפלים, מאמנים, מנטורים ומנחים.',
    canonical: `${SITE}/legal?tab=terms`,
  },
  {
    out: 'legal-dpa.html',
    kind: 'legal',
    location: '/legal?tab=dpa',
    legalTab: 'dpa',
    title: 'הסכם עיבוד נתונים (DPA) — סימפליסיטי',
    description:
      'הסכם עיבוד הנתונים בין סימפליסיטי למשתמשי השירות — היקף העיבוד, אמצעי האבטחה, וזכויות בעל המאגר.',
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
