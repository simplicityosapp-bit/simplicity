import { useState, useRef, useEffect, Component } from 'react'
import { sitePageSurface, safeRedirectUrl, safeImageUrl, safeVideoEmbed, FREE_CANVAS_W, FREE_CANVAS_MOBILE_W, freeDefaultLayout, freeLayoutKey } from '../../lib/sitePageSchema'
import { renderRichText } from '../../lib/richText'
import { useBookingFlow } from './useBookingFlow'
import '../booking-pages/bookingI18n'   // self-registers the 'booking' namespace (inline picker labels)
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
    // No real destination (editor preview, or a missing/blocked URL on the live page)
    // → render a real <button>, not an <a> with no href (which isn't focusable and
    // reads as a broken link). It's inert on the live page, a plain preview in the editor.
    if (!href) return <button type="button" className={cls} disabled={interactive}>{text}</button>
    return <a className={cls} href={href} target="_blank" rel="noopener noreferrer">{text}</a>
  }
  const target = a.type === 'booking' ? 'booking' : 'form'
  return (
    <button type="button" className={cls}
      onClick={() => interactive && scrollToBlock(target)}>
      {text}
    </button>
  )
}

/* ── Inline editing ──────────────────────────────────────────────────────────
   In the editor canvas (when an `edit` callback is threaded in) plain-text fields
   become click-to-edit in place. Uncontrolled contentEditable: the value is set
   into the DOM only while NOT focused, so React re-renders never reset the caret
   mid-typing; it commits to the draft on blur. Empty fields show a placeholder so
   they stay clickable. Never rendered on the public page (edit is null there). */
function Editable({ as: Tag = 'div', className, value, placeholder, onCommit }) {
  const ref = useRef(null)
  useEffect(() => {
    const el = ref.current
    if (el && document.activeElement !== el && el.textContent !== (value || '')) el.textContent = value || ''
  }, [value])
  return (
    <Tag ref={ref} className={`${className || ''} sp-editable`} data-ph={placeholder || ''}
      contentEditable suppressContentEditableWarning spellCheck={false}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => { if (e.key === 'Escape') e.currentTarget.blur() }}
      onBlur={(e) => onCommit(e.currentTarget.textContent)} />
  )
}

/* Optionally wrap a block's content in a translucent panel so text stands out
   over a busy photo. Per-block opacity (0 = transparent … 100 = solid). */
// Per-section glass: opacity + blur as CSS vars that override the page-global ones.
// Used by withCard (opt-in cards) AND by the always-card blocks (form/booking/
// testimonial) so every card surface is individually adjustable.
const cardVars = (props) => ({ '--sp-card-opacity': `${props.cardOpacity ?? 100}%`, '--sp-card-blur': `${props.cardBlur ?? 14}px` })

function withCard(props, inner) {
  if (!props.card) return inner
  return <div className="sp-card sp-block-card" style={cardVars(props)}>{inner}</div>
}

/* ── Visual blocks ───────────────────────────────────────────────────────── */
function HeroBlock({ props, interactive, edit }) {
  const { t } = useT('siteBuilder')
  const inner = (
    <div className="sp-hero">
      {edit ? (
        <>
          <Editable as="div" className="sp-eyebrow" value={props.eyebrow} placeholder={t('labels.eyebrow')} onCommit={(v) => edit('eyebrow', v)} />
          <Editable as="h1" className="sp-h1" value={props.heading} placeholder={t('labels.heading')} onCommit={(v) => edit('heading', v)} />
          <Editable as="p" className="sp-sub" value={props.subheading} placeholder={t('labels.subheading')} onCommit={(v) => edit('subheading', v)} />
          <ActionButton label={props.ctaLabel} action={props.ctaAction} interactive={false} />
        </>
      ) : (
        <>
          {str(props.eyebrow) ? <div className="sp-eyebrow">{props.eyebrow}</div> : null}
          {str(props.heading) ? <h1 className="sp-h1">{props.heading}</h1> : null}
          {str(props.subheading) ? <p className="sp-sub">{props.subheading}</p> : null}
          <ActionButton label={props.ctaLabel} action={props.ctaAction} interactive={interactive} />
        </>
      )}
    </div>
  )
  return withCard(props, inner)
}

/* Coach-authored copy, written in a safe markdown-lite (**bold**, *italic*,
   [links](url), - / 1. lists, ## headings). `renderRichText` HTML-escapes the
   input FIRST and only ever emits a fixed tag set with allow-listed link hrefs,
   so there is no raw-HTML / script surface — safe to inject. Plain text (no
   markdown) still renders fine as paragraphs. */
function TextBlock({ props, edit }) {
  const { t } = useT('siteBuilder')
  // In the editor, click-to-edit the raw text in place (markdown shows as typed);
  // on the public page it's rendered. Formatting help stays in the inspector.
  const body = edit
    ? <Editable as="div" className="sp-text sp-text-raw" value={props.text} placeholder={t('labels.text')} onCommit={(v) => edit('text', v)} />
    : <div className="sp-text" dangerouslySetInnerHTML={{ __html: renderRichText(props.text) }} />
  return withCard(props, body)
}

function ImageBlock({ props }) {
  const { t } = useT('siteBuilder')
  const src = safeImageUrl(props.url)
  const mobileSrc = safeImageUrl(props.mobileUrl)
  if (!src) return <div className="sp-img-empty">{t('renderer.imageEmpty')}</div>
  return withCard(props,
    <figure className={`sp-figure sp-w-${props.width || 'full'}${mobileSrc ? ' has-mobile' : ''}`}>
      <img className="sp-img sp-img-d" src={src} alt={props.alt || ''} loading="lazy" />
      {mobileSrc ? <img className="sp-img sp-img-m" src={mobileSrc} alt={props.alt || ''} loading="lazy" /> : null}
    </figure>,
  )
}

function IconTextBlock({ props, edit }) {
  const { t } = useT('siteBuilder')
  const items = Array.isArray(props.items) ? props.items : []
  const setItem = (i, patch) => edit('items', items.map((it, j) => (j === i ? { ...it, ...patch } : it)))
  return withCard(props,
    <div className="sp-icontext">
      {items.map((it, i) => {
        const Icon = iconByName(it.icon)
        return (
          <div className="sp-feature" key={i}>
            <div className="sp-feature-icon"><Icon size={22} strokeWidth={2} aria-hidden="true" /></div>
            <div className="sp-feature-body">
              {edit ? (
                <>
                  <Editable as="div" className="sp-feature-title" value={it.title} placeholder={t('labels.title')} onCommit={(v) => setItem(i, { title: v })} />
                  <Editable as="p" className="sp-feature-text" value={it.body} placeholder={t('labels.body')} onCommit={(v) => setItem(i, { body: v })} />
                </>
              ) : (
                <>
                  {str(it.title) ? <div className="sp-feature-title">{it.title}</div> : null}
                  {str(it.body) ? <p className="sp-feature-text">{it.body}</p> : null}
                </>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function TestimonialBlock({ props, edit }) {
  const { t } = useT('siteBuilder')
  return (
    <figure className="sp-testimonial" style={cardVars(props)}>
      {edit
        ? <Editable as="blockquote" className="sp-quote" value={props.quote} placeholder={t('labels.quote')} onCommit={(v) => edit('quote', v)} />
        : (str(props.quote) ? <blockquote className="sp-quote">{props.quote}</blockquote> : null)}
      <figcaption className="sp-cite">
        {safeImageUrl(props.avatar) ? <img className="sp-avatar" src={safeImageUrl(props.avatar)} alt="" loading="lazy" /> : null}
        <span>
          {edit ? (
            <>
              <Editable as="strong" value={props.author} placeholder={t('labels.author')} onCommit={(v) => edit('author', v)} />
              {' · '}
              <Editable as="em" value={props.role} placeholder={t('labels.role')} onCommit={(v) => edit('role', v)} />
            </>
          ) : (
            <>
              {str(props.author) ? <strong>{props.author}</strong> : null}
              {str(props.role) ? <em> · {props.role}</em> : null}
            </>
          )}
        </span>
      </figcaption>
    </figure>
  )
}

function CtaBlock({ props, interactive, edit }) {
  const { t } = useT('siteBuilder')
  if (edit) {
    const cls = `sp-btn sp-btn-${props.style === 'secondary' ? 'secondary' : 'primary'}`
    return withCard(props, <div className="sp-cta"><Editable as="span" className={cls} value={props.label} placeholder={t('labels.ctaLabel')} onCommit={(v) => edit('label', v)} /></div>)
  }
  return withCard(props,
    <div className="sp-cta">
      <ActionButton label={props.label} action={props.action} style={props.style} interactive={interactive} />
    </div>,
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
  return withCard(props,
    <div className={`sp-cards sp-cols-${cols}`}>
      {items.map((it, i) => {
        const Icon = iconByName(it.icon)
        const safe = safeRedirectUrl(it.link)
        const inner = (
          <>
            {it.icon ? <div className="sp-cardbox-icon"><Icon size={22} strokeWidth={2} aria-hidden="true" /></div> : null}
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
    </div>,
  )
}

/* A single decorative icon. */
function IconBlock({ props }) {
  const Icon = iconByName(props.icon)
  const size = props.size === 'sm' ? 28 : props.size === 'lg' ? 64 : 44
  return <div className={`sp-iconblock sp-align-${props.align || 'center'}`}><Icon size={size} strokeWidth={1.8} aria-hidden="true" /></div>
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
      <iframe src={src} title={t('renderer.videoTitle')} loading="lazy"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen />
    </div>
  )
}

function FaqBlock({ props }) {
  const items = Array.isArray(props.items) ? props.items : []
  return withCard(props,
    <div className="sp-faq">
      {items.map((it, i) => (
        <details className="sp-faq-item" key={i}>
          <summary className="sp-faq-q">{str(it.q) || '—'}</summary>
          {str(it.a) ? <p className="sp-faq-a">{it.a}</p> : null}
        </details>
      ))}
    </div>,
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
      <div className="sp-card sp-form sp-form-done" style={cardVars(props)}>
        <div className="sp-check" aria-hidden="true">✓</div>
        <p className="sp-thanks">{str(runtime.thankYouBySection?.[section.id]?.message) || t('renderer.thankYouDefault')}</p>
      </div>
    )
  }

  return (
    <form className="sp-card sp-form" onSubmit={submit} noValidate style={cardVars(props)}>
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

/* tz/locale-aware display helpers for the inline booking picker. */
const fmtTime = (iso, tz, lang) =>
  new Intl.DateTimeFormat(lang || 'he', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso))
const fmtDayLabel = (iso, tz, lang) =>
  new Intl.DateTimeFormat(lang || 'he', { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(iso))

/* Booking block — shows the coach's existing booking page's slot-picker INLINE
   (type → day → time → details → done), driven by useBookingFlow over the same
   `booking-intake` edge function the standalone /book page uses (so anti-double-
   booking + calendar + Google write are unchanged). In the editor canvas it
   renders a static, inert preview and makes no network calls. */
function BookingBlock({ props, interactive }) {
  const { t, lang } = useT('siteBuilder')
  const slug = str(props.bookingSlug)
  const previewDays = [1, 2, 3].map((n) => {
    const d = new Date(); d.setDate(d.getDate() + n)
    return new Intl.DateTimeFormat(lang || 'he', { weekday: 'short' }).format(d)
  })
  const head = (
    <>
      {str(props.heading) ? <h2 className="sp-h2">{props.heading}</h2> : null}
      {str(props.subheading) ? <p className="sp-sub">{props.subheading}</p> : null}
    </>
  )
  if (!interactive) {
    // Editor preview: a representative, inert sketch of the picker.
    return (
      <div className="sp-card sp-booking" style={cardVars(props)}>
        {head}
        {slug ? (
          <div className="sp-bk-preview" aria-hidden="true">
            <p className="sp-bk-steplabel">{t('renderer.bkWhen')}</p>
            <div className="sp-bk-row">{previewDays.map((d, i) => <span key={i} className="sp-bk-chip">{d}</span>)}</div>
            <div className="sp-bk-row">{['09:00', '10:30', '12:00'].map((h) => <span key={h} className="sp-bk-chip">{h}</span>)}</div>
            <p className="sp-muted sp-booking-hint">{t('renderer.bkPreviewNote')}</p>
          </div>
        ) : (
          <p className="sp-muted sp-booking-hint">{t('renderer.bookingHint')}</p>
        )}
      </div>
    )
  }
  if (!slug) return null
  return <div className="sp-card sp-booking" style={cardVars(props)}>{head}<BookingInline pageId={slug} /></div>
}

function BookingInline({ pageId }) {
  const { t, lang } = useT('booking')
  const f = useBookingFlow(pageId, { enabled: true })
  if (f.status === 'loading') return <p className="sp-muted">{t('publicPage.loading')}</p>
  if (f.status === 'notfound') return <p className="sp-muted">{t('publicPage.notFoundBody')}</p>
  if (f.status === 'done') {
    return (
      <div className="sp-bk-done">
        <div className="sp-check" aria-hidden="true">✓</div>
        <p className="sp-bk-thankyou">{str(f.thankYou?.message) || t('publicPage.thankYouDefault')}</p>
        {f.slot ? <p className="sp-bk-when">{fmtDayLabel(f.slot.start, f.tz, lang)} · {fmtTime(f.slot.start, f.tz, lang)}</p> : null}
      </div>
    )
  }
  return (
    <div className="sp-bk">
      {f.submitError === 'slot_taken' ? <p className="sp-form-error">{t('publicPage.errSlotTaken')}</p> : null}
      {f.types.length > 1 && (
        <div className="sp-bk-section">
          <p className="sp-bk-steplabel">{t('publicPage.stepType')}</p>
          <div className="sp-bk-row">
            {f.types.map((mt) => {
              const id = mt.id ?? '__d'
              return (
                <button key={id} type="button" className={`sp-bk-type${f.typeId === id ? ' on' : ''}`} onClick={() => f.setTypeId(id)}>
                  <span className="sp-bk-type-name">{mt.name}</span>
                  <span className="sp-bk-type-meta">{t('minutes', { count: mt.duration_minutes })}{mt.default_price ? ` · ₪${mt.default_price}` : ''}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {f.typeId != null && (
        <div className="sp-bk-section">
          <p className="sp-bk-steplabel">{t('publicPage.stepWhen')}</p>
          {f.slotsLoading ? (
            <p className="sp-muted">{t('publicPage.slotsLoading')}</p>
          ) : f.days.length === 0 ? (
            <p className="sp-muted">{t('publicPage.noSlots')}</p>
          ) : (
            <>
              <div className="sp-bk-row">
                {f.days.map((d) => (
                  <button key={d.key} type="button" className={`sp-bk-chip${f.dayKey === d.key ? ' on' : ''}`} onClick={() => { f.setDayKey(d.key); f.setSlot(null) }}>
                    {fmtDayLabel(d.list[0].start, f.tz, lang)}
                  </button>
                ))}
              </div>
              {f.dayKey && (
                <div className="sp-bk-row">
                  {f.daySlots.map((s) => (
                    <button key={s.start} type="button" className={`sp-bk-chip${f.slot?.start === s.start ? ' on' : ''}`} onClick={() => f.setSlot(s)}>
                      {fmtTime(s.start, f.tz, lang)}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {f.slot && (
        <form className="sp-bk-section sp-bk-form" onSubmit={f.submit} noValidate>
          <p className="sp-bk-steplabel">{t('publicPage.stepDetails')}</p>
          <p className="sp-bk-chosen">{f.chosenType?.name ? `${f.chosenType.name} · ` : ''}{fmtDayLabel(f.slot.start, f.tz, lang)} · {fmtTime(f.slot.start, f.tz, lang)}</p>
          <label className="sp-field">
            <span className="sp-label">{t('publicPage.fieldName')} *</span>
            <input className={`sp-input${f.errors.name ? ' is-error' : ''}`} value={f.values.name} onChange={(e) => f.setField('name', e.target.value)} required />
          </label>
          <label className="sp-field">
            <span className="sp-label">{t('publicPage.fieldPhone')}</span>
            <input className="sp-input" type="tel" value={f.values.phone} onChange={(e) => f.setField('phone', e.target.value)} />
          </label>
          <label className="sp-field">
            <span className="sp-label">{t('publicPage.fieldEmail')}</span>
            <input className={`sp-input${f.errors.email ? ' is-error' : ''}`} type="email" value={f.values.email} onChange={(e) => f.setField('email', e.target.value)} />
          </label>
          <label className="sp-field">
            <span className="sp-label">{t('publicPage.fieldNote')}</span>
            <textarea className="sp-input sp-textarea" rows={3} value={f.values.note} onChange={(e) => f.setField('note', e.target.value)} />
          </label>
          <input type="text" tabIndex={-1} autoComplete="off" className="sp-hp" aria-hidden="true" onChange={(e) => { f.hp.current = e.target.value }} />
          {f.submitError === 'generic' ? <p className="sp-form-error">{t('publicPage.errGeneric')}</p> : null}
          <button type="submit" className="sp-btn sp-btn-primary sp-bk-submit" disabled={f.submitting}>
            {f.submitting ? t('publicPage.submitting') : t('publicPage.submit')}
          </button>
        </form>
      )}
    </div>
  )
}

/* ── Phase 2 blocks ──────────────────────────────────────────────────────── */

/* Image + text side by side (stacks on a narrow container). */
function SplitBlock({ props, interactive, edit }) {
  const { t } = useT('siteBuilder')
  const src = safeImageUrl(props.image)
  const mobileSrc = safeImageUrl(props.mobileUrl)
  const side = props.mediaSide === 'end' ? 'end' : 'start'
  const media = src ? (
    <div className={`sp-split-media${mobileSrc ? ' has-mobile' : ''}`}>
      <img className="sp-split-img sp-img-d" src={src} alt={props.alt || ''} loading="lazy" />
      {mobileSrc ? <img className="sp-split-img sp-img-m" src={mobileSrc} alt={props.alt || ''} loading="lazy" /> : null}
    </div>
  ) : <div className="sp-split-media sp-img-empty">{t('renderer.imageEmpty')}</div>
  return (
    <div className={`sp-split sp-split-${side}`}>
      {media}
      <div className="sp-split-body">
        {edit ? (
          <>
            <Editable as="h2" className="sp-h2" value={props.heading} placeholder={t('labels.heading')} onCommit={(v) => edit('heading', v)} />
            <Editable as="div" className="sp-text sp-text-raw" value={props.body} placeholder={t('labels.text')} onCommit={(v) => edit('body', v)} />
            <ActionButton label={props.ctaLabel} action={props.ctaAction} interactive={false} />
          </>
        ) : (
          <>
            {str(props.heading) ? <h2 className="sp-h2">{props.heading}</h2> : null}
            {str(props.body) ? <div className="sp-text" dangerouslySetInnerHTML={{ __html: renderRichText(props.body) }} /> : null}
            <ActionButton label={props.ctaLabel} action={props.ctaAction} interactive={interactive} />
          </>
        )}
      </div>
    </div>
  )
}

/* Big-number stats / counters. */
function StatsBlock({ props }) {
  const items = Array.isArray(props.items) ? props.items : []
  const cols = (props.columns && props.columns !== 'auto') ? props.columns : 'auto'
  return withCard(props,
    <div className={`sp-stats sp-stats-${cols}`}>
      {items.map((it, i) => (
        <div className="sp-stat" key={i}>
          {str(it.value) ? <div className="sp-stat-value">{it.value}</div> : null}
          {str(it.label) ? <div className="sp-stat-label">{it.label}</div> : null}
        </div>
      ))}
    </div>,
  )
}

/* Pricing tiers (the middle/featured plan is highlighted). */
function PricingBlock({ props, interactive }) {
  const items = Array.isArray(props.items) ? props.items : []
  return (
    <div className="sp-pricing">
      {items.map((it, i) => {
        const feats = String(it.features || '').split('\n').map((s) => s.trim()).filter(Boolean)
        return (
          <div className={`sp-price${it.featured ? ' is-featured' : ''}`} key={i}>
            {str(it.name) ? <div className="sp-price-name">{it.name}</div> : null}
            <div className="sp-price-amount">
              <span className="sp-price-value">{it.price}</span>
              {str(it.period) ? <span className="sp-price-period"> {it.period}</span> : null}
            </div>
            {feats.length ? <ul className="sp-price-feats">{feats.map((f, j) => <li key={j}>{f}</li>)}</ul> : null}
            <ActionButton label={it.ctaLabel} action={it.ctaAction} style={it.featured ? 'primary' : 'secondary'} interactive={interactive} />
          </div>
        )
      })}
    </div>
  )
}

/* Logo / "as seen in" strip (grayscale by default). */
function LogosBlock({ props }) {
  const { t } = useT('siteBuilder')
  const items = Array.isArray(props.items) ? props.items : []
  const imgs = items.map((it) => safeImageUrl(it && it.url)).filter(Boolean)
  if (!imgs.length) return <div className="sp-img-empty">{t('renderer.imageEmpty')}</div>
  return (
    <div className={`sp-logos${props.grayscale !== false ? ' is-gray' : ''}`}>
      {imgs.map((u, i) => <img key={i} className="sp-logo" src={u} alt="" loading="lazy" />)}
    </div>
  )
}

/* Numbered "how it works" steps. */
function StepsBlock({ props, edit }) {
  const { t } = useT('siteBuilder')
  const items = Array.isArray(props.items) ? props.items : []
  const setItem = (i, patch) => edit('items', items.map((it, j) => (j === i ? { ...it, ...patch } : it)))
  return withCard(props,
    <ol className="sp-steps">
      {items.map((it, i) => (
        <li className="sp-step" key={i}>
          <div className="sp-step-num" aria-hidden="true">{i + 1}</div>
          <div className="sp-step-body">
            {edit ? (
              <>
                <Editable as="div" className="sp-step-title" value={it.title} placeholder={t('labels.title')} onCommit={(v) => setItem(i, { title: v })} />
                <Editable as="p" className="sp-step-text" value={it.body} placeholder={t('labels.body')} onCommit={(v) => setItem(i, { body: v })} />
              </>
            ) : (
              <>
                {str(it.title) ? <div className="sp-step-title">{it.title}</div> : null}
                {str(it.body) ? <p className="sp-step-text">{it.body}</p> : null}
              </>
            )}
          </div>
        </li>
      ))}
    </ol>,
  )
}

/* Rich CTA section (a brand-tinted band with heading + sub + button). */
function CtaBandBlock({ props, interactive, edit }) {
  const { t } = useT('siteBuilder')
  const style = props.style || 'brand'
  return (
    <div className={`sp-ctaband sp-ctaband-${style}`}>
      {edit ? (
        <>
          <Editable as="h2" className="sp-ctaband-h" value={props.heading} placeholder={t('labels.heading')} onCommit={(v) => edit('heading', v)} />
          <Editable as="p" className="sp-ctaband-sub" value={props.subheading} placeholder={t('labels.subheading')} onCommit={(v) => edit('subheading', v)} />
          <ActionButton label={props.ctaLabel} action={props.ctaAction} interactive={false} />
        </>
      ) : (
        <>
          {str(props.heading) ? <h2 className="sp-ctaband-h">{props.heading}</h2> : null}
          {str(props.subheading) ? <p className="sp-ctaband-sub">{props.subheading}</p> : null}
          <ActionButton label={props.ctaLabel} action={props.ctaAction} interactive={interactive} />
        </>
      )}
    </div>
  )
}

/* ── Social + contact glyphs (inline SVG; no brand-icon dependency) ───────── */
const SOCIAL_COLOR = {
  whatsapp: '#25D366', instagram: '#E1306C', facebook: '#1877F2', tiktok: '#111111',
  youtube: '#FF0000', linkedin: '#0A66C2', telegram: '#26A5E4',
  email: '#7c6f63', phone: '#7c6f63', website: 'var(--sp-brand)',
}
function socialGlyph(p) {
  switch (p) {
    case 'whatsapp': return <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a9.9 9.9 0 0 0-8.5 15L2.2 22l5-1.3A10 10 0 1 0 12 2Zm5.5 14c-.2.6-1.3 1.2-1.8 1.3-.5 0-1 .2-3.3-.7-2.8-1.1-4.5-3.9-4.7-4.1-.1-.2-1.1-1.4-1.1-2.7 0-1.3.7-1.9.9-2.2.2-.2.5-.3.6-.3h.5c.2 0 .4 0 .6.4l.7 1.8c.1.1.1.3 0 .5l-.3.4-.3.3c-.1.1-.3.3-.1.6.2.3.9 1.4 1.9 2.3 1.3 1.1 2.3 1.5 2.6 1.6.3.1.5.1.7-.1l.7-.9c.2-.2.4-.2.6-.1l1.7.8c.2.1.4.2.5.3.1.1.1.7-.2 1.3Z"/></svg>
    case 'instagram': return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4.2"/><circle cx="17.2" cy="6.8" r="1.1" fill="currentColor" stroke="none"/></svg>
    case 'facebook': return <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M13.5 21v-7h2.3l.4-2.8h-2.7V9.4c0-.8.2-1.3 1.4-1.3h1.4V5.6c-.3 0-1.2-.1-2.2-.1-2.2 0-3.7 1.3-3.7 3.8v2H8.1V14h2.3v7h3.1Z"/></svg>
    case 'tiktok': return <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M14.5 3c.4 2 1.6 3.5 3.7 3.7v2.5c-1.3 0-2.5-.4-3.6-1.1v5.7a5.3 5.3 0 1 1-5.3-5.3c.3 0 .5 0 .8.1v2.6a2.7 2.7 0 1 0 1.9 2.6V3h2.5Z"/></svg>
    case 'youtube': return <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M22 8.2a2.6 2.6 0 0 0-1.8-1.8C18.6 6 12 6 12 6s-6.6 0-8.2.4A2.6 2.6 0 0 0 2 8.2 27 27 0 0 0 1.7 12 27 27 0 0 0 2 15.8a2.6 2.6 0 0 0 1.8 1.8C5.4 18 12 18 12 18s6.6 0 8.2-.4a2.6 2.6 0 0 0 1.8-1.8A27 27 0 0 0 22.3 12 27 27 0 0 0 22 8.2ZM10 15V9l5.2 3L10 15Z"/></svg>
    case 'linkedin': return <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 9.5V19H4V9.5h3ZM5.5 4.5A1.75 1.75 0 1 1 5.5 8a1.75 1.75 0 0 1 0-3.5ZM20 19h-3v-5c0-1.4-1.5-1.3-1.5 0v5h-3V9.5h3v1.1A3.2 3.2 0 0 1 20 12.4V19Z"/></svg>
    case 'telegram': return <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="m21.5 4-18 7c-.9.4-.9 1.2 0 1.5l4.5 1.4 1.7 5.3c.2.6.5.7 1 .3l2.6-2.4 4.4 3.2c.5.3 1 .1 1.1-.5L23 5c.2-.7-.3-1.3-1.5-1Zm-3.3 4.2-7 6.3-.3 3.3-1.4-4.4 8.7-5.2Z"/></svg>
    case 'email': return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 7 8 6 8-6"/></svg>
    case 'phone': return <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6.6 3c.5 0 .9.3 1.1.8l1.2 3c.2.5.1 1-.3 1.4L7.2 9.4a13 13 0 0 0 5.4 5.4l1.2-1.4c.4-.4.9-.5 1.4-.3l3 1.2c.5.2.8.6.8 1.1V20c0 .6-.5 1.1-1.1 1A17 17 0 0 1 4 5.1C3.9 4.5 4.4 4 5 4h1.6Z"/></svg>
    default: return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18Z"/></svg>
  }
}

/* Social links row — circular brand-coloured buttons. */
function SocialBlock({ props, interactive }) {
  const items = Array.isArray(props.items) ? props.items : []
  const shown = items.filter((it) => it && SOCIAL_COLOR[it.platform] && (!interactive || str(it.url)))
  const hrefFor = (it) => {
    if (it.platform === 'email') return `mailto:${str(it.url)}`
    if (it.platform === 'phone') return `tel:${String(it.url).replace(/[^0-9+]/g, '')}`
    if (it.platform === 'whatsapp') return `https://wa.me/${String(it.url).replace(/[^0-9]/g, '')}`
    return safeRedirectUrl(it.url)
  }
  return (
    <div className={`sp-social sp-social-${props.align || 'center'} sp-social-${props.size || 'md'}`}>
      {shown.map((it, i) => {
        const href = interactive ? hrefFor(it) : null
        const common = { className: 'sp-social-btn', style: { '--sp-social-c': SOCIAL_COLOR[it.platform] }, title: it.platform, 'aria-label': it.platform }
        return href
          ? <a key={i} href={href} target="_blank" rel="noopener noreferrer" {...common}>{socialGlyph(it.platform)}</a>
          : <span key={i} {...common}>{socialGlyph(it.platform)}</span>
      })}
    </div>
  )
}

/* Contact details card (tap-to-call / mail / map). */
function ContactBlock({ props }) {
  const rows = []
  if (str(props.phone)) rows.push({ g: 'phone', label: props.phone, href: `tel:${String(props.phone).replace(/[^0-9+]/g, '')}` })
  if (str(props.whatsapp)) rows.push({ g: 'whatsapp', label: props.whatsapp, href: `https://wa.me/${String(props.whatsapp).replace(/[^0-9]/g, '')}` })
  if (str(props.email)) rows.push({ g: 'email', label: props.email, href: `mailto:${str(props.email)}` })
  if (str(props.address)) rows.push({ g: 'address', label: props.address, href: `https://www.google.com/maps?q=${encodeURIComponent(str(props.address))}` })
  const addrGlyph = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11Z"/><circle cx="12" cy="10" r="2.4"/></svg>
  const hoursGlyph = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
  const glyph = (g) => (g === 'address' ? addrGlyph : socialGlyph(g))
  return withCard(props,
    <div className="sp-contact">
      {rows.map((r, i) => (
        <a key={i} className="sp-contact-row" href={r.href} target="_blank" rel="noopener noreferrer">
          <span className="sp-contact-ic">{glyph(r.g)}</span>
          <span className="sp-contact-val">{r.label}</span>
        </a>
      ))}
      {str(props.hours) ? (
        <div className="sp-contact-row sp-contact-static">
          <span className="sp-contact-ic">{hoursGlyph}</span>
          <span className="sp-contact-val sp-contact-hours">{props.hours}</span>
        </div>
      ) : null}
    </div>,
  )
}

/* Google Maps embed — built only from the coach's query (no arbitrary src). */
function MapBlock({ props }) {
  const { t } = useT('siteBuilder')
  const q = str(props.query)
  if (!q) return <div className="sp-img-empty">{t('renderer.mapEmpty', { defaultValue: 'הוסיפו כתובת להצגת מפה' })}</div>
  const src = `https://www.google.com/maps?q=${encodeURIComponent(q)}&output=embed`
  return (
    <div className={`sp-map sp-map-${props.height || 'md'}`}>
      <iframe src={src} title={t('renderer.mapTitle', { defaultValue: 'מפה' })} loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
    </div>
  )
}

/* Announcement bar — full-width strip (the Section renders it edge-to-edge). */
function BannerBlock({ props, interactive, edit }) {
  const { t } = useT('siteBuilder')
  const style = props.style || 'brand'
  return (
    <div className={`sp-banner sp-banner-${style}${props.sticky ? ' is-sticky' : ''}`}>
      <div className="sp-banner-inner">
        {edit
          ? <Editable as="span" className="sp-banner-text" value={props.text} placeholder={t('labels.text')} onCommit={(v) => edit('text', v)} />
          : (str(props.text) ? <span className="sp-banner-text">{props.text}</span> : null)}
        {str(props.ctaLabel) ? <ActionButton label={props.ctaLabel} action={props.ctaAction} style="secondary" interactive={interactive} /> : null}
      </div>
    </div>
  )
}

/* Countdown timer — ticks live in both the editor preview and the public page. */
function CountdownBlock({ props }) {
  const { t } = useT('siteBuilder')
  const target = str(props.target) ? new Date(props.target).getTime() : 0
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!target) return undefined
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [target])
  let body
  if (!target) {
    body = <p className="sp-muted">{t('renderer.countdownHint', { defaultValue: 'הגדירו תאריך ושעת יעד' })}</p>
  } else if (target - now <= 0) {
    body = <p className="sp-countdown-expired">{str(props.expiredText) || t('renderer.countdownDone', { defaultValue: 'הסתיים' })}</p>
  } else {
    const diff = target - now
    const units = [
      [Math.floor(diff / 86400000), t('renderer.cdDays', { defaultValue: 'ימים' })],
      [Math.floor(diff / 3600000) % 24, t('renderer.cdHours', { defaultValue: 'שעות' })],
      [Math.floor(diff / 60000) % 60, t('renderer.cdMin', { defaultValue: 'דקות' })],
      [Math.floor(diff / 1000) % 60, t('renderer.cdSec', { defaultValue: 'שניות' })],
    ]
    body = (
      <div className="sp-countdown-grid">
        {units.map(([v, l], i) => (
          <div className="sp-cd-unit" key={i}>
            <div className="sp-cd-num">{String(v).padStart(2, '0')}</div>
            <div className="sp-cd-lbl">{l}</div>
          </div>
        ))}
      </div>
    )
  }
  return withCard(props,
    <div className="sp-countdown">
      {str(props.heading) ? <h2 className="sp-h2">{props.heading}</h2> : null}
      {body}
    </div>,
  )
}

const BLOCK_COMPONENT = {
  hero: HeroBlock, text: TextBlock, image: ImageBlock, iconText: IconTextBlock,
  testimonial: TestimonialBlock, cta: CtaBlock, spacer: SpacerBlock,
  cards: CardsBlock, icon: IconBlock, gallery: GalleryBlock, video: VideoBlock,
  faq: FaqBlock, divider: DividerBlock,
  split: SplitBlock, stats: StatsBlock, pricing: PricingBlock, logos: LogosBlock,
  steps: StepsBlock, ctaBand: CtaBandBlock, social: SocialBlock, contact: ContactBlock,
  map: MapBlock, banner: BannerBlock, countdown: CountdownBlock,
}

/* One section → its block, wrapped so the canvas can target it (id, type).
   `sel` marks the editor-selected section so the canvas can draw a ring. */
/* Editor-only drag handle on a section's inline-end edge — drag to set the
   section's width (% of the content column). Rendered for EVERY section in the
   editor and revealed on hover (or when selected) so it's discoverable straight
   from the canvas, like inline text editing. Width is measured from the column's
   fixed inline-start edge so it can't oscillate as the box re-aligns. */
function ResizeHandle({ width, onResize }) {
  const { t } = useT('siteBuilder')
  const [live, setLive] = useState(null)
  const cleanupRef = useRef(null)
  // Tear down an in-flight drag if the section unmounts mid-resize (e.g. it gets
  // deleted) so the window listeners + body cursor class never leak.
  useEffect(() => () => { if (cleanupRef.current) cleanupRef.current() }, [])
  const onDown = (e) => {
    e.preventDefault(); e.stopPropagation()
    const section = e.currentTarget.parentElement
    // Measure the % against the CONTENT COLUMN (.sp-row-inner), not the now
    // full-width .sp-page — so "100%" still means the column edge.
    const page = section && (section.closest('.sp-row-inner') || section.closest('.sp-page'))
    if (!page) return
    const pageRect = page.getBoundingClientRect()
    const rtl = getComputedStyle(page).direction === 'rtl'
    const move = (ev) => {
      const startEdge = rtl ? pageRect.right : pageRect.left
      const dist = rtl ? (startEdge - ev.clientX) : (ev.clientX - startEdge)
      const pct = Math.max(25, Math.min(100, Math.round((dist / pageRect.width) * 100)))
      setLive(pct); onResize(pct)
    }
    const end = () => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', end)
      document.body.classList.remove('sp-resizing'); cleanupRef.current = null; setLive(null)
    }
    cleanupRef.current = end
    document.body.classList.add('sp-resizing')
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', end)
  }
  return (
    <span className="sp-resize-handle" onPointerDown={onDown} aria-hidden="true">
      <span className="sp-resize-grip" title={t('labels.dragWidth')} />
      <span className="sp-resize-badge">{live != null ? live : (Number(width) || 100)}%</span>
    </span>
  )
}

/* Smart-guide snapping (free proto): snap the dragged block's edges/center to other
   blocks' edges/centers + the canvas edges/center (within T px); and — when no edge
   align is found on an axis — snap to EQUAL SPACING between the nearest neighbours on
   that axis. Reports guide-line positions + spacing markers. All in .sp-page layout-
   space (offsetLeft/Top — no scaling issues). */
function snapMove(rawX, rawY, w, h, blocks, cw) {
  const T = 6
  // ── edge / center alignment ──
  const xT = [0, cw / 2, cw], yT = [0]
  blocks.forEach((b) => { xT.push(b.left, b.cx, b.right); yT.push(b.top, b.cy, b.bottom) })
  let x = rawX, y = rawY, gx = null, gy = null, bx = T + 1, by = T + 1
  for (const off of [0, w / 2, w]) for (const t of xT) { const d = Math.abs(rawX + off - t); if (d <= T && d < bx) { bx = d; x = t - off; gx = t } }
  for (const off of [0, h / 2, h]) for (const t of yT) { const d = Math.abs(rawY + off - t); if (d <= T && d < by) { by = d; y = t - off; gy = t } }
  // ── equal spacing: only on an axis with no alignment snap, only between
  //    neighbours that overlap on the OTHER axis (same column/row), and only when
  //    the gap is big enough to hold the block (so it can't overlap them) ──
  const spacers = []
  const xOverlap = (b) => rawX < b.right && rawX + w > b.left
  const yOverlap = (b) => rawY < b.bottom && rawY + h > b.top
  if (gy == null) {
    let a = null, bel = null
    blocks.forEach((b) => {
      if (!xOverlap(b)) return
      if (b.bottom <= rawY + 2 && (!a || b.bottom > a.bottom)) a = b
      if (b.top >= rawY + h - 2 && (!bel || b.top < bel.top)) bel = b
    })
    if (a && bel && bel.top - a.bottom >= h) {
      const eq = (a.bottom + bel.top - h) / 2
      if (Math.abs(rawY - eq) <= T) {
        y = Math.round(eq); const cx = Math.round(x + w / 2)
        spacers.push({ v: true, left: cx, top: a.bottom, h: y - a.bottom })
        spacers.push({ v: true, left: cx, top: y + h, h: bel.top - (y + h) })
      }
    }
  }
  if (gx == null) {
    let l = null, r = null
    blocks.forEach((b) => {
      if (!yOverlap(b)) return
      if (b.right <= rawX + 2 && (!l || b.right > l.right)) l = b
      if (b.left >= rawX + w - 2 && (!r || b.left < r.left)) r = b
    })
    if (l && r && r.left - l.right >= w) {
      const eq = (l.right + r.left - w) / 2
      if (Math.abs(rawX - eq) <= T) {
        x = Math.round(eq); const cy = Math.round(y + h / 2)
        spacers.push({ v: false, top: cy, left: l.right, w: x - l.right })
        spacers.push({ v: false, top: cy, left: x + w, w: r.left - (x + w) })
      }
    }
  }
  return { x: Math.round(x), y: Math.round(y), gx, gy, spacers }
}

/* Imperative free-drag guides — appended/removed straight in .sp-page (editor only)
   so they don't go through React state during a drag. Cleared before the drop commit. */
function clearGuides(page) { if (page) page.querySelectorAll('.sp-guide, .sp-spacer').forEach((el) => el.remove()) }
function drawGuides(page, gx, gy, spacers) {
  if (!page) return
  clearGuides(page)
  const add = (cls, st) => { const d = document.createElement('div'); d.className = cls; d.setAttribute('aria-hidden', 'true'); Object.assign(d.style, st); page.appendChild(d) }
  if (gx != null) add('sp-guide sp-guide-v', { left: `${gx}px` })
  if (gy != null) add('sp-guide sp-guide-h', { top: `${gy}px` })
  ;(spacers || []).forEach((sp) => add(`sp-spacer ${sp.v ? 'sp-spacer-v' : 'sp-spacer-h'}`,
    sp.v ? { left: `${sp.left}px`, top: `${sp.top}px`, height: `${Math.max(0, sp.h)}px` }
      : { left: `${sp.left}px`, top: `${sp.top}px`, width: `${Math.max(0, sp.w)}px` }))
}

function Section({ section, index = 0, free, layoutKey = 'layout', canvasW = FREE_CANVAS_W, interactive, runtime, selectedId, onEdit }) {
  const { t } = useT('siteBuilder')
  const type = section.type
  const isSel = section.id === selectedId
  const sel = isSel ? '' : undefined
  // In the editor, `onEdit` enables click-to-edit text in place + the resize handle.
  const edit = onEdit ? (key, value) => onEdit(section.id, key, value) : null
  // Tear down an in-flight free drag if the block unmounts mid-drag.
  const dragRef = useRef(null)
  useEffect(() => () => { if (dragRef.current) dragRef.current() }, [])

  // Per-section text color ('auto'/unset = readable default; a hex paints the text).
  const color = section.props?.color
  const colored = typeof color === 'string' && color !== 'auto' && color.trim() !== ''
  // Per-section box width (% of the column) + horizontal alignment. Named
  // boxWidth/boxAlign (not width/align) so they never collide with a block's own
  // width prop (image/divider: full/wide/narrow) or align prop (icon: start/center).
  // Reflows to full width on a narrow container (mobile) via CSS so it stays responsive.
  const width = Number(section.props?.boxWidth) || 100
  const align = section.props?.boxAlign || 'center'
  const sized = width > 0 && width < 100

  // FREE mode: absolute layout from props[layoutKey] (layout for desktop,
  // layoutMobile for mobile), merged OVER the default-stack so every key (x/y/w/h)
  // is always present — a partial/corrupt layout can't yield NaN downstream.
  const layout = free ? { ...freeDefaultLayout(index, canvasW), ...(section.props?.[layoutKey] || {}) } : (section.props?.[layoutKey] || null)
  // FAQ (accordion) grows when an item opens, so reserve its box with min-height
  // and let it expand instead of clipping; every other block keeps a fixed height.
  // Stacking: explicit props.z (set by Bring-to-front / Send-to-back) wins, else the
  // section's order — so overlapping blocks have a predictable, controllable z-order.
  const freeStyle = free ? {
    position: 'absolute', left: `${layout.x}px`, top: `${layout.y}px`, width: `${layout.w}px`,
    zIndex: section.props?.z != null ? section.props.z : index,
    ...(type === 'faq' ? { minHeight: `${layout.h}px` } : { height: `${layout.h}px` }),
  } : null

  // FREE drag: the whole block body MOVES (skipping text/buttons/the resize handle
  // so those stay editable/clickable); the corner handle RESIZES. Px deltas in the
  // 1:1 free canvas. A plain click (no movement past a threshold) just selects.
  // IMPERATIVE: during the drag the block + guides are moved straight in the DOM, so
  // a pointermove does NOT re-render every section — React state is committed once on
  // drop. (drawGuides/clearGuides append/remove plain divs; cleared before the commit.)
  const startFreeDrag = (e, mode) => {
    if (mode === 'move' && e.target.closest('.sp-editable, input, textarea, button, a, .sp-free-resize')) return
    if (mode === 'resize') { e.preventDefault(); e.stopPropagation() }
    const self = e.currentTarget.closest('.sp-block')
    const page = self && self.closest('.sp-page')
    const cw = page ? (page.clientWidth || canvasW) : canvasW
    // Snapshot neighbour geometry ONCE at pointerdown (no layout-thrashing DOM read per move).
    const neighbors = []
    if (page) page.querySelectorAll('.sp-free-block').forEach((b) => {
      if (b === self) return
      neighbors.push({ left: b.offsetLeft, right: b.offsetLeft + b.offsetWidth, cx: b.offsetLeft + b.offsetWidth / 2,
        top: b.offsetTop, bottom: b.offsetTop + b.offsetHeight, cy: b.offsetTop + b.offsetHeight / 2 })
    })
    const sx = e.clientX, sy = e.clientY
    const base = { x: layout.x, y: layout.y, w: layout.w, h: layout.h }
    let moved = false, last = base
    const mv = (ev) => {
      const dx = ev.clientX - sx, dy = ev.clientY - sy
      if (!moved && Math.abs(dx) < 3 && Math.abs(dy) < 3) return // a click, not a drag → don't dirty the page
      moved = true
      if (mode === 'move') {
        const s = snapMove(base.x + dx, base.y + dy, base.w, base.h, neighbors, cw)
        // Keep the block's top-left grip on the canvas so it can never be dragged
        // fully off-screen (above y=0 is unreachable in the editor) and lost.
        const cx = Math.max(0, Math.min(s.x, Math.max(0, cw - 40)))
        const cy = Math.max(0, s.y)
        last = { ...base, x: cx, y: cy }
        self.style.left = `${cx}px`; self.style.top = `${cy}px`
        drawGuides(page, s.gx, s.gy, s.spacers)
      } else {
        last = { ...base, w: Math.max(60, Math.round(base.w + dx)), h: Math.max(40, Math.round(base.h + dy)) }
        self.style.width = `${last.w}px`; self.style.height = `${last.h}px`
      }
    }
    const end = (commit) => {
      window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up)
      document.body.classList.remove('sp-moving'); dragRef.current = null
      clearGuides(page)
      if (commit && moved) edit(layoutKey, last)
    }
    const up = () => end(true)
    dragRef.current = () => end(false)
    document.body.classList.add('sp-moving')
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up)
  }

  const wrapCls = `sp-block sp-block-${type}${colored ? ' sp-colored' : ''}`
    + `${!free && sized ? ' sp-sized' : ''}${free ? ' sp-free-block' : ''}${free && edit ? ' sp-free-edit' : ''}`
  const style = free
    ? { ...(colored ? { '--sp-text-color': color } : {}), ...freeStyle }
    : {
        ...(colored ? { '--sp-text-color': color } : {}),
        ...(sized ? { maxWidth: `${width}%`, alignSelf: align === 'start' ? 'flex-start' : align === 'end' ? 'flex-end' : 'center' } : {}),
      }
  const styleProp = Object.keys(style).length ? style : undefined

  let inner
  if (type === 'form') inner = <FormBlock section={section} interactive={interactive} runtime={runtime} />
  else if (type === 'booking') inner = <BookingBlock props={section.props || {}} interactive={interactive} />
  else {
    const Comp = BLOCK_COMPONENT[type]
    if (!Comp) return null
    inner = <Comp props={section.props || {}} interactive={interactive} edit={edit} />
  }

  const sectionEl = (
    <section className={wrapCls} style={styleProp} data-sid={section.id} data-selected={sel}
      onPointerDown={free && edit ? (e) => startFreeDrag(e, 'move') : undefined}>
      {inner}
      {edit && free ? (
        <>
          <span className="sp-free-grip" aria-hidden="true" title={t('labels.dragMove')} />
          <span className="sp-free-resize" onPointerDown={(e) => startFreeDrag(e, 'resize')} aria-hidden="true" title={t('labels.dragResize')} />
        </>
      ) : null}
      {edit && !free ? <ResizeHandle width={width} onResize={(w) => edit('boxWidth', w)} /> : null}
    </section>
  )
  if (free) return sectionEl
  // Banner is an edge-to-edge strip — skip the centred content column.
  if (type === 'banner') return <div className="sp-row sp-row-banner sp-pad-none">{sectionEl}</div>
  // STACK mode: wrap the block in a full-width row carrying the optional section
  // background (band) + vertical rhythm, with content kept in a centred max-width
  // column (.sp-row-inner). Section design lives on section.style (not props), so
  // existing pages (style:{}) get bg:none + padY:md by default — backward-safe.
  const st = section.style || {}
  const bgKind = st.bg || 'none'
  const padY = st.padY || 'md'
  const rowCls = `sp-row sp-row-bg-${bgKind} sp-pad-${padY}${st.fullBleed && bgKind !== 'none' ? ' sp-row-bleed' : ''}`
  const rowStyle = {}
  if (bgKind === 'solid' && st.bgColor) rowStyle['--sp-row-bg'] = st.bgColor
  if (bgKind === 'image') { const u = safeImageUrl(st.bgImage); if (u) rowStyle['--sp-row-img'] = `url("${u}")` }
  if (st.bgOverlay != null) rowStyle['--sp-row-overlay'] = Math.max(0, Math.min(80, Number(st.bgOverlay) || 0)) / 100
  if (st.bgOpacity != null) rowStyle['--sp-row-opacity'] = Math.max(0, Math.min(100, Number(st.bgOpacity) || 0)) / 100
  return (
    <div className={rowCls} style={Object.keys(rowStyle).length ? rowStyle : undefined}>
      <div className="sp-row-inner">{sectionEl}</div>
    </div>
  )
}

export default function SiteRenderer({ theme, sections, interactive = false, runtime, className = '', selectedId, onEdit, device }) {
  const { t } = useT('siteBuilder')
  // When no explicit device (public page), pick layout + bg by viewport width.
  const [vw, setVw] = useState(() => (typeof window !== 'undefined' ? window.innerWidth : 1200))
  useEffect(() => {
    if (device != null || typeof window === 'undefined') return undefined
    const on = () => setVw(window.innerWidth)
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [device])
  const mobile = device != null ? device === 'mobile' : vw < 600
  const { style, cls } = sitePageSurface(theme, mobile) // mobile may swap to a separate bg
  const list = Array.isArray(sections) ? sections : []
  // FREE mode: the page is a fixed-width positioning canvas; its height grows to
  // the lowest block bottom. Desktop vs mobile use SEPARATE layouts/canvas widths.
  const free = theme?.layoutMode === 'free'
  const layoutKey = freeLayoutKey(mobile)
  const canvasW = mobile ? FREE_CANVAS_MOBILE_W : FREE_CANVAS_W
  const layoutOf = (s, i) => ({ ...freeDefaultLayout(i, canvasW), ...(s.props?.[layoutKey] || {}) })
  // FREE mode is a fixed-width (canvasW) absolute canvas. On the PUBLIC page, when
  // the viewport is narrower than canvasW (tablet / small window), scale the whole
  // canvas down to fit so blocks don't overflow/clip. NOT scaled in the editor —
  // there drag math is 1:1 and the device frames already match the canvas widths.
  const rootRef = useRef(null)
  const pageRef = useRef(null)
  const [availW, setAvailW] = useState(0)
  const [pageH, setPageH] = useState(0) // actual rendered page height (grows when a FAQ opens)
  useEffect(() => {
    if (!free || device != null || typeof ResizeObserver === 'undefined') return undefined
    const el = rootRef.current
    if (!el) return undefined
    const ro = new ResizeObserver(() => setAvailW(el.clientWidth))
    ro.observe(el); setAvailW(el.clientWidth)
    return () => ro.disconnect()
  }, [free, device])
  // Track the page's true height so the scaler reserves room for content that grows
  // past its laid-out height (an opened FAQ) — otherwise the scaler's overflow:hidden
  // clips the expanded answer on a scaled public page.
  useEffect(() => {
    if (!free || typeof ResizeObserver === 'undefined') return undefined
    const el = pageRef.current
    if (!el) return undefined
    const ro = new ResizeObserver(() => setPageH(el.offsetHeight))
    ro.observe(el); setPageH(el.offsetHeight)
    return () => ro.disconnect()
  }, [free])
  const pageMinH = free ? list.reduce((m, s, i) => Math.max(m, layoutOf(s, i).y + layoutOf(s, i).h), 0) + 80 : 0
  const scale = (free && device == null && availW > 0 && availW < canvasW) ? availW / canvasW : 1
  const pageStyle = free ? {
    width: `${canvasW}px`, position: 'relative', minHeight: `${pageMinH}px`,
    ...(scale < 1 ? { transform: `scale(${scale})`, transformOrigin: 'top left' } : {}),
  } : undefined
  const pageEl = (
    <div ref={pageRef} className={`sp-page${free ? ' sp-free' : ''}`} style={pageStyle}>
      {list.map((s, i) => (
        <SectionErrorBoundary key={s.id}>
          <Section section={s} index={i} free={free} layoutKey={layoutKey} canvasW={canvasW} interactive={interactive} runtime={runtime} selectedId={selectedId} onEdit={onEdit} />
        </SectionErrorBoundary>
      ))}
      {list.length === 0 ? <div className="sp-empty">{t('renderer.empty')}</div> : null}
    </div>
  )
  return (
    <div className={`sp-root ${cls} ${device != null ? 'sp-framed' : ''} ${className}`} ref={rootRef} dir="rtl" style={style}>
      {/* Photo bg on its OWN layer so "freeze" can pin it to one screen as a real
          sticky wallpaper (CSS), instead of background-attachment:fixed (ignored on
          iOS; in the editor it pinned to the browser window, not the device frame —
          a mobile-resolution image came out heavily zoomed). */}
      {cls.includes('has-bg') ? <div className="sp-bg" aria-hidden="true" /> : null}
      {free && scale < 1
        ? <div className="sp-free-scaler" style={{ height: `${Math.round(Math.max(pageMinH, pageH) * scale)}px` }}>{pageEl}</div>
        : pageEl}
    </div>
  )
}
