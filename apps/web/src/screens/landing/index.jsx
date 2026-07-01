import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Trans } from 'react-i18next'
import {
  Layers, Sun, Moon, TrendingUp, Languages, Globe, Check,
  Users, Wallet, CalendarDays, Target, Sparkles, GitBranch,
  Gauge, Bell, SlidersHorizontal,
  Plus, ArrowLeft, ShieldCheck, EyeOff,
} from 'lucide-react'
import { ROUTES } from '../../lib/routes'
import MG from '../../components/MG'
import { mgToReadable } from '../../lib/multiGender'
import { trackLandingEvent } from '../../lib/api/landingEvents'
import { useT } from '../../i18n/useT'
import { dirFor, APP_LANGS } from '../../i18n/config'
import { useUserPreferences } from '../../hooks/useUserPreferences'
import './LandingScreen.css'
import { Box, Txt, Btn, Lnk } from '../../components/ui'

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
  const { t, lang, i18n } = useT('landing')
  const { update } = useUserPreferences()
  /* Follow the active language's direction (Hebrew → rtl, English/es/fr → ltr).
     Mirrors DirManager's <html dir>; without this the landing forced rtl, which
     left LTR languages right-aligned and mangled their punctuation. */
  const activeLang = (lang || 'he').split('-')[0]
  const dir = dirFor(activeLang)
  const rootRef = useRef(null)
  const veilRef = useRef(null)
  const langRef = useRef(null)
  const [scrolled, setScrolled] = useState(false)
  const [langOpen, setLangOpen] = useState(false)
  const [theme, setTheme] = useState(() =>
    (typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme') === 'dark') ? 'dark' : 'light'
  )

  /* Anonymous funnel: count one landing view per tab-session (the helper
     dedupes). The signup_start stage fires from the CTA onClick below. */
  useEffect(() => { trackLandingEvent('view') }, [])

  /* "Read" signal — still on the page ~30s after load = a visitor who stopped
     to actually read, not a bounce. Fires once per session. */
  useEffect(() => {
    const id = window.setTimeout(() => trackLandingEvent('engaged'), 30_000)
    return () => window.clearTimeout(id)
  }, [])

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

  /* Language picker — changes i18next live (the detector caches the choice in
     localStorage, so it survives reload pre-auth) and persists prefs.design.
     language when a prefs provider is present; pre-auth `update` is a no-op
     stub, so this is safe on the logged-out landing page too. */
  const pickLang = (code) => {
    setLangOpen(false)
    if (code === activeLang) return
    i18n.changeLanguage(code)
    update({ design: { language: code } })
  }

  /* Close the language menu on outside-click or Escape. */
  useEffect(() => {
    if (!langOpen) return
    const onDown = (e) => { if (langRef.current && !langRef.current.contains(e.target)) setLangOpen(false) }
    const onKey = (e) => { if (e.key === 'Escape') setLangOpen(false) }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [langOpen])

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
      /* Anonymous scroll-depth funnel — each threshold fires once per session
         (the helper dedupes), so we can call it freely on every frame. */
      const docH = document.documentElement.scrollHeight || 1
      const depth = (y + vh) / docH
      if (depth >= 0.5) trackLandingEvent('scroll_50')
      if (depth >= 0.75) trackLandingEvent('scroll_75')
      if (depth >= 0.98) trackLandingEvent('scroll_100')
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
    <Box className="lp-root" dir={dir} ref={rootRef}>
      <Box className="lp-bg" aria-hidden="true" />
      <Box className="lp-veil" aria-hidden="true" ref={veilRef} />

      {/* ── Header ─────────────────────────────────────────────── */}
      <Box as="header" className={`lp-header${scrolled ? ' scrolled' : ''}`}>
        <Box className="lp-wrap lp-header-in">
          <Lnk className="lp-brand" href="#top" aria-label={t('nav.home')}>
            <img src="/logo-dark.png" className="lp-brand-logo dark" alt="" aria-hidden="true" />
            <img src="/logo-light.png" className="lp-brand-logo light" alt="" aria-hidden="true" />
            <Txt className="lp-brand-name">Simplicity</Txt>
          </Lnk>
          <Box as="nav" className="lp-header-actions" aria-label={t('nav.accountActions')}>
            <Box className="lp-lang" ref={langRef}>
              <Btn
                type="button"
                className="lp-lang-btn"
                aria-haspopup="menu"
                aria-expanded={langOpen}
                aria-label={t('nav.language')}
                onClick={() => setLangOpen((o) => !o)}
              >
                <Globe size={15} strokeWidth={2} aria-hidden="true" />
                <Txt className="lp-lang-code">{activeLang.toUpperCase()}</Txt>
              </Btn>
              {langOpen && (
                <Box className="lp-lang-menu" role="menu">
                  {APP_LANGS.map((l) => (
                    <Btn
                      key={l.code}
                      type="button"
                      role="menuitemradio"
                      aria-checked={l.code === activeLang}
                      lang={l.code}
                      className={`lp-lang-opt${l.code === activeLang ? ' on' : ''}`}
                      onClick={() => pickLang(l.code)}
                    >
                      <Txt>{l.name}</Txt>
                      {l.code === activeLang && <Check size={15} strokeWidth={2.2} aria-hidden="true" />}
                    </Btn>
                  ))}
                </Box>
              )}
            </Box>
            <Btn
              type="button"
              className="lp-switch"
              role="switch"
              aria-checked={theme === 'dark'}
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? t('nav.toDay') : t('nav.toNight')}
            >
              <Sun className="lp-switch-ic lp-switch-sun" size={14} strokeWidth={2} aria-hidden="true" />
              <Moon className="lp-switch-ic lp-switch-moon" size={13} strokeWidth={2} aria-hidden="true" />
              <Txt className="lp-switch-knob" aria-hidden="true" />
            </Btn>
            <Link to={ROUTES.LOGIN} className="lp-btn lp-btn-ghost">{t('nav.login')}</Link>
            <Link to={ROUTES.SIGNUP} className="lp-btn lp-btn-primary lp-btn-pill">{t('nav.startFree')}</Link>
          </Box>
        </Box>
      </Box>

      <Box as="main" id="top">
        {/* ── Hero ─────────────────────────────────────────────── */}
        <Box as="section" className="lp-hero lp-wrap" aria-labelledby="lp-h1">
          <img src="/logo-dark.png" className="lp-hero-mark dark" alt="" aria-hidden="true" />
          <img src="/logo-light.png" className="lp-hero-mark light" alt="" aria-hidden="true" />
          <Txt className="lp-eyebrow">
            <Txt className="lp-eyebrow-dot" />
            {t('hero.eyebrow')}
          </Txt>
          <Txt as="h1" className="lp-hero-title" id="lp-h1">
            {t('hero.title1')}<br />
            <Txt className="accent">{t('hero.title2')}</Txt>
          </Txt>
          <Txt as="p" className="lp-hero-sub">
            <MG text={t('hero.subAddress', {
              therapist: t('roles.therapists'),
              advisor: t('roles.advisors'),
              teacher: t('roles.teachers'),
              facilitator: t('roles.facilitators'),
            })} /><br />
            {t('hero.subBody')}
          </Txt>
          <Box className="lp-hero-cta">
            <Link to={ROUTES.SIGNUP} className="lp-btn lp-btn-primary lp-btn-lg" onClick={() => trackLandingEvent('signup_start')}>{t('hero.ctaPrimary')}</Link>
            <Link to={ROUTES.LOGIN} className="lp-btn lp-btn-secondary">{t('hero.ctaSecondary')}</Link>
          </Box>
          <Txt as="p" className="lp-hero-trust">{t('hero.trust')}</Txt>
        </Box>

        {/* ── Product preview (early proof) ────────────────────── */}
        <Box as="section" className="lp-section lp-wrap" aria-labelledby="lp-demo-h">
          <Box className="lp-section-head lp-reveal">
            <Txt className="lp-section-eyebrow">{t('demo.eyebrow')}</Txt>
            <Txt as="h2" className="lp-section-title" id="lp-demo-h">{t('demo.title')}</Txt>
            <Txt as="p" className="lp-section-sub">
              {t('demo.sub')}
            </Txt>
          </Box>

          <Box className="lp-demo-grid">
            <Box className="lp-demo-stage lp-reveal">
              <Box className="lp-device" role="img" aria-label={t('demo.deviceAria')}>
                <Box className="lp-screen" aria-hidden="true">
                  <Box className="lp-moon">
                    <Box className="lp-ring">
                      <svg viewBox="0 0 100 100">
                        <circle className="lp-ring-track" cx="50" cy="50" r="42" />
                        {/* 78% of 2πr (≈263.9) → offset ≈ 58 */}
                        <circle className="lp-ring-fill" cx="50" cy="50" r="42"
                          strokeDasharray="263.9" strokeDashoffset="58" />
                      </svg>
                      <Box className="lp-ring-center">
                        <Txt className="lp-ring-pct"><bdi>78%</bdi></Txt>
                      </Box>
                    </Box>
                    <Box className="lp-moon-body">
                      <Txt as="p" className="lp-moon-title">{t('demo.moonTitle')}</Txt>
                      <Txt as="p" className="lp-moon-line">
                        <Trans t={t} i18nKey="demo.moonLine" components={[<b key="b" />]} />
                      </Txt>
                    </Box>
                  </Box>

                  <Box className="lp-rows">
                    <Box className="lp-rows-head">
                      <Txt className="lp-rows-title">{t('demo.attentionTitle')}</Txt>
                      <Txt className="lp-rows-count">
                        <Trans t={t} i18nKey="demo.attentionCount" values={{ count: 3 }} components={[<bdi key="c" />]} />
                      </Txt>
                    </Box>
                    <Box className="lp-row">
                      <Txt className="lp-row-dot amber"><Wallet size={16} strokeWidth={1.8} /></Txt>
                      <Box className="lp-row-body">
                        <Txt as="p" className="lp-row-t">{t('demo.row1Title')}</Txt>
                        <Txt as="p" className="lp-row-s">{t('demo.row1Sub')}</Txt>
                      </Box>
                      <Txt className="lp-row-val"><bdi>₪1,240</bdi></Txt>
                    </Box>
                    <Box className="lp-row">
                      <Txt className="lp-row-dot sage"><CalendarDays size={16} strokeWidth={1.8} /></Txt>
                      <Box className="lp-row-body">
                        <Txt as="p" className="lp-row-t">
                          <Trans t={t} i18nKey="demo.row2Title" components={[<bdi key="t" />]} />
                        </Txt>
                        <Txt as="p" className="lp-row-s">{t('demo.row2Sub')}</Txt>
                      </Box>
                      <ArrowLeft size={16} strokeWidth={1.8} style={{ color: 'var(--stone)' }} />
                    </Box>
                    <Box className="lp-row">
                      <Txt className="lp-row-dot clay"><Users size={16} strokeWidth={1.8} /></Txt>
                      <Box className="lp-row-body">
                        <Txt as="p" className="lp-row-t">
                          <Trans t={t} i18nKey="demo.row3Title" components={[<bdi key="d" />]} />
                        </Txt>
                        <Txt as="p" className="lp-row-s">{t('demo.row3Sub')}</Txt>
                      </Box>
                      <ArrowLeft size={16} strokeWidth={1.8} style={{ color: 'var(--stone)' }} />
                    </Box>
                  </Box>
                </Box>
              </Box>
            </Box>

            <Box className="lp-demo-points">
              {DEMO_POINTS.map(({ icon: Icon, title, text }) => (
                <Box className="lp-demo-point lp-reveal" key={title}>
                  <Txt className="lp-demo-point-ic"><Icon size={20} strokeWidth={1.7} /></Txt>
                  <Box>
                    <Txt as="p" className="lp-demo-point-t">{title}</Txt>
                    <Txt as="p" className="lp-demo-point-s">{text}</Txt>
                  </Box>
                </Box>
              ))}
            </Box>
          </Box>
        </Box>

        {/* ── Values ───────────────────────────────────────────── */}
        <Box as="section" className="lp-section lp-wrap" aria-labelledby="lp-values-h">
          <Box className="lp-section-head lp-reveal">
            <Txt className="lp-section-eyebrow">{t('values.eyebrow')}</Txt>
            <Txt as="h2" className="lp-section-title" id="lp-values-h">{t('values.title')}</Txt>
            <Txt as="p" className="lp-section-sub">
              {t('values.sub')}
            </Txt>
          </Box>
          <Box className="lp-values">
            {VALUES.map(({ icon: Icon, title, text }) => (
              <Box as="article" className="lp-card lp-value lp-reveal" key={title}>
                <Txt className="lp-value-ic"><Icon size={24} strokeWidth={1.6} /></Txt>
                <Txt as="h3" className="lp-value-title">{title}</Txt>
                <Txt as="p" className="lp-value-text">{text}</Txt>
              </Box>
            ))}
          </Box>
        </Box>

        {/* ── Features ─────────────────────────────────────────── */}
        <Box as="section" className="lp-section lp-wrap" aria-labelledby="lp-features-h">
          <Box className="lp-section-head lp-reveal">
            <Txt className="lp-section-eyebrow">{t('features.eyebrow')}</Txt>
            <Txt as="h2" className="lp-section-title" id="lp-features-h">{t('features.title')}</Txt>
            <Txt as="p" className="lp-section-sub">
              {t('features.sub')}
            </Txt>
          </Box>
          <Box className="lp-features">
            {FEATURES.map(({ icon: Icon, title, text }) => (
              <Box as="article" className="lp-card lp-feature lp-reveal" key={title}>
                <Txt className="lp-feature-ic"><Icon size={20} strokeWidth={1.7} /></Txt>
                <Txt as="h3" className="lp-feature-title">{title}</Txt>
                <Txt as="p" className="lp-feature-text">{text}</Txt>
              </Box>
            ))}
          </Box>
        </Box>

        {/* ── Built with you (openness & feedback) ─────────────── */}
        <Box as="section" className="lp-section lp-wrap" aria-labelledby="lp-feedback-h">
          <Box as="article" className="lp-card lp-feedback lp-reveal">
            <Txt className="lp-feedback-ic">
              <img src="/logo-dark.png" className="lp-feedback-logo dark" alt="" aria-hidden="true" />
              <img src="/logo-light.png" className="lp-feedback-logo light" alt="" aria-hidden="true" />
            </Txt>
            <Txt as="h2" className="lp-section-title" id="lp-feedback-h">{t('feedback.title')}</Txt>
            <Txt as="p" className="lp-feedback-text">
              {t('feedback.text')}
            </Txt>
          </Box>
        </Box>

        {/* ── Trust / privacy ──────────────────────────────────── */}
        <Box as="section" className="lp-section lp-wrap" aria-labelledby="lp-trust-h">
          <Box className="lp-section-head lp-reveal">
            <Txt as="h2" className="lp-section-title" id="lp-trust-h">{t('trust.title')}</Txt>
          </Box>
          <Box className="lp-values">
            {TRUST.map(({ icon: Icon, title, text }) => (
              <Box as="article" className="lp-card lp-value lp-reveal" key={title}>
                <Txt className="lp-value-ic"><Icon size={24} strokeWidth={1.6} /></Txt>
                <Txt as="h3" className="lp-value-title">{title}</Txt>
                <Txt as="p" className="lp-value-text">{text}</Txt>
              </Box>
            ))}
          </Box>
        </Box>

        {/* ── FAQ ──────────────────────────────────────────────── */}
        <Box as="section" className="lp-section lp-wrap" aria-labelledby="lp-faq-h">
          <Box className="lp-section-head lp-reveal">
            <Txt className="lp-section-eyebrow">{t('faq.eyebrow')}</Txt>
            <Txt as="h2" className="lp-section-title" id="lp-faq-h">{t('faq.title')}</Txt>
          </Box>
          <Box className="lp-faq">
            {FAQS.map(({ q, a }) => (
              <Box as="details" className="lp-faq-item lp-reveal" key={q} onToggle={(e) => { if (e.currentTarget.open) trackLandingEvent('faq_open') }}>
                <Txt as="summary" className="lp-faq-q">
                  {q}
                  <Plus className="lp-faq-q-ic" size={20} strokeWidth={2} aria-hidden="true" />
                </Txt>
                <Txt as="p" className="lp-faq-a"><MG text={a} /></Txt>
              </Box>
            ))}
          </Box>
        </Box>

        {/* ── Closing CTA ──────────────────────────────────────── */}
        <Box as="section" className="lp-cta lp-wrap">
          <Box className="lp-cta-card lp-reveal">
            <Txt as="h2" className="lp-cta-title">{t('cta.title')}</Txt>
            <Txt as="p" className="lp-cta-sub">
              <MG text={t('cta.sub', { roles: roleList })} />
            </Txt>
            <Box className="lp-cta-actions">
              <Link to={ROUTES.SIGNUP} className="lp-btn lp-btn-primary lp-btn-lg" onClick={() => trackLandingEvent('signup_start')}>{t('cta.ctaPrimary')}</Link>
              <Link to={ROUTES.LOGIN} className="lp-btn lp-btn-secondary">{t('cta.ctaSecondary')}</Link>
            </Box>
            <Txt as="p" className="lp-cta-micro">{t('cta.micro')}</Txt>
          </Box>
        </Box>
      </Box>

      {/* ── Footer ─────────────────────────────────────────────── */}
      <Box as="footer" className="lp-foot">
        <Box className="lp-wrap lp-foot-in">
          <Box className="lp-foot-brand">
            <Txt className="lp-foot-brand-row">
              <img src="/logo-dark.png" className="lp-brand-logo dark" alt="" aria-hidden="true" />
              <img src="/logo-light.png" className="lp-brand-logo light" alt="" aria-hidden="true" />
              <Txt className="lp-brand-name">Simplicity</Txt>
            </Txt>
            <Txt as="p" className="lp-foot-tag"><MG text={t('footer.tagline', { roles: roleList })} /></Txt>
          </Box>
          <Box className="lp-foot-links">
            <Box className="lp-foot-col">
              <Txt className="lp-foot-col-h">{t('footer.colProduct')}</Txt>
              <Link to={ROUTES.SIGNUP} className="lp-foot-link">{t('footer.signup')}</Link>
              <Link to={ROUTES.LOGIN} className="lp-foot-link">{t('footer.login')}</Link>
            </Box>
            <Box className="lp-foot-col">
              <Txt className="lp-foot-col-h">{t('footer.colLegal')}</Txt>
              <Link to={`${ROUTES.LEGAL}?tab=privacy`} className="lp-foot-link">{t('footer.privacy')}</Link>
              <Link to={`${ROUTES.LEGAL}?tab=terms`} className="lp-foot-link">{t('footer.terms')}</Link>
            </Box>
            <Box className="lp-foot-col">
              <Txt className="lp-foot-col-h">{t('footer.colContact')}</Txt>
              <Lnk href="mailto:simplicity.os.app@gmail.com" className="lp-foot-link">{t('footer.contact')}</Lnk>
            </Box>
          </Box>
        </Box>
        <Box className="lp-wrap lp-foot-legal">
          <Txt>{t('footer.copyright')}</Txt>
        </Box>
      </Box>

      {/* FAQ structured data for rich results (homepage only). */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(FAQ_LD) }} />
    </Box>
  )
}
