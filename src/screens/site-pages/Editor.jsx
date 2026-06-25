import { useMemo, useRef, useState } from 'react'
import {
  ArrowRight, Plus, Trash2, Monitor, Smartphone, GripVertical,
  Palette, Upload, X,
  LayoutTemplate, Type, Image as ImageIcon, Sparkles, Quote,
  MousePointerClick, ClipboardList, CalendarClock, Minus,
} from 'lucide-react'
import {
  BLOCK_TYPES, BLOCK_PALETTE, newSection, sitePageSurface,
  SITE_FONTS, LEAD_PAGE_BACKGROUNDS, DEFAULT_THEME, slugifyInput,
  FIELD_TYPES, isChoiceType, defaultChoiceOptions, freeFieldKey,
} from '../../lib/sitePageSchema'

/* Chrome icons for the "add section" palette (distinct from the curated
   CONTENT icon set in pageIcons that users pick inside icon/iconText blocks). */
const BLOCK_ICON = {
  hero: LayoutTemplate, text: Type, image: ImageIcon, iconText: Sparkles,
  testimonial: Quote, cta: MousePointerClick, form: ClipboardList,
  booking: CalendarClock, spacer: Minus,
}
import { ICON_NAMES, iconByName } from '../../lib/pageIcons'
import { uploadPageAsset, assetPathFromUrl, removePageAsset } from '../../lib/pageAssets'
import SiteRenderer from '../site-page/SiteRenderer'
import './SitePagesScreen.css'

/* ════════════════════════════════════════════════════════════════
   PAGE EDITOR — the block builder (canvas + inspector + design).
   ════════════════════════════════════════════════════════════════
   Three panes: a sections rail (add / reorder by drag / select / delete),
   a live canvas (SiteRenderer, reframed desktop⇄mobile), and a right panel
   that shows the selected section's inspector OR the page design panel.
   All edits mutate a local draft; "שמירה" persists via onSave. */

const clone = (v) => structuredClone(v)

export default function Editor({ page, onSave, onBack }) {
  const [draft, setDraft] = useState(() => ({
    title: page.title || '',
    published: !!page.published,
    slug: page.slug || '',
    kind: page.kind || 'landing',
    theme: { ...DEFAULT_THEME, ...(page.theme || {}) },
    sections: Array.isArray(page.sections) ? clone(page.sections) : [],
    config: page.config || {},
  }))
  const [selectedId, setSelectedId] = useState(null)
  const [device, setDevice] = useState('desktop')
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const dragIndex = useRef(null)

  const selected = useMemo(
    () => draft.sections.find((s) => s.id === selectedId) || null,
    [draft.sections, selectedId],
  )

  const mutate = (fn) => { setDraft((d) => { const next = fn(d); return next }); setDirty(true) }

  const setTheme = (patch) => mutate((d) => ({ ...d, theme: { ...d.theme, ...patch } }))
  const setConfig = (patch) => mutate((d) => ({ ...d, config: { ...d.config, ...patch } }))

  const addSection = (type) => {
    mutate((d) => {
      const sec = newSection(type, d.sections)
      return { ...d, sections: [...d.sections, sec] }
    })
    setPaletteOpen(false)
  }

  const deleteSection = (id) => {
    mutate((d) => ({ ...d, sections: d.sections.filter((s) => s.id !== id) }))
    if (selectedId === id) setSelectedId(null)
  }

  const updateProps = (id, patch) => mutate((d) => ({
    ...d,
    sections: d.sections.map((s) => (s.id === id ? { ...s, props: { ...s.props, ...patch } } : s)),
  }))

  const reorder = (from, to) => {
    if (from == null || to == null || from === to) return
    mutate((d) => {
      const arr = [...d.sections]
      const [moved] = arr.splice(from, 1)
      arr.splice(to, 0, moved)
      return { ...d, sections: arr }
    })
  }

  const save = async () => {
    setSaving(true)
    try {
      await onSave({
        title: draft.title, published: draft.published, slug: draft.slug || null,
        kind: draft.kind, theme: draft.theme, sections: draft.sections, config: draft.config,
      })
      setDirty(false)
    } finally { setSaving(false) }
  }

  /* Canvas click → select the clicked section (reads the nearest [data-sid]). */
  const onCanvasClick = (e) => {
    const el = e.target.closest('[data-sid]')
    if (el) setSelectedId(el.getAttribute('data-sid'))
  }

  return (
    <div className="spe">
      {/* ── Top bar ─────────────────────────────────────────────── */}
      <div className="spe-top">
        <button className="spe-icon-btn" onClick={onBack} title="חזרה"><ArrowRight size={18} /></button>
        <input
          className="spe-title-input"
          value={draft.title}
          placeholder="שם הדף (פנימי)"
          onChange={(e) => mutate((d) => ({ ...d, title: e.target.value }))}
        />
        <div className="spe-top-spacer" />
        <div className="spe-device">
          <button className={device === 'desktop' ? 'is-on' : ''} onClick={() => setDevice('desktop')} title="דסקטופ"><Monitor size={16} /></button>
          <button className={device === 'mobile' ? 'is-on' : ''} onClick={() => setDevice('mobile')} title="מובייל"><Smartphone size={16} /></button>
        </div>
        <label className="spe-pub">
          <input type="checkbox" checked={draft.published} onChange={(e) => mutate((d) => ({ ...d, published: e.target.checked }))} />
          <span>פרסום</span>
        </label>
        <button className="spe-save" onClick={save} disabled={saving || !dirty}>
          {saving ? 'שומר…' : dirty ? 'שמירה' : 'נשמר'}
        </button>
      </div>

      <div className="spe-body">
        {/* ── Sections rail ─────────────────────────────────────── */}
        <aside className="spe-rail">
          <div className="spe-rail-head">
            <span>סקשנים</span>
            <button className="spe-add" onClick={() => setPaletteOpen((v) => !v)}><Plus size={15} /> הוסף</button>
          </div>
          {paletteOpen ? (
            <div className="spe-palette">
              {BLOCK_PALETTE.map((type) => {
                const def = BLOCK_TYPES[type]
                const Icon = BLOCK_ICON[type] || Sparkles
                return (
                  <button key={type} className="spe-palette-item" onClick={() => addSection(type)}>
                    <Icon size={16} /><span>{def.label}</span>
                  </button>
                )
              })}
            </div>
          ) : null}
          <ul className="spe-seclist">
            {draft.sections.map((s, i) => (
              <li
                key={s.id}
                className={`spe-secitem${selectedId === s.id ? ' is-sel' : ''}`}
                draggable
                onDragStart={() => { dragIndex.current = i }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => { reorder(dragIndex.current, i); dragIndex.current = null }}
                onClick={() => setSelectedId(s.id)}
              >
                <GripVertical size={14} className="spe-grip" />
                <span className="spe-sec-label">{BLOCK_TYPES[s.type]?.label || s.type}</span>
                <button className="spe-sec-del" onClick={(e) => { e.stopPropagation(); deleteSection(s.id) }} title="מחיקה"><Trash2 size={13} /></button>
              </li>
            ))}
            {draft.sections.length === 0 ? <li className="spe-rail-empty">אין סקשנים עדיין</li> : null}
          </ul>
          <button className={`spe-design-btn${!selected ? ' is-on' : ''}`} onClick={() => setSelectedId(null)}>
            <Palette size={15} /> עיצוב הדף
          </button>
        </aside>

        {/* ── Canvas ────────────────────────────────────────────── */}
        <div className="spe-canvas-wrap">
          <div className={`spe-frame spe-frame-${device}`} onClick={onCanvasClick}>
            <SiteRenderer theme={draft.theme} sections={draft.sections} interactive={false} />
          </div>
        </div>

        {/* ── Right panel: inspector OR design ──────────────────── */}
        <aside className="spe-inspector">
          {selected
            ? <SectionInspector section={selected} onChange={(patch) => updateProps(selected.id, patch)} />
            : <DesignPanel theme={draft.theme} setTheme={setTheme}
                slug={draft.slug} onSlug={(v) => mutate((d) => ({ ...d, slug: v }))}
                kind={draft.kind} config={draft.config} setConfig={setConfig} />}
        </aside>
      </div>
    </div>
  )
}

/* ════════════════════════════════════════════════════════════════
   DESIGN PANEL — page-level theme (font / brand / background / glass).
   ════════════════════════════════════════════════════════════════ */
function DesignPanel({ theme, setTheme, slug, onSlug, kind, config, setConfig }) {
  const bg = theme.background || DEFAULT_THEME.background
  return (
    <div className="spe-panel">
      <h3 className="spe-panel-title">עיצוב הדף</h3>

      <label className="spe-f">
        <span>כתובת ציבורית (/p/…)</span>
        <input value={slug || ''} placeholder="my-page" onChange={(e) => onSlug(slugifyInput(e.target.value))} />
      </label>

      <label className="spe-f">
        <span>פונט</span>
        <select value={theme.font} onChange={(e) => setTheme({ font: e.target.value })}>
          {SITE_FONTS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
        </select>
      </label>

      <label className="spe-f spe-f-row">
        <span>צבע מותג</span>
        <input type="color" value={theme.brandColor} onChange={(e) => setTheme({ brandColor: e.target.value })} />
      </label>

      <div className="spe-f">
        <span>רקע</span>
        <div className="spe-seg">
          {[['scene', 'תמונה'], ['flat', 'צבע'], ['image', 'העלאה']].map(([k, lbl]) => (
            <button key={k} className={bg.type === k ? 'is-on' : ''}
              onClick={() => setTheme({ background: { type: k, value: k === 'flat' ? '#f7f3ee' : (k === 'scene' ? 'home' : '') } })}>
              {lbl}
            </button>
          ))}
        </div>
      </div>

      {bg.type === 'scene' ? (
        <div className="spe-scenes">
          {LEAD_PAGE_BACKGROUNDS.map((s) => (
            <button key={s.key} className={`spe-scene${bg.value === s.key ? ' is-on' : ''}`}
              onClick={() => setTheme({ background: { type: 'scene', value: s.key } })} title={s.label}>
              <img src={`/backgrounds/desktop/day/${s.key}.webp`} alt={s.label} loading="lazy" />
            </button>
          ))}
        </div>
      ) : null}
      {bg.type === 'flat' ? (
        <label className="spe-f spe-f-row"><span>צבע רקע</span>
          <input type="color" value={bg.value || '#f7f3ee'} onChange={(e) => setTheme({ background: { type: 'flat', value: e.target.value } })} />
        </label>
      ) : null}
      {bg.type === 'image' ? (
        <ImageField value={bg.value} onChange={(url) => setTheme({ background: { type: 'image', value: url } })} />
      ) : null}

      <Slider label="שקיפות כרטיס" min={0} max={100} value={theme.cardOpacity} onChange={(v) => setTheme({ cardOpacity: v })} />
      <Slider label="טשטוש זכוכית" min={0} max={40} value={theme.cardBlur} onChange={(v) => setTheme({ cardBlur: v })} />
      <Slider label="עיגול פינות" min={8} max={40} value={theme.cardRadius} onChange={(v) => setTheme({ cardRadius: v })} />

      <label className="spe-f spe-f-row"><span>טקסט בהיר (לרקע כהה)</span>
        <input type="checkbox" checked={theme.textColor === 'light'} onChange={(e) => setTheme({ textColor: e.target.checked ? 'light' : 'dark' })} />
      </label>
      <label className="spe-f spe-f-row"><span>מודגש</span>
        <input type="checkbox" checked={!!theme.bold} onChange={(e) => setTheme({ bold: e.target.checked })} />
      </label>
      <label className="spe-f spe-f-row"><span>מרכוז</span>
        <input type="checkbox" checked={theme.textAlign === 'center'} onChange={(e) => setTheme({ textAlign: e.target.checked ? 'center' : 'start' })} />
      </label>

      {/* Lead-capture settings (config) — pages with a form section. */}
      {kind === 'lead' ? <LeadSettings config={config || {}} setConfig={setConfig} /> : null}
    </div>
  )
}

/* Lead-page settings that live in page `config` (not a visual section):
   the manual-approval gate + the post-submit thank-you. */
function LeadSettings({ config, setConfig }) {
  const ty = config.thankYou || { mode: 'message', message: '', url: '' }
  const setTy = (patch) => setConfig({ thankYou: { ...ty, ...patch } })
  return (
    <>
      <h3 className="spe-panel-title" style={{ marginTop: 8 }}>הגדרות טופס</h3>
      <label className="spe-f spe-f-row"><span>אישור אוטומטי (דילוג על בדיקה ידנית)</span>
        <input type="checkbox" checked={!!config.autoApprove} onChange={(e) => setConfig({ autoApprove: e.target.checked })} />
      </label>
      <label className="spe-f"><span>אחרי שליחה</span>
        <select value={ty.mode || 'message'} onChange={(e) => setTy({ mode: e.target.value })}>
          <option value="message">הצגת הודעת תודה</option>
          <option value="redirect">הפניה לכתובת</option>
        </select>
      </label>
      {ty.mode === 'redirect'
        ? <label className="spe-f"><span>כתובת הפניה</span><input placeholder="https://…" value={ty.url || ''} onChange={(e) => setTy({ url: e.target.value })} /></label>
        : <label className="spe-f"><span>הודעת תודה</span><textarea rows={2} value={ty.message || ''} onChange={(e) => setTy({ message: e.target.value })} /></label>}
    </>
  )
}

function Slider({ label, min, max, value, onChange }) {
  return (
    <label className="spe-f">
      <span>{label} · {value}</span>
      <input type="range" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  )
}

/* ════════════════════════════════════════════════════════════════
   SECTION INSPECTOR — renders inputs from BLOCK_TYPES[type].editable.
   ════════════════════════════════════════════════════════════════ */
function SectionInspector({ section, onChange }) {
  const def = BLOCK_TYPES[section.type]
  if (!def) return null
  const props = section.props || {}
  return (
    <div className="spe-panel">
      <h3 className="spe-panel-title">{def.label}</h3>
      {def.editable.map((d) => (
        <Descriptor key={d.key} d={d} value={props[d.key]} onChange={(v) => onChange({ [d.key]: v })} />
      ))}
    </div>
  )
}

function Descriptor({ d, value, onChange }) {
  switch (d.type) {
    case 'text':
      return <label className="spe-f"><span>{d.label}</span><input value={value ?? ''} onChange={(e) => onChange(e.target.value)} /></label>
    case 'textarea':
    case 'richtext':
      return <label className="spe-f"><span>{d.label}</span><textarea rows={d.type === 'richtext' ? 5 : 3} value={value ?? ''} onChange={(e) => onChange(e.target.value)} /></label>
    case 'number':
      return <label className="spe-f"><span>{d.label}</span><input type="number" value={value ?? 0} onChange={(e) => onChange(Number(e.target.value))} /></label>
    case 'toggle':
      return <label className="spe-f spe-f-row"><span>{d.label}</span><input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} /></label>
    case 'color':
      return <label className="spe-f spe-f-row"><span>{d.label}</span><input type="color" value={value || '#000000'} onChange={(e) => onChange(e.target.value)} /></label>
    case 'select':
      return (
        <label className="spe-f"><span>{d.label}</span>
          <select value={value ?? d.options[0]} onChange={(e) => onChange(e.target.value)}>
            {d.options.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </label>
      )
    case 'image':
      return <div className="spe-f"><span>{d.label}</span><ImageField value={value} onChange={onChange} /></div>
    case 'icon':
      return <div className="spe-f"><span>{d.label}</span><IconPicker value={value} onChange={onChange} /></div>
    case 'action':
      return <div className="spe-f"><span>{d.label}</span><ActionField value={value} onChange={onChange} /></div>
    case 'list':
      return <ListField d={d} value={value} onChange={onChange} />
    case 'formFields':
      return <FormFieldsEditor value={value} onChange={onChange} />
    case 'availability':
      return <div className="spe-f"><span>{d.label}</span><p className="spe-note">עורך הזמינות מגיע בשלב הבא (קיפול דפי הפגישות למנוע).</p></div>
    default:
      return null
  }
}

function ImageField({ value, onChange }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const inputRef = useRef(null)
  const pick = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setErr(''); setBusy(true)
    try {
      const { url } = await uploadPageAsset(file)
      onChange(url)
    } catch (ex) { setErr(ex.message || 'ההעלאה נכשלה') } finally { setBusy(false); if (inputRef.current) inputRef.current.value = '' }
  }
  const clear = () => {
    const path = assetPathFromUrl(value)
    if (path) removePageAsset(path)
    onChange('')
  }
  return (
    <div className="spe-image">
      {value ? <div className="spe-image-prev"><img src={value} alt="" /><button onClick={clear} title="הסרה"><X size={14} /></button></div> : null}
      <button className="spe-upload" onClick={() => inputRef.current?.click()} disabled={busy}>
        <Upload size={14} /> {busy ? 'מעלה…' : value ? 'החלפה' : 'העלאת תמונה'}
      </button>
      <input ref={inputRef} type="file" accept="image/*" hidden onChange={pick} />
      {err ? <p className="spe-err">{err}</p> : null}
    </div>
  )
}

function IconPicker({ value, onChange }) {
  return (
    <div className="spe-iconpick">
      {ICON_NAMES.map((name) => {
        const Icon = iconByName(name)
        return (
          <button key={name} className={`spe-iconcell${value === name ? ' is-on' : ''}`} onClick={() => onChange(name)} title={name}>
            <Icon size={18} />
          </button>
        )
      })}
    </div>
  )
}

function ActionField({ value, onChange }) {
  const a = value || { type: 'link', url: '' }
  return (
    <div className="spe-action">
      <select value={a.type} onChange={(e) => onChange({ ...a, type: e.target.value })}>
        <option value="link">קישור חיצוני</option>
        <option value="scrollToForm">גלילה לטופס</option>
        <option value="booking">קביעת פגישה</option>
      </select>
      {a.type === 'link' ? (
        <input placeholder="https://…" value={a.url || ''} onChange={(e) => onChange({ ...a, url: e.target.value })} />
      ) : null}
    </div>
  )
}

function ListField({ d, value, onChange }) {
  const items = Array.isArray(value) ? value : []
  const setItem = (i, patch) => onChange(items.map((it, j) => (j === i ? { ...it, ...patch } : it)))
  const add = () => onChange([...items, Object.fromEntries(d.item.map((f) => [f.key, f.type === 'icon' ? 'Check' : '']))])
  const remove = (i) => onChange(items.filter((_, j) => j !== i))
  return (
    <div className="spe-f">
      <span>{d.label}</span>
      {items.map((it, i) => (
        <div className="spe-listitem" key={i}>
          <div className="spe-listitem-head"><span>#{i + 1}</span><button onClick={() => remove(i)}><Trash2 size={13} /></button></div>
          {d.item.map((f) => (
            <Descriptor key={f.key} d={f} value={it[f.key]} onChange={(v) => setItem(i, { [f.key]: v })} />
          ))}
        </div>
      ))}
      <button className="spe-add-row" onClick={add}><Plus size={14} /> הוספת פריט</button>
    </div>
  )
}

/* Compact lead-form field editor (label + type + required), reusing the
   lead-page field model. Builtin fields keep their key; free fields get one. */
function FormFieldsEditor({ value, onChange }) {
  const fields = Array.isArray(value) ? value : []
  const setField = (i, patch) => onChange(fields.map((f, j) => (j === i ? { ...f, ...patch } : f)))
  const remove = (i) => onChange(fields.filter((_, j) => j !== i))
  const add = () => onChange([...fields, { key: freeFieldKey(fields), label: 'שדה חדש', type: 'text', required: false, builtin: false }])
  return (
    <div className="spe-f">
      <span>שדות הטופס</span>
      {fields.map((f, i) => (
        <div className="spe-listitem" key={f.key}>
          <div className="spe-listitem-head">
            <input className="spe-flex" value={f.label} onChange={(e) => setField(i, { label: e.target.value })} />
            {!f.builtin ? <button onClick={() => remove(i)}><Trash2 size={13} /></button> : null}
          </div>
          <div className="spe-field-row">
            <select value={f.type} disabled={f.builtin} onChange={(e) => setField(i, { type: e.target.value, ...(isChoiceType(e.target.value) && !f.options ? { options: defaultChoiceOptions() } : {}) })}>
              {FIELD_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <label className="spe-req-toggle"><input type="checkbox" checked={!!f.required} onChange={(e) => setField(i, { required: e.target.checked })} /> חובה</label>
          </div>
          {isChoiceType(f.type) ? (
            <input className="spe-flex" placeholder="אפשרויות, מופרדות בפסיק"
              value={(f.options || []).join(', ')}
              onChange={(e) => setField(i, { options: e.target.value.split(',').map((o) => o.trim()).filter(Boolean) })} />
          ) : null}
        </div>
      ))}
      <button className="spe-add-row" onClick={add}><Plus size={14} /> הוספת שדה</button>
    </div>
  )
}
