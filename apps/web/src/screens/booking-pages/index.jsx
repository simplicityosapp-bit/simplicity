import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  ArrowRight, Plus, Trash2, Copy, Check, ExternalLink, Settings, Link2, X, ChevronDown,
  Clock, CalendarClock,
} from 'lucide-react'
import { useBookingPages } from '../../hooks/useBookingPages'
import { useSubscription } from '../../hooks/useSubscription'
import { useUpgradeNav } from '../../hooks/useUpgradeNav'
import { useMeetingTypes } from '../../hooks/useMeetingTypes'
import { useProjects } from '../../hooks/useProjects'
import { useGoogleCalendar } from '../../hooks/useGoogleCalendar'
import Coachmark from '../../components/Coachmark'
import InfoPopover from '../../components/InfoPopover'
import SelectMenu from '../../components/SelectMenu'
import {
  DEFAULT_CONTENT, DEFAULT_AVAILABILITY, newBookingPageDraft, weekdayLabels,
  publicBookingPageUrl, normalizeSlug, isValidSlug, slugifyInput, leadPageSurface,
  findUnbookableDay,
  sanitizeAvailability, findInvalidWindow,
} from '../../lib/bookingPageSchema'
import { GROW_ENABLED } from '../../lib/grow'
import DesignToolbox from '../../components/DesignToolbox'
import { ROUTES } from '../../lib/routes'
import { copyText } from '../../lib/clipboard'
import { setLeaveGuard, clearLeaveGuard, confirmLeave } from '../../lib/leaveGuard'
import ConfirmModal from '../../modals/ConfirmModal'
import PageSetupWizard from '../../modals/PageSetupWizard'
import { needsSetupWizard } from '../../lib/pageSetup'
import { showError } from '../../lib/toast'
import { useT } from '../../i18n/useT'
import './bookingI18n'                     // self-registers the 'booking' namespace
import '../lead-page/LeadPage.css'        // shared public-page look (lp-*)
import '../lead-pages/LeadPagesScreen.css' // shared builder chrome (lpe-*, lpm-*)
import './BookingPagesScreen.css'
import { Box, Txt, Btn, Input, Textarea, Lnk } from '../../components/ui'          // booking-specific (bk-*)

/* ════════════════════════════════════════════════════════════════
   BOOKING PAGES — in-app builder + management for public booking pages.
   Sibling of the Lead Pages builder: a list view ↔ a live builder, with
   a branding canvas + meeting-type picker + weekly-availability editor.
   ════════════════════════════════════════════════════════════════ */
export default function BookingPagesScreen() {
  const navigate = useNavigate()
  const location = useLocation()
  const { t } = useT('booking')
  const { t: ts } = useT('subscription')
  const { pages, loading, error, addPage, updatePage, removePage } = useBookingPages()
  const { limits } = useSubscription()
  const goUpgrade = useUpgradeNav()
  const [editingId, setEditingId] = useState(() => location.state?.editPageId ?? null)

  const editing = useMemo(() => {
    if (editingId === 'new') return null
    return pages.find((p) => p.id === editingId) || null
  }, [editingId, pages])

  /* Free tier gets ONE booking page — manage it freely, but creating a second
     is gated. Infinity while billing isn't enforced → never blocks. */
  const atLimit = (pages?.length || 0) >= limits.bookingPages

  if (editingId) {
    return (
      <BookingPageBuilder
        key={editingId}
        page={editing}
        isNew={editingId === 'new'}
        onAdd={addPage}
        onUpdate={updatePage}
        onBack={() => setEditingId(null)}
        onSavedNew={(row) => setEditingId(row.id)}
      />
    )
  }

  return (
    <Box className="screen bk-screen">
      <Box className="screen-top">
        <Box as="header" className="screen-head">
          <Txt as="p" className="t-screen">
            <CalendarClock size={20} strokeWidth={1.6} aria-hidden="true" />
            {t('pages.screenTitle')}
          </Txt>
        </Box>
        <Coachmark id="add-booking-page" radius="50%">
          <Btn className="cta-add" type="button" onClick={() => (atLimit ? goUpgrade() : setEditingId('new'))}>{t('pages.newPage')}</Btn>
        </Coachmark>
      </Box>
      {atLimit && (
        <Btn type="button" className="sub-limit-note" onClick={goUpgrade}>{ts('limit.pages')} · {ts('limit.upgrade')}</Btn>
      )}

      {/* This screen has two doors: the calendar and the public-pages hub. The
          link used to be hard-wired to the calendar, so arriving from the hub
          and pressing "חזרה" put you somewhere you had never been. `location.key`
          is 'default' only on a cold load (a bookmark, a refresh) — anywhere else
          there is app history to step back into. */}
      <Btn type="button" className="lp-back-link"
        onClick={() => (location.key === 'default' ? navigate(ROUTES.CALENDAR) : navigate(-1))}>
        <ArrowRight size={16} strokeWidth={1.7} aria-hidden="true" />
        {location.key === 'default' ? t('pages.backToCalendar') : t('pages.back')}
      </Btn>

      {loading ? (
        <Box className="empty"><Txt as="p" className="empty-text">{t('pages.loading')}</Txt></Box>
      ) : error ? (
        <Box className="empty"><Txt as="p" className="empty-text">{t('pages.loadError', { error })}</Txt></Box>
      ) : pages.length === 0 ? (
        <Box className="empty">
          <Txt as="p" className="empty-text">{t('pages.emptyText')}</Txt>
          <Btn type="button" className="lpm-empty-cta" onClick={() => setEditingId('new')}>
            <Plus size={16} strokeWidth={1.8} aria-hidden="true" /> {t('pages.newPage')}
          </Btn>
        </Box>
      ) : (
        <Box className="lpm-list">
          {pages.map((p) => (
            <PageCard
              key={p.id}
              page={p}
              onEdit={() => setEditingId(p.id)}
              onDelete={() => removePage(p.id)}
            />
          ))}
        </Box>
      )}
    </Box>
  )
}

function PageCard({ page, onEdit, onDelete }) {
  const { t } = useT('booking')
  const [copied, setCopied] = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)
  const url = publicBookingPageUrl(page.slug || page.id)
  const copy = async () => {
    if (await copyText(url)) { setCopied(true); setTimeout(() => setCopied(false), 1600) }
    else showError(t('pages.copyFailed'))
  }
  return (
    <Box className="lpm-card">
      <Box className="lpm-card-main">
        <Txt as="p" className="lpm-card-title">{page.title?.trim() || t('pages.untitled')}</Txt>
        <Box className="lpm-badges">
          <Txt className={`lpm-badge${page.published ? ' is-live' : ''}`}>{page.published ? t('pages.statusLive') : t('pages.statusDraft')}</Txt>
          {page.auto_confirm
            ? <Txt className="lpm-badge is-auto">{t('pages.autoConfirmBadge')}</Txt>
            : <Txt className="lpm-badge">{t('pages.manualConfirmBadge')}</Txt>}
          <InfoPopover
            label={t('pages.confirmInfoLabel')}
            text={page.auto_confirm
              ? t('pages.confirmInfoAuto')
              : t('pages.confirmInfoManual')}
          />
        </Box>
      </Box>
      <Box className="lpm-card-actions">
        {page.published && (
          <>
            <Btn type="button" className="lpm-icon-btn" onClick={copy} aria-label={t('pages.copyLinkLabel')} title={t('pages.copyLinkLabel')}>
              {copied ? <Check size={16} strokeWidth={2} /> : <Copy size={16} strokeWidth={1.7} />}
            </Btn>
            <Lnk className="lpm-icon-btn" href={url} target="_blank" rel="noreferrer" aria-label={t('pages.openPageLabel')} title={t('pages.openPageLabel')}>
              <ExternalLink size={16} strokeWidth={1.7} />
            </Lnk>
          </>
        )}
        <Btn type="button" className="lpm-edit-btn" onClick={onEdit}>{t('pages.edit')}</Btn>
        <Btn type="button" className="lpm-icon-btn danger" onClick={() => setConfirmDel(true)} aria-label={t('pages.deleteLabel')} title={t('pages.deleteLabel')}>
          <Trash2 size={16} strokeWidth={1.7} />
        </Btn>
      </Box>

      {/* One tap used to delete it outright. There is an undo toast afterwards,
          but a live page — the one clients are booking through — should not come
          off the air on a mis-tap. The pages builder asks; so does this now. */}
      {confirmDel ? (
        <ConfirmModal
          open
          danger
          onClose={() => setConfirmDel(false)}
          title={t('pages.deleteConfirmTitle')}
          message={page.published ? t('pages.deleteConfirmLive') : t('pages.deleteConfirmDraft')}
          confirmLabel={t('pages.deleteLabel')}
          onConfirm={onDelete}
        />
      ) : null}
    </Box>
  )
}

/* ── Builder ─────────────────────────────────────────────────────────── */
/* The builder's starting draft. Module-scoped so the unsaved-work guard can take
   its own snapshot of exactly the same starting point (see `baseline` below)
   without the two definitions drifting apart. */
function draftFromPage(page, isNew) {
  if (isNew || !page) return newBookingPageDraft()
  return {
    title: page.title ?? '',
    published: !!page.published,
    auto_confirm: !!page.auto_confirm,
    require_payment: !!page.require_payment,
    write_to_google: !!page.write_to_google,
    invite_client: !!page.invite_client,
    project_id: page.project_id ?? '',
    slug: page.slug ?? '',
    content: { ...DEFAULT_CONTENT, ...(page.content || {}), thankYou: { ...DEFAULT_CONTENT.thankYou, ...(page.content?.thankYou || {}) } },
    availability: { ...DEFAULT_AVAILABILITY, ...(page.availability || {}), weekly: { ...DEFAULT_AVAILABILITY.weekly, ...((page.availability || {}).weekly || {}) } },
    meeting_type_ids: Array.isArray(page.meeting_type_ids) ? page.meeting_type_ids : [],
    meeting_type_durations: (page.meeting_type_durations && typeof page.meeting_type_durations === 'object') ? page.meeting_type_durations : {},
  }
}

function BookingPageBuilder({ page, isNew, onAdd, onUpdate, onBack, onSavedNew }) {
  const { t } = useT('booking')
  const [draft, setDraft] = useState(() => draftFromPage(page, isNew))
  const { projects } = useProjects()
  const { types, addType } = useMeetingTypes()
  const { status: gcalStatus } = useGoogleCalendar()
  const gcalConnected = !!gcalStatus?.connected
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  /* The message used to be printed twice — once under the top bar and once above
     the bottom buttons — because save can be pressed at either end of a page
     that runs to ~2,500px. One copy, brought to whoever pressed. */
  const errRef = useRef(null)
  useEffect(() => {
    if (err) errRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [err])
  const [copied, setCopied] = useState(false)
  const [showSettings, setShowSettings] = useState(isNew)
  /* Creating a page is one ~2,500px form. Making it once, top to bottom, is the
     job — so a NEW page opens with everything expanded. Coming back to an
     existing page is almost always about one thing, so the two config cards
     start folded and their headers carry the count that answers "is it still
     set up right?" without opening anything. */
  const [openCards, setOpenCards] = useState({ types: isNew, availability: isNew })
  /* Unsaved-work guard. This builder holds the whole page in local state and had
     nothing protecting it: no beforeunload, no route guard, and "ביטול"/"חזרה"
     dropped the draft without a word — the same hole the pages builder had. There
     is no per-edit dirty flag here (every field writes straight into `draft`), so
     dirtiness is the draft measured against the snapshot it started from.

     State, not a ref: `dirty` is read during render, and a ref read there would
     never trigger the re-render that turns the guard on. The component is keyed
     by the page being edited, so this initialiser runs once per page. */
  const [baseline, setBaseline] = useState(() => JSON.stringify(draftFromPage(page, isNew)))
  const [pendingLeave, setPendingLeave] = useState(null)
  const [setupFor, setSetupFor] = useState(null)   // { row, next } — the setup wizard, after a save
  const draftJson = useMemo(() => JSON.stringify(draft), [draft])
  const dirty = draftJson !== baseline
  // In-app "new meeting type" dialog (replaces window.prompt, blocked on mobile).
  const [newTypeOpen, setNewTypeOpen] = useState(false)
  const [newTypeName, setNewTypeName] = useState('')
  const [addingType, setAddingType] = useState(false)

  /* Browser refresh / tab close. */
  useEffect(() => {
    if (!dirty) return undefined
    const onBeforeUnload = (e) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirty])

  /* …and navigation inside the app, which beforeunload never sees. The chrome
     asks this guard first; we block, ask in the app's modal, and replay. */
  useEffect(() => {
    if (!dirty) return undefined
    const ask = (retry) => { setPendingLeave({ retry: retry || null }); return false }
    setLeaveGuard(ask)
    return () => clearLeaveGuard(ask)
  }, [dirty])

  /* Every way out of the builder that isn't "save" goes through the guard. */
  const leave = () => { if (confirmLeave(onBack)) onBack() }

  const set = (patch) => setDraft((d) => ({ ...d, ...patch }))
  const setContent = (patch) => setDraft((d) => ({ ...d, content: { ...d.content, ...patch } }))
  const setThankYou = (patch) => setDraft((d) => ({ ...d, content: { ...d.content, thankYou: { ...d.content.thankYou, ...patch } } }))
  const setAvail = (patch) => setDraft((d) => ({ ...d, availability: { ...d.availability, ...patch } }))
  const setWeekly = (day, windows) => setDraft((d) => ({ ...d, availability: { ...d.availability, weekly: { ...d.availability.weekly, [day]: windows } } }))

  const availTypes = (types || []).filter((t) => !t.deleted_at)
  const toggleType = (id) => setDraft((d) => {
    const has = d.meeting_type_ids.includes(id)
    return { ...d, meeting_type_ids: has ? d.meeting_type_ids.filter((x) => x !== id) : [...d.meeting_type_ids, id] }
  })
  // Per-PAGE duration override (migration 0059): stored on the draft and saved
  // with the page — NOT written to the shared meeting_types row, so it never
  // affects other pages. Empty clears the override (falls back to the type's
  // own default, then the page default).
  const setTypeDuration = (id, minutes) => setDraft((d) => {
    const next = { ...d.meeting_type_durations }
    if (minutes === '' || minutes == null) delete next[id]
    else next[id] = Number(minutes)
    return { ...d, meeting_type_durations: next }
  })

  /* Every meeting length this page can offer, resolved exactly the way
     booking-intake resolves it: a per-page override wins, then the type's own
     default, then the page default — and with no types picked the page offers a
     single synthetic meeting at the page default. */
  const offeredDurations = () => {
    const def = Number(draft.availability.defaultDurationMinutes) || 0
    const ids = draft.meeting_type_ids
    if (!ids.length) return [def]
    return ids.map((id) => {
      const override = Number(draft.meeting_type_durations[id])
      if (override > 0) return override
      const mt = availTypes.find((x) => x.id === id)
      return Number(mt?.duration_minutes) > 0 ? Number(mt.duration_minutes) : def
    })
  }

  const dayWindows = (day) => {
    const w = draft.availability.weekly?.[day]
    return Array.isArray(w) ? w : []
  }
  /* Everything that must hold before this page may face the public, in one place
     — the save path and the setup wizard's publish button ask the same question
     and get the same sentence back. Returns a message, or null when it is fit
     to go live. */
  const publishProblem = () => {
    const anyAvail = weekdayLabels().some((_, d) => dayWindows(d).length > 0)
    if (!anyAvail) return t('pages.errNoAvailability')
    /* A day whose windows are all shorter than the shortest meeting on offer
       produces nothing, silently — see findUnbookableDay. Checked only against
       going live: while it is a draft the windows and the durations are still
       being typed, in whichever order suits the person typing them. */
    const shortest = Math.min(...offeredDurations())
    const unbookable = findUnbookableDay(draft.availability, shortest)
    if (unbookable) {
      return t('pages.errWindowShorterThanMeeting', {
        day: weekdayLabels()[unbookable.day], minutes: shortest, window: unbookable.longest,
      })
    }
    return null
  }

  const openDayCount = weekdayLabels().filter((_, d) => dayWindows(d).length > 0).length
  const addWindow = (day) => setWeekly(day, [...dayWindows(day), { start: '09:00', end: '17:00' }])
  const updateWindow = (day, i, patch) => setWeekly(day, dayWindows(day).map((w, idx) => (idx === i ? { ...w, ...patch } : w)))
  const removeWindow = (day, i) => setWeekly(day, dayWindows(day).filter((_, idx) => idx !== i))

  const openNewType = () => { setNewTypeName(''); setNewTypeOpen(true) }
  const submitNewType = async () => {
    if (addingType) return
    const name = newTypeName.trim()
    if (!name) return
    setAddingType(true)
    try {
      const row = await addType({ name, sort_order: availTypes.length, duration_minutes: draft.availability.defaultDurationMinutes })
      toggleType(row.id)
      setNewTypeOpen(false)
    } catch (e) { setErr(t('pages.errAddTypeFailed', { error: e.message || '' })) }
    finally { setAddingType(false) }
  }

  /* `publishNow` = the top-bar publish action: it saves AND takes the page live
     in one press, so publishing isn't a checkbox you can tick and forget to save.
     Everything that must hold for a LIVE page is checked against that intent, not
     against the state the draft happens to be in. */
  const save = async ({ publishNow = false } = {}) => {
    if (busy) return // guard against a fast double-click across the two save buttons
    const willPublish = publishNow || draft.published
    setErr('')
    if (!draft.title.trim()) { setShowSettings(true); setErr(t('pages.errInternalName')); return }
    const slug = normalizeSlug(draft.slug)
    if (draft.slug.trim() && !isValidSlug(slug)) {
      setShowSettings(true)
      setErr(t('pages.errSlugFormat'))
      return
    }
    // Reject reversed/empty windows (e.g. 17:00–09:00) — they yield no slots.
    const bad = findInvalidWindow(draft.availability)
    if (bad) { setErr(t('pages.errInvalidWindow', { day: weekdayLabels()[bad.day] })); return }

    const problem = willPublish ? publishProblem() : null
    if (problem) { setErr(problem); return }

    setBusy(true)
    const payload = {
      title: draft.title.trim(),
      published: willPublish,
      auto_confirm: draft.auto_confirm,
      require_payment: !!draft.require_payment,
      write_to_google: draft.write_to_google,
      invite_client: draft.write_to_google && draft.invite_client, // invite only meaningful when writing
      project_id: draft.project_id || null,
      slug: slug || null,
      content: draft.content,
      // Clamp numeric fields: a cleared <input type=number> is 0/NaN, which
      // would break public slot generation if saved verbatim.
      availability: sanitizeAvailability(draft.availability),
      meeting_type_ids: draft.meeting_type_ids,
      // Per-page duration overrides, pruned to currently-offered types only.
      meeting_type_durations: Object.fromEntries(
        Object.entries(draft.meeting_type_durations).filter(([id]) => draft.meeting_type_ids.includes(id)),
      ),
    }
    try {
      /* A page that has just been stored still may not be set up: no address, so
         the link is a uuid — and on the block-engine side, no name either. The
         wizard asks once, here, before the builder hands the screen back. */
      if (isNew) {
        const row = await onAdd(payload)
        if (needsSetupWizard(row, { firstSave: true })) setSetupFor({ row, next: () => onSavedNew(row) })
        else onSavedNew(row)
      } else {
        const row = (await onUpdate(page.id, payload)) || { ...payload, id: page.id }
        if (needsSetupWizard(row)) setSetupFor({ row, next: onBack })
        else onBack()
      }
    } catch (e) {
      setShowSettings(true)
      if (e?.code === '23505' || /duplicate|unique|idx_booking_pages_slug/i.test(e?.message || '')) {
        setErr(t('pages.errSlugTaken'))
      } else {
        // The raw Postgres text means nothing to a coach; keep it for the console.
        console.error('booking page save failed', e)
        setErr(t('pages.errSaveFailed'))
      }
    } finally {
      setBusy(false)
    }
  }

  const url = page?.id ? publicBookingPageUrl(page.slug || page.id) : null
  const copyLink = async () => {
    if (!url) return
    if (await copyText(url)) { setCopied(true); setTimeout(() => setCopied(false), 1600) }
    else showError(t('pages.copyFailed'))
  }

  /* Everything before the part they type — taken from publicBookingPageUrl so
     it cannot drift from the route the page actually answers on. */
  const slugPrefix = publicBookingPageUrl('').replace(/^https?:\/\//, '')
  const c = draft.content
  const { style: canvasStyle, cls: surfaceCls } = leadPageSurface(c)
  const canvasClass = `lpe-canvas lp-surface${surfaceCls ? ` ${surfaceCls}` : ''}`

  return (
    <Box className="screen lpe-screen bk-screen">
      <DesignToolbox content={draft.content} onChange={setContent} />
      <Box className="lpe-topbar">
        <Btn type="button" className="lp-back-link" onClick={leave}>
          <ArrowRight size={16} strokeWidth={1.7} aria-hidden="true" /> {t('pages.back')}
        </Btn>
        <Txt className="lpe-topbar-title">{draft.title.trim() || (isNew ? t('pages.newPageTitle') : t('pages.editPageTitle'))}</Txt>
        <Box className="lpe-topbar-actions">
          {/* Whether the page is live was only knowable by opening "הגדרות" and
              reading a checkbox. It is the first thing about a page, so it says
              itself — and the publish action next to it saves and goes live in
              one press, instead of a tick that does nothing until you also save. */}
          <Txt className={`lpm-badge bk-live-badge${draft.published ? ' is-live' : ''}`}>
            {draft.published ? t('pages.statusLive') : t('pages.statusDraft')}
          </Txt>
          <Btn type="button" className={`lpe-settings-btn${showSettings ? ' is-on' : ''}`} onClick={() => setShowSettings((v) => !v)}>
            <Settings size={16} strokeWidth={1.7} aria-hidden="true" /> {t('pages.settings')}
          </Btn>
          {/* Once it is live, the page itself is one press away — the builder's
              canvas is a branding mock and never shows the slot picker, so this
              is the only way to see what a visitor actually gets. */}
          {draft.published && url && (
            <Lnk className="lpm-icon-btn bk-open-live" href={url} target="_blank" rel="noreferrer"
              aria-label={t('pages.openPageLabel')} title={t('pages.openPageLabel')}>
              <ExternalLink size={16} strokeWidth={1.7} />
            </Lnk>
          )}
          <Btn type="button" className="m-btn-cancel bk-save-draft" onClick={() => save()} disabled={busy}>{busy ? t('pages.saving') : t('pages.save')}</Btn>
          {!draft.published && (
            <Btn type="button" className="m-btn-save" onClick={() => save({ publishNow: true })} disabled={busy}>{t('pages.publishNow')}</Btn>
          )}
        </Box>
      </Box>

      {showSettings && (
        <Box className="lpe-settings">
          <Box className="m-field">
            <Box as="label" className="m-label">{t('pages.internalNameLabel')} <Txt className="bk-req" title={t('pages.requiredField')}>*</Txt></Box>
            <Input className="m-input" required aria-required="true" value={draft.title} onChange={(e) => set({ title: e.target.value })} placeholder={t('pages.internalNamePlaceholder')} />
          </Box>
          <Box className="lpe-settings-row">
            <Box as="label" className="lpb-toggle">
              <Input type="checkbox" checked={draft.published} onChange={(e) => set({ published: e.target.checked })} />
              <Txt><strong>{t('pages.publishTitle')}</strong><em>{t('pages.publishHint')}</em></Txt>
            </Box>
            <Box as="label" className="lpb-toggle">
              <Input type="checkbox" checked={draft.auto_confirm} onChange={(e) => set({ auto_confirm: e.target.checked })} />
              <Txt><strong>{t('pages.autoConfirmTitle')}</strong><em>{t('pages.autoConfirmHint')}</em></Txt>
            </Box>
            {/* Pay-at-booking — only shown when the Grow gateway is enabled
                (hidden while GROW_ENABLED is false, so no page can require it). */}
            {GROW_ENABLED && (
              <Box as="label" className="lpb-toggle">
                <Input type="checkbox" checked={!!draft.require_payment} onChange={(e) => set({ require_payment: e.target.checked })} />
                <Txt><strong>{t('pages.requirePaymentTitle')}</strong><em>{t('pages.requirePaymentHint')}</em></Txt>
              </Box>
            )}
          </Box>

          <Box className="m-field">
            <Box as="label" className="m-label">{t('pages.googleCalendar')}</Box>
            <Box as="label" className={`lpb-toggle${gcalConnected ? '' : ' is-disabled'}`}>
              <Input
                type="checkbox"
                checked={draft.write_to_google}
                disabled={!gcalConnected}
                onChange={(e) => set({ write_to_google: e.target.checked })}
              />
              <Txt>
                <strong>{t('pages.writeToGoogleTitle')}</strong>
                <em>{gcalConnected
                  ? t('pages.writeToGoogleHintConnected')
                  : t('pages.writeToGoogleHintDisconnected')}</em>
              </Txt>
            </Box>
            {gcalConnected && draft.write_to_google && (
              <Box as="label" className="lpb-toggle">
                <Input type="checkbox" checked={draft.invite_client} onChange={(e) => set({ invite_client: e.target.checked })} />
                <Txt><strong>{t('pages.inviteClientTitle')}</strong><em>{t('pages.inviteClientHint')}</em></Txt>
              </Box>
            )}
          </Box>
          <Box className="m-field">
            <Box as="label" className="m-label">{t('pages.projectLabel')}</Box>
            <SelectMenu
              value={draft.project_id || ''}
              onChange={(v) => set({ project_id: v })}
              ariaLabel={t('pages.projectLabel')}
              options={[
                { value: '', label: t('pages.projectNone') },
                ...(projects || []).filter((p) => !p.deleted_at).map((p) => ({ value: p.id, label: p.name })),
              ]}
            />
          </Box>
          <Box className="m-field">
            <Box as="label" className="m-label">{t('pages.slugLabel')}</Box>
            <Box className="lpe-slug-row">
              <Txt className="lpe-slug-prefix mono" dir="ltr">{slugPrefix}</Txt>
              <Input
                className="m-input lpe-slug-input"
                dir="ltr"
                value={draft.slug}
                onChange={(e) => set({ slug: slugifyInput(e.target.value) })}
                placeholder="dana-coaching"
                maxLength={40}
              />
            </Box>
            <Txt as="p" className="lbl-sm">{t('pages.slugHint')}</Txt>
          </Box>
          {/* Appearance (colour, background, opacity, blur, bold, text) lives in
              the left-side "ארגז כלים" toolbox — kept out of settings on purpose. */}
          <Box className="m-field">
            <Box as="label" className="m-label">{t('pages.afterBookingLabel')}</Box>
            <Box className="lpb-radio-group">
              <Box as="label" className="lpb-radio">
                <Input type="radio" name="bk-thankyou" checked={c.thankYou.mode === 'message'} onChange={() => setThankYou({ mode: 'message' })} />
                {t('pages.thankYouModeMessage')}
              </Box>
              <Box as="label" className="lpb-radio">
                <Input type="radio" name="bk-thankyou" checked={c.thankYou.mode === 'redirect'} onChange={() => setThankYou({ mode: 'redirect' })} />
                {t('pages.thankYouModeRedirect')}
              </Box>
            </Box>
            {c.thankYou.mode === 'redirect' ? (
              <Input className="m-input" value={c.thankYou.url} onChange={(e) => setThankYou({ url: e.target.value })} placeholder="https://..." dir="ltr" />
            ) : (
              <Textarea className="m-textarea" value={c.thankYou.message} onChange={(e) => setThankYou({ message: e.target.value })} />
            )}
          </Box>
          {url && (
            <Box className="m-field">
              <Box as="label" className="m-label">{t('pages.publicLinkLabel')}</Box>
              {draft.published ? (
                <Box className="lpb-link-row">
                  <Link2 size={15} strokeWidth={1.7} aria-hidden="true" />
                  <Txt className="lpb-link-url mono" dir="ltr">{url}</Txt>
                  <Btn type="button" className="lpb-copy-btn" onClick={copyLink}>
                    {copied ? <><Check size={14} strokeWidth={2} /> {t('pages.copied')}</> : <><Copy size={14} strokeWidth={1.7} /> {t('pages.copy')}</>}
                  </Btn>
                </Box>
              ) : (
                <Txt as="p" className="lbl-sm">{t('pages.publishToGetLink')}</Txt>
              )}
            </Box>
          )}
        </Box>
      )}

      {err && <Txt as="p" ref={errRef} className="m-error lpe-err">{err}</Txt>}

      {/* Branding preview canvas (logo / heading / body inline) */}
      <Box className={canvasClass} style={canvasStyle}>
        <Box className="lp-card">
          <Input
            className="lp-logo lpe-edit lpe-center"
            value={c.logoText}
            onChange={(e) => setContent({ logoText: e.target.value })}
            placeholder={t('pages.logoPlaceholder')}
            aria-label={t('pages.logoAria')}
          />
          <Input
            className="lp-heading lpe-edit"
            value={c.heading}
            onChange={(e) => setContent({ heading: e.target.value })}
            placeholder={t('pages.headingPlaceholder')}
            aria-label={t('pages.headingAria')}
          />
          <Textarea
            className="lp-body lpe-edit"
            value={c.body}
            onChange={(e) => setContent({ body: e.target.value })}
            placeholder={t('pages.bodyPlaceholder')}
            rows={2}
            aria-label={t('pages.bodyAria')}
          />
          <Box className="bk-preview-hint" aria-hidden="true">
            <CalendarClock size={15} strokeWidth={1.6} /> {t('pages.previewHint')}
          </Box>
          <Box className="lp-submit lpe-submit-preview" aria-hidden="true">{t('pages.submitPreview')}</Box>
        </Box>
      </Box>

      {/* Meeting types */}
      <Box className={`bk-config-card${openCards.types ? ' is-open' : ''}`}>
        <Box className="bk-config-head">
          {/* Heading WRAPS the button — a button may only contain phrasing
              content, so an <h3> inside one is invalid; this is the shape the
              accordion pattern calls for and it keeps the card its heading. */}
          <Txt as="h3" className="bk-config-heading">
            <Btn type="button" className="bk-config-toggle bk-config-title" aria-expanded={openCards.types}
              onClick={() => setOpenCards((s) => ({ ...s, types: !s.types }))}>
              <ChevronDown size={15} strokeWidth={1.9} className="bk-config-chev" aria-hidden="true" />
              <CalendarClock size={17} strokeWidth={1.7} aria-hidden="true" /> {t('pages.meetingTypesTitle')}
              <Txt className="bk-config-count">{draft.meeting_type_ids.length || availTypes.length}</Txt>
            </Btn>
          </Txt>
          {openCards.types && (
            <Btn type="button" className="bk-mini-btn" onClick={openNewType}><Plus size={14} strokeWidth={1.9} /> {t('pages.newType')}</Btn>
          )}
        </Box>
        {!openCards.types ? null : (
        <>
        <Txt as="p" className="lbl-sm">{t('pages.meetingTypesHint')}</Txt>
        {availTypes.length === 0 ? (
          <Txt as="p" className="bk-empty-note">{t('pages.meetingTypesEmpty')}</Txt>
        ) : (
          <Box className="bk-type-list">
            {availTypes.map((mt) => {
              const on = draft.meeting_type_ids.includes(mt.id)
              return (
                <Box key={mt.id} className={`bk-type-row${on ? ' on' : ''}`}>
                  <Box as="label" className="bk-type-pick">
                    <Input type="checkbox" checked={on} onChange={() => toggleType(mt.id)} />
                    <Txt className="bk-type-name">{mt.name}</Txt>
                  </Box>
                  <Box className="bk-type-dur">
                    <Clock size={14} strokeWidth={1.6} aria-hidden="true" />
                    <Input
                      type="number" min="5" step="5"
                      className="bk-dur-input"
                      value={draft.meeting_type_durations[mt.id] ?? ''}
                      placeholder={String(mt.duration_minutes || draft.availability.defaultDurationMinutes)}
                      onChange={(e) => setTypeDuration(mt.id, e.target.value)}
                      aria-label={t('pages.typeDurationAria', { name: mt.name })}
                    />
                    <Txt className="bk-dur-unit">{t('pages.durationUnit')}</Txt>
                  </Box>
                </Box>
              )
            })}
          </Box>
        )}
        </>
        )}
      </Box>

      {/* Availability */}
      <Box className={`bk-config-card${openCards.availability ? ' is-open' : ''}`}>
        <Box className="bk-config-head">
          {/* Heading WRAPS the button — a button may only contain phrasing
              content, so an <h3> inside one is invalid; this is the shape the
              accordion pattern calls for and it keeps the card its heading. */}
          <Txt as="h3" className="bk-config-heading">
            <Btn type="button" className="bk-config-toggle bk-config-title" aria-expanded={openCards.availability}
              onClick={() => setOpenCards((s) => ({ ...s, availability: !s.availability }))}>
              <ChevronDown size={15} strokeWidth={1.9} className="bk-config-chev" aria-hidden="true" />
              <Clock size={17} strokeWidth={1.7} aria-hidden="true" /> {t('pages.availabilityTitle')}
              <Txt className="bk-config-count">{openDayCount}</Txt>
            </Btn>
          </Txt>
        </Box>
        {!openCards.availability ? null : (
        <>
        <Box className="bk-settings-grid">
          <Box as="label" className="bk-num-field">
            <Txt className="bk-num-label">{t('pages.slotIntervalLabel')}<InfoPopover label={t('pages.slotIntervalLabel')} text={t('pages.slotIntervalInfo')} /></Txt>
            <Input type="number" min="5" step="5" value={draft.availability.slotMinutes} onChange={(e) => setAvail({ slotMinutes: Number(e.target.value) })} />
          </Box>
          <Box as="label" className="bk-num-field">
            <Txt className="bk-num-label">{t('pages.defaultDurationLabel')}<InfoPopover label={t('pages.defaultDurationLabel')} text={t('pages.defaultDurationInfo')} /></Txt>
            <Input type="number" min="5" step="5" value={draft.availability.defaultDurationMinutes} onChange={(e) => setAvail({ defaultDurationMinutes: Number(e.target.value) })} />
          </Box>
          <Box as="label" className="bk-num-field">
            <Txt className="bk-num-label">{t('pages.bufferLabel')}<InfoPopover label={t('pages.bufferLabel')} text={t('pages.bufferInfo')} /></Txt>
            <Input type="number" min="0" step="5" value={draft.availability.bufferMinutes} onChange={(e) => setAvail({ bufferMinutes: Number(e.target.value) })} />
          </Box>
          <Box as="label" className="bk-num-field">
            <Txt className="bk-num-label">{t('pages.minNoticeLabel')}<InfoPopover label={t('pages.minNoticeLabel')} text={t('pages.minNoticeInfo')} /></Txt>
            <Input type="number" min="0" step="1" value={draft.availability.minNoticeHours} onChange={(e) => setAvail({ minNoticeHours: Number(e.target.value) })} />
          </Box>
          <Box as="label" className="bk-num-field">
            <Txt className="bk-num-label">{t('pages.maxDaysLabel')}<InfoPopover label={t('pages.maxDaysLabel')} text={t('pages.maxDaysInfo')} /></Txt>
            <Input type="number" min="1" step="1" value={draft.availability.maxDaysAhead} onChange={(e) => setAvail({ maxDaysAhead: Number(e.target.value) })} />
          </Box>
        </Box>

        <Box className="bk-week">
          {weekdayLabels().map((label, day) => {
            const windows = dayWindows(day)
            const open = windows.length > 0
            return (
              <Box key={day} className={`bk-day${open ? ' open' : ''}`}>
                <Box className="bk-day-head">
                  <Txt className="bk-day-name">{label}</Txt>
                  {open ? (
                    <Btn type="button" className="bk-mini-btn" onClick={() => addWindow(day)}><Plus size={13} strokeWidth={1.9} /> {t('pages.addWindow')}</Btn>
                  ) : (
                    <Btn type="button" className="bk-day-add" onClick={() => addWindow(day)}>{t('pages.addAvailability')}</Btn>
                  )}
                </Box>
                {open && (
                  <Box className="bk-windows">
                    {windows.map((w, i) => (
                      <Box className="bk-window" key={i}>
                        <Input type="time" value={w.start} onChange={(e) => updateWindow(day, i, { start: e.target.value })} />
                        <Txt className="bk-window-sep">–</Txt>
                        <Input type="time" value={w.end} onChange={(e) => updateWindow(day, i, { end: e.target.value })} />
                        <Btn type="button" className="lpe-ctrl-btn danger" onClick={() => removeWindow(day, i)} aria-label={t('pages.removeWindowLabel')}><X size={14} /></Btn>
                      </Box>
                    ))}
                  </Box>
                )}
              </Box>
            )
          })}
        </Box>
        </>
        )}
      </Box>

      {setupFor ? (
        <PageSetupWizard
          open
          page={setupFor.row}
          urlPrefix={slugPrefix}
          slugify={slugifyInput}
          isValidSlug={(v) => isValidSlug(normalizeSlug(v))}
          validatePublish={publishProblem}
          onSubmit={async ({ title, slug, publish }) => {
            try {
              await onUpdate(setupFor.row.id, {
                title,
                slug: slug ? normalizeSlug(slug) : null,
                published: publish || !!setupFor.row.published,
              })
            } catch (e) {
              /* The one failure worth repeating in the coach's own words. */
              if (e?.code === '23505' || /duplicate|unique|idx_booking_pages_slug/i.test(e?.message || '')) {
                const friendly = new Error('slug taken')
                friendly.userMessage = t('pages.errSlugTaken')
                throw friendly
              }
              throw e
            }
          }}
          onClose={() => { const next = setupFor.next; setSetupFor(null); next?.() }}
        />
      ) : null}

      {pendingLeave ? (
        <ConfirmModal
          open
          onClose={() => setPendingLeave(null)}
          title={t('pages.leaveTitle')}
          message={t('pages.leaveBody')}
          confirmLabel={t('pages.leaveDiscard')}
          onConfirm={() => {
            const retry = pendingLeave.retry
            setBaseline(draftJson)   // drop the guard before replaying, or it re-fires
            setPendingLeave(null)
            if (retry) retry()
            else onBack()
          }}
        />
      ) : null}

      <Box className="lpe-bottom-actions">
        <Btn type="button" className="m-btn-cancel" onClick={leave}>{t('pages.cancel')}</Btn>
        {/* Bare `save` as a handler would hand the click event to it as options. */}
        <Btn type="button" className="m-btn-save" onClick={() => save()} disabled={busy}>{busy ? t('pages.saving') : t('pages.save')}</Btn>
        {!draft.published && (
          <Btn type="button" className="m-btn-save" onClick={() => save({ publishNow: true })} disabled={busy}>{t('pages.publishNow')}</Btn>
        )}
      </Box>

      {newTypeOpen && (
        <Box
          className="bk-tm-overlay"
          dir="rtl"
          role="dialog"
          aria-modal="true"
          aria-label={t('pages.newTypeDialogLabel')}
          onClick={(e) => { if (e.target === e.currentTarget && !addingType) setNewTypeOpen(false) }}
        >
          <Box className="bk-tm-card">
            <Txt as="h3" className="bk-tm-title">{t('pages.newTypeDialogTitle')}</Txt>
            <Input
              className="bk-tm-input"
              type="text"
              value={newTypeName}
              autoFocus
              maxLength={60}
              placeholder={t('pages.newTypeNamePlaceholder')}
              onChange={(e) => setNewTypeName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); submitNewType() }
                if (e.key === 'Escape' && !addingType) setNewTypeOpen(false)
              }}
            />
            <Box className="bk-tm-actions">
              <Btn type="button" className="m-btn-cancel" onClick={() => setNewTypeOpen(false)} disabled={addingType}>{t('pages.cancel')}</Btn>
              <Btn type="button" className="m-btn-save" onClick={submitNewType} disabled={addingType || !newTypeName.trim()}>
                {addingType ? t('pages.adding') : t('pages.add')}
              </Btn>
            </Box>
          </Box>
        </Box>
      )}
    </Box>
  )
}
