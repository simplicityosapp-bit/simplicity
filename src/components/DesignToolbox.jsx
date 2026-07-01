import { useState } from 'react'
import { SlidersHorizontal, X } from 'lucide-react'
import { LEAD_PAGE_BACKGROUNDS, leadPageBgUrl } from '../lib/leadPageSchema'
import './DesignToolbox.css'
import { Box, Txt, Btn, Input } from './ui'

/* Curated on-brand quick-pick palette — leans on the Mångata accent family
   (warm clays → sage → dusk) so a one-tap colour always reads premium.
   The full colour picker stays available for anything off-palette. */
const BRAND_PRESETS = [
  '#C97B5E', // terracotta (default brand)
  '#B0654F', // rosewood clay
  '#D08A4E', // amber
  '#C8A84E', // gold
  '#8BA888', // sage
  '#5AA89C', // teal
  '#6E8CA8', // dusk blue
  '#8A6BA8', // plum
]

/* Card-corner steps — named + precise. 24 = the original look (default). */
const RADII = [
  { v: 14, label: 'חד' },
  { v: 24, label: 'רגיל' },
  { v: 34, label: 'רך' },
]

/* ════════════════════════════════════════════════════════════════
   DESIGN TOOLBOX — "ארגז כלים"
   ════════════════════════════════════════════════════════════════
   A shared left-side slide-out panel that holds EVERY appearance control
   for a public page (brand colour, background, card opacity, blur, bold,
   text colour + alignment). Used by both the lead-pages and booking-pages
   builders so the design model is identical and extensible — new tools
   slot in here, not into the (now functional-only) settings panel.

   Props:
     • content  — the page's content object (brandColor, background,
       cardOpacity, cardBlur, bold, textColor, textAlign)
     • onChange — (patch) => void, merged into content (live preview)

   Control styling (lpe-design*, lpe-bg-*, lpe-slider-*, lpe-seg*, lpb-color)
   is shared with the builders' CSS, already loaded on these screens. */
export default function DesignToolbox({ content, onChange }) {
  const [open, setOpen] = useState(false)
  const c = content || {}
  const set = (patch) => onChange?.(patch)
  const curBrand = (c.brandColor || '#C97B5E').toLowerCase()
  const curRadius = typeof c.cardRadius === 'number' ? c.cardRadius : 24

  return (
    <>
      <Btn
        type="button"
        className={`dtb-fab${open ? ' is-open' : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="ארגז כלים — עיצוב הדף"
      >
        <SlidersHorizontal size={18} strokeWidth={1.7} aria-hidden="true" />
        <Txt className="dtb-fab-label">ארגז כלים</Txt>
      </Btn>

      {open && <Box className="dtb-scrim" onClick={() => setOpen(false)} aria-hidden="true" />}

      <Box as="aside" className={`dtb-panel${open ? ' open' : ''}`} dir="rtl" aria-label="ארגז כלים">
        <Box as="header" className="dtb-head">
          <Txt className="dtb-title"><SlidersHorizontal size={16} strokeWidth={1.7} aria-hidden="true" /> ארגז כלים</Txt>
          <Btn type="button" className="dtb-close" onClick={() => setOpen(false)} aria-label="סגירה"><X size={18} strokeWidth={1.8} /></Btn>
        </Box>

        <Box className="dtb-body">
          <Box className="dtb-group">
            <Txt as="p" className="dtb-group-lbl">צבע מותג</Txt>
            <Box className="dtb-presets" role="group" aria-label="צבעים מוכנים">
              {BRAND_PRESETS.map((hex) => {
                const on = curBrand === hex.toLowerCase()
                return (
                  <Btn
                    key={hex}
                    type="button"
                    className={`dtb-preset${on ? ' on' : ''}`}
                    style={{ '--sw': hex }}
                    onClick={() => set({ brandColor: hex })}
                    aria-label={`צבע ${hex}`}
                    aria-pressed={on}
                    title={hex}
                  />
                )
              })}
            </Box>
            <Box className="lpb-color">
              <Input type="color" value={c.brandColor || '#C97B5E'} onChange={(e) => set({ brandColor: e.target.value })} />
              <Txt className="lpb-color-hex mono">{c.brandColor || '#C97B5E'}</Txt>
            </Box>
          </Box>

          <Box className="dtb-group">
            <Txt as="p" className="dtb-group-lbl">רקע</Txt>
            <Box className="lpe-bg-grid">
              <Btn type="button" className={`lpe-bg-swatch lpe-bg-none${!c.background ? ' on' : ''}`} onClick={() => set({ background: '' })}>ללא</Btn>
              {LEAD_PAGE_BACKGROUNDS.map((b) => (
                <Btn
                  key={b.key}
                  type="button"
                  className={`lpe-bg-swatch${c.background === b.key ? ' on' : ''}`}
                  style={{ backgroundImage: `url(${leadPageBgUrl(b.key)})` }}
                  onClick={() => set({ background: b.key })}
                  aria-label={b.label}
                  title={b.label}
                />
              ))}
            </Box>
          </Box>

          <Box className="dtb-group">
            <Box className="lpe-slider-row">
              <Txt className="lpe-design-lbl">שקיפות הכרטיס</Txt>
              <Input type="range" min="0" max="100" value={100 - (c.cardOpacity ?? 100)} onChange={(e) => set({ cardOpacity: 100 - Number(e.target.value) })} />
              <Txt className="lpe-slider-val mono">{100 - (c.cardOpacity ?? 100)}%</Txt>
            </Box>
            <Box className="lpe-slider-row">
              <Txt className="lpe-design-lbl">טשטוש רקע</Txt>
              <Input type="range" min="0" max="30" value={c.cardBlur ?? 14} onChange={(e) => set({ cardBlur: Number(e.target.value) })} />
              <Txt className="lpe-slider-val mono">{c.cardBlur ?? 14}px</Txt>
            </Box>
          </Box>

          <Box className="dtb-group">
            <Box className="lpe-seg-row">
              <Txt className="lpe-design-lbl">פינות הכרטיס</Txt>
              <Box className="lpe-seg">
                {RADII.map((r) => (
                  <Btn
                    key={r.v}
                    type="button"
                    className={`lpe-seg-btn${curRadius === r.v ? ' on' : ''}`}
                    onClick={() => set({ cardRadius: r.v })}
                  >
                    {r.label}
                  </Btn>
                ))}
              </Box>
            </Box>
          </Box>

          <Box className="dtb-group">
            <Box as="label" className="lpe-design-toggle">
              <Input type="checkbox" checked={!!c.bold} onChange={(e) => set({ bold: e.target.checked })} />
              טקסט מודגש
            </Box>
          </Box>

          <Box className="dtb-group">
            <Box className="lpe-seg-row">
              <Txt className="lpe-design-lbl">צבע טקסט</Txt>
              <Box className="lpe-seg">
                <Btn type="button" className={`lpe-seg-btn${c.textColor !== 'light' ? ' on' : ''}`} onClick={() => set({ textColor: 'dark' })}>כהה</Btn>
                <Btn type="button" className={`lpe-seg-btn${c.textColor === 'light' ? ' on' : ''}`} onClick={() => set({ textColor: 'light' })}>בהיר</Btn>
              </Box>
            </Box>
            <Box className="lpe-seg-row">
              <Txt className="lpe-design-lbl">יישור טקסט</Txt>
              <Box className="lpe-seg">
                <Btn type="button" className={`lpe-seg-btn${c.textAlign !== 'center' ? ' on' : ''}`} onClick={() => set({ textAlign: 'start' })}>ימין</Btn>
                <Btn type="button" className={`lpe-seg-btn${c.textAlign === 'center' ? ' on' : ''}`} onClick={() => set({ textAlign: 'center' })}>מרכז</Btn>
              </Box>
            </Box>
          </Box>
        </Box>
      </Box>
    </>
  )
}
