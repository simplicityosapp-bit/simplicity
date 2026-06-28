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
function withCard(props, inner) {
  if (!props.card) return inner
  return <div className="sp-card sp-block-card" style={{ '--sp-card-opacity': `${props.cardOpacity ?? 100}%` }}>{inner}</div>
}

/* ── Visual blocks ───────────────────────────────────────────────────────── */
function HeroBlock({ props, interactive, edit }) {
  const inner = (
    <div className="sp-hero">
      {edit ? (
        <>
          <Editable as="div" className="sp-eyebrow" value={props.eyebrow} placeholder="טקסט עליון" onCommit={(v) => edit('eyebrow', v)} />
          <Editable as="h1" className="sp-h1" value={props.heading} placeholder="כותרת" onCommit={(v) => edit('heading', v)} />
          <Editable as="p" className="sp-sub" value={props.subheading} placeholder="תת-כותרת" onCommit={(v) => edit('subheading', v)} />
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
  // In the editor, click-to-edit the raw text in place (markdown shows as typed);
  // on the public page it's rendered. Formatting help stays in the inspector.
  const body = edit
    ? <Editable as="div" className="sp-text sp-text-raw" value={props.text} placeholder="טקסט" onCommit={(v) => edit('text', v)} />
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
  const items = Array.isArray(props.items) ? props.items : []
  const setItem = (i, patch) => edit('items', items.map((it, j) => (j === i ? { ...it, ...patch } : it)))
  return withCard(props,
    <div className="sp-icontext">
      {items.map((it, i) => {
        const Icon = iconByName(it.icon)
        return (
          <div className="sp-feature" key={i}>
            <div className="sp-feature-icon"><Icon size={22} strokeWidth={2} /></div>
            <div className="sp-feature-body">
              {edit ? (
                <>
                  <Editable as="div" className="sp-feature-title" value={it.title} placeholder="כותרת" onCommit={(v) => setItem(i, { title: v })} />
                  <Editable as="p" className="sp-feature-text" value={it.body} placeholder="תיאור" onCommit={(v) => setItem(i, { body: v })} />
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
  return (
    <figure className="sp-testimonial">
      {edit
        ? <Editable as="blockquote" className="sp-quote" value={props.quote} placeholder="ציטוט" onCommit={(v) => edit('quote', v)} />
        : (str(props.quote) ? <blockquote className="sp-quote">{props.quote}</blockquote> : null)}
      <figcaption className="sp-cite">
        {safeImageUrl(props.avatar) ? <img className="sp-avatar" src={safeImageUrl(props.avatar)} alt="" loading="lazy" /> : null}
        <span>
          {edit ? (
            <>
              <Editable as="strong" value={props.author} placeholder="שם" onCommit={(v) => edit('author', v)} />
              {' · '}
              <Editable as="em" value={props.role} placeholder="תפקיד" onCommit={(v) => edit('role', v)} />
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
  if (edit) {
    const cls = `sp-btn sp-btn-${props.style === 'secondary' ? 'secondary' : 'primary'}`
    return withCard(props, <div className="sp-cta"><Editable as="span" className={cls} value={props.label} placeholder="כפתור" onCommit={(v) => edit('label', v)} /></div>)
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
    </div>,
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
      <div className="sp-card sp-booking">
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
  return <div className="sp-card sp-booking">{head}<BookingInline pageId={slug} /></div>
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

const BLOCK_COMPONENT = {
  hero: HeroBlock, text: TextBlock, image: ImageBlock, iconText: IconTextBlock,
  testimonial: TestimonialBlock, cta: CtaBlock, spacer: SpacerBlock,
  cards: CardsBlock, icon: IconBlock, gallery: GalleryBlock, video: VideoBlock,
  faq: FaqBlock, divider: DividerBlock,
}

/* One section → its block, wrapped so the canvas can target it (id, type).
   `sel` marks the editor-selected section so the canvas can draw a ring. */
/* Editor-only drag handle on a section's inline-end edge — drag to set the
   section's width (% of the content column). Rendered for EVERY section in the
   editor and revealed on hover (or when selected) so it's discoverable straight
   from the canvas, like inline text editing. Width is measured from the column's
   fixed inline-start edge so it can't oscillate as the box re-aligns. */
function ResizeHandle({ width, onResize }) {
  const [live, setLive] = useState(null)
  const cleanupRef = useRef(null)
  // Tear down an in-flight drag if the section unmounts mid-resize (e.g. it gets
  // deleted) so the window listeners + body cursor class never leak.
  useEffect(() => () => { if (cleanupRef.current) cleanupRef.current() }, [])
  const onDown = (e) => {
    e.preventDefault(); e.stopPropagation()
    const section = e.currentTarget.parentElement
    const page = section && section.closest('.sp-page')
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
      <span className="sp-resize-grip" title="גרור לשינוי רוחב השדה" />
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

function Section({ section, index = 0, free, layoutKey = 'layout', canvasW = FREE_CANVAS_W, interactive, runtime, selectedId, onEdit, onGuides }) {
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
  const freeStyle = free ? {
    position: 'absolute', left: `${layout.x}px`, top: `${layout.y}px`,
    width: `${layout.w}px`, height: `${layout.h}px`,
  } : null

  // FREE drag: the whole block body MOVES (skipping text/buttons/the resize handle
  // so those stay editable/clickable); the corner handle RESIZES. Px deltas in the
  // 1:1 free canvas. A plain click (no movement past a threshold) just selects.
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
    let moved = false
    const mv = (ev) => {
      const dx = ev.clientX - sx, dy = ev.clientY - sy
      if (!moved && Math.abs(dx) < 3 && Math.abs(dy) < 3) return // a click, not a drag → don't dirty the page
      moved = true
      if (mode === 'move') {
        const s = snapMove(base.x + dx, base.y + dy, base.w, base.h, neighbors, cw)
        edit(layoutKey, { ...base, x: s.x, y: s.y })
        if (onGuides) onGuides({ x: s.gx, y: s.gy, spacers: s.spacers })
      } else {
        edit(layoutKey, { ...base, w: Math.max(60, Math.round(base.w + dx)), h: Math.max(40, Math.round(base.h + dy)) })
      }
    }
    const up = () => {
      window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up)
      document.body.classList.remove('sp-moving'); dragRef.current = null
      if (onGuides) onGuides(null)
    }
    dragRef.current = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); document.body.classList.remove('sp-moving'); if (onGuides) onGuides(null) }
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

  return (
    <section className={wrapCls} style={styleProp} data-sid={section.id} data-selected={sel}
      onPointerDown={free && edit ? (e) => startFreeDrag(e, 'move') : undefined}>
      {inner}
      {edit && free ? (
        <>
          <span className="sp-free-grip" aria-hidden="true" title="גרור להזזה" />
          <span className="sp-free-resize" onPointerDown={(e) => startFreeDrag(e, 'resize')} aria-hidden="true" title="גרור לשינוי גודל" />
        </>
      ) : null}
      {edit && !free ? <ResizeHandle width={width} onResize={(w) => edit('boxWidth', w)} /> : null}
    </section>
  )
}

export default function SiteRenderer({ theme, sections, interactive = false, runtime, className = '', selectedId, onEdit, device }) {
  const { t } = useT('siteBuilder')
  const [guides, setGuides] = useState(null) // free-mode smart guides: { x, y } | null
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
  const onGuides = (free && onEdit) ? setGuides : undefined
  const layoutOf = (s, i) => ({ ...freeDefaultLayout(i, canvasW), ...(s.props?.[layoutKey] || {}) })
  const pageStyle = free ? {
    width: `${canvasW}px`, maxWidth: '100%', position: 'relative',
    minHeight: `${list.reduce((m, s, i) => Math.max(m, layoutOf(s, i).y + layoutOf(s, i).h), 0) + 80}px`,
  } : undefined
  return (
    <div className={`sp-root ${cls} ${className}`} dir="rtl" style={style}>
      <div className={`sp-page${free ? ' sp-free' : ''}`} style={pageStyle}>
        {list.map((s, i) => (
          <SectionErrorBoundary key={s.id}>
            <Section section={s} index={i} free={free} layoutKey={layoutKey} canvasW={canvasW} interactive={interactive} runtime={runtime} selectedId={selectedId} onEdit={onEdit} onGuides={onGuides} />
          </SectionErrorBoundary>
        ))}
        {free && guides && guides.x != null ? <div className="sp-guide sp-guide-v" style={{ left: `${guides.x}px` }} aria-hidden="true" /> : null}
        {free && guides && guides.y != null ? <div className="sp-guide sp-guide-h" style={{ top: `${guides.y}px` }} aria-hidden="true" /> : null}
        {free && guides && guides.spacers ? guides.spacers.map((sp, i) => (
          <div key={`sp${i}`} className={`sp-spacer ${sp.v ? 'sp-spacer-v' : 'sp-spacer-h'}`} aria-hidden="true"
            style={sp.v ? { left: `${sp.left}px`, top: `${sp.top}px`, height: `${Math.max(0, sp.h)}px` } : { left: `${sp.left}px`, top: `${sp.top}px`, width: `${Math.max(0, sp.w)}px` }} />
        )) : null}
        {list.length === 0 ? <div className="sp-empty">{t('renderer.empty')}</div> : null}
      </div>
    </div>
  )
}
