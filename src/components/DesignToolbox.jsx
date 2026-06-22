import { useState } from 'react'
import { SlidersHorizontal, X } from 'lucide-react'
import { LEAD_PAGE_BACKGROUNDS, leadPageBgUrl } from '../lib/leadPageSchema'
import './DesignToolbox.css'

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

  return (
    <>
      <button
        type="button"
        className={`dtb-fab${open ? ' is-open' : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="ארגז כלים — עיצוב הדף"
      >
        <SlidersHorizontal size={18} strokeWidth={1.7} aria-hidden="true" />
        <span className="dtb-fab-label">ארגז כלים</span>
      </button>

      {open && <div className="dtb-scrim" onClick={() => setOpen(false)} aria-hidden="true" />}

      <aside className={`dtb-panel${open ? ' open' : ''}`} dir="rtl" aria-label="ארגז כלים">
        <header className="dtb-head">
          <span className="dtb-title"><SlidersHorizontal size={16} strokeWidth={1.7} aria-hidden="true" /> ארגז כלים</span>
          <button type="button" className="dtb-close" onClick={() => setOpen(false)} aria-label="סגירה"><X size={18} strokeWidth={1.8} /></button>
        </header>

        <div className="dtb-body">
          <div className="dtb-group">
            <p className="dtb-group-lbl">צבע מותג</p>
            <div className="lpb-color">
              <input type="color" value={c.brandColor || '#C97B5E'} onChange={(e) => set({ brandColor: e.target.value })} />
              <span className="lpb-color-hex mono">{c.brandColor || '#C97B5E'}</span>
            </div>
          </div>

          <div className="dtb-group">
            <p className="dtb-group-lbl">רקע</p>
            <div className="lpe-bg-grid">
              <button type="button" className={`lpe-bg-swatch lpe-bg-none${!c.background ? ' on' : ''}`} onClick={() => set({ background: '' })}>ללא</button>
              {LEAD_PAGE_BACKGROUNDS.map((b) => (
                <button
                  key={b.key}
                  type="button"
                  className={`lpe-bg-swatch${c.background === b.key ? ' on' : ''}`}
                  style={{ backgroundImage: `url(${leadPageBgUrl(b.key)})` }}
                  onClick={() => set({ background: b.key })}
                  aria-label={b.label}
                  title={b.label}
                />
              ))}
            </div>
          </div>

          <div className="dtb-group">
            <div className="lpe-slider-row">
              <span className="lpe-design-lbl">שקיפות הכרטיס</span>
              <input type="range" min="0" max="100" value={100 - (c.cardOpacity ?? 100)} onChange={(e) => set({ cardOpacity: 100 - Number(e.target.value) })} />
              <span className="lpe-slider-val mono">{100 - (c.cardOpacity ?? 100)}%</span>
            </div>
            <div className="lpe-slider-row">
              <span className="lpe-design-lbl">טשטוש רקע</span>
              <input type="range" min="0" max="30" value={c.cardBlur ?? 14} onChange={(e) => set({ cardBlur: Number(e.target.value) })} />
              <span className="lpe-slider-val mono">{c.cardBlur ?? 14}px</span>
            </div>
          </div>

          <div className="dtb-group">
            <label className="lpe-design-toggle">
              <input type="checkbox" checked={!!c.bold} onChange={(e) => set({ bold: e.target.checked })} />
              טקסט מודגש
            </label>
          </div>

          <div className="dtb-group">
            <div className="lpe-seg-row">
              <span className="lpe-design-lbl">צבע טקסט</span>
              <div className="lpe-seg">
                <button type="button" className={`lpe-seg-btn${c.textColor !== 'light' ? ' on' : ''}`} onClick={() => set({ textColor: 'dark' })}>כהה</button>
                <button type="button" className={`lpe-seg-btn${c.textColor === 'light' ? ' on' : ''}`} onClick={() => set({ textColor: 'light' })}>בהיר</button>
              </div>
            </div>
            <div className="lpe-seg-row">
              <span className="lpe-design-lbl">יישור טקסט</span>
              <div className="lpe-seg">
                <button type="button" className={`lpe-seg-btn${c.textAlign !== 'center' ? ' on' : ''}`} onClick={() => set({ textAlign: 'start' })}>ימין</button>
                <button type="button" className={`lpe-seg-btn${c.textAlign === 'center' ? ' on' : ''}`} onClick={() => set({ textAlign: 'center' })}>מרכז</button>
              </div>
            </div>
          </div>
        </div>
      </aside>
    </>
  )
}
