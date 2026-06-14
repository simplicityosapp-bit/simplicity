import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Layers, Compass, Languages,
  Users, Wallet, CalendarDays, Target, Sparkles, GitBranch,
  Gauge, Bell, SlidersHorizontal,
  Check, Plus, ArrowLeft, ShieldCheck, EyeOff,
} from 'lucide-react'
import { ROUTES } from '../../lib/routes'
import './LandingScreen.css'

/* ════════════════════════════════════════════════════════════════════
   LANDING — public marketing page (served at "/" to logged-out visitors).
   ════════════════════════════════════════════════════════════════════
   Self-contained: imports only tokens + lucide, never the authenticated
   app's hooks or data. First Hebrew draft — refined with the owner.
   Positioning (deep research): own the white space no Israeli competitor
   holds — pace over records ("מבט על"), the whole practitioner (business +
   reflection), calm + Hebrew-native, gender-aware copy. Tone: warm, grown-
   up, "feels like exhaling" — no hype words, no exclamation marks.
   Section order: hero → product demo → values → features → how-it-works →
   trust/privacy → FAQ → closing CTA → footer. ONE repeated CTA = free
   signup. Numbers/%/₪ are bidi-isolated for correct RTL rendering.
   ════════════════════════════════════════════════════════════════════ */

const VALUES = [
  {
    icon: Layers,
    title: 'הכול במקום אחד',
    text: 'לקוחות, יומן, כספים, משימות ויעדים — בלי לקפוץ בין אקסל, וואטסאפ ופנקס. תמונה אחת שלמה של העסק, תמיד מעודכנת.',
  },
  {
    icon: Compass,
    title: 'קצב, לא לחץ',
    text: '״מבט על״ מראה לכם במבט אחד אם אתם בקצב להשגת היעדים החודשיים. התקדמות נמדדת ברוגע — לא בעוד התראה אדומה.',
  },
  {
    icon: Languages,
    title: 'בעברית, ובכבוד',
    text: 'נבנתה מהיסוד בעברית מלאה ומימין לשמאל, עם פנייה בלשון שלכם — זכר, נקבה או ניטרלי. כי הדרך שמדברים אליכם חשובה.',
  },
]

const FEATURES = [
  { icon: Users, title: 'לקוחות', text: 'כרטיס לקוח חי: היסטוריה, סטטוס, יתרה ופגישות — הכול תחת שם אחד.' },
  { icon: Wallet, title: 'כספים', text: 'הכנסות, הוצאות, יתרות והוראות קבע. תדעו בדיוק איפה העסק עומד.' },
  { icon: CalendarDays, title: 'פגישות ויומן', text: 'קביעת פגישות, חבילות וסשנים — מסודר וברור, מול היומן שלכם.' },
  { icon: Target, title: 'יעדים ומבט על', text: 'הציבו יעדים חודשיים, וראו ב״מבט על״ אם אתם בקצב להשיג אותם.' },
  { icon: Sparkles, title: 'תובנות יומיות', text: 'שאלה קצרה כל יום, שמציירת לאורך זמן מגמות ותובנות על עצמכם.' },
  { icon: GitBranch, title: 'לידים ופרויקטים', text: 'מפנייה ראשונה ועד לקוח משלם — ומיזמים קבוצתיים, במקום אחד.' },
]

const STEPS = [
  {
    tree: '/onboarding-tree/1.png',
    title: 'נרשמים ומקימים את העסק',
    text: 'מספרים לנו על העיסוק שלכם. אפשר גם לייבא לקוחות, פגישות וכספים מקובץ אקסל בלחיצה.',
  },
  {
    tree: '/onboarding-tree/5.png',
    title: 'מנהלים הכול במקום אחד',
    text: 'לקוחות, פגישות, כספים ומשימות מתעדכנים תוך כדי עבודה — בלי כפילויות ובלי בלגן.',
  },
  {
    tree: '/onboarding-tree/10.png',
    title: 'מתקדמים בקצב',
    text: '״מבט על״ והתובנות מראים לכם את התמונה הגדולה, ועוזרים להחליט מה הצעד הבא.',
  },
]

const DEMO_POINTS = [
  {
    icon: Gauge,
    title: 'מבט על — ציון אחד שאומר הכול',
    text: 'במקום עשרה דוחות, מספר אחד: כמה אתם בקצב להשגת היעדים החודש.',
  },
  {
    icon: Bell,
    title: 'דרושה תשומת לב',
    text: 'המערכת מקדימה ומראה מה דורש פעולה — תשלום שתקוע, פגישה מתקרבת, לקוח ששקט.',
  },
  {
    icon: SlidersHorizontal,
    title: 'מותאם אליכם',
    text: 'בוחרים אילו כרטיסים לראות, באיזו צפיפות ובאיזו ערכת נושא — יום או לילה.',
  },
]

const TRUST = [
  {
    icon: ShieldCheck,
    title: 'מוצפן ושמור',
    text: 'תוכן רגיש — כמו הערות על לקוחות ועל סשנים — מוצפן בתקן AES-256 ונשאר חסוי.',
  },
  {
    icon: Languages,
    title: 'נבנתה בישראל, בעברית',
    text: 'מהיסוד מימין לשמאל, עם פנייה בלשון זכר, נקבה או ניטרלי — לבחירתכם.',
  },
  {
    icon: EyeOff,
    title: 'בלי פרסומות, בלי מכירת מידע',
    text: 'המידע שלכם לא מועבר לאף אחד. הוא שלכם בלבד, נקודה.',
  },
]

const FAQS = [
  {
    q: 'למי סימפליסיטי מתאימה?',
    a: 'לקואצ׳ים, מנטורים, מטפלים, מנחים, מדריכים ומורים — לכל מי שמנהל עסק טיפולי או ליווי אישי, לבד או בקבוצות. מתאימה גם אם אתם רק בתחילת הדרך.',
  },
  {
    q: 'כמה זמן לוקח להתחיל?',
    a: 'דקות. נרשמים, מספרים על העיסוק, ואפשר גם לייבא לקוחות וכספים קיימים מאקסל — והמערכת מזהה את העמודות באופן אוטומטי.',
  },
  {
    q: 'מה עם הפרטיות של הלקוחות שלי?',
    a: 'תוכן רגיש מוצפן בתקן AES-256, הגישה מאובטחת, והמידע נשאר שלכם בלבד — אנחנו לא מוכרים ולא חולקים אותו עם אף אחד.',
  },
  {
    q: 'כמה זה עולה?',
    a: 'אפשר להתחיל בחינם וליצור חשבון בלי כרטיס אשראי, כדי להכיר את המערכת בקצב שלכם.',
  },
  {
    q: 'צריך להתקין משהו?',
    a: 'לא. סימפליסיטי עובדת בדפדפן ובנייד, ואפשר להוסיף אותה למסך הבית כאפליקציה — בלי הורדות ובלי עדכונים.',
  },
  {
    q: 'זה באמת מותאם לישראל ולעברית?',
    a: 'לגמרי. נבנתה מהיסוד בעברית מלאה ומימין לשמאל, עם שקלים, תאריכים עבריים ופנייה בלשון זכר, נקבה או ניטרלי.',
  },
]

/* FAQ structured data — rendered only on this page (the homepage), built
   from the single FAQS source so the markup never drifts from the copy. */
const FAQ_LD = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: FAQS.map(({ q, a }) => ({
    '@type': 'Question',
    name: q,
    acceptedAnswer: { '@type': 'Answer', text: a },
  })),
}

export default function LandingScreen() {
  const rootRef = useRef(null)
  const [scrolled, setScrolled] = useState(false)

  /* Sticky-header glass appears once the hero scrolls away. */
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  /* Gentle reveal-on-scroll for every .lp-reveal block. */
  useEffect(() => {
    const els = rootRef.current?.querySelectorAll('.lp-reveal')
    if (!els?.length) return
    if (!('IntersectionObserver' in window)) {
      els.forEach((el) => el.classList.add('in'))
      return
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('in')
            io.unobserve(e.target)
          }
        })
      },
      { threshold: 0.14, rootMargin: '0px 0px -8% 0px' }
    )
    els.forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [])

  return (
    <div className="lp-root" dir="rtl" ref={rootRef}>
      <div className="lp-bg" aria-hidden="true" />

      {/* ── Header ─────────────────────────────────────────────── */}
      <header className={`lp-header${scrolled ? ' scrolled' : ''}`}>
        <div className="lp-wrap lp-header-in">
          <a className="lp-brand" href="#top" aria-label="סימפליסיטי — לדף הבית">
            <img src="/logo-dark.png" className="lp-brand-logo dark" alt="" aria-hidden="true" />
            <img src="/logo-light.png" className="lp-brand-logo light" alt="" aria-hidden="true" />
            <span className="lp-brand-name">סימפליסיטי</span>
          </a>
          <nav className="lp-header-actions" aria-label="פעולות חשבון">
            <Link to={ROUTES.LOGIN} className="lp-btn lp-btn-ghost">כניסה</Link>
            <Link to={ROUTES.SIGNUP} className="lp-btn lp-btn-primary lp-btn-pill">התחילו בחינם</Link>
          </nav>
        </div>
      </header>

      <main id="top">
        {/* ── Hero ─────────────────────────────────────────────── */}
        <section className="lp-hero lp-wrap" aria-labelledby="lp-h1">
          <img src="/logo-dark.png" className="lp-hero-mark dark" alt="" aria-hidden="true" />
          <img src="/logo-light.png" className="lp-hero-mark light" alt="" aria-hidden="true" />
          <span className="lp-eyebrow">
            <span className="lp-eyebrow-dot" />
            מערכת ההפעלה לעסק הטיפולי
          </span>
          <h1 className="lp-hero-title" id="lp-h1">
            כל העסק הטיפולי שלך,<br />
            <span className="accent">במקום אחד שקט.</span>
          </h1>
          <p className="lp-hero-sub">
            לקואצ׳ים, מטפלים ומנטורים: לקוחות, כספים, פגישות ויעדים — במקום אחד מסודר, בעברית.
            ו״מבט על״ אחד מראה לכם אם אתם בקצב הנכון החודש.
          </p>
          <div className="lp-hero-cta">
            <Link to={ROUTES.SIGNUP} className="lp-btn lp-btn-primary lp-btn-lg">התחילו בחינם</Link>
            <Link to={ROUTES.LOGIN} className="lp-btn lp-btn-secondary">כבר יש לי חשבון</Link>
          </div>
          <p className="lp-hero-trust">
            <span><Check size={15} strokeWidth={2.4} /> חינם להתחיל</span>
            <span><Check size={15} strokeWidth={2.4} /> בלי כרטיס אשראי</span>
            <span><Check size={15} strokeWidth={2.4} /> בעברית מלאה</span>
          </p>
        </section>

        {/* ── Product preview (early proof) ────────────────────── */}
        <section className="lp-section lp-wrap" aria-labelledby="lp-demo-h">
          <div className="lp-section-head lp-reveal">
            <span className="lp-section-eyebrow">המסך הראשי</span>
            <h2 className="lp-section-title" id="lp-demo-h">היום שלכם, מרוכז במסך אחד</h2>
            <p className="lp-section-sub">
              נכנסים בבוקר ורואים בדיוק מה חשוב: איפה אתם עומדים, ומה דורש תשומת לב עכשיו.
            </p>
          </div>

          <div className="lp-demo-grid">
            <div className="lp-demo-stage lp-reveal">
              <div className="lp-device" role="img" aria-label="תצוגה של המסך הראשי בסימפליסיטי: ‘מבט על’ עם ציון של 78 אחוז בקצב, ורשימת פריטים שדורשים תשומת לב.">
                <div className="lp-screen" aria-hidden="true">
                  <p className="lp-screen-greet">בוקר טוב,</p>
                  <p className="lp-screen-name">נועה</p>

                  <div className="lp-moon">
                    <div className="lp-ring">
                      <svg viewBox="0 0 100 100">
                        <circle className="lp-ring-track" cx="50" cy="50" r="42" />
                        {/* 78% of 2πr (≈263.9) → offset ≈ 58 */}
                        <circle className="lp-ring-fill" cx="50" cy="50" r="42"
                          strokeDasharray="263.9" strokeDashoffset="58" />
                      </svg>
                      <div className="lp-ring-center">
                        <span className="lp-ring-pct"><bdi>78%</bdi></span>
                      </div>
                    </div>
                    <div className="lp-moon-body">
                      <p className="lp-moon-title">מבט על</p>
                      <p className="lp-moon-line">אתם <b>בקצב</b> להשגת היעדים החודש — המשיכו ככה.</p>
                    </div>
                  </div>

                  <div className="lp-rows">
                    <div className="lp-row">
                      <span className="lp-row-dot amber"><Wallet size={16} strokeWidth={1.8} /></span>
                      <div className="lp-row-body">
                        <p className="lp-row-t">3 תנועות ממתינות לאישור</p>
                        <p className="lp-row-s">כספים</p>
                      </div>
                      <span className="lp-row-val"><bdi>₪1,240</bdi></span>
                    </div>
                    <div className="lp-row">
                      <span className="lp-row-dot sage"><CalendarDays size={16} strokeWidth={1.8} /></span>
                      <div className="lp-row-body">
                        <p className="lp-row-t">פגישה היום ב־<bdi>17:00</bdi></p>
                        <p className="lp-row-s">יומן · דניאל כהן</p>
                      </div>
                      <ArrowLeft size={16} strokeWidth={1.8} style={{ color: 'var(--stone)' }} />
                    </div>
                    <div className="lp-row">
                      <span className="lp-row-dot clay"><Users size={16} strokeWidth={1.8} /></span>
                      <div className="lp-row-body">
                        <p className="lp-row-t">לא דיברתם <bdi>45</bdi> יום</p>
                        <p className="lp-row-s">מעקב · מיכל לוי</p>
                      </div>
                      <ArrowLeft size={16} strokeWidth={1.8} style={{ color: 'var(--stone)' }} />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="lp-demo-points">
              {DEMO_POINTS.map(({ icon: Icon, title, text }) => (
                <div className="lp-demo-point lp-reveal" key={title}>
                  <span className="lp-demo-point-ic"><Icon size={20} strokeWidth={1.7} /></span>
                  <div>
                    <p className="lp-demo-point-t">{title}</p>
                    <p className="lp-demo-point-s">{text}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Values ───────────────────────────────────────────── */}
        <section className="lp-section lp-wrap" aria-labelledby="lp-values-h">
          <div className="lp-section-head lp-reveal">
            <span className="lp-section-eyebrow">למה סימפליסיטי</span>
            <h2 className="lp-section-title" id="lp-values-h">פחות בלגן. יותר נוכחות.</h2>
            <p className="lp-section-sub">
              שלושה דברים שהופכים את סימפליסיטי למקום שנעים לנהל ממנו עסק — לא עוד תוכנה, אלא בית.
            </p>
          </div>
          <div className="lp-values">
            {VALUES.map(({ icon: Icon, title, text }) => (
              <article className="lp-card lp-value lp-reveal" key={title}>
                <span className="lp-value-ic"><Icon size={24} strokeWidth={1.6} /></span>
                <h3 className="lp-value-title">{title}</h3>
                <p className="lp-value-text">{text}</p>
              </article>
            ))}
          </div>
        </section>

        {/* ── Features ─────────────────────────────────────────── */}
        <section className="lp-section lp-wrap" aria-labelledby="lp-features-h">
          <div className="lp-section-head lp-reveal">
            <span className="lp-section-eyebrow">מה יש בפנים</span>
            <h2 className="lp-section-title" id="lp-features-h">כל מה שצריך כדי לנהל עסק טיפולי</h2>
            <p className="lp-section-sub">
              ששת הכלים שעובדים יחד — מהפנייה הראשונה ועד התמונה הגדולה בסוף החודש.
            </p>
          </div>
          <div className="lp-features">
            {FEATURES.map(({ icon: Icon, title, text }) => (
              <article className="lp-card lp-feature lp-reveal" key={title}>
                <span className="lp-feature-ic"><Icon size={20} strokeWidth={1.7} /></span>
                <h3 className="lp-feature-title">{title}</h3>
                <p className="lp-feature-text">{text}</p>
              </article>
            ))}
          </div>
        </section>

        {/* ── How it works ─────────────────────────────────────── */}
        <section className="lp-section lp-wrap" aria-labelledby="lp-how-h">
          <div className="lp-section-head lp-reveal">
            <span className="lp-section-eyebrow">פשוט להתחיל</span>
            <h2 className="lp-section-title" id="lp-how-h">מתחילים בשלושה צעדים</h2>
            <p className="lp-section-sub">
              כמו עץ שגדל — מתחילים קטן, ובכל שלב התמונה נעשית שלמה יותר.
            </p>
          </div>
          <div className="lp-steps">
            {STEPS.map(({ tree, title, text }, i) => (
              <article className="lp-card lp-step lp-reveal" key={title}>
                <img className="lp-step-tree" src={tree} alt="" aria-hidden="true" />
                <span className="lp-step-num"><bdi>{i + 1}</bdi></span>
                <h3 className="lp-step-title">{title}</h3>
                <p className="lp-step-text">{text}</p>
              </article>
            ))}
          </div>
        </section>

        {/* ── Trust / privacy ──────────────────────────────────── */}
        <section className="lp-section lp-wrap" aria-labelledby="lp-trust-h">
          <div className="lp-section-head lp-reveal">
            <span className="lp-section-eyebrow">פרטיות ושקט נפש</span>
            <h2 className="lp-section-title" id="lp-trust-h">הנתונים שלך — שלך בלבד.</h2>
            <p className="lp-section-sub">פרטיות היא לא עוד הגדרה במערכת. היא חלק מהשקט.</p>
          </div>
          <div className="lp-values">
            {TRUST.map(({ icon: Icon, title, text }) => (
              <article className="lp-card lp-value lp-reveal" key={title}>
                <span className="lp-value-ic"><Icon size={24} strokeWidth={1.6} /></span>
                <h3 className="lp-value-title">{title}</h3>
                <p className="lp-value-text">{text}</p>
              </article>
            ))}
          </div>
        </section>

        {/* ── FAQ ──────────────────────────────────────────────── */}
        <section className="lp-section lp-wrap" aria-labelledby="lp-faq-h">
          <div className="lp-section-head lp-reveal">
            <span className="lp-section-eyebrow">שאלות נפוצות</span>
            <h2 className="lp-section-title" id="lp-faq-h">כל מה שרציתם לדעת</h2>
          </div>
          <div className="lp-faq">
            {FAQS.map(({ q, a }) => (
              <details className="lp-faq-item lp-reveal" key={q}>
                <summary className="lp-faq-q">
                  {q}
                  <Plus className="lp-faq-q-ic" size={20} strokeWidth={2} aria-hidden="true" />
                </summary>
                <p className="lp-faq-a">{a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* ── Closing CTA ──────────────────────────────────────── */}
        <section className="lp-cta lp-wrap">
          <div className="lp-cta-card lp-reveal">
            <h2 className="lp-cta-title">הכול מתחיל כאן.</h2>
            <p className="lp-cta-sub">
              הצטרפו לקואצ׳ים, מנטורים ומטפלים שכבר מנהלים את העסק שלהם ברוגע — במקום אחד.
            </p>
            <div className="lp-cta-actions">
              <Link to={ROUTES.SIGNUP} className="lp-btn lp-btn-primary lp-btn-lg">התחילו בחינם</Link>
              <Link to={ROUTES.LOGIN} className="lp-btn lp-btn-secondary">יש לי כבר חשבון</Link>
            </div>
            <p className="lp-cta-micro">חינם להתחיל · בלי כרטיס אשראי · בלי התחייבות</p>
          </div>
        </section>
      </main>

      {/* ── Footer ─────────────────────────────────────────────── */}
      <footer className="lp-foot">
        <div className="lp-wrap lp-foot-in">
          <div className="lp-foot-brand">
            <span className="lp-foot-brand-row">
              <img src="/logo-dark.png" className="lp-brand-logo dark" alt="" aria-hidden="true" />
              <img src="/logo-light.png" className="lp-brand-logo light" alt="" aria-hidden="true" />
              <span className="lp-brand-name">סימפליסיטי</span>
            </span>
            <p className="lp-foot-tag">מערכת ההפעלה לעסק הטיפולי — לקואצ׳ים, מנטורים ומטפלים. נבנתה באהבה בישראל.</p>
          </div>
          <div className="lp-foot-links">
            <div className="lp-foot-col">
              <span className="lp-foot-col-h">מוצר</span>
              <Link to={ROUTES.SIGNUP} className="lp-foot-link">הרשמה</Link>
              <Link to={ROUTES.LOGIN} className="lp-foot-link">כניסה</Link>
            </div>
            <div className="lp-foot-col">
              <span className="lp-foot-col-h">משפטי</span>
              <Link to={`${ROUTES.LEGAL}?tab=privacy`} className="lp-foot-link">מדיניות פרטיות</Link>
              <Link to={`${ROUTES.LEGAL}?tab=terms`} className="lp-foot-link">תנאי שימוש</Link>
            </div>
            <div className="lp-foot-col">
              <span className="lp-foot-col-h">קשר</span>
              <a href="mailto:simplicity.os.app@gmail.com" className="lp-foot-link">צרו קשר</a>
            </div>
          </div>
        </div>
        <div className="lp-wrap lp-foot-legal">
          <span>© 2026 סימפליסיטי. כל הזכויות שמורות.</span>
          <span>נבנה באהבה בישראל</span>
        </div>
      </footer>

      {/* FAQ structured data for rich results (homepage only). */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(FAQ_LD) }} />
    </div>
  )
}
