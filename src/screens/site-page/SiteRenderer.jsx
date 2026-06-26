import { useState, useRef, Component } from 'react'
import { sitePageSurface, safeRedirectUrl, safeImageUrl, safeVideoEmbed } from '../../lib/sitePageSchema'
import { renderRichText } from '../../lib/richText'
import { isChoiceType } from '../../lib/leadPageSchema'
import { iconByName } from '../../lib/pageIcons'
import { useT } from '../../i18n/useT'
import '../site-pages/siteBuilderI18n'
import './SitePage.css'

/* ════════════════════════════════════════════════════════════════
   SITE RENDERER — the ONE pure renderer for builder pages.
   ════════════════════════════════════════════════════════════════
   Renders a page's { theme, sections } into the visual page used BOTH by
   the builder canvas (interactive=false → a static WYSIWYG preview) and the
   public page (interactive=true → the form submits, CTAs navigate). Keeping a
   single renderer means the preview can never drift from what visitors see —
   the same lesson as leadPageSurface().

   `runtime` (public page only) supplies live behaviour the editor lacks:
     { onSubmitForm(answers, sectionId), submitting, submitError }
   In the editor it's omitted and every block renders inert. */

const str = (v) => (v == null ? '' : String(v)).trim()

/* Isolates a single section: if a block throws on malformed data it degrades to
   a skipped block instead of blanking the whole public page. */
class SectionErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { failed: false } }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch() { /* swallow — one bad block must not kill the page */ }
  render() { return this.state.failed ? null : this.props.children }
}

/* Smoothly scroll to the first block of a kind (used by scrollToForm/booking
   CTAs). No-op in the editor (interactive=false). */
const scrollToBlock = (kind) => {
  const el = document.querySelector(`.sp-block-${kind}`)
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

/* ── CTA / action button — shared by hero + cta blocks ───────────────────── */
function ActionButton({ label, action, style = 'primary', interactive }) {
  const text = str(label)
  if (!text) return null
  const cls = `sp-btn sp-btn-${style === 'secondary' ? 'secondary' : 'primary'}`
  const a = action || {}
  if (a.type === 'link') {
    const href = interactive ? safeRedirectUrl(a.url) : null
    return (
      <a className={cls} href={href || undefined}
        target="_blank" rel="noopener noreferrer"
        onClick={(e) => { if (!href) e.preventDefault() }}>
        {text}
      </a>
    )
  }
  const target = a.type === 'booking' ? 'booking' : 'form'
  return (
    <button type="button" className={cls}
      onClick={() => interactive && scrollToBlock(target)}>
      {text}
    </button>
  )
}

/* ── Visual blocks ───────────────────────────────────────────────────────── */
function HeroBlock({ props, interactive }) {
  return (
    <div className="sp-hero">
      {str(props.eyebrow) ? <div className="sp-eyebrow">{props.eyebrow}</div> : null}
      {str(props.heading) ? <h1 className="sp-h1">{props.heading}</h1> : null}
      {str(props.subheading) ? <p className="sp-sub">{props.subheading}</p> : null}
      <ActionButton label={props.ctaLabel} action={props.ctaAction} interactive={interactive} />
    </div>
  )
}

/* Coach-authored copy, written in a safe markdown-lite (**bold**, *italic*,
   [links](url), - / 1. lists, ## headings). `renderRichText` HTML-escapes the
   input FIRST and only ever emits a fixed tag set with allow-listed link hrefs,
   so there is no raw-HTML / script surface — safe to inject. Plain text (no
   markdown) still renders fine as paragraphs. */
function TextBlock({ props }) {
  return <div className="sp-text" dangerouslySetInnerHTML={{ __html: renderRichText(props.text) }} />
}

function ImageBlock({ props }) {
  const { t } = useT('siteBuilder')
  const src = safeImageUrl(props.url)
  if (!src) return <div className="sp-img-empty">{t('renderer.imageEmpty')}</div>
  return (
    <figure className={`sp-figure sp-w-${props.width || 'full'}`}>
      <img className="sp-img" src={src} alt={props.alt || ''} loading="lazy" />
    </figure>
  )
}

function IconTextBlock({ props }) {
  const items = Array.isArray(props.items) ? props.items : []
  return (
    <div className="sp-icontext">
      {items.map((it, i) => {
        const Icon = iconByName(it.icon)
        return (
          <div className="sp-feature" key={i}>
            <div className="sp-feature-icon"><Icon size={22} strokeWidth={2} /></div>
            <div className="sp-feature-body">
              {str(it.title) ? <div className="sp-feature-title">{it.title}</div> : null}
              {str(it.body) ? <p className="sp-feature-text">{it.body}</p> : null}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function TestimonialBlock({ props }) {
  return (
    <figure className="sp-testimonial">
      {str(props.quote) ? <blockquote className="sp-quote">{props.quote}</blockquote> : null}
      <figcaption className="sp-cite">
        {safeImageUrl(props.avatar) ? <img className="sp-avatar" src={safeImageUrl(props.avatar)} alt="" loading="lazy" /> : null}
        <span>
          {str(props.author) ? <strong>{props.author}</strong> : null}
          {str(props.role) ? <em> · {props.role}</em> : null}
        </span>
      </figcaption>
    </figure>
  )
}

function CtaBlock({ props, interactive }) {
  return (
    <div className="sp-cta">
      <ActionButton label={props.label} action={props.action} style={props.style} interactive={interactive} />
    </div>
  )
}

function SpacerBlock({ props }) {
  return <div className={`sp-spacer sp-spacer-${props.size || 'md'}`} aria-hidden="true" />
}

function DividerBlock({ props }) {
  return <hr className={`sp-divider sp-divider-${props.width || 'full'}`} />
}

/* "חלוניות" — a responsive grid of cards (icon + title + body + optional link). */
function CardsBlock({ props, interactive }) {
  const items = Array.isArray(props.items) ? props.items : []
  const cols = (props.columns && props.columns !== 'auto') ? props.columns : 'auto'
  return (
    <div className={`sp-cards sp-cols-${cols}`}>
      {items.map((it, i) => {
        const Icon = iconByName(it.icon)
        const safe = safeRedirectUrl(it.link)
        const inner = (
          <>
            {it.icon ? <div className="sp-cardbox-icon"><Icon size={22} strokeWidth={2} /></div> : null}
            {str(it.title) ? <div className="sp-cardbox-title">{it.title}</div> : null}
            {str(it.body) ? <p className="sp-cardbox-text">{it.body}</p> : null}
          </>
        )
        // A linked card is inert in the editor (interactive=false) so the click
        // selects the section instead of escaping to a new tab.
        return safe
          ? <a key={i} className="sp-cardbox sp-cardbox-link" href={interactive ? safe : undefined}
              target="_blank" rel="noopener noreferrer" onClick={(e) => { if (!interactive) e.preventDefault() }}>{inner}</a>
          : <div key={i} className="sp-cardbox">{inner}</div>
      })}
    </div>
  )
}

/* A single decorative icon. */
function IconBlock({ props }) {
  const Icon = iconByName(props.icon)
  const size = props.size === 'sm' ? 28 : props.size === 'lg' ? 64 : 44
  return <div className={`sp-iconblock sp-align-${props.align || 'center'}`}><Icon size={size} strokeWidth={1.8} /></div>
}

function GalleryBlock({ props }) {
  const { t } = useT('siteBuilder')
  const items = Array.isArray(props.items) ? props.items : []
  const imgs = items.map((it) => safeImageUrl(it && it.url)).filter(Boolean)
  const cols = (props.columns && props.columns !== 'auto') ? props.columns : 'auto'
  if (!imgs.length) return <div className="sp-img-empty">{t('renderer.imageEmpty')}</div>
  return (
    <div className={`sp-gallery sp-cols-${cols}`}>
      {imgs.map((u, i) => <img key={i} className="sp-gallery-img" src={u} alt="" loading="lazy" />)}
    </div>
  )
}

/* YouTube / Vimeo embed only (validated src) — no arbitrary iframe. */
function VideoBlock({ props }) {
  const { t } = useT('siteBuilder')
  const src = safeVideoEmbed(props.url)
  if (!src) return <div className="sp-img-empty">{t('renderer.videoEmpty')}</div>
  return (
    <div className="sp-video">
      <iframe src={src} title="video" loading="lazy"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen />
    </div>
  )
}

function FaqBlock({ props }) {
  const items = Array.isArray(props.items) ? props.items : []
  return (
    <div className="sp-faq">
      {items.map((it, i) => (
        <details className="sp-faq-item" key={i}>
          <summary className="sp-faq-q">{str(it.q) || '—'}</summary>
          {str(it.a) ? <p className="sp-faq-a">{it.a}</p> : null}
        </details>
      ))}
    </div>
  )
}

/* Lead-capture form. In the editor (interactive=false) inputs are disabled and
   the submit is inert. On the public page the parent passes `runtime` and we
   manage answer state locally, then hand a flat answers map up to submit. */
function FormBlock({ section, interactive, runtime }) {
  const { t } = useT('siteBuilder')
  const props = section.props || {}
  const fields = Array.isArray(props.fields) ? props.fields : []
  const [values, setValues] = useState({})
  const [errors, setErrors] = useState({})
  const hpRef = useRef('') // honeypot — stable across re-renders

  const setField = (key, v) => {
    setValues((p) => ({ ...p, [key]: v }))
    setErrors((p) => (p[key] ? { ...p, [key]: false } : p))
  }
  const toggleChoice = (key, opt) => {
    setValues((p) => {
      const arr = Array.isArray(p[key]) ? p[key] : []
      return { ...p, [key]: arr.includes(opt) ? arr.filter((o) => o !== opt) : [...arr, opt] }
    })
    setErrors((p) => (p[key] ? { ...p, [key]: false } : p))
  }
  const submit = (e) => {
    e.preventDefault()
    if (!interactive || !runtime) return
    const isEmpty = (f) => (f.type === 'checkbox'
      ? !(Array.isArray(values[f.key]) && values[f.key].length)
      : !str(values[f.key]))
    const next = {}
    fields.forEach((f) => { if (f.required && isEmpty(f)) next[f.key] = true })
    if (Object.keys(next).length) { setErrors(next); return }
    const answers = { _hp: hpRef.current }
    fields.forEach((f) => {
      const v = values[f.key]
      answers[f.key] = f.type === 'checkbox' ? (Array.isArray(v) ? v.join(', ') : '') : (v ?? '')
    })
    runtime.onSubmitForm(answers, section.id)
  }

  // After a successful submit the public page flags this form's id as done.
  if (interactive && runtime?.submittedForms?.has(section.id)) {
    return (
      <div className="sp-card sp-form sp-form-done">
        <div className="sp-check" aria-hidden="true">✓</div>
        <p className="sp-thanks">{str(runtime.thankYouBySection?.[section.id]?.message) || t('renderer.thankYouDefault')}</p>
      </div>
    )
  }

  return (
    <form className="sp-card sp-form" onSubmit={submit} noValidate>
      {str(props.heading) ? <h2 className="sp-h2">{props.heading}</h2> : null}
      <div className="sp-fields">
        {fields.map((f) => {
          const label = (
            <span className="sp-label">{f.label || f.key}{f.required ? <span className="sp-req"> *</span> : null}</span>
          )
          if (isChoiceType(f.type)) {
            return (
              <div key={f.key} className="sp-field" role="group" aria-label={f.label || f.key}>
                {label}
                <div className={`sp-choices${errors[f.key] ? ' is-error' : ''}`}>
                  {(f.options || []).map((opt, oi) => (
                    <label className="sp-choice" key={oi}>
                      <input type={f.type === 'select' ? 'radio' : 'checkbox'} name={f.key}
                        disabled={!interactive}
                        checked={f.type === 'select' ? values[f.key] === opt
                          : (Array.isArray(values[f.key]) && values[f.key].includes(opt))}
                        onChange={() => (f.type === 'select' ? setField(f.key, opt) : toggleChoice(f.key, opt))} />
                      <span>{opt}</span>
                    </label>
                  ))}
                </div>
              </div>
            )
          }
          return (
            <label key={f.key} className="sp-field">
              {label}
              {f.type === 'textarea' ? (
                <textarea className={`sp-input sp-textarea${errors[f.key] ? ' is-error' : ''}`} rows={4}
                  disabled={!interactive} value={values[f.key] ?? ''} onChange={(e) => setField(f.key, e.target.value)} />
              ) : (
                <input className={`sp-input${errors[f.key] ? ' is-error' : ''}`}
                  type={f.type === 'email' ? 'email' : f.type === 'tel' ? 'tel' : 'text'}
                  disabled={!interactive} value={values[f.key] ?? ''} onChange={(e) => setField(f.key, e.target.value)} />
              )}
            </label>
          )
        })}
      </div>
      <input type="text" tabIndex={-1} autoComplete="off" className="sp-hp" aria-hidden="true"
        onChange={(e) => { hpRef.current = e.target.value }} />
      {runtime?.errorBySection?.[section.id] ? <p className="sp-form-error">{runtime.errorBySection[section.id]}</p> : null}
      <button type="submit" className="sp-btn sp-btn-primary sp-form-submit" disabled={!interactive || runtime?.submittingId === section.id}>
        {str(props.submitLabel) || t('renderer.submit')}
      </button>
    </form>
  )
}

/* Booking block — a branded card that links out to the coach's existing
   booking page (/book/<slug>). A native in-page slot-picker is a future phase. */
function BookingBlock({ props, interactive }) {
  const { t } = useT('siteBuilder')
  const slug = str(props.bookingSlug)
  const href = slug ? `${window.location.origin}/book/${encodeURIComponent(slug)}` : null
  return (
    <div className="sp-card sp-booking">
      {str(props.heading) ? <h2 className="sp-h2">{props.heading}</h2> : null}
      {str(props.subheading) ? <p className="sp-sub">{props.subheading}</p> : null}
      {href ? (
        <a className="sp-btn sp-btn-primary" href={interactive ? href : undefined}
          target="_blank" rel="noopener noreferrer"
          onClick={(e) => { if (!interactive) e.preventDefault() }}>
          {str(props.buttonLabel) || t('renderer.bookingButton')}
        </a>
      ) : (!interactive ? <p className="sp-muted sp-booking-hint">{t('renderer.bookingHint')}</p> : null)}
    </div>
  )
}

const BLOCK_COMPONENT = {
  hero: HeroBlock, text: TextBlock, image: ImageBlock, iconText: IconTextBlock,
  testimonial: TestimonialBlock, cta: CtaBlock, spacer: SpacerBlock,
  cards: CardsBlock, icon: IconBlock, gallery: GalleryBlock, video: VideoBlock,
  faq: FaqBlock, divider: DividerBlock,
}

/* One section → its block, wrapped so the canvas can target it (id, type).
   `sel` marks the editor-selected section so the canvas can draw a ring. */
function Section({ section, interactive, runtime, selectedId }) {
  const type = section.type
  const wrapCls = `sp-block sp-block-${type}`
  const sel = section.id === selectedId ? '' : undefined
  if (type === 'form') {
    return <section className={wrapCls} data-sid={section.id} data-selected={sel}><FormBlock section={section} interactive={interactive} runtime={runtime} /></section>
  }
  if (type === 'booking') {
    return <section className={wrapCls} data-sid={section.id} data-selected={sel}><BookingBlock props={section.props || {}} interactive={interactive} /></section>
  }
  const Comp = BLOCK_COMPONENT[type]
  if (!Comp) return null
  return (
    <section className={wrapCls} data-sid={section.id} data-selected={sel}>
      <Comp props={section.props || {}} interactive={interactive} />
    </section>
  )
}

export default function SiteRenderer({ theme, sections, interactive = false, runtime, className = '', selectedId }) {
  const { t } = useT('siteBuilder')
  const { style, cls } = sitePageSurface(theme)
  const list = Array.isArray(sections) ? sections : []
  return (
    <div className={`sp-root ${cls} ${className}`} dir="rtl" style={style}>
      <div className="sp-page">
        {list.map((s) => (
          <SectionErrorBoundary key={s.id}>
            <Section section={s} interactive={interactive} runtime={runtime} selectedId={selectedId} />
          </SectionErrorBoundary>
        ))}
        {list.length === 0 ? <div className="sp-empty">{t('renderer.empty')}</div> : null}
      </div>
    </div>
  )
}
