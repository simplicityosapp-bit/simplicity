import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Trans } from 'react-i18next'
import {
  Layers, Sun, Moon, TrendingUp, Languages,
  Users, Wallet, CalendarDays, Target, Sparkles, GitBranch,
  Gauge, Bell, SlidersHorizontal,
  Plus, ArrowLeft, ShieldCheck, EyeOff,
} from 'lucide-react'
import { ROUTES } from '../../lib/routes'
import MG from '../../components/MG'
import { mgToReadable } from '../../lib/multiGender'
import { trackLandingEvent } from '../../lib/api/landingEvents'
import { useT } from '../../i18n/useT'
import { dirFor } from '../../i18n/config'
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

   i18n: copy lives in i18n/locales/{en,he}/landing.json (namespace
   'landing'); English is source. The dual-gender role nouns (מטפלים/ות …)
   carry MultiGndr merge glyphs in the Hebrew strings and stay plain words
   in English — both are wrapped in <MG> so the glyphs (when present) get an
   accessible sr-only readable form. The brand wordmark "Simplicity" stays
   in the markup as-is.
   ════════════════════════════════════════════════════════════════════ */

export default function LandingScreen() {
  const { t, lang } = useT('landing')
  /* Follow the active language's direction (Hebrew → rtl, English/es/fr → ltr).
     Mirrors DirManager's <html dir>; without this the landing forced rtl, which
     left LTR languages right-aligned and mangled their punctuation. */
  const dir = dirFor((lang || 'he').split('-')[0])
  const rootRef = useRef(null)
  const veilRef = useRef(null)
  const [scrolled, setScrolled] = useState(false)
  const [theme, setTheme] = useState(() =>
    (typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme') === 'dark') ? 'dark' : 'light'
  )

  /* Anonymous funnel: count one landing view per tab-session (the helper
     dedupes). The signup_start stage fires from the CTA onClick below. */
  useEffect(() => { trackLandingEvent('view') }, [])

  /* The three role nouns shared by hero / CTA / footer / FAQ, pre-joined per
     the active language ("מטפלים/ות, מורים/ות ומנחים/ות" / "therapists,
     teachers and facilitators"). The Hebrew nouns carry merge glyphs. */
  const roleList = t('roles.list', {
    therapist: t('roles.therapists'),
    teacher: t('roles.teachers'),
    facilitator: t('roles.facilitators'),
  })

  const VALUES = [
    { icon: Layers, title: t('values.allInOne.title'), text: t('values.allInOne.text') },
    { icon: Sun, title: t('values.clarity.title'), text: t('values.clarity.text') },
    { icon: TrendingUp, title: t('values.growth.title'), text: t('values.growth.text') },
  ]

  const FEATURES = [
    { icon: CalendarDays, title: t('features.calendar.title'), text: t('features.calendar.text') },
    { icon: Wallet, title: t('features.finance.title'), text: t('features.finance.text') },
    { icon: Users, title: t('features.clients.title'), text: t('features.clients.text') },
    { icon: Sparkles, title: t('features.insights.title'), text: t('features.insights.text') },
    { icon: GitBranch, title: t('features.projects.title'), text: t('features.projects.text') },
    { icon: Target, title: t('features.goals.title'), text: t('features.goals.text') },
  ]

  const DEMO_POINTS = [
    { icon: Gauge, title: t('demo.points.score.title'), text: t('demo.points.score.text') },
    { icon: Bell, title: t('demo.points.attention.title'), text: t('demo.points.attention.text') },
    { icon: SlidersHorizontal, title: t('demo.points.tailored.title'), text: t('demo.points.tailored.text') },
  ]

  const TRUST = [
    { icon: ShieldCheck, title: t('trust.secure.title'), text: t('trust.secure.text') },
    { icon: Languages, title: t('trust.hebrew.title'), text: t('trust.hebrew.text') },
    { icon: EyeOff, title: t('trust.noAds.title'), text: t('trust.noAds.text') },
  ]

  /* FAQ — answers interpolate the (glyph-bearing) role nouns, so each one is
     wrapped in <MG> for the accessible readable form. */
  const FAQS = [
    {
      q: t('faq.fit.q'),
      a: t('faq.fit.a', {
        therapist: t('roles.therapists'),
        teacher: t('roles.teachers'),
        facilitator: t('roles.facilitators'),
      }),
    },
    { q: t('faq.start.q'), a: t('faq.start.a') },
    { q: t('faq.privacy.q'), a: t('faq.privacy.a') },
    { q: t('faq.price.q'), a: t('faq.price.a') },
    { q: t('faq.install.q'), a: t('faq.install.a') },
    { q: t('faq.hebrew.q'), a: t('faq.hebrew.a') },
  ]

  /* FAQ structured data — rendered only on this page (the homepage), built
     from the single FAQS source so the markup never drifts from the copy.
     mgToReadable strips any merge glyphs from the answer text. */
  const FAQ_LD = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQS.map(({ q, a }) => ({
      '@type': 'Question',
      name: q,
      acceptedAnswer: { '@type': 'Answer', text: mgToReadable(a) },
    })),
  }

  /* Day/night toggle — writes the same localStorage key + data-theme the app's
     bootstrap uses, so the choice persists on reload and into the app. */
  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    document.documentElement.setAttribute('data-theme', next)
    try { localStorage.setItem('mg-theme', next) } catch { /* private mode — non-fatal */ }
  }

  /* Sticky-header glass + the fixed forest backdrop whose centre brightens as
     you scroll past the hero: the outer tree-frame stays visible, the middle
     clears so content reads and the centre stays calm. rAF-throttled. */
  useEffect(() => {
    let raf = 0
    const update = () => {
      raf = 0
      const y = window.scrollY
      setScrolled(y > 24)
      const vh = window.innerHeight || 1
      const t = Math.min(1, Math.max(0, (y - vh * 0.2) / (vh * 0.6)))
      if (veilRef.current) veilRef.current.style.opacity = (0.12 + t * 0.83).toFixed(3)
    }
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update) }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      if (raf) cancelAnimationFrame(raf)
    }
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
    <div className="lp-root" dir={dir} ref={rootRef}>
      <div className="lp-bg" aria-hidden="true" />
      <div className="lp-veil" aria-hidden="true" ref={veilRef} />

      {/* ── Header ─────────────────────────────────────────────── */}
      <header className={`lp-header${scrolled ? ' scrolled' : ''}`}>
        <div className="lp-wrap lp-header-in">
          <a className="lp-brand" href="#top" aria-label={t('nav.home')}>
            <img src="/logo-dark.png" className="lp-brand-logo dark" alt="" aria-hidden="true" />
            <img src="/logo-light.png" className="lp-brand-logo light" alt="" aria-hidden="true" />
            <span className="lp-brand-name">Simplicity</span>
          </a>
          <nav className="lp-header-actions" aria-label={t('nav.accountActions')}>
            <button
              type="button"
              className="lp-switch"
              role="switch"
              aria-checked={theme === 'dark'}
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? t('nav.toDay') : t('nav.toNight')}
            >
              <Sun className="lp-switch-ic lp-switch-sun" size={14} strokeWidth={2} aria-hidden="true" />
              <Moon className="lp-switch-ic lp-switch-moon" size={13} strokeWidth={2} aria-hidden="true" />
              <span className="lp-switch-knob" aria-hidden="true" />
            </button>
            <Link to={ROUTES.LOGIN} className="lp-btn lp-btn-ghost">{t('nav.login')}</Link>
            <Link to={ROUTES.SIGNUP} className="lp-btn lp-btn-primary lp-btn-pill">{t('nav.startFree')}</Link>
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
            {t('hero.eyebrow')}
          </span>
          <h1 className="lp-hero-title" id="lp-h1">
            {t('hero.title1')}<br />
            <span className="accent">{t('hero.title2')}</span>
          </h1>
          <p className="lp-hero-sub">
            <MG text={t('hero.subAddress', {
              therapist: t('roles.therapists'),
              advisor: t('roles.advisors'),
              teacher: t('roles.teachers'),
              facilitator: t('roles.facilitators'),
            })} /><br />
            {t('hero.subBody')}
          </p>
          <div className="lp-hero-cta">
            <Link to={ROUTES.SIGNUP} className="lp-btn lp-btn-primary lp-btn-lg" onClick={() => trackLandingEvent('signup_start')}>{t('hero.ctaPrimary')}</Link>
            <Link to={ROUTES.LOGIN} className="lp-btn lp-btn-secondary">{t('hero.ctaSecondary')}</Link>
          </div>
          <p className="lp-hero-trust">{t('hero.trust')}</p>
        </section>

        {/* ── Product preview (early proof) ────────────────────── */}
        <section className="lp-section lp-wrap" aria-labelledby="lp-demo-h">
          <div className="lp-section-head lp-reveal">
            <span className="lp-section-eyebrow">{t('demo.eyebrow')}</span>
            <h2 className="lp-section-title" id="lp-demo-h">{t('demo.title')}</h2>
            <p className="lp-section-sub">
              {t('demo.sub')}
            </p>
          </div>

          <div className="lp-demo-grid">
            <div className="lp-demo-stage lp-reveal">
              <div className="lp-device" role="img" aria-label={t('demo.deviceAria')}>
                <div className="lp-screen" aria-hidden="true">
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
                      <p className="lp-moon-title">{t('demo.moonTitle')}</p>
                      <p className="lp-moon-line">
                        <Trans t={t} i18nKey="demo.moonLine" components={[<b key="b" />]} />
                      </p>
                    </div>
                  </div>

                  <div className="lp-rows">
                    <div className="lp-rows-head">
                      <span className="lp-rows-title">{t('demo.attentionTitle')}</span>
                      <span className="lp-rows-count">
                        <Trans t={t} i18nKey="demo.attentionCount" values={{ count: 3 }} components={[<bdi key="c" />]} />
                      </span>
                    </div>
                    <div className="lp-row">
                      <span className="lp-row-dot amber"><Wallet size={16} strokeWidth={1.8} /></span>
                      <div className="lp-row-body">
                        <p className="lp-row-t">{t('demo.row1Title')}</p>
                        <p className="lp-row-s">{t('demo.row1Sub')}</p>
                      </div>
                      <span className="lp-row-val"><bdi>₪1,240</bdi></span>
                    </div>
                    <div className="lp-row">
                      <span className="lp-row-dot sage"><CalendarDays size={16} strokeWidth={1.8} /></span>
                      <div className="lp-row-body">
                        <p className="lp-row-t">
                          <Trans t={t} i18nKey="demo.row2Title" components={[<bdi key="t" />]} />
                        </p>
                        <p className="lp-row-s">{t('demo.row2Sub')}</p>
                      </div>
                      <ArrowLeft size={16} strokeWidth={1.8} style={{ color: 'var(--stone)' }} />
                    </div>
                    <div className="lp-row">
                      <span className="lp-row-dot clay"><Users size={16} strokeWidth={1.8} /></span>
                      <div className="lp-row-body">
                        <p className="lp-row-t">
                          <Trans t={t} i18nKey="demo.row3Title" components={[<bdi key="d" />]} />
                        </p>
                        <p className="lp-row-s">{t('demo.row3Sub')}</p>
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
            <span className="lp-section-eyebrow">{t('values.eyebrow')}</span>
            <h2 className="lp-section-title" id="lp-values-h">{t('values.title')}</h2>
            <p className="lp-section-sub">
              {t('values.sub')}
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
            <span className="lp-section-eyebrow">{t('features.eyebrow')}</span>
            <h2 className="lp-section-title" id="lp-features-h">{t('features.title')}</h2>
            <p className="lp-section-sub">
              {t('features.sub')}
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

        {/* ── Built with you (openness & feedback) ─────────────── */}
        <section className="lp-section lp-wrap" aria-labelledby="lp-feedback-h">
          <article className="lp-card lp-feedback lp-reveal">
            <span className="lp-feedback-ic">
              <img src="/logo-dark.png" className="lp-feedback-logo dark" alt="" aria-hidden="true" />
              <img src="/logo-light.png" className="lp-feedback-logo light" alt="" aria-hidden="true" />
            </span>
            <h2 className="lp-section-title" id="lp-feedback-h">{t('feedback.title')}</h2>
            <p className="lp-feedback-text">
              {t('feedback.text')}
            </p>
          </article>
        </section>

        {/* ── Trust / privacy ──────────────────────────────────── */}
        <section className="lp-section lp-wrap" aria-labelledby="lp-trust-h">
          <div className="lp-section-head lp-reveal">
            <h2 className="lp-section-title" id="lp-trust-h">{t('trust.title')}</h2>
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
            <span className="lp-section-eyebrow">{t('faq.eyebrow')}</span>
            <h2 className="lp-section-title" id="lp-faq-h">{t('faq.title')}</h2>
          </div>
          <div className="lp-faq">
            {FAQS.map(({ q, a }) => (
              <details className="lp-faq-item lp-reveal" key={q}>
                <summary className="lp-faq-q">
                  {q}
                  <Plus className="lp-faq-q-ic" size={20} strokeWidth={2} aria-hidden="true" />
                </summary>
                <p className="lp-faq-a"><MG text={a} /></p>
              </details>
            ))}
          </div>
        </section>

        {/* ── Closing CTA ──────────────────────────────────────── */}
        <section className="lp-cta lp-wrap">
          <div className="lp-cta-card lp-reveal">
            <h2 className="lp-cta-title">{t('cta.title')}</h2>
            <p className="lp-cta-sub">
              <MG text={t('cta.sub', { roles: roleList })} />
            </p>
            <div className="lp-cta-actions">
              <Link to={ROUTES.SIGNUP} className="lp-btn lp-btn-primary lp-btn-lg" onClick={() => trackLandingEvent('signup_start')}>{t('cta.ctaPrimary')}</Link>
              <Link to={ROUTES.LOGIN} className="lp-btn lp-btn-secondary">{t('cta.ctaSecondary')}</Link>
            </div>
            <p className="lp-cta-micro">{t('cta.micro')}</p>
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
              <span className="lp-brand-name">Simplicity</span>
            </span>
            <p className="lp-foot-tag"><MG text={t('footer.tagline', { roles: roleList })} /></p>
          </div>
          <div className="lp-foot-links">
            <div className="lp-foot-col">
              <span className="lp-foot-col-h">{t('footer.colProduct')}</span>
              <Link to={ROUTES.SIGNUP} className="lp-foot-link">{t('footer.signup')}</Link>
              <Link to={ROUTES.LOGIN} className="lp-foot-link">{t('footer.login')}</Link>
            </div>
            <div className="lp-foot-col">
              <span className="lp-foot-col-h">{t('footer.colLegal')}</span>
              <Link to={`${ROUTES.LEGAL}?tab=privacy`} className="lp-foot-link">{t('footer.privacy')}</Link>
              <Link to={`${ROUTES.LEGAL}?tab=terms`} className="lp-foot-link">{t('footer.terms')}</Link>
            </div>
            <div className="lp-foot-col">
              <span className="lp-foot-col-h">{t('footer.colContact')}</span>
              <a href="mailto:simplicity.os.app@gmail.com" className="lp-foot-link">{t('footer.contact')}</a>
            </div>
          </div>
        </div>
        <div className="lp-wrap lp-foot-legal">
          <span>{t('footer.copyright')}</span>
        </div>
      </footer>

      {/* FAQ structured data for rich results (homepage only). */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(FAQ_LD) }} />
    </div>
  )
}
