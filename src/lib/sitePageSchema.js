/* ════════════════════════════════════════════════════════════════
   SITE PAGE SCHEMA — shared contract for the page builder (all kinds).
   ════════════════════════════════════════════════════════════════
   Phase 0 of the page-builder project (docs/page-builder-plan.md).

   The unified `site_pages` table powers a hub of THREE page KINDS — landing /
   lead / booking — all on ONE block engine. A page is:
     • theme    — page-level design (font, brand, background, glass)
     • sections — ordered [{ id, type, props, style }] (the visual blocks)
     • config   — kind-specific, non-visual settings (lead approval, booking
                  availability, …); the form/booking SECTIONS carry their own.

   This module is the DATA CONTRACT only — block defaults, the block registry
   that later drives both the auto-generated edit form AND the pure renderer,
   the theme→CSS surface, and helpers. The React block components + CSS are
   built ON this in phase 1 (so the editor preview and the public page render
   from one source of truth, exactly like leadPageSurface() does today).

   Shared bits (slug rules, scene backgrounds, safe-redirect) are REUSED from
   leadPageSchema.js — never duplicated. */

import {
  DEFAULT_BRAND_COLOR, LEAD_PAGE_BACKGROUNDS, leadPageBgUrl,
  normalizeSlug, isValidSlug, slugifyInput, safeRedirectUrl,
  DEFAULT_FIELDS, FIELD_TYPES, isChoiceType, defaultChoiceOptions, freeFieldKey,
} from './leadPageSchema'

/* Re-export the shared bits so builder screens import from one place. */
export {
  DEFAULT_BRAND_COLOR, LEAD_PAGE_BACKGROUNDS, leadPageBgUrl,
  normalizeSlug, isValidSlug, slugifyInput, safeRedirectUrl,
  DEFAULT_FIELDS, FIELD_TYPES, isChoiceType, defaultChoiceOptions, freeFieldKey,
}

/* ── Page kinds ─────────────────────────────────────────────────────────────
   Each kind has its own builder surface + public route, but shares the engine.
   The public route differs by kind so slugs live in separate namespaces. */
export const PAGE_KINDS = ['landing', 'lead', 'booking']
export const KIND_ROUTE = { landing: 'p', lead: 'lead', booking: 'book' }
export const KIND_LABEL = { landing: 'דפי נחיתה', lead: 'השארת פרטים', booking: 'תיאום פגישות' }

/* ── Fonts (MVP curated set) ────────────────────────────────────────────────
   A short, intentional list of Hebrew-capable web fonts. The actual font
   LOADING (Google Fonts / @font-face) is wired in phase 1; here we only carry
   the option key → display name + CSS stack. A full font picker is phase 4. */
export const SITE_FONTS = [
  { key: 'heebo', label: 'היבו', stack: "'Heebo', 'Assistant', sans-serif" },
  { key: 'rubik', label: 'רוביק', stack: "'Rubik', 'Heebo', sans-serif" },
  { key: 'frank', label: 'פרנק רוהל', stack: "'Frank Ruhl Libre', 'Heebo', serif" },
  { key: 'secular', label: 'סקולר', stack: "'Secular One', 'Heebo', sans-serif" },
]
export const fontStack = (key) =>
  (SITE_FONTS.find((f) => f.key === key) || SITE_FONTS[0]).stack

/* ── Theme (page-level design) ──────────────────────────────────────────────
   A superset of the old lead/booking `content` styling fields, plus `font` and
   a structured `background`. Existing scene-only pages map cleanly onto this
   (background:{ type:'scene', value:'<key>' }). */
export const DEFAULT_THEME = {
  font: 'heebo',
  brandColor: DEFAULT_BRAND_COLOR,
  textColor: 'auto',   // 'auto' (readable per background) | 'dark' | 'light'
  textAlign: 'start',  // 'start' (RTL right) | 'center'
  bold: false,
  // background.type: 'flat' (solid colour) | 'scene' (curated nature photo)
  //                | 'image' (uploaded asset url, no day/night variant).
  background: { type: 'scene', value: 'home' },
  cardOpacity: 100,    // 0–100 — how solid section cards sit over the bg
  cardBlur: 14,        // px — glass blur behind a transparent card
  cardRadius: 24,      // px — card corner roundness
  freezeBg: false,     // photo bg pinned to the viewport (background-attachment:
                       // fixed) so it doesn't re-scale/crop as the page grows;
                       // opt-in (iOS Safari treats fixed as scroll → degrades).
  mobileBgOn: false,   // use a separate uploaded background on mobile (mobileBg)
  mobileBg: '',        // mobile-only background image url (when mobileBgOn)
  layoutMode: 'stack', // 'stack' (default responsive vertical sections) | 'free'
                       // (PROTOTYPE: desktop free-positioning — each section has a
                       // layout {x,y,w,h} in px on a fixed FREE_CANVAS_W canvas).
                       // Mobile layout for free mode = Phase 2.
}

// Free-layout (prototype) design canvas width in px — section x/y/w/h are relative
// to this. Desktop uses props.layout on FREE_CANVAS_W; mobile (Phase 2) uses a
// SEPARATE props.layoutMobile on the narrower FREE_CANVAS_MOBILE_W canvas.
export const FREE_CANVAS_W = 960
export const FREE_CANVAS_MOBILE_W = 390
export const freeDefaultLayout = (i = 0, canvasW = FREE_CANVAS_W) => {
  const pad = canvasW < 500 ? 16 : 80
  return { x: pad, y: 40 + i * 180, w: canvasW - 2 * pad, h: 150 }
}
// The section prop key holding the free layout for the active device.
export const freeLayoutKey = (mobile) => (mobile ? 'layoutMobile' : 'layout')

/* Allowlist a coach-authored image/background URL before binding it to an
   <img src> or a CSS url(). Permits only http(s) and same-origin root-relative
   paths — blocks javascript:/data:/other schemes as defense-in-depth (these
   render in a visitor's browser). Returns '' when not allowed. */
export function safeImageUrl(url) {
  const raw = (url || '').toString().trim()
  if (!raw) return ''
  return (/^https?:\/\//i.test(raw) || raw.startsWith('/')) ? raw : ''
}

/* Resolve a page's effective SEO from its `config.seo` + content fallbacks:
   title falls back to the hero heading, description to the hero subheading,
   image to the first image block. Used to set the public page's meta tags. */
export function resolveSeo(cfg) {
  const seo = (cfg && cfg.seo) || {}
  const sections = Array.isArray(cfg && cfg.sections) ? cfg.sections : []
  const s = (v) => (v == null ? '' : String(v)).trim()
  const hero = sections.find((x) => x.type === 'hero')
  const firstImg = sections.find((x) => x.type === 'image' && x.props && s(x.props.url))
  return {
    title: s(seo.title) || s(hero && hero.props && hero.props.heading),
    description: s(seo.description) || s(hero && hero.props && hero.props.subheading),
    image: safeImageUrl(seo.image || (firstImg && firstImg.props.url) || ''),
  }
}

/* Turn a coach-pasted YouTube/Vimeo URL into a safe embed src. Only these two
   providers are allowed (no arbitrary iframe src). Returns '' if unrecognized. */
export function safeVideoEmbed(url) {
  const raw = (url || '').toString().trim()
  if (!raw) return ''
  const yt = raw.match(/(?:youtube\.com\/(?:embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/)
    || raw.match(/youtube\.com\/watch\?(?:[^#]*&)?v=([A-Za-z0-9_-]{6,})/)
  if (yt) return `https://www.youtube.com/embed/${yt[1]}`
  const vm = raw.match(/vimeo\.com\/(?:video\/)?(\d{6,})/)
  if (vm) return `https://player.vimeo.com/video/${vm[1]}`
  return ''
}

/* Theme → inline CSS vars + className, applied to the `.sp-surface` root used
   by BOTH the builder canvas and the public page (true WYSIWYG). Generalizes
   leadPageSurface(): adds `font` and the three background types. */
export function sitePageSurface(theme = {}, mobile = false) {
  const t = { ...DEFAULT_THEME, ...(theme || {}) }
  const bg = t.background || DEFAULT_THEME.background
  const clamp = (v, lo, hi, d) => {
    const n = Number(v)
    return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d
  }
  const style = {
    '--sp-font': fontStack(t.font),
    '--sp-brand': t.brandColor || DEFAULT_BRAND_COLOR,
    '--sp-card-opacity': `${clamp(t.cardOpacity, 0, 100, 100)}%`,
    '--sp-card-blur': `${clamp(t.cardBlur, 0, 60, 14)}px`,
    '--sp-radius': `${clamp(t.cardRadius, 8, 48, 24)}px`,
  }
  const cls = ['sp-surface']
  // A coach-uploaded MOBILE background overrides everything on a narrow screen.
  const mobileSrc = (mobile && t.mobileBgOn) ? safeImageUrl(t.mobileBg) : ''
  if (mobileSrc) {
    style['--sp-bg-day'] = `url("${mobileSrc}")`
    style['--sp-bg-night'] = `url("${mobileSrc}")`
    cls.push('has-bg')
  } else if (bg.type === 'scene' && bg.value) {
    style['--sp-bg-day'] = `url(${leadPageBgUrl(bg.value, 'day')})`
    style['--sp-bg-night'] = `url(${leadPageBgUrl(bg.value, 'night')})`
    cls.push('has-bg')
  } else if (bg.type === 'image' && safeImageUrl(bg.value)) {
    // Uploaded image has no night variant — reuse it for both.
    const safe = safeImageUrl(bg.value)
    style['--sp-bg-day'] = `url("${safe}")`
    style['--sp-bg-night'] = `url("${safe}")`
    cls.push('has-bg')
  } else if (bg.type === 'flat') {
    style['--sp-bg-flat'] = bg.value || 'var(--bone)'
    cls.push('bg-flat')
  }
  if (t.bold) cls.push('is-bold')
  // Readability: text sitting directly on a photo background needs to be light
  // (with a shadow). 'auto' (the default) picks per background — light on a
  // photo, dark on a flat colour; 'light'/'dark' are explicit coach overrides.
  const photoBg = !!mobileSrc || bg.type === 'scene' || bg.type === 'image'
  if (t.textColor === 'light' || (t.textColor !== 'dark' && photoBg)) cls.push('text-light')
  if (t.textAlign === 'center') cls.push('align-center')
  // Freeze the photo background to the viewport so it keeps a constant crop as
  // the page grows (instead of `cover` re-scaling over a taller element).
  if (t.freezeBg && photoBg) cls.push('bg-fixed')
  return { style, cls: cls.join(' ') }
}

/* ── Block registry ─────────────────────────────────────────────────────────
   The single source of truth for the MVP section types. Each entry carries:
     • label / icon  — for the "add section" palette (icon = Lucide name)
     • defaultProps  — a fresh block's starting content
     • editable      — ordered descriptors that DRIVE the auto-generated edit
                       form in phase 1 (and document the prop shape here).
   Descriptor `type` ∈ text | textarea | richtext | image | icon | textColor
     | select | range | toggle | list | action | formFields | bookingPage.
   `cta` actions: { type:'link'|'scrollToForm'|'booking', url } — `link` opens
   an external URL (validated via safeRedirectUrl), the others scroll to / open
   the page's own form / booking section. */
export const BLOCK_TYPES = {
  hero: {
    label: 'כותרת ראשית', icon: 'LayoutTemplate',
    defaultProps: {
      eyebrow: '', heading: 'הכותרת שלך כאן', subheading: '',
      ctaLabel: '', ctaAction: { type: 'scrollToForm', url: '' }, color: 'auto',
      card: false, cardOpacity: 100, cardBlur: 14,
    },
    editable: [
      { key: 'eyebrow', label: 'טקסט עליון', type: 'text' },
      { key: 'heading', label: 'כותרת', type: 'text' },
      { key: 'subheading', label: 'תת-כותרת', type: 'textarea' },
      { key: 'ctaLabel', label: 'כפתור', type: 'text' },
      { key: 'ctaAction', label: 'פעולת הכפתור', type: 'action' },
      { key: 'color', label: 'צבע טקסט', type: 'textColor' },
      { key: 'card', label: 'רקע חלונית מאחורי הטקסט', type: 'toggle' },
      { key: 'cardOpacity', label: 'אטימות החלונית', type: 'range', min: 0, max: 100, showWhen: 'card' },
      { key: 'cardBlur', label: 'טשטוש החלונית', type: 'range', min: 0, max: 40, def: 14, unit: 'px', showWhen: 'card' },
    ],
  },
  text: {
    label: 'טקסט', icon: 'Type',
    defaultProps: { text: 'טקסט חופשי. ספרו על עצמכם, על השירות, ועל מה שחשוב לכם.', card: false, cardOpacity: 100, cardBlur: 14, color: 'auto' },
    editable: [
      { key: 'text', label: 'תוכן', type: 'richtext' },
      { key: 'color', label: 'צבע טקסט', type: 'textColor' },
      { key: 'card', label: 'רקע חלונית מאחורי הטקסט', type: 'toggle' },
      { key: 'cardOpacity', label: 'אטימות החלונית', type: 'range', min: 0, max: 100, showWhen: 'card' },
      { key: 'cardBlur', label: 'טשטוש החלונית', type: 'range', min: 0, max: 40, def: 14, unit: 'px', showWhen: 'card' },
    ],
  },
  image: {
    label: 'תמונה', icon: 'Image',
    defaultProps: { url: '', mobileUrl: '', alt: '', width: 'full', card: false, cardOpacity: 100, cardBlur: 14 },
    editable: [
      { key: 'url', label: 'תמונה', type: 'image' },
      { key: 'mobileUrl', label: 'תמונה למובייל (לא חובה)', type: 'image' },
      { key: 'alt', label: 'טקסט חלופי', type: 'text' },
      { key: 'width', label: 'רוחב', type: 'select', options: ['full', 'wide', 'narrow'] },
      { key: 'card', label: 'רקע חלונית מאחורי הטקסט', type: 'toggle' },
      { key: 'cardOpacity', label: 'אטימות החלונית', type: 'range', min: 0, max: 100, showWhen: 'card' },
      { key: 'cardBlur', label: 'טשטוש החלונית', type: 'range', min: 0, max: 40, def: 14, unit: 'px', showWhen: 'card' },
    ],
  },
  iconText: {
    label: 'יתרונות', icon: 'Sparkles',
    defaultProps: {
      items: [
        { icon: 'Check', title: 'יתרון ראשון', body: '' },
        { icon: 'Check', title: 'יתרון שני', body: '' },
        { icon: 'Check', title: 'יתרון שלישי', body: '' },
      ],
      color: 'auto', card: false, cardOpacity: 100, cardBlur: 14,
    },
    editable: [
      {
        key: 'items', label: 'פריטים', type: 'list',
        item: [
          { key: 'icon', label: 'אייקון', type: 'icon' },
          { key: 'title', label: 'כותרת', type: 'text' },
          { key: 'body', label: 'תיאור', type: 'textarea' },
        ],
      },
      { key: 'color', label: 'צבע טקסט', type: 'textColor' },
      { key: 'card', label: 'רקע חלונית מאחורי הטקסט', type: 'toggle' },
      { key: 'cardOpacity', label: 'אטימות החלונית', type: 'range', min: 0, max: 100, showWhen: 'card' },
      { key: 'cardBlur', label: 'טשטוש החלונית', type: 'range', min: 0, max: 40, def: 14, unit: 'px', showWhen: 'card' },
    ],
  },
  testimonial: {
    label: 'המלצה', icon: 'Quote',
    defaultProps: { quote: 'מה שאמרו עליי…', author: '', role: '', avatar: '', color: 'auto', cardOpacity: 100, cardBlur: 14 },
    editable: [
      { key: 'quote', label: 'ציטוט', type: 'textarea' },
      { key: 'author', label: 'שם', type: 'text' },
      { key: 'role', label: 'תפקיד', type: 'text' },
      { key: 'avatar', label: 'תמונה', type: 'image' },
      { key: 'color', label: 'צבע טקסט', type: 'textColor' },
      { key: 'cardOpacity', label: 'אטימות החלונית', type: 'range', min: 0, max: 100 },
      { key: 'cardBlur', label: 'טשטוש החלונית', type: 'range', min: 0, max: 40, def: 14, unit: 'px' },
    ],
  },
  cta: {
    label: 'כפתור', icon: 'MousePointerClick',
    defaultProps: {
      label: 'לחצו כאן', action: { type: 'link', url: '' }, style: 'primary',
      card: false, cardOpacity: 100, cardBlur: 14,
    },
    editable: [
      { key: 'label', label: 'טקסט', type: 'text' },
      { key: 'action', label: 'פעולה', type: 'action' },
      { key: 'style', label: 'סגנון', type: 'select', options: ['primary', 'secondary'] },
      { key: 'card', label: 'רקע חלונית מאחורי הטקסט', type: 'toggle' },
      { key: 'cardOpacity', label: 'אטימות החלונית', type: 'range', min: 0, max: 100, showWhen: 'card' },
      { key: 'cardBlur', label: 'טשטוש החלונית', type: 'range', min: 0, max: 40, def: 14, unit: 'px', showWhen: 'card' },
    ],
  },
  form: {
    label: 'טופס השארת פרטים', icon: 'ClipboardList',
    // The form block references the lead-form contract: its FIELDS reuse
    // leadPageSchema's field model, submissions go through the edge function.
    defaultProps: {
      heading: 'השאירו פרטים', submitLabel: 'שליחה', fields: DEFAULT_FIELDS, cardOpacity: 100, cardBlur: 14,
    },
    editable: [
      { key: 'heading', label: 'כותרת', type: 'text' },
      { key: 'fields', label: 'שדות', type: 'formFields' },
      { key: 'submitLabel', label: 'כפתור שליחה', type: 'text' },
      { key: 'cardOpacity', label: 'אטימות החלונית', type: 'range', min: 0, max: 100 },
      { key: 'cardBlur', label: 'טשטוש החלונית', type: 'range', min: 0, max: 40, def: 14, unit: 'px' },
    ],
  },
  booking: {
    label: 'תיאום פגישה', icon: 'CalendarClock',
    // Shows the chosen booking page's slot-picker INLINE, served by the same
    // robust booking-intake edge function as the standalone /book page.
    defaultProps: { heading: 'קביעת פגישה', subheading: '', bookingSlug: '', buttonLabel: 'לקביעת תור', cardOpacity: 100, cardBlur: 14 },
    editable: [
      { key: 'heading', label: 'כותרת', type: 'text' },
      { key: 'subheading', label: 'תיאור', type: 'textarea' },
      { key: 'bookingSlug', label: 'עמוד הפגישות', type: 'bookingPage' },
      { key: 'cardOpacity', label: 'אטימות החלונית', type: 'range', min: 0, max: 100 },
      { key: 'cardBlur', label: 'טשטוש החלונית', type: 'range', min: 0, max: 40, def: 14, unit: 'px' },
    ],
  },
  cards: {
    label: 'חלוניות', icon: 'LayoutGrid',
    defaultProps: {
      columns: 'auto',
      items: [
        { icon: 'Star', title: 'חלונית ראשונה', body: 'תיאור קצר', link: '' },
        { icon: 'Heart', title: 'חלונית שנייה', body: 'תיאור קצר', link: '' },
        { icon: 'Sparkles', title: 'חלונית שלישית', body: 'תיאור קצר', link: '' },
      ],
      color: 'auto', card: false, cardOpacity: 100, cardBlur: 14,
    },
    editable: [
      { key: 'columns', label: 'עמודות', type: 'select', options: ['auto', '2', '3'] },
      { key: 'items', label: 'חלוניות', type: 'list', item: [
        { key: 'icon', label: 'אייקון', type: 'icon' },
        { key: 'title', label: 'כותרת', type: 'text' },
        { key: 'body', label: 'תיאור', type: 'textarea' },
        { key: 'link', label: 'קישור', type: 'text' },
      ] },
      { key: 'color', label: 'צבע טקסט', type: 'textColor' },
      { key: 'card', label: 'רקע חלונית מאחורי הטקסט', type: 'toggle' },
      { key: 'cardOpacity', label: 'אטימות החלונית', type: 'range', min: 0, max: 100, showWhen: 'card' },
      { key: 'cardBlur', label: 'טשטוש החלונית', type: 'range', min: 0, max: 40, def: 14, unit: 'px', showWhen: 'card' },
    ],
  },
  icon: {
    label: 'אייקון', icon: 'Smile',
    defaultProps: { icon: 'Heart', size: 'md', align: 'center' },
    editable: [
      { key: 'icon', label: 'אייקון', type: 'icon' },
      { key: 'size', label: 'גודל', type: 'select', options: ['sm', 'md', 'lg'] },
      { key: 'align', label: 'יישור', type: 'select', options: ['start', 'center'] },
    ],
  },
  gallery: {
    label: 'גלריה', icon: 'Images',
    defaultProps: { columns: 'auto', items: [{ url: '' }, { url: '' }, { url: '' }] },
    editable: [
      { key: 'columns', label: 'עמודות', type: 'select', options: ['auto', '2', '3'] },
      { key: 'items', label: 'תמונות', type: 'list', item: [{ key: 'url', label: 'תמונה', type: 'image' }] },
    ],
  },
  video: {
    label: 'וידאו', icon: 'Video',
    defaultProps: { url: '' },
    editable: [{ key: 'url', label: 'קישור YouTube / Vimeo', type: 'text' }],
  },
  faq: {
    label: 'שאלות ותשובות', icon: 'HelpCircle',
    defaultProps: {
      items: [{ q: 'שאלה נפוצה?', a: 'התשובה כאן.' }, { q: 'עוד שאלה?', a: 'עוד תשובה.' }],
      color: 'auto', card: false, cardOpacity: 100, cardBlur: 14,
    },
    editable: [
      { key: 'items', label: 'שאלות', type: 'list', item: [
        { key: 'q', label: 'שאלה', type: 'text' },
        { key: 'a', label: 'תשובה', type: 'textarea' },
      ] },
      { key: 'color', label: 'צבע טקסט', type: 'textColor' },
      { key: 'card', label: 'רקע חלונית מאחורי הטקסט', type: 'toggle' },
      { key: 'cardOpacity', label: 'אטימות החלונית', type: 'range', min: 0, max: 100, showWhen: 'card' },
      { key: 'cardBlur', label: 'טשטוש החלונית', type: 'range', min: 0, max: 40, def: 14, unit: 'px', showWhen: 'card' },
    ],
  },
  divider: {
    label: 'קו מפריד', icon: 'SeparatorHorizontal',
    defaultProps: { width: 'full' },
    editable: [{ key: 'width', label: 'רוחב', type: 'select', options: ['full', 'narrow'] }],
  },
  spacer: {
    label: 'רווח', icon: 'Minus',
    defaultProps: { size: 'md' },
    editable: [{ key: 'size', label: 'גודל', type: 'select', options: ['sm', 'md', 'lg'] }],
  },
}

/* The order sections appear in the "add" palette. */
export const BLOCK_PALETTE = ['hero', 'text', 'image', 'cards', 'iconText', 'icon', 'gallery', 'video', 'testimonial', 'faq', 'cta', 'form', 'booking', 'divider', 'spacer']

/* ── Section + page factories ───────────────────────────────────────────────
   Index-based local ids keep sections stable across reorders without needing a
   real uuid (the page id covers persistence). */
export const newSectionId = (existing = []) => {
  const taken = new Set(existing.map((s) => s.id))
  let n = 1
  while (taken.has(`s_${n}`)) n += 1
  return `s_${n}`
}

export const newSection = (type, existing = []) => {
  const def = BLOCK_TYPES[type]
  if (!def) return null
  return {
    id: newSectionId(existing),
    type,
    props: structuredClone(def.defaultProps),
    style: {},
  }
}

/* A fresh page's starting state for a given kind (before any edit). */
export const newSitePageDraft = (kind = 'landing') => ({
  kind: PAGE_KINDS.includes(kind) ? kind : 'landing',
  title: '',
  published: false,
  // NULL (not ''): the DB slug CHECK rejects '' and project_id is a uuid FK.
  slug: null,
  project_id: null,
  theme: structuredClone(DEFAULT_THEME),
  sections: [],
  config: {},
})

/* Public URL for a page. Pass the slug when set, else the uuid — both resolve
   under the kind's route (/p, /lead, /book). Absolute so it's shareable. */
export const publicSitePageUrl = (kind, slugOrId) =>
  `${window.location.origin}/${KIND_ROUTE[kind] || 'p'}/${slugOrId}`
