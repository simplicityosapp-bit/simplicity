import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  ArrowRight, Plus, Trash2, Copy, Check, ExternalLink, Settings, Link2, ChevronDown, Eye, EyeOff,
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
import BookingPreview from './BookingPreview'
import BookingCreateWizard from './CreateWizard'
import AvailabilityEditor from './AvailabilityEditor'
import MeetingTypesPicker from './MeetingTypesPicker'
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

  /* Creating and editing are different jobs. Creating is one pass through
     decisions nobody has made yet — that gets the wizard. Editing is almost
     always about one thing, so it opens the whole builder where that one thing
     is reachable without walking five steps to it. */
  if (editingId === 'new') {
    return (
      <BookingCreateWizard
        takenTitles={(pages || []).map((p) => p.title)}
        onAdd={addPage}
        onUpdate={updatePage}
        onExit={() => setEditingId(null)}
        onOpenBuilder={(row) => setEditingId(row?.id ?? null)}
      />
    )
  }

  if (editingId) {
    return (
      <BookingPageBuilder
        key={editingId}
        page={editing}
        onUpdate={updatePage}
        onBack={() => setEditingId(null)}
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
function draftFromPage(page) {
  if (!page) return newBookingPageDraft()
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

function BookingPageBuilder({ page, onUpdate, onBack }) {
  const { t } = useT('booking')
  const navigate = useNavigate()
  const [draft, setDraft] = useState(() => draftFromPage(page))
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
  const [showSettings, setShowSettings] = useState(false)
  /* Creating a page is one ~2,500px form. Making it once, top to bottom, is the
     job — so a NEW page opens with everything expanded. Coming back to an
     existing page is almost always about one thing, so the two config cards
     start folded and their headers carry the count that answers "is it still
     set up right?" without opening anything. */
  const [openCards, setOpenCards] = useState({ types: false, availability: false })
  /* Unsaved-work guard. This builder holds the whole page in local state and had
     nothing protecting it: no beforeunload, no route guard, and "ביטול"/"חזרה"
     dropped the draft without a word — the same hole the pages builder had. There
     is no per-edit dirty flag here (every field writes straight into `draft`), so
     dirtiness is the draft measured against the snapshot it started from.

     State, not a ref: `dirty` is read during render, and a ref read there would
     never trigger the re-render that turns the guard on. The component is keyed
     by the page being edited, so this initialiser runs once per page. */
  const [baseline, setBaseline] = useState(() => JSON.stringify(draftFromPage(page)))
  const [pendingLeave, setPendingLeave] = useState(null)
  const [preview, setPreview] = useState(false)   // the visitor's view, from the draft
  const [setupFor, setSetupFor] = useState(null)   // { row, next } — the setup wizard, after a save
  const draftJson = useMemo(() => JSON.stringify(draft), [draft])
  const dirty = draftJson !== baseline

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
  /* Including this one: the guard hooks the nav bars, not navigate() itself, so
     a raw call here would walk out with the draft still unsaved and say nothing. */
  const goConnectCalendar = () => {
    const go = () => navigate(ROUTES.CONNECTION_CALENDAR)
    if (confirmLeave(go)) go()
  }

  const set = (patch) => setDraft((d) => ({ ...d, ...patch }))
  const setContent = (patch) => setDraft((d) => ({ ...d, content: { ...d.content, ...patch } }))
  const setThankYou = (patch) => setDraft((d) => ({ ...d, content: { ...d.content, thankYou: { ...d.content.thankYou, ...patch } } }))

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
      /* The builder only ever edits an existing page now — creating one goes
         through the wizard, which asks for the name and the address as its own
         last step. What remains is the older page that never got either: the
         setup prompt still catches it on the way out. */
      const row = (await onUpdate(page.id, payload)) || { ...payload, id: page.id }
      if (needsSetupWizard(row)) setSetupFor({ row, next: onBack })
      else onBack()
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

  /* What is true of the page as SAVED — never of the draft on screen. The badge
     answers "can someone reach my page right now?", and only the saved row can
     answer that. */
  const livePublished = !!page?.published
  const publishPending = !!draft.published !== livePublished

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
        <Txt className="lpe-topbar-title">{draft.title.trim() || t('pages.editPageTitle')}</Txt>
        <Box className="lpe-topbar-actions">
          {/* Whether the page is live was only knowable by opening "הגדרות" and
              reading a checkbox. It is the first thing about a page, so it says
              itself — and the publish action next to it saves and goes live in
              one press, instead of a tick that does nothing until you also save.

              It reads the SAVED page, not the draft. Reading the draft meant
              ticking the publish box flipped this to "פעיל" on the spot, while
              nothing had been saved, the page had no address, and no visitor
              could reach it — the one label whose whole job is to be trusted,
              lying. What the draft would DO on save is a separate, smaller
              sentence below: a promise, not a state. */}
          <Txt className={`lpm-badge bk-live-badge${livePublished ? ' is-live' : ''}`}>
            {livePublished ? t('pages.statusLive') : t('pages.statusDraft')}
          </Txt>
          {publishPending && (
            <Txt className="bk-pending-note">
              {draft.published ? t('pages.statusWillPublish') : t('pages.statusWillUnpublish')}
            </Txt>
          )}
          {/* The canvas here is a branding mock — it never shows the slot picker,
              which is the page's whole point. This is the only way to see it
              without publishing first. */}
          <Btn type="button" className={`lpe-settings-btn${preview ? ' is-on' : ''}`} onClick={() => setPreview((v) => !v)}>
            {preview ? <EyeOff size={16} strokeWidth={1.7} aria-hidden="true" /> : <Eye size={16} strokeWidth={1.7} aria-hidden="true" />}
            {preview ? t('preview.exit') : t('preview.toggle')}
          </Btn>
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
            {/* A disabled tick and a sentence saying why is only half an answer:
                it named the obstacle and left the coach to find the way round it
                from memory. */}
            {!gcalConnected && (
              <Btn type="button" className="bk-connect-link" onClick={goConnectCalendar}>
                {t('pages.connectGoogle')}
              </Btn>
            )}
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

      {/* Preview replaces the editable canvas rather than sitting beside it: the
          two show the same page, and side by side they would only compete. */}
      {preview ? <BookingPreview draft={draft} meetingTypes={availTypes} /> : (
      /* Branding preview canvas (logo / heading / body inline) */
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
      )}

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
              {/* The header counts what the page OFFERS. Falling back to
                  availTypes.length claimed the opposite of the truth: with five
                  types defined and none ticked it read "5", while the page
                  actually offers a single generic meeting at the default length
                  — see offeredDurations() and BookingPreview, which both resolve
                  an empty selection to exactly one. */}
              <Txt className="bk-config-count">{draft.meeting_type_ids.length || 1}</Txt>
            </Btn>
          </Txt>
        </Box>
        {!openCards.types ? null : (
          <>
            <Txt as="p" className="lbl-sm">{t('pages.meetingTypesHint')}</Txt>
            <MeetingTypesPicker
              meetingTypes={availTypes}
              selectedIds={draft.meeting_type_ids}
              durations={draft.meeting_type_durations}
              defaultDuration={draft.availability.defaultDurationMinutes}
              onToggle={toggleType}
              onSetDuration={setTypeDuration}
              onSetDefaultDuration={(minutes) => setDraft((d) => ({ ...d, availability: { ...d.availability, defaultDurationMinutes: minutes } }))}
              onAddType={addType}
            />
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
          <AvailabilityEditor
            availability={draft.availability}
            onChange={(availability) => setDraft((d) => ({ ...d, availability }))}
          />
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
    </Box>
  )
}
