import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowRight, Plus, Trash2, Monitor, Smartphone, GripVertical,
  Palette, Upload, X, ChevronUp, ChevronDown, Maximize2, Minimize2,
  LayoutTemplate, Type, Image as ImageIcon, Sparkles, Quote,
  MousePointerClick, ClipboardList, CalendarClock, Minus,
  LayoutGrid, Smile, Images, Video, HelpCircle, SeparatorHorizontal, Copy,
  Bold, Italic, List, Heading, Link as LinkIcon, Undo2, Redo2, Search,
  Columns2, BarChart3, Tag, Building2, ListOrdered, Megaphone, Share2, Mail, Map as MapIcon, Flag, Timer,
  MoreHorizontal, CheckCircle2,
} from 'lucide-react'
import {
  BLOCK_TYPES, BLOCK_PALETTE, BLOCK_CATEGORIES, newSection, newSectionId,
  SITE_FONTS, LEAD_PAGE_BACKGROUNDS, DEFAULT_THEME, slugifyInput, isValidSlug,
  FIELD_TYPES, isChoiceType, isConsentType, defaultChoiceOptions, freeFieldKey,
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
const collectAll = (sections) => (Array.isArray(sections) ? sections : []).flatMap((s) => collectAssetPaths(s))

/* Lets a deeply-nested ImageField register a freshly-uploaded asset path with the
   editor's session tracker (knownAssets) without prop-drilling — so an upload that
   is later replaced/removed before any save still gets garbage-collected. */
const AssetSinkContext = createContext(null)

/* Chrome icons for the "add section" palette (distinct from the curated
   CONTENT icon set in pageIcons that users pick inside icon/iconText blocks). */
const BLOCK_ICON = {
  hero: LayoutTemplate, text: Type, image: ImageIcon, iconText: Sparkles,
  testimonial: Quote, cta: MousePointerClick, form: ClipboardList,
  booking: CalendarClock, spacer: Minus,
  cards: LayoutGrid, icon: Smile, gallery: Images, video: Video,
  faq: HelpCircle, divider: SeparatorHorizontal,
  split: Columns2, stats: BarChart3, pricing: Tag, logos: Building2,
  steps: ListOrdered, ctaBand: Megaphone, social: Share2, contact: Mail,
  map: MapIcon, banner: Flag, countdown: Timer,
}
import { ICON_NAMES, iconByName } from '../../lib/pageIcons'
import { uploadPageAsset, assetPathFromUrl, removePageAsset } from '../../lib/pageAssets'
import { useProjects } from '../../hooks/useProjects'
import { useBookingPages } from '../../hooks/useBookingPages'
import { useT } from '../../i18n/useT'
import './siteBuilderI18n'
import SiteRenderer from '../site-page/SiteRenderer'
import './SitePagesScreen.css'
import { Box, Txt, Btn, Input, Textarea } from '../../components/ui'

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
  const [paletteQuery, setPaletteQuery] = useState('') // "add section" search filter
  // Collapsible palette categories — the two most-used groups start open, the rest
  // collapsed so the (now 26-block) palette stays compact; each header toggles.
  const [openCats, setOpenCats] = useState(() => Object.fromEntries(BLOCK_CATEGORIES.slice(0, 2).map((c) => [c.key, true])))
  const [overflowOpen, setOverflowOpen] = useState(false) // top-bar "⋯" menu (unpublish…)
  const [publishOk, setPublishOk] = useState(false)       // brief "published!" confirmation toast
  const overflowRef = useRef(null)
  const [mobileSheet, setMobileSheet] = useState(false) // inspector bottom-sheet (mobile)
  // The inspector is a static side panel on desktop but a MODAL bottom-sheet at
  // ≤767px (the CSS breakpoint). Track that breakpoint so the dialog semantics +
  // focus trap apply ONLY when it's actually acting as a modal.
  const [isMobileView, setIsMobileView] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches,
  )
  const sheetRef = useRef(null)          // the bottom-sheet aside (focus target/trap)
  const sheetReturnRef = useRef(null)    // element to restore focus to when it closes
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [saveError, setSaveError] = useState(null)
  const [publishedSnapshot, setPublishedSnapshot] = useState(() => page.published_snapshot || null)
  const dragIndex = useRef(null)
  const [dragging, setDragging] = useState(null)   // index being dragged
  const [dragOver, setDragOver] = useState(null)   // index hovered as drop target
  const [pendingDel, setPendingDel] = useState(null) // { section, index } awaiting undo
  const delTimer = useRef(null)
  const okTimer = useRef(null)                     // "published ✓" toast auto-dismiss
  const draftRef = useRef(draft)                   // latest draft for deferred asset cleanup
  useEffect(() => { draftRef.current = draft }, [draft])
  // Asset GC is reconciled at SAVE, never mid-edit, so an undo (toast OR Ctrl+Z) can
  // always restore a section/image without 404-ing. knownAssets = every path we've
  // seen (loaded + this session's uploads); savedAssets = what the last save actually
  // persisted (draft ∪ still-live published snapshot — never purge those).
  const knownAssets = useRef(null)
  const savedAssets = useRef(null)
  const snapshotRef = useRef(publishedSnapshot)    // live snapshot, for the reconcile/unmount closures
  useEffect(() => { snapshotRef.current = publishedSnapshot }, [publishedSnapshot])
  const registerAsset = useCallback((path) => { if (path) knownAssets.current?.add(path) }, [])
  // Seed the asset trackers from the loaded page (in an effect, not during render),
  // then on unmount clear timers (so they can't setState on a dead editor) and purge
  // assets uploaded THIS session but never persisted — leaving (Back) discards the
  // draft, so a draft-only upload is a true orphan. savedAssets holds exactly what
  // the last save persisted, so subtracting it can never touch a live image.
  useEffect(() => {
    const init = new Set([...collectAll(page.sections), ...collectAll(page.published_snapshot?.sections)])
    knownAssets.current = init
    savedAssets.current = new Set(init)
    return () => {
      if (delTimer.current) clearTimeout(delTimer.current)
      if (okTimer.current) clearTimeout(okTimer.current)
      knownAssets.current?.forEach((p) => { if (!savedAssets.current?.has(p)) removePageAsset(p) })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount/unmount only: seed the asset refs on mount, sweep orphan uploads on unmount. Adding page.* deps would re-run and corrupt the orphan-tracking sets.
  }, [])

  /* Track the bottom-sheet breakpoint so dialog semantics apply only when modal. */
  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    const mq = window.matchMedia('(max-width: 767px)')
    const on = () => setIsMobileView(mq.matches)
    on()
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])

  /* When the inspector is acting as a modal sheet (mobile + open): move focus into
     it, trap Tab inside, close on Escape, and restore focus to the trigger on close. */
  const sheetModal = isMobileView && mobileSheet
  useEffect(() => {
    if (!sheetModal) return undefined
    const node = sheetRef.current
    sheetReturnRef.current = document.activeElement
    const focusables = () => Array.from(
      node?.querySelectorAll('button, [href], input:not([type="hidden"]), select, textarea, [tabindex]:not([tabindex="-1"])') || [],
    ).filter((el) => !el.disabled && el.offsetParent !== null)
    ;(focusables()[0] || node)?.focus()
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); setMobileSheet(false); return }
      if (e.key !== 'Tab' || !node) return
      const list = focusables()
      if (!list.length) return
      const first = list[0], last = list[list.length - 1]
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      const ret = sheetReturnRef.current
      if (ret && typeof ret.focus === 'function' && document.body.contains(ret)) ret.focus()
    }
  }, [sheetModal])

  /* Close the top-bar "⋯" overflow menu on outside-click / Escape. */
  useEffect(() => {
    if (!overflowOpen) return undefined
    const onDoc = (e) => { if (overflowRef.current && !overflowRef.current.contains(e.target)) setOverflowOpen(false) }
    const onKey = (e) => { if (e.key === 'Escape') setOverflowOpen(false) }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey) }
  }, [overflowOpen])

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
  const sheetTitle = selected
    ? t('blocks.' + selected.type, { defaultValue: BLOCK_TYPES[selected.type]?.label || selected.type })
    : t('editor.designPage')

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
    // eslint-disable-next-line react-hooks/purity -- `mutate` runs only from event handlers (edits), never during render, so Date.now() here is safe.
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
  // eslint-disable-next-line react-hooks/refs -- reads a ref during render, but every history mutation also calls setDraft, so the component re-renders and these booleans recompute in the same tick.
  const canUndo = hist.current.past.length > 0
  // eslint-disable-next-line react-hooks/refs -- see canUndo above: state always re-renders alongside the ref mutation.
  const canRedo = hist.current.future.length > 0

  /* Ctrl/⌘+Z = undo, Ctrl/⌘+Shift+Z or Ctrl+Y = redo. Skipped while a text field
     is focused so the browser's native text undo still works there. */
  const histKeyRef = useRef({})
  useEffect(() => { histKeyRef.current = { undo, redo } }) // keep latest callbacks without re-binding the listener
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

  /* Garbage-collect orphaned uploads at a SAVE checkpoint (the only safe time —
     mid-edit, an undo could still bring any of them back). "Live" = everything the
     just-saved draft references PLUS the still-online published snapshot, so this
     never deletes an image visitors are currently seeing. Anything in knownAssets
     that's no longer live (deleted section, replaced/cleared image, removed gallery
     item) is purged; knownAssets/savedAssets then collapse to exactly what's live. */
  const reconcileAssets = () => {
    const live = new Set([...collectAll(draftRef.current.sections), ...collectAll(snapshotRef.current?.sections)])
    knownAssets.current?.forEach((p) => { if (!live.has(p)) removePageAsset(p) })
    knownAssets.current = new Set(live)
    savedAssets.current = new Set(live)
  }
  /* Settle a pending delete now: just dismiss its undo toast (no asset work — GC
     happens at save). Called before starting a new delete. */
  const commitPendingDelete = () => {
    if (delTimer.current) { clearTimeout(delTimer.current); delTimer.current = null }
    setPendingDel(null)
  }

  const deleteSection = (id) => {
    commitPendingDelete()                       // settle any earlier pending delete first
    const index = draft.sections.findIndex((s) => s.id === id)
    if (index < 0) return
    const removed = draft.sections[index]
    mutate((d) => ({ ...d, sections: d.sections.filter((s) => s.id !== id) }), true)
    if (selectedId === id) setSelectedId(null)
    // No asset cleanup here — the section's images stay in storage so a toast/Ctrl+Z
    // undo restores it intact. Orphaned uploads are reconciled at the next save.
    setPendingDel({ section: removed, index })
    delTimer.current = setTimeout(() => {
      delTimer.current = null; setPendingDel(null)   // auto-dismiss the undo toast
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
  useEffect(() => { keyDelRef.current = { selectedId, deleteSection } }) // keep latest values without re-binding the listener
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

  // Section-level DESIGN (background band / vertical rhythm) lives on section.style,
  // separate from the block's content props.
  const updateStyle = (id, patch) => mutate((d) => ({
    ...d,
    sections: d.sections.map((s) => (s.id === id ? { ...s, style: { ...(s.style || {}), ...patch } } : s)),
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
      reconcileAssets()                 // GC uploads orphaned since the last save
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
      snapshotRef.current = snapshot    // make the new snapshot live for reconcile NOW (effect lags a render)
      setDirty(false)
      reconcileAssets()                 // GC uploads orphaned by this publish (incl. the replaced live version)
      setPublishOk(true)
      if (okTimer.current) clearTimeout(okTimer.current)
      okTimer.current = setTimeout(() => { setPublishOk(false); okTimer.current = null }, 2600)
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
    <AssetSinkContext.Provider value={registerAsset}>
    <Box className={`spe${focusMode ? ' is-focus' : ''}`}>
      {/* ── Top bar ─────────────────────────────────────────────── */}
      <Box className="spe-top">
        {/* nav */}
        <Box className="spe-top-nav">
          <Btn className="spe-icon-btn" onClick={handleBack} title={t('editor.back')} aria-label={t('editor.back')}><ArrowRight size={18} /></Btn>
          <Input
            className="spe-title-input"
            value={draft.title}
            placeholder={t('editor.titlePlaceholder')}
            onChange={(e) => mutate((d) => ({ ...d, title: e.target.value }))}
          />
        </Box>
        {/* center tools */}
        <Box className="spe-top-tools">
          <Box className="spe-toolgroup">
            <Btn className="spe-icon-btn" onClick={undo} disabled={!canUndo} title={t('editor.undo')} aria-label={t('editor.undo')}><Undo2 size={16} /></Btn>
            <Btn className="spe-icon-btn" onClick={redo} disabled={!canRedo} title={t('editor.redo')} aria-label={t('editor.redo')}><Redo2 size={16} /></Btn>
          </Box>
          <Box className="spe-device">
            <Btn className={device === 'desktop' ? 'is-on' : ''} aria-pressed={device === 'desktop'} onClick={() => setDevice('desktop')} title={t('editor.desktop')} aria-label={t('editor.desktop')}><Monitor size={16} /></Btn>
            <Btn className={device === 'mobile' ? 'is-on' : ''} aria-pressed={device === 'mobile'} onClick={() => setDevice('mobile')} title={t('editor.mobile')} aria-label={t('editor.mobile')}><Smartphone size={16} /></Btn>
          </Box>
          <Btn
            className={`spe-icon-btn spe-focus-btn${focusMode ? ' is-on' : ''}`}
            aria-pressed={focusMode}
            onClick={() => setFocusMode((v) => !v)}
            title={focusMode ? t('editor.exitFocus') : t('editor.focusView')}
            aria-label={focusMode ? t('editor.exitFocus') : t('editor.focusView')}
          >
            {focusMode ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </Btn>
        </Box>
        {/* publish */}
        <Box className="spe-top-actions">
          {saveError ? <Txt className="spe-save-err" title={saveError}>{saveError}</Txt> : null}
          <Txt className={`spe-status${draft.published ? (hasUnpublishedChanges ? ' is-pending' : ' is-live') : ''}`}>
            {!draft.published ? t('editor.statusDraft') : hasUnpublishedChanges ? t('editor.statusUnpublished') : t('editor.statusPublished')}
          </Txt>
          <Btn className="spe-save-draft" onClick={save} disabled={saving || !dirty}>
            {saving ? t('editor.saving') : t('editor.saveDraft')}
          </Btn>
          <Btn className="spe-save" onClick={publish} disabled={saving || (draft.published && !hasUnpublishedChanges && !dirty)}>
            {t('editor.publish')}
          </Btn>
          {draft.published ? (
            <Box className="spe-overflow" ref={overflowRef}>
              <Btn className="spe-icon-btn" onClick={() => setOverflowOpen((v) => !v)} aria-haspopup="menu" aria-expanded={overflowOpen} title={t('editor.more', { defaultValue: 'עוד' })} aria-label={t('editor.more', { defaultValue: 'עוד' })}><MoreHorizontal size={18} /></Btn>
              {overflowOpen ? (
                <Box className="spe-overflow-menu" role="menu">
                  <Btn role="menuitem" onClick={() => { setOverflowOpen(false); unpublish() }} disabled={saving}>{t('editor.unpublish')}</Btn>
                </Box>
              ) : null}
            </Box>
          ) : null}
        </Box>
      </Box>

      <Box className="spe-body">
        {/* ── Sections rail ─────────────────────────────────────── */}
        <Box as="aside" className="spe-rail">
          <Box className="spe-rail-head">
            <Txt>{t('editor.sections')}</Txt>
            <Btn className="spe-add" aria-expanded={paletteOpen} onClick={() => { setPaletteOpen((v) => !v); setPaletteQuery('') }}><Plus size={15} /> {t('editor.add')}</Btn>
          </Box>
          {paletteOpen ? (
            <Box className="spe-palette">
              <Box className="spe-palette-search">
                <Search size={14} />
                <Input autoFocus value={paletteQuery} onChange={(e) => setPaletteQuery(e.target.value)}
                  placeholder={t('palette.search', { defaultValue: 'חיפוש סקשן…' })}
                  aria-label={t('palette.search', { defaultValue: 'חיפוש סקשן' })} />
              </Box>
              {(() => {
                const q = paletteQuery.trim().toLowerCase()
                const item = (type) => {
                  const def = BLOCK_TYPES[type]
                  const Icon = BLOCK_ICON[type] || Sparkles
                  const label = t('blocks.' + type, { defaultValue: def.label })
                  return (
                    <Btn key={type} className="spe-palette-item" onClick={() => addSection(type)} title={label}>
                      <Txt className="spe-palette-ico"><Icon size={17} /></Txt>
                      <Txt>{label}</Txt>
                    </Btn>
                  )
                }
                if (q) {
                  const hits = BLOCK_PALETTE.filter((type) =>
                    type.toLowerCase().includes(q) || t('blocks.' + type, { defaultValue: BLOCK_TYPES[type].label }).toLowerCase().includes(q))
                  return hits.length
                    ? <Box className="spe-palette-grid">{hits.map(item)}</Box>
                    : <Txt as="p" className="spe-palette-empty">{t('palette.noResults', { defaultValue: 'לא נמצאו סקשנים' })}</Txt>
                }
                return BLOCK_CATEGORIES.map((cat) => {
                  const open = !!openCats[cat.key]
                  return (
                    <Box className={`spe-palette-cat${open ? ' is-open' : ''}`} key={cat.key}>
                      <Btn type="button" className="spe-palette-cat-toggle" aria-expanded={open}
                        onClick={() => setOpenCats((s) => ({ ...s, [cat.key]: !open }))}>
                        <ChevronDown size={14} className="spe-palette-cat-chev" />
                        <Txt className="spe-palette-cat-name">{t('palette.cat.' + cat.key, { defaultValue: cat.key })}</Txt>
                        <Txt className="spe-palette-cat-count">{cat.blocks.length}</Txt>
                      </Btn>
                      {open ? <Box className="spe-palette-grid">{cat.blocks.map(item)}</Box> : null}
                    </Box>
                  )
                })
              })()}
            </Box>
          ) : null}
          <Box as="ul" className="spe-seclist">
            {draft.sections.map((s, i) => {
              const Ico = BLOCK_ICON[s.type] || Sparkles
              return (
              <Box as="li"
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
                <Txt className="spe-sec-ico" aria-hidden="true"><Ico size={14} /></Txt>
                <Txt className="spe-sec-label">{t('blocks.' + s.type, { defaultValue: BLOCK_TYPES[s.type]?.label || s.type })}</Txt>
                <Txt className="spe-sec-actions">
                  <Btn className="spe-sec-move" disabled={i === 0} onClick={(e) => { e.stopPropagation(); reorder(i, i - 1) }} title={t('editor.moveUp')} aria-label={t('editor.moveUp')}><ChevronUp size={13} /></Btn>
                  <Btn className="spe-sec-move" disabled={i === draft.sections.length - 1} onClick={(e) => { e.stopPropagation(); reorder(i, i + 1) }} title={t('editor.moveDown')} aria-label={t('editor.moveDown')}><ChevronDown size={13} /></Btn>
                  <Btn className="spe-sec-move" onClick={(e) => { e.stopPropagation(); duplicateSection(s.id) }} title={t('editor.duplicateSection')} aria-label={t('editor.duplicateSection')}><Copy size={13} /></Btn>
                  <Btn className="spe-sec-del" onClick={(e) => { e.stopPropagation(); deleteSection(s.id) }} title={t('editor.deleteSection')} aria-label={t('editor.deleteSection')}><Trash2 size={13} /></Btn>
                </Txt>
              </Box>
              )
            })}
            {draft.sections.length === 0 ? <Box as="li" className="spe-rail-empty">{t('editor.railEmpty')}</Box> : null}
          </Box>
          <Btn className={`spe-design-btn${!selected ? ' is-on' : ''}`} onClick={() => { setSelectedId(null); setMobileSheet(true) }}>
            <Palette size={15} /> {t('editor.designPage')}
          </Btn>
        </Box>

        {/* ── Canvas ────────────────────────────────────────────── */}
        <Box className="spe-canvas-wrap">
          <Box className={`spe-frame spe-frame-${device}`} onClick={onCanvasClick}>
            <SiteRenderer theme={draft.theme} sections={draft.sections} interactive={false} selectedId={selectedId} device={device}
              onEdit={(id, key, value) => updateProps(id, { [key]: value })} />
          </Box>
        </Box>

        {/* ── Right panel: inspector OR design (a bottom sheet on mobile) ── */}
        {mobileSheet ? <Box className="spe-sheet-backdrop" onClick={() => setMobileSheet(false)} /> : null}
        <Box as="aside"
          ref={sheetRef}
          className={`spe-inspector${mobileSheet ? ' is-open' : ''}`}
          {...(sheetModal ? { role: 'dialog', 'aria-modal': 'true', 'aria-label': sheetTitle, tabIndex: -1 } : {})}
        >
          <Box className="spe-sheet-head">
            <Txt className="spe-sheet-title">{sheetTitle}</Txt>
            <Btn className="spe-sheet-close" onClick={() => setMobileSheet(false)}>{t('editor.done')}</Btn>
          </Box>
          {selected
            ? <SectionInspector section={selected} sections={draft.sections} free={draft.theme?.layoutMode === 'free'} onChange={(patch) => updateProps(selected.id, patch)} onStyle={(patch) => updateStyle(selected.id, patch)} />
            : <DesignPanel theme={draft.theme} setTheme={setTheme}
                slug={draft.slug} onSlug={(v) => mutate((d) => ({ ...d, slug: v }))}
                projects={projects} projectId={draft.project_id} onProject={(v) => mutate((d) => ({ ...d, project_id: v }))}
                kind={draft.kind} config={draft.config} setConfig={setConfig} />}
        </Box>
      </Box>

      {pendingDel ? (
        <Box className="spe-toast" role="status">
          <Txt>{t('editor.sectionDeleted')}</Txt>
          <Btn onClick={undoDelete}>{t('editor.undo')}</Btn>
        </Box>
      ) : null}

      {publishOk ? (
        <Box className="spe-toast spe-toast-ok" role="status">
          <CheckCircle2 size={17} />
          <Txt>{t('editor.publishedToast', { defaultValue: 'הדף פורסם!' })}</Txt>
        </Box>
      ) : null}
    </Box>
    </AssetSinkContext.Provider>
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
    <Box className="spe-panel">
      <Txt as="h3" className="spe-panel-title">{t('design.title')}</Txt>

      <Box className="spe-group">
        <Txt as="p" className="spe-group-lbl">{t('design.grpLayout')}</Txt>
        <Box as="label" className="spe-f spe-f-row"><Txt>{t('design.freeLayout')}</Txt>
          <Input type="checkbox" checked={theme.layoutMode === 'free'} onChange={(e) => setTheme({ layoutMode: e.target.checked ? 'free' : 'stack' })} />
        </Box>
        {theme.layoutMode === 'free'
          ? <Txt as="p" style={{ fontSize: 'var(--mg-caption)', color: 'var(--stone)', margin: 0, lineHeight: 1.4 }}>{t('design.freeLayoutHint')}</Txt>
          : null}
      </Box>

      <Box className="spe-group">
        <Txt as="p" className="spe-group-lbl">{t('design.grpAddress')}</Txt>
        <Box as="label" className="spe-f">
          <Txt>{t('design.publicUrl')}</Txt>
          <Input value={slug || ''} placeholder="my-page" onChange={(e) => onSlug(slugifyInput(e.target.value))} />
        </Box>
        <Box as="label" className="spe-f">
          <Txt>{t('design.project')}</Txt>
          <select value={projectId || ''} onChange={(e) => onProject(e.target.value)}>
            <option value="">{t('design.projectNone')}</option>
            {(projects || []).map((p) => <option key={p.id} value={p.id}>{p.name || p.title}</option>)}
          </select>
        </Box>
      </Box>

      <Box className="spe-group">
        <Txt as="p" className="spe-group-lbl">{t('seo.group')}</Txt>
        <Box as="label" className="spe-f"><Txt>{t('seo.title')}</Txt>
          <Input value={seo.title || ''} onChange={(e) => setSeo({ title: e.target.value })} />
        </Box>
        <Box as="label" className="spe-f"><Txt>{t('seo.description')}</Txt>
          <Textarea rows={2} value={seo.description || ''} onChange={(e) => setSeo({ description: e.target.value })} />
        </Box>
        <Box className="spe-f"><Txt>{t('seo.image')}</Txt>
          <ImageField value={seo.image} onChange={(url) => setSeo({ image: url })} />
        </Box>
        <Txt as="p" className="spe-note">{t('seo.hint')}</Txt>
      </Box>

      <Box className="spe-group">
        <Txt as="p" className="spe-group-lbl">{t('design.grpTypography')}</Txt>
        <Box as="label" className="spe-f">
          <Txt>{t('design.font')}</Txt>
          <select value={theme.font} onChange={(e) => setTheme({ font: e.target.value })}>
            {SITE_FONTS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
          </select>
        </Box>
        <Box as="label" className="spe-f spe-f-row">
          <Txt>{t('design.brandColor')}</Txt>
          <Input type="color" value={theme.brandColor} onChange={(e) => setTheme({ brandColor: e.target.value })} />
        </Box>
      </Box>

      <Box className="spe-group">
        <Txt as="p" className="spe-group-lbl">{t('design.grpBackground')}</Txt>
        <Box className="spe-seg">
          {[['scene', t('design.bgScene')], ['flat', t('design.bgFlat')], ['image', t('design.bgImage')]].map(([k, lbl]) => (
            <Btn key={k} className={bg.type === k ? 'is-on' : ''} aria-pressed={bg.type === k}
              onClick={() => setTheme({ background: { type: k, value: k === 'flat' ? '#f7f3ee' : (k === 'scene' ? 'home' : '') } })}>
              {lbl}
            </Btn>
          ))}
        </Box>
        {bg.type === 'scene' ? (
          <Box className="spe-scenes">
            {LEAD_PAGE_BACKGROUNDS.map((s) => (
              <Btn key={s.key} className={`spe-scene${bg.value === s.key ? ' is-on' : ''}`} aria-pressed={bg.value === s.key}
                onClick={() => setTheme({ background: { type: 'scene', value: s.key } })} title={s.label} aria-label={s.label}>
                <img src={`/backgrounds/desktop/day/${s.key}.webp`} alt={s.label} loading="lazy" />
              </Btn>
            ))}
          </Box>
        ) : null}
        {bg.type === 'flat' ? (
          <Box as="label" className="spe-f spe-f-row"><Txt>{t('design.bgFlatColor')}</Txt>
            <Input type="color" value={bg.value || '#f7f3ee'} onChange={(e) => setTheme({ background: { type: 'flat', value: e.target.value } })} />
          </Box>
        ) : null}
        {bg.type === 'image' ? (
          <>
            <ImageField value={bg.value} onChange={(url) => setTheme({ background: { type: 'image', value: url } })} />
            <Txt as="p" className="spe-note">{t('design.bgImageHint')}</Txt>
          </>
        ) : null}
        {bg.type === 'scene' || bg.type === 'image' || (theme.mobileBgOn && theme.mobileBg) ? (
          <>
            <Slider label={t('design.scrim')} min={0} max={70}
              value={theme.scrim ?? (theme.textColor !== 'dark' ? 30 : 0)}
              onChange={(v) => setTheme({ scrim: v })} />
            <Box as="label" className="spe-f spe-f-row"><Txt>{t('design.freezeBg')}</Txt>
              <Input type="checkbox" checked={!!theme.freezeBg} onChange={(e) => setTheme({ freezeBg: e.target.checked })} />
            </Box>
          </>
        ) : null}
        <Box as="label" className="spe-f spe-f-row"><Txt>{t('design.mobileBg')}</Txt>
          <Input type="checkbox" checked={!!theme.mobileBgOn} onChange={(e) => setTheme({ mobileBgOn: e.target.checked })} />
        </Box>
        {theme.mobileBgOn ? (
          <>
            <ImageField value={theme.mobileBg} onChange={(url) => setTheme({ mobileBg: url })} />
            <Txt as="p" className="spe-note">{t('design.mobileBgHint')}</Txt>
          </>
        ) : null}
      </Box>

      <Box className="spe-group">
        <Txt as="p" className="spe-group-lbl">{t('design.grpCards')}</Txt>
        <Slider label={t('design.cardOpacity')} min={0} max={100} value={theme.cardOpacity} onChange={(v) => setTheme({ cardOpacity: v })} />
        <Slider label={t('design.cardBlur')} min={0} max={40} value={theme.cardBlur} onChange={(v) => setTheme({ cardBlur: v })} />
        <Slider label={t('design.cardRadius')} min={8} max={40} value={theme.cardRadius} onChange={(v) => setTheme({ cardRadius: v })} />
      </Box>

      <Box className="spe-group">
        <Txt as="p" className="spe-group-lbl">{t('design.grpText')}</Txt>
        <Box as="label" className="spe-f spe-f-row"><Txt>{t('design.bold')}</Txt>
          <Input type="checkbox" checked={!!theme.bold} onChange={(e) => setTheme({ bold: e.target.checked })} />
        </Box>
        <Box as="label" className="spe-f spe-f-row"><Txt>{t('design.center')}</Txt>
          <Input type="checkbox" checked={theme.textAlign === 'center'} onChange={(e) => setTheme({ textAlign: e.target.checked ? 'center' : 'start' })} />
        </Box>
      </Box>

      {/* Lead-capture settings (config) — pages with a form section. */}
      {kind === 'lead' ? <Box className="spe-group"><LeadSettings config={config || {}} setConfig={setConfig} /></Box> : null}
    </Box>
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
      <Txt as="h3" className="spe-panel-title" style={{ marginTop: 8 }}>{t('settings.title')}</Txt>
      <Box as="label" className="spe-f spe-f-row"><Txt>{t('settings.autoApprove')}</Txt>
        <Input type="checkbox" checked={!!config.autoApprove} onChange={(e) => setConfig({ autoApprove: e.target.checked })} />
      </Box>
      <Box as="label" className="spe-f"><Txt>{t('settings.afterSubmit')}</Txt>
        <select value={ty.mode || 'message'} onChange={(e) => setTy({ mode: e.target.value })}>
          <option value="message">{t('settings.modeMessage')}</option>
          <option value="redirect">{t('settings.modeRedirect')}</option>
        </select>
      </Box>
      {ty.mode === 'redirect'
        ? <Box as="label" className="spe-f"><Txt>{t('settings.redirectUrl')}</Txt><Input placeholder="https://…" value={ty.url || ''} onChange={(e) => setTy({ url: e.target.value })} /></Box>
        : <Box as="label" className="spe-f"><Txt>{t('settings.thankYouMessage')}</Txt><Textarea rows={2} value={ty.message || ''} onChange={(e) => setTy({ message: e.target.value })} /></Box>}
    </>
  )
}

function Slider({ label, min, max, value, onChange }) {
  return (
    <Box as="label" className="spe-f">
      <Txt>{label} · {value}</Txt>
      <Input type="range" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </Box>
  )
}

/* ════════════════════════════════════════════════════════════════
   SECTION INSPECTOR — renders inputs from BLOCK_TYPES[type].editable.
   ════════════════════════════════════════════════════════════════ */
function SectionInspector({ section, sections, free, onChange, onStyle }) {
  const { t } = useT('siteBuilder')
  const def = BLOCK_TYPES[section.type]
  if (!def) return null
  const props = section.props || {}
  const list = Array.isArray(sections) ? sections : []
  const targets = { form: list.some((s) => s.type === 'form'), booking: list.some((s) => s.type === 'booking') }
  return (
    <Box className="spe-panel">
      <Txt as="h3" className="spe-panel-title">{t('blocks.' + section.type, { defaultValue: def.label })}</Txt>
      {def.editable.filter((d) => !d.showWhen || props[d.showWhen]).map((d) => (
        <Descriptor key={d.key} d={d} value={props[d.key]} targets={targets} onChange={(v) => onChange({ [d.key]: v })} />
      ))}
      <SizePosition props={props} onChange={onChange} free={free} section={section} sections={sections} />
      {/* Banner renders as its own sticky row and ignores section.style, so the
          background/padding/full-bleed controls would be dead — hide them for it. */}
      {!free && section.type !== 'banner' ? <SectionDesign style={section.style || {}} onStyle={onStyle} /> : null}
    </Box>
  )
}

/* Per-section DESIGN — background band + vertical rhythm (stack mode). Edits
   section.style (not props). Lets a coach turn a flat stack into alternating
   full-width bands — the biggest lever for a "designed" look. */
function SectionDesign({ style, onStyle }) {
  const { t } = useT('siteBuilder')
  const st = style || {}
  const bg = st.bg || 'none'
  return (
    <Box className="spe-group">
      <Txt as="p" className="spe-group-lbl">{t('section.group', { defaultValue: 'עיצוב הסקשן' })}</Txt>
      <Box as="label" className="spe-f"><Txt>{t('section.bg', { defaultValue: 'רקע הסקשן' })}</Txt>
        <select value={bg} onChange={(e) => onStyle({ bg: e.target.value })}>
          <option value="none">{t('section.bgNone', { defaultValue: 'ללא (שקוף)' })}</option>
          <option value="tint">{t('section.bgTint', { defaultValue: 'גוון עדין' })}</option>
          <option value="brand">{t('section.bgBrand', { defaultValue: 'גוון מותג' })}</option>
          <option value="solid">{t('section.bgSolid', { defaultValue: 'צבע מלא' })}</option>
          <option value="image">{t('section.bgImage', { defaultValue: 'תמונה' })}</option>
        </select>
      </Box>
      {bg === 'solid' ? (
        <Box as="label" className="spe-f spe-f-row"><Txt>{t('section.bgColor', { defaultValue: 'צבע' })}</Txt>
          <Input type="color" value={st.bgColor || '#fffdf9'} onChange={(e) => onStyle({ bgColor: e.target.value })} />
        </Box>
      ) : null}
      {bg === 'image' ? (
        <>
          <ImageField value={st.bgImage} onChange={(url) => onStyle({ bgImage: url })} />
          <Slider label={t('section.overlay', { defaultValue: 'כהות מעל התמונה' })} min={0} max={80} value={st.bgOverlay ?? 0} onChange={(v) => onStyle({ bgOverlay: v })} />
        </>
      ) : null}
      {bg !== 'none' ? (
        <Slider label={t('section.bgOpacity', { defaultValue: 'שקיפות הרקע' })} min={0} max={100} value={st.bgOpacity ?? 100} onChange={(v) => onStyle({ bgOpacity: v })} />
      ) : null}
      {bg !== 'none' ? (
        <Box as="label" className="spe-f spe-f-row"><Txt>{t('section.fullBleed', { defaultValue: 'רוחב מלא (רצועה)' })}</Txt>
          <Input type="checkbox" checked={!!st.fullBleed} onChange={(e) => onStyle({ fullBleed: e.target.checked })} />
        </Box>
      ) : null}
      <Box as="label" className="spe-f"><Txt>{t('section.padY', { defaultValue: 'ריווח אנכי' })}</Txt>
        <select value={st.padY || 'md'} onChange={(e) => onStyle({ padY: e.target.value })}>
          {['none', 'sm', 'md', 'lg', 'xl'].map((p) => (
            <option key={p} value={p}>{t('section.pad_' + p, { defaultValue: p })}</option>
          ))}
        </select>
      </Box>
    </Box>
  )
}

/* Per-section size + position. In STACK mode: a width slider + alignment within the
   column (width is also draggable on the canvas). In FREE mode size/position come
   from dragging, so instead we expose LAYERING (bring to front / send to back) for
   overlapping blocks. */
function SizePosition({ props, onChange, free, sections }) {
  const { t } = useT('siteBuilder')
  if (free) {
    const list = Array.isArray(sections) ? sections : []
    const zs = list.map((s, i) => (s.props?.z != null ? s.props.z : i))
    const bringFront = () => onChange({ z: (zs.length ? Math.max(...zs) : 0) + 1 })
    const sendBack = () => onChange({ z: (zs.length ? Math.min(...zs) : 0) - 1 })
    return (
      <Box className="spe-group">
        <Txt as="p" className="spe-group-lbl">{t('design.grpLayering', { defaultValue: 'שכבות' })}</Txt>
        <Box className="spe-layer-btns">
          <Btn type="button" className="spe-layer-btn" onClick={bringFront}><ChevronUp size={15} /> {t('design.bringFront', { defaultValue: 'הבא לחזית' })}</Btn>
          <Btn type="button" className="spe-layer-btn" onClick={sendBack}><ChevronDown size={15} /> {t('design.sendBack', { defaultValue: 'שלח לאחור' })}</Btn>
        </Box>
        <Txt as="p" className="spe-note">{t('design.freeSizeHint', { defaultValue: 'גודל ומיקום נקבעים בגרירה על הקנבס.' })}</Txt>
      </Box>
    )
  }
  // boxWidth/boxAlign (not width/align) so they never clash with a block's own
  // width prop (image/divider) or align prop (icon).
  const width = Number(props.boxWidth) || 100
  const align = props.boxAlign || 'center'
  return (
    <Box className="spe-group">
      <Txt as="p" className="spe-group-lbl">{t('design.grpSize', { defaultValue: 'גודל ומיקום' })}</Txt>
      <Box as="label" className="spe-f"><Txt>{t('design.width', { defaultValue: 'רוחב' })} — {width}%</Txt>
        <Input type="range" min={25} max={100} value={width} onChange={(e) => onChange({ boxWidth: Number(e.target.value) })} />
      </Box>
      {width < 100 ? (
        <Box className="spe-f spe-f-row"><Txt>{t('labels.align')}</Txt>
          <Box className="spe-align">
            {['start', 'center', 'end'].map((a) => (
              <Btn key={a} type="button" className={`spe-align-btn${align === a ? ' is-on' : ''}`} aria-pressed={align === a} onClick={() => onChange({ boxAlign: a })}>
                {t('options.' + a, { defaultValue: a })}
              </Btn>
            ))}
          </Box>
        </Box>
      ) : null}
    </Box>
  )
}

function Descriptor({ d, value, targets, onChange }) {
  const { t } = useT('siteBuilder')
  const label = t('labels.' + d.key, { defaultValue: d.label })
  switch (d.type) {
    case 'text':
      return <Box as="label" className="spe-f"><Txt>{label}</Txt><Input value={value ?? ''} onChange={(e) => onChange(e.target.value)} /></Box>
    case 'textarea':
      return <Box as="label" className="spe-f"><Txt>{label}</Txt><Textarea rows={3} value={value ?? ''} onChange={(e) => onChange(e.target.value)} /></Box>
    case 'richtext':
      return <RichTextField d={d} value={value} onChange={onChange} />
    case 'number':
      return <Box as="label" className="spe-f"><Txt>{label}</Txt><Input type="number" value={value ?? 0} onChange={(e) => onChange(Number(e.target.value))} /></Box>
    case 'datetime': {
      // Store an absolute instant (ISO) so a countdown ends at the SAME moment for
      // every visitor, regardless of their timezone — display it back in the editor's
      // local time. Tolerates legacy zoneless values (new Date parses them as local).
      const toInput = (v) => {
        if (!v) return ''
        const dt = new Date(v)
        if (isNaN(dt.getTime())) return ''
        const p = (n) => String(n).padStart(2, '0')
        return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}T${p(dt.getHours())}:${p(dt.getMinutes())}`
      }
      return <Box as="label" className="spe-f"><Txt>{label}</Txt><Input type="datetime-local" value={toInput(value)}
        onChange={(e) => { const v = e.target.value; if (!v) return onChange(''); const dt = new Date(v); onChange(isNaN(dt.getTime()) ? v : dt.toISOString()) }} /></Box>
    }
    case 'range': {
      const rv = value ?? d.def ?? d.max ?? 100
      return <Box as="label" className="spe-f"><Txt>{label} — {rv}{d.unit ?? '%'}</Txt><Input type="range" min={d.min ?? 0} max={d.max ?? 100} value={rv} onChange={(e) => onChange(Number(e.target.value))} /></Box>
    }
    case 'toggle':
      return <Box as="label" className="spe-f spe-f-row"><Txt>{label}</Txt><Input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} /></Box>
    case 'color':
      return <Box as="label" className="spe-f spe-f-row"><Txt>{label}</Txt><Input type="color" value={value || '#000000'} onChange={(e) => onChange(e.target.value)} /></Box>
    case 'textColor':
      return <Box className="spe-f spe-f-row"><Txt>{label}</Txt><TextColorField value={value} onChange={onChange} /></Box>
    case 'select':
      return (
        <Box as="label" className="spe-f"><Txt>{label}</Txt>
          <select value={value || d.options[0]} onChange={(e) => onChange(e.target.value)}>
            {d.options.map((o) => <option key={o} value={o}>{t('options.' + o, { defaultValue: o })}</option>)}
          </select>
        </Box>
      )
    case 'image':
      return <Box className="spe-f"><Txt>{label}</Txt><ImageField value={value} onChange={onChange} /></Box>
    case 'icon':
      return <Box className="spe-f"><Txt>{label}</Txt><IconPicker value={value} onChange={onChange} /></Box>
    case 'action':
      return <Box className="spe-f"><Txt>{label}</Txt><ActionField value={value} targets={targets} onChange={onChange} /></Box>
    case 'list':
      return <ListField d={d} value={value} onChange={onChange} />
    case 'bookingPage':
      return <Box className="spe-f"><Txt>{label}</Txt><BookingPageField value={value} onChange={onChange} /></Box>
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
    <Btn type="button" className="spe-rich-btn" onMouseDown={(ev) => ev.preventDefault()} onClick={on} title={lbl} aria-label={lbl}><Ic size={14} /></Btn>
  )
  return (
    <Box className="spe-f spe-rich">
      <Txt>{t('labels.' + d.key, { defaultValue: d.label })}</Txt>
      <Box className="spe-rich-bar">
        <Btn on={() => wrap('**')} icon={Bold} label={t('rich.bold')} />
        <Btn on={() => wrap('*')} icon={Italic} label={t('rich.italic')} />
        <Btn on={link} icon={LinkIcon} label={t('rich.link')} />
        <Btn on={() => prefix('- ')} icon={List} label={t('rich.list')} />
        <Btn on={() => prefix('## ')} icon={Heading} label={t('rich.heading')} />
      </Box>
      <Textarea ref={ref} rows={6} value={v} onChange={(e) => onChange(e.target.value)} />
      <Txt as="p" className="spe-rich-hint">{t('rich.hint')}</Txt>
    </Box>
  )
}

/* Per-section text color — "auto" (readable per the page background) or a custom
   colour. Replaces the old global light/dark toggle. */
function TextColorField({ value, onChange }) {
  const { t } = useT('siteBuilder')
  const isAuto = !value || value === 'auto'
  return (
    <Box className="spe-textcolor">
      <Btn type="button" className={`spe-tc-auto${isAuto ? ' is-on' : ''}`} aria-pressed={isAuto} onClick={() => onChange('auto')}>{t('design.colorAuto')}</Btn>
      <Input type="color" value={isAuto ? '#2c2621' : value} onChange={(e) => onChange(e.target.value)} aria-label={t('labels.color')} />
    </Box>
  )
}

/* Booking-page picker — choose which existing booking page's slot-picker the
   block embeds. Stores the page's public ref (slug, or id). Only published
   pages are offered (the inline picker needs a live booking-intake config). */
function BookingPageField({ value, onChange }) {
  const { t } = useT('siteBuilder')
  const { pages, loading } = useBookingPages()
  const published = (pages || []).filter((p) => p.published)
  if (loading) return <Txt as="p" className="spe-note">{t('hub.loading')}</Txt>
  if (!published.length) return <Txt as="p" className="spe-note spe-err">{t('inspector.noBookingPages')}</Txt>
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
  const registerAsset = useContext(AssetSinkContext)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const inputRef = useRef(null)
  const pick = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setErr(''); setBusy(true)
    try {
      const { url, path } = await uploadPageAsset(file)
      onChange(url)
      // Track the upload but DON'T purge the replaced image — an undo could bring it
      // back, and it may still be live on the published page. The editor reconciles
      // every orphan (replaced/cleared/deleted) at the next save.
      registerAsset?.(path)
    } catch (ex) { setErr(t('assets.' + ex.message, { defaultValue: t('inspector.uploadFailed') })) } finally { setBusy(false); if (inputRef.current) inputRef.current.value = '' }
  }
  const clear = () => { onChange('') }   // asset GC deferred to save (undo-safe)
  return (
    <Box className="spe-image">
      {value ? <Box className="spe-image-prev"><img src={value} alt="" /><Btn onClick={clear} title={t('inspector.removeImage')} aria-label={t('inspector.removeImage')}><X size={14} /></Btn></Box> : null}
      <Btn className="spe-upload" onClick={() => inputRef.current?.click()} disabled={busy}>
        <Upload size={14} /> {busy ? t('inspector.uploading') : value ? t('inspector.replaceImage') : t('inspector.uploadImage')}
      </Btn>
      <Input ref={inputRef} type="file" accept="image/*" hidden onChange={pick} />
      {err ? <Txt as="p" className="spe-err">{err}</Txt> : null}
    </Box>
  )
}

/* Localized search keywords for the curated icon set (he + en) so a coach can
   find an icon by meaning ("לב" / "heart") instead of scanning the whole grid. */
const ICON_KEYWORDS = {
  Check: 'וי אישור נכון בוצע check ok done',
  Star: 'כוכב מועדף דירוג איכות star favorite rating',
  Heart: 'לב אהבה אכפתיות חמלה heart love care',
  Sparkles: 'ניצוצות קסם נצנוץ ייחודי sparkle magic shine',
  Sun: 'שמש יום אור אנרגיה sun day light',
  Moon: 'ירח לילה רוגע moon night calm',
  Leaf: 'עלה טבע צמיחה אקולוגי leaf nature growth',
  Target: 'מטרה יעד פוקוס מיקוד target goal focus',
  Award: 'פרס הצטיינות מדליה איכות award medal quality',
  Clock: 'שעון זמן מהירות זמינות clock time',
  Calendar: 'יומן לוח תאריך פגישה calendar date schedule',
  Phone: 'טלפון שיחה חיוג phone call',
  Mail: 'מייל אימייל דואר הודעה mail email',
  MapPin: 'מיקום כתובת מפה סיכה location map address pin',
  MessageCircle: 'הודעה צ׳אט שיחה ווטסאפ message chat whatsapp',
  Users: 'אנשים קבוצה לקוחות קהילה users people group community',
  BookOpen: 'ספר לימוד קריאה ידע book learn read',
  Compass: 'מצפן כיוון ניווט הכוונה compass direction',
  Smile: 'חיוך שמחה רגש פשטות smile happy',
  Shield: 'מגן ביטחון אמינות הגנה shield trust security',
  Zap: 'ברק מהירות אנרגיה זריזות zap fast energy',
  Coffee: 'קפה פגישה הפסקה coffee meeting',
  Feather: 'נוצה קלילות עדינות feather light',
  Gift: 'מתנה הפתעה בונוס gift present bonus',
}

/* Icon picker — a compact swatch showing the current icon that opens a searchable
   popover. (Was an always-open 24-cell grid that rendered inline for EVERY list
   item, turning the inspector into a wall of repeated icon grids.) Collapsed by
   default; the popover closes on pick / outside-click / Escape. */
function IconPicker({ value, onChange }) {
  const { t } = useT('siteBuilder')
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return undefined
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey) }
  }, [open])
  const needle = q.trim().toLowerCase()
  const names = needle
    ? ICON_NAMES.filter((n) => n.toLowerCase().includes(needle) || (ICON_KEYWORDS[n] || '').toLowerCase().includes(needle))
    : ICON_NAMES
  return (
    <Box className="spe-iconpick" ref={ref}>
      <Btn type="button" className={`spe-iconswatch${open ? ' is-open' : ''}`} onClick={() => setOpen((v) => !v)} aria-haspopup="listbox" aria-expanded={open}>
        <Txt className="spe-iconswatch-icn">{createElement(iconByName(value), { size: 18 })}</Txt>
        <Txt className="spe-iconswatch-name">{value || t('inspector.pickIcon', { defaultValue: 'בחרו אייקון' })}</Txt>
        <ChevronDown size={15} className="spe-iconswatch-chev" />
      </Btn>
      {open ? (
        <Box className="spe-iconpop">
          <Box className="spe-iconpop-search">
            <Search size={14} />
            <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)}
              placeholder={t('inspector.searchIcon', { defaultValue: 'חיפוש אייקון…' })}
              aria-label={t('inspector.searchIcon', { defaultValue: 'חיפוש אייקון' })} />
          </Box>
          <Box className="spe-iconpop-grid" role="listbox">
            {names.map((name) => {
              const Icon = iconByName(name)
              return (
                <Btn key={name} type="button" role="option" aria-selected={value === name}
                  className={`spe-iconcell${value === name ? ' is-on' : ''}`}
                  onClick={() => { onChange(name); setOpen(false); setQ('') }} title={name} aria-label={name}>
                  <Icon size={18} />
                </Btn>
              )
            })}
            {names.length === 0 ? <Txt as="p" className="spe-iconpop-empty">{t('inspector.noIcons', { defaultValue: 'לא נמצאו אייקונים' })}</Txt> : null}
          </Box>
        </Box>
      ) : null}
    </Box>
  )
}

function ActionField({ value, targets, onChange }) {
  const { t } = useT('siteBuilder')
  const a = value || { type: 'link', url: '' }
  // Warn when the button points to a block that doesn't exist on the page.
  const missing = (a.type === 'scrollToForm' && targets && !targets.form)
    || (a.type === 'booking' && targets && !targets.booking)
  return (
    <Box className="spe-action">
      <select value={a.type} onChange={(e) => onChange({ ...a, type: e.target.value })}>
        <option value="link">{t('action.link')}</option>
        <option value="scrollToForm">{t('action.scrollToForm')}</option>
        <option value="booking">{t('action.booking')}</option>
      </select>
      {a.type === 'link' ? (
        <Input placeholder="https://…" value={a.url || ''} onChange={(e) => onChange({ ...a, url: e.target.value })} />
      ) : null}
      {missing ? <Txt as="p" className="spe-note spe-err">{t('inspector.noTargetHint')}</Txt> : null}
    </Box>
  )
}

function ListField({ d, value, onChange }) {
  const { t } = useT('siteBuilder')
  const items = Array.isArray(value) ? value : []
  const setItem = (i, patch) => onChange(items.map((it, j) => (j === i ? { ...it, ...patch } : it)))
  const add = () => onChange([...items, Object.fromEntries(d.item.map((f) => [f.key,
    f.type === 'icon' ? 'Check'
      : (f.type === 'select' && Array.isArray(f.options) && f.options.length) ? f.options[0]
      : '']))])
  const remove = (i) => onChange(items.filter((_, j) => j !== i))
  return (
    <Box className="spe-f">
      <Txt>{t('labels.' + d.key, { defaultValue: d.label })}</Txt>
      {items.map((it, i) => (
        <Box className="spe-listitem" key={i}>
          <Box className="spe-listitem-head"><Txt>#{i + 1}</Txt><Btn onClick={() => remove(i)}><Trash2 size={13} /></Btn></Box>
          {d.item.map((f) => (
            <Descriptor key={f.key} d={f} value={it[f.key]} onChange={(v) => setItem(i, { [f.key]: v })} />
          ))}
        </Box>
      ))}
      <Btn className="spe-add-row" onClick={add}><Plus size={14} /> {t('inspector.addItem')}</Btn>
    </Box>
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
  // Per-option editing for choice fields (select/checkbox): one row each, add/remove individually.
  const setOption = (i, oi, val) => setField(i, { options: (fields[i].options || []).map((o, k) => (k === oi ? val : o)) })
  const addOption = (i) => setField(i, { options: [...(fields[i].options || []), ''] })
  const removeOption = (i, oi) => setField(i, { options: (fields[i].options || []).filter((_, k) => k !== oi) })
  return (
    <Box className="spe-f">
      <Txt>{t('fields.formFields')}</Txt>
      {fields.map((f, i) => (
        <Box className="spe-listitem" key={f.key}>
          <Box className="spe-listitem-head">
            <Input className="spe-flex" value={f.label} onChange={(e) => setField(i, { label: e.target.value })} />
            {!f.builtin ? <Btn onClick={() => remove(i)}><Trash2 size={13} /></Btn> : null}
          </Box>
          <Box className="spe-field-row">
            <select value={f.type} disabled={f.builtin} onChange={(e) => setField(i, { type: e.target.value, ...(isChoiceType(e.target.value) && !f.options ? { options: defaultChoiceOptions() } : {}) })}>
              {FIELD_TYPES.map((ft) => <option key={ft} value={ft}>{t('fieldTypes.' + ft)}</option>)}
            </select>
            <Box as="label" className="spe-req-toggle"><Input type="checkbox" checked={!!f.required} onChange={(e) => setField(i, { required: e.target.checked })} /> {t('fields.required')}</Box>
          </Box>
          {isChoiceType(f.type) ? (
            <Box className="spe-opts">
              {(f.options || []).map((o, oi) => (
                <Box className="spe-opt-row" key={oi}>
                  <Input className="spe-flex" placeholder={t('fields.optionPlaceholder')}
                    value={o} onChange={(e) => setOption(i, oi, e.target.value)} />
                  <Btn onClick={() => removeOption(i, oi)}><Trash2 size={13} /></Btn>
                </Box>
              ))}
              <Btn className="spe-add-opt" onClick={() => addOption(i)}><Plus size={13} /> {t('fields.addOption')}</Btn>
            </Box>
          ) : isConsentType(f.type) ? (
            <>
              <Input className="spe-flex" placeholder={t('fields.consentLinkUrl')}
                value={f.link || ''} onChange={(e) => setField(i, { link: e.target.value })} />
              <Input className="spe-flex" placeholder={t('fields.consentLinkText')}
                value={f.linkText || ''} onChange={(e) => setField(i, { linkText: e.target.value })} />
            </>
          ) : null}
        </Box>
      ))}
      <Btn className="spe-add-row" onClick={add}><Plus size={14} /> {t('fields.addField')}</Btn>
    </Box>
  )
}
