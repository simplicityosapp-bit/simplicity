import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowRight, Plus, Trash2, Monitor, Smartphone, GripVertical,
  Palette, Upload, X, ChevronUp, ChevronDown, Maximize2, Minimize2,
  LayoutTemplate, Type, Image as ImageIcon, Sparkles, Quote,
  MousePointerClick, ClipboardList, CalendarClock, Minus,
  LayoutGrid, Smile, Images, Video, HelpCircle, SeparatorHorizontal, Copy,
  Bold, Italic, List, Heading, Link as LinkIcon, Undo2, Redo2,
} from 'lucide-react'
import {
  BLOCK_TYPES, BLOCK_PALETTE, newSection, newSectionId, sitePageSurface,
  SITE_FONTS, LEAD_PAGE_BACKGROUNDS, DEFAULT_THEME, slugifyInput, isValidSlug,
  FIELD_TYPES, isChoiceType, defaultChoiceOptions, freeFieldKey,
} from '../../lib/sitePageSchema'

/* Key-order-independent serializer — so comparing the draft to a snapshot read
   back from a Postgres jsonb column (which normalises key order) is stable. */
const sortKeys = (v) => Array.isArray(v) ? v.map(sortKeys)
  : (v && typeof v === 'object') ? Object.keys(v).sort().reduce((o, k) => { o[k] = sortKeys(v[k]); return o }, {})
  : v
const canon = (v) => JSON.stringify(sortKeys(v))

/* Walk any props value and collect the storage paths of every uploaded asset it
   references (image url, testimonial avatar, gallery items…). External links
   aren't page-assets, so assetPathFromUrl returns null and skips them. */
const collectAssetPaths = (val, acc = []) => {
  if (typeof val === 'string') { const p = assetPathFromUrl(val); if (p) acc.push(p) }
  else if (Array.isArray(val)) val.forEach((v) => collectAssetPaths(v, acc))
  else if (val && typeof val === 'object') Object.values(val).forEach((v) => collectAssetPaths(v, acc))
  return acc
}

/* Chrome icons for the "add section" palette (distinct from the curated
   CONTENT icon set in pageIcons that users pick inside icon/iconText blocks). */
const BLOCK_ICON = {
  hero: LayoutTemplate, text: Type, image: ImageIcon, iconText: Sparkles,
  testimonial: Quote, cta: MousePointerClick, form: ClipboardList,
  booking: CalendarClock, spacer: Minus,
  cards: LayoutGrid, icon: Smile, gallery: Images, video: Video,
  faq: HelpCircle, divider: SeparatorHorizontal,
}
import { ICON_NAMES, iconByName } from '../../lib/pageIcons'
import { uploadPageAsset, assetPathFromUrl, removePageAsset } from '../../lib/pageAssets'
import { useProjects } from '../../hooks/useProjects'
import { useBookingPages } from '../../hooks/useBookingPages'
import { useT } from '../../i18n/useT'
import './siteBuilderI18n'
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
  const { t } = useT('siteBuilder')
  const { projects } = useProjects()
  const [draft, setDraft] = useState(() => ({
    title: page.title || '',
    published: !!page.published,
    slug: page.slug || '',
    kind: page.kind || 'landing',
    project_id: page.project_id || '',
    theme: { ...DEFAULT_THEME, ...(page.theme || {}) },
    sections: Array.isArray(page.sections) ? clone(page.sections) : [],
    config: page.config || {},
  }))
  const [selectedId, setSelectedId] = useState(null)
  const [device, setDevice] = useState('desktop')
  const [focusMode, setFocusMode] = useState(false) // hide rail+inspector → full-size page view
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [mobileSheet, setMobileSheet] = useState(false) // inspector bottom-sheet (mobile)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [saveError, setSaveError] = useState(null)
  const [publishedSnapshot, setPublishedSnapshot] = useState(() => page.published_snapshot || null)
  const dragIndex = useRef(null)
  const [dragging, setDragging] = useState(null)   // index being dragged
  const [dragOver, setDragOver] = useState(null)   // index hovered as drop target
  const [pendingDel, setPendingDel] = useState(null) // { section, index, paths } awaiting undo
  const delTimer = useRef(null)
  const draftRef = useRef(draft)                   // latest draft for deferred asset cleanup
  useEffect(() => { draftRef.current = draft }, [draft])

  /* Scroll the selected (or just-added) section into view — desktop: only if
     off-screen; mobile: to the top of the canvas sliver above the sheet. ONE
     instant scroll via rAF, cancelled on change. (Two competing *smooth*
     scrollIntoView calls on add were leaving the canvas scroll stuck at the top
     until a refresh.) */
  useEffect(() => {
    if (!selectedId) return undefined
    const id = setTimeout(() => {            // wait for the add/reorder layout to settle
      const el = document.querySelector(`.spe-frame [data-sid="${selectedId}"]`)
      if (el) el.scrollIntoView({ block: window.matchMedia('(max-width: 767px)').matches ? 'start' : 'nearest' })
    }, 60)
    return () => clearTimeout(id)
  }, [selectedId])

  const selected = useMemo(
    () => draft.sections.find((s) => s.id === selectedId) || null,
    [draft.sections, selectedId],
  )

  /* Warn before losing unsaved edits on browser refresh / tab close. */
  useEffect(() => {
    if (!dirty) return undefined
    const onBeforeUnload = (e) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirty])

  /* Back arrow — confirm if there are unsaved edits. */
  const handleBack = () => {
    if (dirty && !window.confirm(t('editor.confirmDiscard'))) return
    onBack()
  }

  /* ── Undo / redo ───────────────────────────────────────────────────────────
     Every content edit funnels through mutate(), so history hangs off it. Each
     entry snapshots the editable content (NOT `published`/UI flags). Rapid edits
     within COALESCE_MS (a slider drag, fast typing) fold into ONE step so undo
     doesn't crawl value-by-value. All draft objects are replaced immutably, so a
     snapshot can hold references safely (the old objects are never mutated). */
  const HISTORY_CAP = 100
  const COALESCE_MS = 450
  const hist = useRef({ past: [], future: [], lastT: 0 })
  const snapshot = (d) => ({ title: d.title, slug: d.slug, kind: d.kind, project_id: d.project_id, theme: d.theme, sections: d.sections, config: d.config })

  // `immediate` = a STRUCTURAL edit (add / delete / duplicate / reorder / layering):
  // always its own history step, never coalesced into a neighbouring value edit.
  const mutate = (fn, immediate) => {
    const h = hist.current
    const now = Date.now()
    if (immediate || h.past.length === 0 || now - h.lastT > COALESCE_MS) {
      h.past.push(snapshot(draft))
      if (h.past.length > HISTORY_CAP) h.past.shift()
    }
    h.lastT = immediate ? 0 : now                 // structural step: the NEXT edit also starts fresh
    h.future = []                                 // a fresh edit discards the redo branch
    setDraft((d) => fn(d))
    setDirty(true)
  }

  const restore = (snap) => {
    setDraft((d) => ({ ...d, ...snap }))
    if (selectedId && !snap.sections.some((s) => s.id === selectedId)) setSelectedId(null)
    setPendingDel(null)                           // a stale "deleted" toast must not re-insert (→ duplicate id)
    setDirty(true)
  }
  const undo = () => {
    const h = hist.current
    if (!h.past.length) return
    h.future.push(snapshot(draft))
    restore(h.past.pop())
    h.lastT = 0                                   // next edit starts a new step (no coalesce across an undo)
  }
  const redo = () => {
    const h = hist.current
    if (!h.future.length) return
    h.past.push(snapshot(draft))
    restore(h.future.pop())
    h.lastT = 0
  }
  const canUndo = hist.current.past.length > 0
  const canRedo = hist.current.future.length > 0

  /* Ctrl/⌘+Z = undo, Ctrl/⌘+Shift+Z or Ctrl+Y = redo. Skipped while a text field
     is focused so the browser's native text undo still works there. */
  const histKeyRef = useRef({})
  histKeyRef.current = { undo, redo }
  useEffect(() => {
    const onKey = (e) => {
      if (!(e.ctrlKey || e.metaKey)) return
      const k = e.key.toLowerCase()
      if (k !== 'z' && k !== 'y') return
      const a = document.activeElement
      if (a && (a.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(a.tagName))) return
      e.preventDefault()
      if (k === 'y' || (k === 'z' && e.shiftKey)) histKeyRef.current.redo()
      else histKeyRef.current.undo()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const setTheme = (patch) => mutate((d) => ({ ...d, theme: { ...d.theme, ...patch } }))
  const setConfig = (patch) => mutate((d) => ({ ...d, config: { ...d.config, ...patch } }))

  const addSection = (type) => {
    const sec = newSection(type, draft.sections)
    if (!sec) return
    mutate((d) => ({ ...d, sections: [...d.sections, sec] }), true)
    setSelectedId(sec.id)               // auto-select → the scroll-into-view effect brings it into view
    setMobileSheet(true)                // …and open the editor sheet on mobile
    setPaletteOpen(false)
  }

  /* Remove only the asset paths that NO remaining section references — so a delete
     never orphans an upload, and never breaks an image shared with a duplicate. */
  const cleanupAssets = (paths, sections) => {
    const used = new Set(sections.flatMap((s) => collectAssetPaths(s.props)))
    paths.forEach((p) => { if (!used.has(p)) removePageAsset(p) })
  }
  /* Settle a pending delete now: actually clean up its (still-unused) assets. */
  const commitPendingDelete = () => {
    if (delTimer.current) { clearTimeout(delTimer.current); delTimer.current = null }
    if (pendingDel) cleanupAssets(pendingDel.paths, draftRef.current.sections)
    setPendingDel(null)
  }

  const deleteSection = (id) => {
    commitPendingDelete()                       // settle any earlier pending delete first
    const index = draft.sections.findIndex((s) => s.id === id)
    if (index < 0) return
    const removed = draft.sections[index]
    mutate((d) => ({ ...d, sections: d.sections.filter((s) => s.id !== id) }), true)
    if (selectedId === id) setSelectedId(null)
    const paths = collectAssetPaths(removed.props)
    setPendingDel({ section: removed, index, paths })
    // Defer asset cleanup so an undo can restore the section with its images intact.
    delTimer.current = setTimeout(() => {
      cleanupAssets(paths, draftRef.current.sections)
      delTimer.current = null; setPendingDel(null)
    }, 7000)
  }

  const undoDelete = () => {
    const pd = pendingDel
    if (!pd) return
    if (delTimer.current) { clearTimeout(delTimer.current); delTimer.current = null }
    // If a general undo (Ctrl+Z) already restored this section, don't re-insert it
    // (that would create a duplicate id).
    if (draft.sections.some((s) => s.id === pd.section.id)) { setPendingDel(null); return }
    mutate((d) => {
      const arr = [...d.sections]
      arr.splice(Math.min(pd.index, arr.length), 0, pd.section)
      return { ...d, sections: arr }
    }, true)
    setSelectedId(pd.section.id)
    setPendingDel(null)
  }

  /* Delete / Backspace removes the SELECTED block straight from the canvas — but
     never while typing in a field / editing text in place (ref keeps the handler
     reading the latest selectedId + deleteSection without re-binding each render). */
  const keyDelRef = useRef({})
  keyDelRef.current = { selectedId, deleteSection }
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return
      const { selectedId: sid, deleteSection: del } = keyDelRef.current
      if (!sid) return
      const a = document.activeElement
      if (a && (a.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(a.tagName))) return
      e.preventDefault()
      del(sid)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const duplicateSection = (id) => {
    const orig = draft.sections.find((s) => s.id === id)
    if (!orig) return
    const copy = { ...structuredClone(orig), id: newSectionId(draft.sections) }
    mutate((d) => {
      const i = d.sections.findIndex((s) => s.id === id)
      const arr = [...d.sections]; arr.splice(i < 0 ? arr.length : i + 1, 0, copy)
      return { ...d, sections: arr }
    }, true)
    setSelectedId(copy.id)
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
    }, true)
  }

  /* The version that defines "what's on the page" (compared to the published
     snapshot to detect unpublished changes). Uses a key-order-independent
     serializer: the snapshot comes back from a Postgres jsonb column, which
     normalises key order, so a raw JSON.stringify would always mis-compare and
     show a freshly-published page as having unpublished changes. */
  // Memoized: canon() deep-sorts + stringifies the whole page, so don't re-run it
  // on every keystroke render — only when the draft content or snapshot changes.
  const hasUnpublishedChanges = useMemo(
    () => !!draft.published && canon({ theme: draft.theme, sections: draft.sections, config: draft.config }) !== canon(publishedSnapshot || {}),
    [draft.published, draft.theme, draft.sections, draft.config, publishedSnapshot],
  )

  const baseFields = () => ({
    title: draft.title, slug: draft.slug || null, kind: draft.kind,
    project_id: draft.project_id || null, theme: draft.theme, sections: draft.sections, config: draft.config,
  })

  /* Save the DRAFT only — does not change what visitors see. */
  const save = async () => {
    if (draft.slug && !isValidSlug(draft.slug)) { setSaveError(t('editor.slugInvalid')); return }
    setSaving(true); setSaveError(null)
    try {
      await onSave(baseFields())
      setDirty(false)
    } catch { setSaveError(t('editor.saveError')) } finally { setSaving(false) }
  }

  /* Publish — save the draft AND snapshot it as the live version. */
  const publish = async () => {
    if (draft.slug && !isValidSlug(draft.slug)) { setSaveError(t('editor.slugInvalid')); return }
    if (!draft.sections.length) { setSaveError(t('editor.publishEmpty')); return }
    setSaving(true); setSaveError(null)
    const snapshot = { theme: draft.theme, sections: draft.sections, config: draft.config }
    try {
      await onSave({ ...baseFields(), published: true, published_snapshot: snapshot })
      setDraft((d) => ({ ...d, published: true }))
      setPublishedSnapshot(snapshot)
      setDirty(false)
    } catch { setSaveError(t('editor.saveError')) } finally { setSaving(false) }
  }

  /* Take the page offline (keeps the snapshot for a quick re-publish). */
  const unpublish = async () => {
    setSaving(true); setSaveError(null)
    try {
      await onSave({ published: false })
      setDraft((d) => ({ ...d, published: false }))
    } catch { setSaveError(t('editor.saveError')) } finally { setSaving(false) }
  }

  /* Canvas click → select the clicked section (reads the nearest [data-sid]). */
  const onCanvasClick = (e) => {
    const el = e.target.closest('[data-sid]')
    if (el) { setSelectedId(el.getAttribute('data-sid')); setMobileSheet(true) }
  }

  return (
    <div className={`spe${focusMode ? ' is-focus' : ''}`}>
      {/* ── Top bar ─────────────────────────────────────────────── */}
      <div className="spe-top">
        <button className="spe-icon-btn" onClick={handleBack} title={t('editor.back')} aria-label={t('editor.back')}><ArrowRight size={18} /></button>
        <input
          className="spe-title-input"
          value={draft.title}
          placeholder={t('editor.titlePlaceholder')}
          onChange={(e) => mutate((d) => ({ ...d, title: e.target.value }))}
        />
        <div className="spe-top-spacer" />
        <button className="spe-icon-btn" onClick={undo} disabled={!canUndo} title={t('editor.undo')} aria-label={t('editor.undo')}><Undo2 size={16} /></button>
        <button className="spe-icon-btn" onClick={redo} disabled={!canRedo} title={t('editor.redo')} aria-label={t('editor.redo')}><Redo2 size={16} /></button>
        <div className="spe-device">
          <button className={device === 'desktop' ? 'is-on' : ''} onClick={() => setDevice('desktop')} title={t('editor.desktop')} aria-label={t('editor.desktop')}><Monitor size={16} /></button>
          <button className={device === 'mobile' ? 'is-on' : ''} onClick={() => setDevice('mobile')} title={t('editor.mobile')} aria-label={t('editor.mobile')}><Smartphone size={16} /></button>
        </div>
        <button
          className={`spe-icon-btn spe-focus-btn${focusMode ? ' is-on' : ''}`}
          onClick={() => setFocusMode((v) => !v)}
          title={focusMode ? t('editor.exitFocus') : t('editor.focusView')}
          aria-label={focusMode ? t('editor.exitFocus') : t('editor.focusView')}
        >
          {focusMode ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
        </button>
        {saveError ? <span className="spe-save-err" title={saveError}>{saveError}</span> : null}
        <span className={`spe-status${draft.published ? (hasUnpublishedChanges ? ' is-pending' : ' is-live') : ''}`}>
          {!draft.published ? t('editor.statusDraft') : hasUnpublishedChanges ? t('editor.statusUnpublished') : t('editor.statusPublished')}
        </span>
        {draft.published ? (
          <button className="spe-unpub" onClick={unpublish} disabled={saving} title={t('editor.unpublish')}>{t('editor.unpublish')}</button>
        ) : null}
        <button className="spe-save-draft" onClick={save} disabled={saving || !dirty}>
          {saving ? t('editor.saving') : t('editor.saveDraft')}
        </button>
        <button className="spe-save" onClick={publish} disabled={saving || (draft.published && !hasUnpublishedChanges && !dirty)}>
          {t('editor.publish')}
        </button>
      </div>

      <div className="spe-body">
        {/* ── Sections rail ─────────────────────────────────────── */}
        <aside className="spe-rail">
          <div className="spe-rail-head">
            <span>{t('editor.sections')}</span>
            <button className="spe-add" aria-expanded={paletteOpen} onClick={() => setPaletteOpen((v) => !v)}><Plus size={15} /> {t('editor.add')}</button>
          </div>
          {paletteOpen ? (
            <div className="spe-palette">
              {BLOCK_PALETTE.map((type) => {
                const def = BLOCK_TYPES[type]
                const Icon = BLOCK_ICON[type] || Sparkles
                return (
                  <button key={type} className="spe-palette-item" onClick={() => addSection(type)}>
                    <Icon size={16} /><span>{t('blocks.' + type, { defaultValue: def.label })}</span>
                  </button>
                )
              })}
            </div>
          ) : null}
          <ul className="spe-seclist">
            {draft.sections.map((s, i) => (
              <li
                key={s.id}
                className={`spe-secitem${selectedId === s.id ? ' is-sel' : ''}${dragging === i ? ' is-dragging' : ''}${dragOver === i && dragging !== i ? ' is-drop-target' : ''}`}
                draggable
                role="button"
                tabIndex={0}
                aria-pressed={selectedId === s.id}
                onDragStart={() => { dragIndex.current = i; setDragging(i) }}
                onDragOver={(e) => { e.preventDefault(); if (dragOver !== i) setDragOver(i) }}
                onDragEnd={() => { setDragging(null); setDragOver(null) }}
                onDrop={() => { const from = dragIndex.current; if (from != null) reorder(from, from < i ? i - 1 : i); dragIndex.current = null; setDragging(null); setDragOver(null) }}
                onClick={() => { setSelectedId(s.id); setMobileSheet(true) }}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedId(s.id); setMobileSheet(true) } }}
              >
                <GripVertical size={14} className="spe-grip" />
                <span className="spe-sec-label">{t('blocks.' + s.type, { defaultValue: BLOCK_TYPES[s.type]?.label || s.type })}</span>
                <button className="spe-sec-move" disabled={i === 0} onClick={(e) => { e.stopPropagation(); reorder(i, i - 1) }} title={t('editor.moveUp')} aria-label={t('editor.moveUp')}><ChevronUp size={13} /></button>
                <button className="spe-sec-move" disabled={i === draft.sections.length - 1} onClick={(e) => { e.stopPropagation(); reorder(i, i + 1) }} title={t('editor.moveDown')} aria-label={t('editor.moveDown')}><ChevronDown size={13} /></button>
                <button className="spe-sec-move" onClick={(e) => { e.stopPropagation(); duplicateSection(s.id) }} title={t('editor.duplicateSection')} aria-label={t('editor.duplicateSection')}><Copy size={13} /></button>
                <button className="spe-sec-del" onClick={(e) => { e.stopPropagation(); deleteSection(s.id) }} title={t('editor.deleteSection')} aria-label={t('editor.deleteSection')}><Trash2 size={13} /></button>
              </li>
            ))}
            {draft.sections.length === 0 ? <li className="spe-rail-empty">{t('editor.railEmpty')}</li> : null}
          </ul>
          <button className={`spe-design-btn${!selected ? ' is-on' : ''}`} onClick={() => { setSelectedId(null); setMobileSheet(true) }}>
            <Palette size={15} /> {t('editor.designPage')}
          </button>
        </aside>

        {/* ── Canvas ────────────────────────────────────────────── */}
        <div className="spe-canvas-wrap">
          <div className={`spe-frame spe-frame-${device}`} onClick={onCanvasClick}>
            <SiteRenderer theme={draft.theme} sections={draft.sections} interactive={false} selectedId={selectedId} device={device}
              onEdit={(id, key, value) => updateProps(id, { [key]: value })} />
          </div>
        </div>

        {/* ── Right panel: inspector OR design (a bottom sheet on mobile) ── */}
        {mobileSheet ? <div className="spe-sheet-backdrop" onClick={() => setMobileSheet(false)} /> : null}
        <aside className={`spe-inspector${mobileSheet ? ' is-open' : ''}`}>
          <div className="spe-sheet-head">
            <span className="spe-sheet-title">{selected ? t('blocks.' + selected.type, { defaultValue: BLOCK_TYPES[selected.type]?.label || selected.type }) : t('editor.designPage')}</span>
            <button className="spe-sheet-close" onClick={() => setMobileSheet(false)}>{t('editor.done')}</button>
          </div>
          {selected
            ? <SectionInspector section={selected} sections={draft.sections} free={draft.theme?.layoutMode === 'free'} onChange={(patch) => updateProps(selected.id, patch)} />
            : <DesignPanel theme={draft.theme} setTheme={setTheme}
                slug={draft.slug} onSlug={(v) => mutate((d) => ({ ...d, slug: v }))}
                projects={projects} projectId={draft.project_id} onProject={(v) => mutate((d) => ({ ...d, project_id: v }))}
                kind={draft.kind} config={draft.config} setConfig={setConfig} />}
        </aside>
      </div>

      {pendingDel ? (
        <div className="spe-toast" role="status">
          <span>{t('editor.sectionDeleted')}</span>
          <button onClick={undoDelete}>{t('editor.undo')}</button>
        </div>
      ) : null}
    </div>
  )
}

/* ════════════════════════════════════════════════════════════════
   DESIGN PANEL — page-level theme (font / brand / background / glass).
   ════════════════════════════════════════════════════════════════ */
function DesignPanel({ theme, setTheme, slug, onSlug, projects, projectId, onProject, kind, config, setConfig }) {
  const { t } = useT('siteBuilder')
  const bg = theme.background || DEFAULT_THEME.background
  const seo = (config && config.seo) || {}
  const setSeo = (patch) => setConfig({ seo: { ...seo, ...patch } })
  return (
    <div className="spe-panel">
      <h3 className="spe-panel-title">{t('design.title')}</h3>

      <div className="spe-group">
        <p className="spe-group-lbl">{t('design.grpLayout')}</p>
        <label className="spe-f spe-f-row"><span>{t('design.freeLayout')}</span>
          <input type="checkbox" checked={theme.layoutMode === 'free'} onChange={(e) => setTheme({ layoutMode: e.target.checked ? 'free' : 'stack' })} />
        </label>
        {theme.layoutMode === 'free'
          ? <p style={{ fontSize: 'var(--mg-caption)', color: 'var(--stone)', margin: 0, lineHeight: 1.4 }}>{t('design.freeLayoutHint')}</p>
          : null}
      </div>

      <div className="spe-group">
        <p className="spe-group-lbl">{t('design.grpAddress')}</p>
        <label className="spe-f">
          <span>{t('design.publicUrl')}</span>
          <input value={slug || ''} placeholder="my-page" onChange={(e) => onSlug(slugifyInput(e.target.value))} />
        </label>
        <label className="spe-f">
          <span>{t('design.project')}</span>
          <select value={projectId || ''} onChange={(e) => onProject(e.target.value)}>
            <option value="">{t('design.projectNone')}</option>
            {(projects || []).map((p) => <option key={p.id} value={p.id}>{p.name || p.title}</option>)}
          </select>
        </label>
      </div>

      <div className="spe-group">
        <p className="spe-group-lbl">{t('seo.group')}</p>
        <label className="spe-f"><span>{t('seo.title')}</span>
          <input value={seo.title || ''} onChange={(e) => setSeo({ title: e.target.value })} />
        </label>
        <label className="spe-f"><span>{t('seo.description')}</span>
          <textarea rows={2} value={seo.description || ''} onChange={(e) => setSeo({ description: e.target.value })} />
        </label>
        <div className="spe-f"><span>{t('seo.image')}</span>
          <ImageField value={seo.image} onChange={(url) => setSeo({ image: url })} />
        </div>
        <p className="spe-note">{t('seo.hint')}</p>
      </div>

      <div className="spe-group">
        <p className="spe-group-lbl">{t('design.grpTypography')}</p>
        <label className="spe-f">
          <span>{t('design.font')}</span>
          <select value={theme.font} onChange={(e) => setTheme({ font: e.target.value })}>
            {SITE_FONTS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
          </select>
        </label>
        <label className="spe-f spe-f-row">
          <span>{t('design.brandColor')}</span>
          <input type="color" value={theme.brandColor} onChange={(e) => setTheme({ brandColor: e.target.value })} />
        </label>
      </div>

      <div className="spe-group">
        <p className="spe-group-lbl">{t('design.grpBackground')}</p>
        <div className="spe-seg">
          {[['scene', t('design.bgScene')], ['flat', t('design.bgFlat')], ['image', t('design.bgImage')]].map(([k, lbl]) => (
            <button key={k} className={bg.type === k ? 'is-on' : ''}
              onClick={() => setTheme({ background: { type: k, value: k === 'flat' ? '#f7f3ee' : (k === 'scene' ? 'home' : '') } })}>
              {lbl}
            </button>
          ))}
        </div>
        {bg.type === 'scene' ? (
          <div className="spe-scenes">
            {LEAD_PAGE_BACKGROUNDS.map((s) => (
              <button key={s.key} className={`spe-scene${bg.value === s.key ? ' is-on' : ''}`}
                onClick={() => setTheme({ background: { type: 'scene', value: s.key } })} title={s.label} aria-label={s.label}>
                <img src={`/backgrounds/desktop/day/${s.key}.webp`} alt={s.label} loading="lazy" />
              </button>
            ))}
          </div>
        ) : null}
        {bg.type === 'flat' ? (
          <label className="spe-f spe-f-row"><span>{t('design.bgFlatColor')}</span>
            <input type="color" value={bg.value || '#f7f3ee'} onChange={(e) => setTheme({ background: { type: 'flat', value: e.target.value } })} />
          </label>
        ) : null}
        {bg.type === 'image' ? (
          <>
            <ImageField value={bg.value} onChange={(url) => setTheme({ background: { type: 'image', value: url } })} />
            <p className="spe-note">{t('design.bgImageHint')}</p>
          </>
        ) : null}
        {bg.type === 'scene' || bg.type === 'image' || (theme.mobileBgOn && theme.mobileBg) ? (
          <label className="spe-f spe-f-row"><span>{t('design.freezeBg')}</span>
            <input type="checkbox" checked={!!theme.freezeBg} onChange={(e) => setTheme({ freezeBg: e.target.checked })} />
          </label>
        ) : null}
        <label className="spe-f spe-f-row"><span>{t('design.mobileBg')}</span>
          <input type="checkbox" checked={!!theme.mobileBgOn} onChange={(e) => setTheme({ mobileBgOn: e.target.checked })} />
        </label>
        {theme.mobileBgOn ? (
          <>
            <ImageField value={theme.mobileBg} onChange={(url) => setTheme({ mobileBg: url })} />
            <p className="spe-note">{t('design.mobileBgHint')}</p>
          </>
        ) : null}
      </div>

      <div className="spe-group">
        <p className="spe-group-lbl">{t('design.grpCards')}</p>
        <Slider label={t('design.cardOpacity')} min={0} max={100} value={theme.cardOpacity} onChange={(v) => setTheme({ cardOpacity: v })} />
        <Slider label={t('design.cardBlur')} min={0} max={40} value={theme.cardBlur} onChange={(v) => setTheme({ cardBlur: v })} />
        <Slider label={t('design.cardRadius')} min={8} max={40} value={theme.cardRadius} onChange={(v) => setTheme({ cardRadius: v })} />
      </div>

      <div className="spe-group">
        <p className="spe-group-lbl">{t('design.grpText')}</p>
        <label className="spe-f spe-f-row"><span>{t('design.bold')}</span>
          <input type="checkbox" checked={!!theme.bold} onChange={(e) => setTheme({ bold: e.target.checked })} />
        </label>
        <label className="spe-f spe-f-row"><span>{t('design.center')}</span>
          <input type="checkbox" checked={theme.textAlign === 'center'} onChange={(e) => setTheme({ textAlign: e.target.checked ? 'center' : 'start' })} />
        </label>
      </div>

      {/* Lead-capture settings (config) — pages with a form section. */}
      {kind === 'lead' ? <div className="spe-group"><LeadSettings config={config || {}} setConfig={setConfig} /></div> : null}
    </div>
  )
}

/* Lead-page settings that live in page `config` (not a visual section):
   the manual-approval gate + the post-submit thank-you. */
function LeadSettings({ config, setConfig }) {
  const { t } = useT('siteBuilder')
  const ty = config.thankYou || { mode: 'message', message: '', url: '' }
  const setTy = (patch) => setConfig({ thankYou: { ...ty, ...patch } })
  return (
    <>
      <h3 className="spe-panel-title" style={{ marginTop: 8 }}>{t('settings.title')}</h3>
      <label className="spe-f spe-f-row"><span>{t('settings.autoApprove')}</span>
        <input type="checkbox" checked={!!config.autoApprove} onChange={(e) => setConfig({ autoApprove: e.target.checked })} />
      </label>
      <label className="spe-f"><span>{t('settings.afterSubmit')}</span>
        <select value={ty.mode || 'message'} onChange={(e) => setTy({ mode: e.target.value })}>
          <option value="message">{t('settings.modeMessage')}</option>
          <option value="redirect">{t('settings.modeRedirect')}</option>
        </select>
      </label>
      {ty.mode === 'redirect'
        ? <label className="spe-f"><span>{t('settings.redirectUrl')}</span><input placeholder="https://…" value={ty.url || ''} onChange={(e) => setTy({ url: e.target.value })} /></label>
        : <label className="spe-f"><span>{t('settings.thankYouMessage')}</span><textarea rows={2} value={ty.message || ''} onChange={(e) => setTy({ message: e.target.value })} /></label>}
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
function SectionInspector({ section, sections, free, onChange }) {
  const { t } = useT('siteBuilder')
  const def = BLOCK_TYPES[section.type]
  if (!def) return null
  const props = section.props || {}
  const list = Array.isArray(sections) ? sections : []
  const targets = { form: list.some((s) => s.type === 'form'), booking: list.some((s) => s.type === 'booking') }
  return (
    <div className="spe-panel">
      <h3 className="spe-panel-title">{t('blocks.' + section.type, { defaultValue: def.label })}</h3>
      {def.editable.filter((d) => !d.showWhen || props[d.showWhen]).map((d) => (
        <Descriptor key={d.key} d={d} value={props[d.key]} targets={targets} onChange={(v) => onChange({ [d.key]: v })} />
      ))}
      <SizePosition props={props} onChange={onChange} free={free} section={section} sections={sections} />
    </div>
  )
}

/* Per-section size + position. In STACK mode: a width slider + alignment within the
   column (width is also draggable on the canvas). In FREE mode size/position come
   from dragging, so instead we expose LAYERING (bring to front / send to back) for
   overlapping blocks. */
function SizePosition({ props, onChange, free, section, sections }) {
  const { t } = useT('siteBuilder')
  if (free) {
    const list = Array.isArray(sections) ? sections : []
    const zs = list.map((s, i) => (s.props?.z != null ? s.props.z : i))
    const bringFront = () => onChange({ z: (zs.length ? Math.max(...zs) : 0) + 1 })
    const sendBack = () => onChange({ z: (zs.length ? Math.min(...zs) : 0) - 1 })
    return (
      <div className="spe-group">
        <p className="spe-group-lbl">{t('design.grpLayering', { defaultValue: 'שכבות' })}</p>
        <div className="spe-layer-btns">
          <button type="button" className="spe-layer-btn" onClick={bringFront}><ChevronUp size={15} /> {t('design.bringFront', { defaultValue: 'הבא לחזית' })}</button>
          <button type="button" className="spe-layer-btn" onClick={sendBack}><ChevronDown size={15} /> {t('design.sendBack', { defaultValue: 'שלח לאחור' })}</button>
        </div>
        <p className="spe-note">{t('design.freeSizeHint', { defaultValue: 'גודל ומיקום נקבעים בגרירה על הקנבס.' })}</p>
      </div>
    )
  }
  // boxWidth/boxAlign (not width/align) so they never clash with a block's own
  // width prop (image/divider) or align prop (icon).
  const width = Number(props.boxWidth) || 100
  const align = props.boxAlign || 'center'
  return (
    <div className="spe-group">
      <p className="spe-group-lbl">{t('design.grpSize', { defaultValue: 'גודל ומיקום' })}</p>
      <label className="spe-f"><span>{t('design.width', { defaultValue: 'רוחב' })} — {width}%</span>
        <input type="range" min={25} max={100} value={width} onChange={(e) => onChange({ boxWidth: Number(e.target.value) })} />
      </label>
      {width < 100 ? (
        <div className="spe-f spe-f-row"><span>{t('labels.align')}</span>
          <div className="spe-align">
            {['start', 'center', 'end'].map((a) => (
              <button key={a} type="button" className={`spe-align-btn${align === a ? ' is-on' : ''}`} onClick={() => onChange({ boxAlign: a })}>
                {t('options.' + a, { defaultValue: a })}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function Descriptor({ d, value, targets, onChange }) {
  const { t } = useT('siteBuilder')
  const label = t('labels.' + d.key, { defaultValue: d.label })
  switch (d.type) {
    case 'text':
      return <label className="spe-f"><span>{label}</span><input value={value ?? ''} onChange={(e) => onChange(e.target.value)} /></label>
    case 'textarea':
      return <label className="spe-f"><span>{label}</span><textarea rows={3} value={value ?? ''} onChange={(e) => onChange(e.target.value)} /></label>
    case 'richtext':
      return <RichTextField d={d} value={value} onChange={onChange} />
    case 'number':
      return <label className="spe-f"><span>{label}</span><input type="number" value={value ?? 0} onChange={(e) => onChange(Number(e.target.value))} /></label>
    case 'range': {
      const rv = value ?? d.def ?? d.max ?? 100
      return <label className="spe-f"><span>{label} — {rv}{d.unit ?? '%'}</span><input type="range" min={d.min ?? 0} max={d.max ?? 100} value={rv} onChange={(e) => onChange(Number(e.target.value))} /></label>
    }
    case 'toggle':
      return <label className="spe-f spe-f-row"><span>{label}</span><input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} /></label>
    case 'color':
      return <label className="spe-f spe-f-row"><span>{label}</span><input type="color" value={value || '#000000'} onChange={(e) => onChange(e.target.value)} /></label>
    case 'textColor':
      return <div className="spe-f spe-f-row"><span>{label}</span><TextColorField value={value} onChange={onChange} /></div>
    case 'select':
      return (
        <label className="spe-f"><span>{label}</span>
          <select value={value ?? d.options[0]} onChange={(e) => onChange(e.target.value)}>
            {d.options.map((o) => <option key={o} value={o}>{t('options.' + o, { defaultValue: o })}</option>)}
          </select>
        </label>
      )
    case 'image':
      return <div className="spe-f"><span>{label}</span><ImageField value={value} onChange={onChange} /></div>
    case 'icon':
      return <div className="spe-f"><span>{label}</span><IconPicker value={value} onChange={onChange} /></div>
    case 'action':
      return <div className="spe-f"><span>{label}</span><ActionField value={value} targets={targets} onChange={onChange} /></div>
    case 'list':
      return <ListField d={d} value={value} onChange={onChange} />
    case 'bookingPage':
      return <div className="spe-f"><span>{label}</span><BookingPageField value={value} onChange={onChange} /></div>
    case 'formFields':
      return <FormFieldsEditor value={value} onChange={onChange} />
    default:
      return null
  }
}

/* Rich-text field — a markdown-lite toolbar over a textarea. Buttons wrap the
   current selection (or insert a sample) with markdown markers; the canvas shows
   the rendered result live. Stored as plain markdown, rendered via renderRichText. */
function RichTextField({ d, value, onChange }) {
  const { t } = useT('siteBuilder')
  const ref = useRef(null)
  const v = value || ''
  const setSel = (start, end) => requestAnimationFrame(() => {
    const ta = ref.current; if (!ta) return
    ta.focus(); ta.selectionStart = start; ta.selectionEnd = end
  })
  const wrap = (mark) => {
    const ta = ref.current; if (!ta) return
    const s = ta.selectionStart, e = ta.selectionEnd
    const sel = v.slice(s, e) || t('rich.sample')
    onChange(v.slice(0, s) + mark + sel + mark + v.slice(e))
    setSel(s + mark.length, s + mark.length + sel.length)
  }
  const link = () => {
    const ta = ref.current; if (!ta) return
    const s = ta.selectionStart, e = ta.selectionEnd
    const sel = v.slice(s, e) || t('rich.linkText')
    onChange(`${v.slice(0, s)}[${sel}](https://)${v.slice(e)}`)
    const urlAt = s + sel.length + 3
    setSel(urlAt, urlAt + 8)            // select the "https://" so they can type the URL
  }
  const prefix = (mark) => {
    const ta = ref.current; if (!ta) return
    const s = ta.selectionStart, e = ta.selectionEnd
    const lineStart = v.lastIndexOf('\n', s - 1) + 1
    const block = v.slice(lineStart, Math.max(e, lineStart))
    const next = block.split('\n').map((l) => mark + l).join('\n')
    onChange(v.slice(0, lineStart) + next + v.slice(Math.max(e, lineStart)))
  }
  const Btn = ({ on, icon: Ic, label: lbl }) => (
    <button type="button" className="spe-rich-btn" onMouseDown={(ev) => ev.preventDefault()} onClick={on} title={lbl} aria-label={lbl}><Ic size={14} /></button>
  )
  return (
    <div className="spe-f spe-rich">
      <span>{t('labels.' + d.key, { defaultValue: d.label })}</span>
      <div className="spe-rich-bar">
        <Btn on={() => wrap('**')} icon={Bold} label={t('rich.bold')} />
        <Btn on={() => wrap('*')} icon={Italic} label={t('rich.italic')} />
        <Btn on={link} icon={LinkIcon} label={t('rich.link')} />
        <Btn on={() => prefix('- ')} icon={List} label={t('rich.list')} />
        <Btn on={() => prefix('## ')} icon={Heading} label={t('rich.heading')} />
      </div>
      <textarea ref={ref} rows={6} value={v} onChange={(e) => onChange(e.target.value)} />
      <p className="spe-rich-hint">{t('rich.hint')}</p>
    </div>
  )
}

/* Per-section text color — "auto" (readable per the page background) or a custom
   colour. Replaces the old global light/dark toggle. */
function TextColorField({ value, onChange }) {
  const { t } = useT('siteBuilder')
  const isAuto = !value || value === 'auto'
  return (
    <div className="spe-textcolor">
      <button type="button" className={`spe-tc-auto${isAuto ? ' is-on' : ''}`} onClick={() => onChange('auto')}>{t('design.colorAuto')}</button>
      <input type="color" value={isAuto ? '#2c2621' : value} onChange={(e) => onChange(e.target.value)} aria-label={t('labels.color')} />
    </div>
  )
}

/* Booking-page picker — choose which existing booking page's slot-picker the
   block embeds. Stores the page's public ref (slug, or id). Only published
   pages are offered (the inline picker needs a live booking-intake config). */
function BookingPageField({ value, onChange }) {
  const { t } = useT('siteBuilder')
  const { pages, loading } = useBookingPages()
  const published = (pages || []).filter((p) => p.published)
  if (loading) return <p className="spe-note">{t('hub.loading')}</p>
  if (!published.length) return <p className="spe-note spe-err">{t('inspector.noBookingPages')}</p>
  return (
    <select value={value || ''} onChange={(e) => onChange(e.target.value)}>
      <option value="">{t('inspector.chooseBookingPage')}</option>
      {published.map((p) => (
        <option key={p.id} value={p.slug || p.id}>{p.title || p.slug || p.id}</option>
      ))}
    </select>
  )
}

function ImageField({ value, onChange }) {
  const { t } = useT('siteBuilder')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const inputRef = useRef(null)
  const pick = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setErr(''); setBusy(true)
    const prev = value
    try {
      const { url } = await uploadPageAsset(file)
      onChange(url)
      // Replacing an image: clean up the previous asset so it doesn't orphan.
      const prevPath = assetPathFromUrl(prev)
      if (prevPath) removePageAsset(prevPath)
    } catch (ex) { setErr(t('assets.' + ex.message, { defaultValue: t('inspector.uploadFailed') })) } finally { setBusy(false); if (inputRef.current) inputRef.current.value = '' }
  }
  const clear = () => {
    const path = assetPathFromUrl(value)
    if (path) removePageAsset(path)
    onChange('')
  }
  return (
    <div className="spe-image">
      {value ? <div className="spe-image-prev"><img src={value} alt="" /><button onClick={clear} title={t('inspector.removeImage')} aria-label={t('inspector.removeImage')}><X size={14} /></button></div> : null}
      <button className="spe-upload" onClick={() => inputRef.current?.click()} disabled={busy}>
        <Upload size={14} /> {busy ? t('inspector.uploading') : value ? t('inspector.replaceImage') : t('inspector.uploadImage')}
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

function ActionField({ value, targets, onChange }) {
  const { t } = useT('siteBuilder')
  const a = value || { type: 'link', url: '' }
  // Warn when the button points to a block that doesn't exist on the page.
  const missing = (a.type === 'scrollToForm' && targets && !targets.form)
    || (a.type === 'booking' && targets && !targets.booking)
  return (
    <div className="spe-action">
      <select value={a.type} onChange={(e) => onChange({ ...a, type: e.target.value })}>
        <option value="link">{t('action.link')}</option>
        <option value="scrollToForm">{t('action.scrollToForm')}</option>
        <option value="booking">{t('action.booking')}</option>
      </select>
      {a.type === 'link' ? (
        <input placeholder="https://…" value={a.url || ''} onChange={(e) => onChange({ ...a, url: e.target.value })} />
      ) : null}
      {missing ? <p className="spe-note spe-err">{t('inspector.noTargetHint')}</p> : null}
    </div>
  )
}

function ListField({ d, value, onChange }) {
  const { t } = useT('siteBuilder')
  const items = Array.isArray(value) ? value : []
  const setItem = (i, patch) => onChange(items.map((it, j) => (j === i ? { ...it, ...patch } : it)))
  const add = () => onChange([...items, Object.fromEntries(d.item.map((f) => [f.key, f.type === 'icon' ? 'Check' : '']))])
  const remove = (i) => onChange(items.filter((_, j) => j !== i))
  return (
    <div className="spe-f">
      <span>{t('labels.' + d.key, { defaultValue: d.label })}</span>
      {items.map((it, i) => (
        <div className="spe-listitem" key={i}>
          <div className="spe-listitem-head"><span>#{i + 1}</span><button onClick={() => remove(i)}><Trash2 size={13} /></button></div>
          {d.item.map((f) => (
            <Descriptor key={f.key} d={f} value={it[f.key]} onChange={(v) => setItem(i, { [f.key]: v })} />
          ))}
        </div>
      ))}
      <button className="spe-add-row" onClick={add}><Plus size={14} /> {t('inspector.addItem')}</button>
    </div>
  )
}

/* Compact lead-form field editor (label + type + required), reusing the
   lead-page field model. Builtin fields keep their key; free fields get one. */
function FormFieldsEditor({ value, onChange }) {
  const { t } = useT('siteBuilder')
  const fields = Array.isArray(value) ? value : []
  const setField = (i, patch) => onChange(fields.map((f, j) => (j === i ? { ...f, ...patch } : f)))
  const remove = (i) => onChange(fields.filter((_, j) => j !== i))
  const add = () => onChange([...fields, { key: freeFieldKey(fields), label: t('fields.newField'), type: 'text', required: false, builtin: false }])
  return (
    <div className="spe-f">
      <span>{t('fields.formFields')}</span>
      {fields.map((f, i) => (
        <div className="spe-listitem" key={f.key}>
          <div className="spe-listitem-head">
            <input className="spe-flex" value={f.label} onChange={(e) => setField(i, { label: e.target.value })} />
            {!f.builtin ? <button onClick={() => remove(i)}><Trash2 size={13} /></button> : null}
          </div>
          <div className="spe-field-row">
            <select value={f.type} disabled={f.builtin} onChange={(e) => setField(i, { type: e.target.value, ...(isChoiceType(e.target.value) && !f.options ? { options: defaultChoiceOptions() } : {}) })}>
              {FIELD_TYPES.map((ft) => <option key={ft} value={ft}>{t('fieldTypes.' + ft)}</option>)}
            </select>
            <label className="spe-req-toggle"><input type="checkbox" checked={!!f.required} onChange={(e) => setField(i, { required: e.target.checked })} /> {t('fields.required')}</label>
          </div>
          {isChoiceType(f.type) ? (
            <input className="spe-flex" placeholder={t('fields.optionsPlaceholder')}
              value={(f.options || []).join(', ')}
              onChange={(e) => setField(i, { options: e.target.value.split(',').map((o) => o.trim()).filter(Boolean) })} />
          ) : null}
        </div>
      ))}
      <button className="spe-add-row" onClick={add}><Plus size={14} /> {t('fields.addField')}</button>
    </div>
  )
}
