import { useMemo, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  ArrowRight, Plus, Trash2, Copy, Check, ExternalLink, Settings, Link2, X,
  Clock, CalendarClock,
} from 'lucide-react'
import { useBookingPages } from '../../hooks/useBookingPages'
import { useMeetingTypes } from '../../hooks/useMeetingTypes'
import { useProjects } from '../../hooks/useProjects'
import { useGoogleCalendar } from '../../hooks/useGoogleCalendar'
import Coachmark from '../../components/Coachmark'
import InfoPopover from '../../components/InfoPopover'
import {
  DEFAULT_CONTENT, DEFAULT_AVAILABILITY, newBookingPageDraft, weekdayLabels,
  publicBookingPageUrl, normalizeSlug, isValidSlug, slugifyInput, leadPageSurface,
  sanitizeAvailability, findInvalidWindow,
} from '../../lib/bookingPageSchema'
import DesignToolbox from '../../components/DesignToolbox'
import { ROUTES } from '../../lib/routes'
import { copyText } from '../../lib/clipboard'
import { showError } from '../../lib/toast'
import { useT } from '../../i18n/useT'
import './bookingI18n'                     // self-registers the 'booking' namespace
import '../lead-page/LeadPage.css'        // shared public-page look (lp-*)
import '../lead-pages/LeadPagesScreen.css' // shared builder chrome (lpe-*, lpm-*)
import './BookingPagesScreen.css'          // booking-specific (bk-*)

/* ════════════════════════════════════════════════════════════════
   BOOKING PAGES — in-app builder + management for public booking pages.
   Sibling of the Lead Pages builder: a list view ↔ a live builder, with
   a branding canvas + meeting-type picker + weekly-availability editor.
   ════════════════════════════════════════════════════════════════ */
export default function BookingPagesScreen() {
  const navigate = useNavigate()
  const location = useLocation()
  const { t } = useT('booking')
  const { pages, loading, error, addPage, updatePage, removePage } = useBookingPages()
  const [editingId, setEditingId] = useState(() => location.state?.editPageId ?? null)

  const editing = useMemo(() => {
    if (editingId === 'new') return null
    return pages.find((p) => p.id === editingId) || null
  }, [editingId, pages])

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
    <div className="screen bk-screen">
      <div className="screen-top">
        <header className="screen-head">
          <div>
            <div className="screen-head-meta">
              <p className="lbl">{t('pages.headCount', { count: pages.length })}</p>
            </div>
            <p className="lbl-sm">{t('pages.headSubtitle')}</p>
          </div>
          <p className="t-screen">{t('pages.screenTitle')}</p>
        </header>
        <Coachmark id="add-booking-page" radius="50%">
          <button className="cta-add" type="button" onClick={() => setEditingId('new')}>{t('pages.newPage')}</button>
        </Coachmark>
      </div>

      <button type="button" className="lp-back-link" onClick={() => navigate(ROUTES.CALENDAR)}>
        <ArrowRight size={16} strokeWidth={1.7} aria-hidden="true" /> {t('pages.backToCalendar')}
      </button>

      {loading ? (
        <div className="empty"><p className="empty-text">{t('pages.loading')}</p></div>
      ) : error ? (
        <div className="empty"><p className="empty-text">{t('pages.loadError', { error })}</p></div>
      ) : pages.length === 0 ? (
        <div className="empty">
          <p className="empty-text">{t('pages.emptyText')}</p>
          <button type="button" className="lpm-empty-cta" onClick={() => setEditingId('new')}>
            <Plus size={16} strokeWidth={1.8} aria-hidden="true" /> {t('pages.newPage')}
          </button>
        </div>
      ) : (
        <div className="lpm-list">
          {pages.map((p) => (
            <PageCard
              key={p.id}
              page={p}
              onEdit={() => setEditingId(p.id)}
              onDelete={() => removePage(p.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function PageCard({ page, onEdit, onDelete }) {
  const { t } = useT('booking')
  const [copied, setCopied] = useState(false)
  const url = publicBookingPageUrl(page.slug || page.id)
  const copy = async () => {
    if (await copyText(url)) { setCopied(true); setTimeout(() => setCopied(false), 1600) }
    else showError(t('pages.copyFailed'))
  }
  return (
    <div className="lpm-card">
      <div className="lpm-card-main">
        <p className="lpm-card-title">{page.title?.trim() || t('pages.untitled')}</p>
        <div className="lpm-badges">
          <span className={`lpm-badge${page.published ? ' is-live' : ''}`}>{page.published ? t('pages.statusLive') : t('pages.statusDraft')}</span>
          {page.auto_confirm
            ? <span className="lpm-badge is-auto">{t('pages.autoConfirmBadge')}</span>
            : <span className="lpm-badge">{t('pages.manualConfirmBadge')}</span>}
          <InfoPopover
            label={t('pages.confirmInfoLabel')}
            text={page.auto_confirm
              ? t('pages.confirmInfoAuto')
              : t('pages.confirmInfoManual')}
          />
        </div>
      </div>
      <div className="lpm-card-actions">
        {page.published && (
          <>
            <button type="button" className="lpm-icon-btn" onClick={copy} aria-label={t('pages.copyLinkLabel')} title={t('pages.copyLinkLabel')}>
              {copied ? <Check size={16} strokeWidth={2} /> : <Copy size={16} strokeWidth={1.7} />}
            </button>
            <a className="lpm-icon-btn" href={url} target="_blank" rel="noreferrer" aria-label={t('pages.openPageLabel')} title={t('pages.openPageLabel')}>
              <ExternalLink size={16} strokeWidth={1.7} />
            </a>
          </>
        )}
        <button type="button" className="lpm-edit-btn" onClick={onEdit}>{t('pages.edit')}</button>
        <button type="button" className="lpm-icon-btn danger" onClick={onDelete} aria-label={t('pages.deleteLabel')} title={t('pages.deleteLabel')}>
          <Trash2 size={16} strokeWidth={1.7} />
        </button>
      </div>
    </div>
  )
}

/* ── Builder ─────────────────────────────────────────────────────────── */
function BookingPageBuilder({ page, isNew, onAdd, onUpdate, onBack, onSavedNew }) {
  const { t } = useT('booking')
  const [draft, setDraft] = useState(() => {
    if (isNew || !page) return newBookingPageDraft()
    return {
      title: page.title ?? '',
      published: !!page.published,
      auto_confirm: !!page.auto_confirm,
      write_to_google: !!page.write_to_google,
      invite_client: !!page.invite_client,
      project_id: page.project_id ?? '',
      slug: page.slug ?? '',
      content: { ...DEFAULT_CONTENT, ...(page.content || {}), thankYou: { ...DEFAULT_CONTENT.thankYou, ...(page.content?.thankYou || {}) } },
      availability: { ...DEFAULT_AVAILABILITY, ...(page.availability || {}), weekly: { ...DEFAULT_AVAILABILITY.weekly, ...((page.availability || {}).weekly || {}) } },
      meeting_type_ids: Array.isArray(page.meeting_type_ids) ? page.meeting_type_ids : [],
      meeting_type_durations: (page.meeting_type_durations && typeof page.meeting_type_durations === 'object') ? page.meeting_type_durations : {},
    }
  })
  const { projects } = useProjects()
  const { types, addType } = useMeetingTypes()
  const { status: gcalStatus } = useGoogleCalendar()
  const gcalConnected = !!gcalStatus?.connected
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [copied, setCopied] = useState(false)
  const [showSettings, setShowSettings] = useState(isNew)
  // In-app "new meeting type" dialog (replaces window.prompt, blocked on mobile).
  const [newTypeOpen, setNewTypeOpen] = useState(false)
  const [newTypeName, setNewTypeName] = useState('')
  const [addingType, setAddingType] = useState(false)

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

  const dayWindows = (day) => {
    const w = draft.availability.weekly?.[day]
    return Array.isArray(w) ? w : []
  }
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

  const save = async () => {
    if (busy) return // guard against a fast double-click across the two save buttons
    setErr('')
    if (!draft.title.trim()) { setShowSettings(true); setErr(t('pages.errInternalName')); return }
    const slug = normalizeSlug(draft.slug)
    if (draft.slug.trim() && !isValidSlug(slug)) {
      setShowSettings(true)
      setErr(t('pages.errSlugFormat'))
      return
    }
    // Sanity: an active page with no availability has no slots to offer.
    const anyAvail = weekdayLabels().some((_, d) => dayWindows(d).length > 0)
    if (draft.published && !anyAvail) { setErr(t('pages.errNoAvailability')); return }

    // Reject reversed/empty windows (e.g. 17:00–09:00) — they yield no slots.
    const bad = findInvalidWindow(draft.availability)
    if (bad) { setErr(t('pages.errInvalidWindow', { day: weekdayLabels()[bad.day] })); return }

    setBusy(true)
    const payload = {
      title: draft.title.trim(),
      published: draft.published,
      auto_confirm: draft.auto_confirm,
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
      if (isNew) {
        const row = await onAdd(payload)
        onSavedNew(row)
      } else {
        await onUpdate(page.id, payload)
        onBack()
      }
    } catch (e) {
      setShowSettings(true)
      if (e?.code === '23505' || /duplicate|unique|idx_booking_pages_slug/i.test(e?.message || '')) {
        setErr(t('pages.errSlugTaken'))
      } else {
        setErr(t('pages.errSaveFailed', { error: e.message || t('pages.errSaveRetry') }))
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

  const c = draft.content
  const { style: canvasStyle, cls: surfaceCls } = leadPageSurface(c)
  const canvasClass = `lpe-canvas lp-surface${surfaceCls ? ` ${surfaceCls}` : ''}`

  return (
    <div className="screen lpe-screen bk-screen">
      <DesignToolbox content={draft.content} onChange={setContent} />
      <div className="lpe-topbar">
        <button type="button" className="lp-back-link" onClick={onBack}>
          <ArrowRight size={16} strokeWidth={1.7} aria-hidden="true" /> {t('pages.back')}
        </button>
        <span className="lpe-topbar-title">{draft.title.trim() || (isNew ? t('pages.newPageTitle') : t('pages.editPageTitle'))}</span>
        <div className="lpe-topbar-actions">
          <button type="button" className={`lpe-settings-btn${showSettings ? ' is-on' : ''}`} onClick={() => setShowSettings((v) => !v)}>
            <Settings size={16} strokeWidth={1.7} aria-hidden="true" /> {t('pages.settings')}
          </button>
          <button type="button" className="m-btn-save" onClick={save} disabled={busy}>{busy ? t('pages.saving') : t('pages.save')}</button>
        </div>
      </div>

      {showSettings && (
        <div className="lpe-settings">
          <div className="m-field">
            <label className="m-label">{t('pages.internalNameLabel')}</label>
            <input className="m-input" value={draft.title} onChange={(e) => set({ title: e.target.value })} placeholder={t('pages.internalNamePlaceholder')} />
          </div>
          <div className="lpe-settings-row">
            <label className="lpb-toggle">
              <input type="checkbox" checked={draft.published} onChange={(e) => set({ published: e.target.checked })} />
              <span><strong>{t('pages.publishTitle')}</strong><em>{t('pages.publishHint')}</em></span>
            </label>
            <label className="lpb-toggle">
              <input type="checkbox" checked={draft.auto_confirm} onChange={(e) => set({ auto_confirm: e.target.checked })} />
              <span><strong>{t('pages.autoConfirmTitle')}</strong><em>{t('pages.autoConfirmHint')}</em></span>
            </label>
          </div>

          <div className="m-field">
            <label className="m-label">{t('pages.googleCalendar')}</label>
            <label className={`lpb-toggle${gcalConnected ? '' : ' is-disabled'}`}>
              <input
                type="checkbox"
                checked={draft.write_to_google}
                disabled={!gcalConnected}
                onChange={(e) => set({ write_to_google: e.target.checked })}
              />
              <span>
                <strong>{t('pages.writeToGoogleTitle')}</strong>
                <em>{gcalConnected
                  ? t('pages.writeToGoogleHintConnected')
                  : t('pages.writeToGoogleHintDisconnected')}</em>
              </span>
            </label>
            {gcalConnected && draft.write_to_google && (
              <label className="lpb-toggle">
                <input type="checkbox" checked={draft.invite_client} onChange={(e) => set({ invite_client: e.target.checked })} />
                <span><strong>{t('pages.inviteClientTitle')}</strong><em>{t('pages.inviteClientHint')}</em></span>
              </label>
            )}
          </div>
          <div className="m-field">
            <label className="m-label">{t('pages.projectLabel')}</label>
            <select className="m-select" value={draft.project_id} onChange={(e) => set({ project_id: e.target.value })}>
              <option value="">{t('pages.projectNone')}</option>
              {(projects || []).filter((p) => !p.deleted_at).map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div className="m-field">
            <label className="m-label">{t('pages.slugLabel')}</label>
            <div className="lpe-slug-row">
              <span className="lpe-slug-prefix mono" dir="ltr">{window.location.host}/book/</span>
              <input
                className="m-input lpe-slug-input"
                dir="ltr"
                value={draft.slug}
                onChange={(e) => set({ slug: slugifyInput(e.target.value) })}
                placeholder="dana-coaching"
                maxLength={40}
              />
            </div>
            <p className="lbl-sm">{t('pages.slugHint')}</p>
          </div>
          {/* Appearance (colour, background, opacity, blur, bold, text) lives in
              the left-side "ארגז כלים" toolbox — kept out of settings on purpose. */}
          <div className="m-field">
            <label className="m-label">{t('pages.afterBookingLabel')}</label>
            <div className="lpb-radio-group">
              <label className="lpb-radio">
                <input type="radio" name="bk-thankyou" checked={c.thankYou.mode === 'message'} onChange={() => setThankYou({ mode: 'message' })} />
                {t('pages.thankYouModeMessage')}
              </label>
              <label className="lpb-radio">
                <input type="radio" name="bk-thankyou" checked={c.thankYou.mode === 'redirect'} onChange={() => setThankYou({ mode: 'redirect' })} />
                {t('pages.thankYouModeRedirect')}
              </label>
            </div>
            {c.thankYou.mode === 'redirect' ? (
              <input className="m-input" value={c.thankYou.url} onChange={(e) => setThankYou({ url: e.target.value })} placeholder="https://..." dir="ltr" />
            ) : (
              <textarea className="m-textarea" value={c.thankYou.message} onChange={(e) => setThankYou({ message: e.target.value })} />
            )}
          </div>
          {url && (
            <div className="m-field">
              <label className="m-label">{t('pages.publicLinkLabel')}</label>
              {draft.published ? (
                <div className="lpb-link-row">
                  <Link2 size={15} strokeWidth={1.7} aria-hidden="true" />
                  <span className="lpb-link-url mono" dir="ltr">{url}</span>
                  <button type="button" className="lpb-copy-btn" onClick={copyLink}>
                    {copied ? <><Check size={14} strokeWidth={2} /> {t('pages.copied')}</> : <><Copy size={14} strokeWidth={1.7} /> {t('pages.copy')}</>}
                  </button>
                </div>
              ) : (
                <p className="lbl-sm">{t('pages.publishToGetLink')}</p>
              )}
            </div>
          )}
        </div>
      )}

      {err && <p className="m-error lpe-err">{err}</p>}

      {/* Branding preview canvas (logo / heading / body inline) */}
      <div className={canvasClass} style={canvasStyle}>
        <div className="lp-card">
          <input
            className="lp-logo lpe-edit lpe-center"
            value={c.logoText}
            onChange={(e) => setContent({ logoText: e.target.value })}
            placeholder={t('pages.logoPlaceholder')}
            aria-label={t('pages.logoAria')}
          />
          <input
            className="lp-heading lpe-edit"
            value={c.heading}
            onChange={(e) => setContent({ heading: e.target.value })}
            placeholder={t('pages.headingPlaceholder')}
            aria-label={t('pages.headingAria')}
          />
          <textarea
            className="lp-body lpe-edit"
            value={c.body}
            onChange={(e) => setContent({ body: e.target.value })}
            placeholder={t('pages.bodyPlaceholder')}
            rows={2}
            aria-label={t('pages.bodyAria')}
          />
          <div className="bk-preview-hint" aria-hidden="true">
            <CalendarClock size={15} strokeWidth={1.6} /> {t('pages.previewHint')}
          </div>
          <div className="lp-submit lpe-submit-preview" aria-hidden="true">{t('pages.submitPreview')}</div>
        </div>
      </div>

      {/* Meeting types */}
      <div className="bk-config-card">
        <div className="bk-config-head">
          <h3 className="bk-config-title"><CalendarClock size={17} strokeWidth={1.7} aria-hidden="true" /> {t('pages.meetingTypesTitle')}</h3>
          <button type="button" className="bk-mini-btn" onClick={openNewType}><Plus size={14} strokeWidth={1.9} /> {t('pages.newType')}</button>
        </div>
        <p className="lbl-sm">{t('pages.meetingTypesHint')}</p>
        {availTypes.length === 0 ? (
          <p className="bk-empty-note">{t('pages.meetingTypesEmpty')}</p>
        ) : (
          <div className="bk-type-list">
            {availTypes.map((mt) => {
              const on = draft.meeting_type_ids.includes(mt.id)
              return (
                <div key={mt.id} className={`bk-type-row${on ? ' on' : ''}`}>
                  <label className="bk-type-pick">
                    <input type="checkbox" checked={on} onChange={() => toggleType(mt.id)} />
                    <span className="bk-type-name">{mt.name}</span>
                  </label>
                  <div className="bk-type-dur">
                    <Clock size={14} strokeWidth={1.6} aria-hidden="true" />
                    <input
                      type="number" min="5" step="5"
                      className="bk-dur-input"
                      value={draft.meeting_type_durations[mt.id] ?? ''}
                      placeholder={String(mt.duration_minutes || draft.availability.defaultDurationMinutes)}
                      onChange={(e) => setTypeDuration(mt.id, e.target.value)}
                      aria-label={t('pages.typeDurationAria', { name: mt.name })}
                    />
                    <span className="bk-dur-unit">{t('pages.durationUnit')}</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Availability */}
      <div className="bk-config-card">
        <h3 className="bk-config-title"><Clock size={17} strokeWidth={1.7} aria-hidden="true" /> {t('pages.availabilityTitle')}</h3>
        <div className="bk-settings-grid">
          <label className="bk-num-field">
            <span>{t('pages.slotIntervalLabel')}</span>
            <input type="number" min="5" step="5" value={draft.availability.slotMinutes} onChange={(e) => setAvail({ slotMinutes: Number(e.target.value) })} />
          </label>
          <label className="bk-num-field">
            <span>{t('pages.defaultDurationLabel')}</span>
            <input type="number" min="5" step="5" value={draft.availability.defaultDurationMinutes} onChange={(e) => setAvail({ defaultDurationMinutes: Number(e.target.value) })} />
          </label>
          <label className="bk-num-field">
            <span>{t('pages.bufferLabel')}</span>
            <input type="number" min="0" step="5" value={draft.availability.bufferMinutes} onChange={(e) => setAvail({ bufferMinutes: Number(e.target.value) })} />
          </label>
          <label className="bk-num-field">
            <span>{t('pages.minNoticeLabel')}</span>
            <input type="number" min="0" step="1" value={draft.availability.minNoticeHours} onChange={(e) => setAvail({ minNoticeHours: Number(e.target.value) })} />
          </label>
          <label className="bk-num-field">
            <span>{t('pages.maxDaysLabel')}</span>
            <input type="number" min="1" step="1" value={draft.availability.maxDaysAhead} onChange={(e) => setAvail({ maxDaysAhead: Number(e.target.value) })} />
          </label>
        </div>

        <div className="bk-week">
          {weekdayLabels().map((label, day) => {
            const windows = dayWindows(day)
            const open = windows.length > 0
            return (
              <div key={day} className={`bk-day${open ? ' open' : ''}`}>
                <div className="bk-day-head">
                  <span className="bk-day-name">{label}</span>
                  {open ? (
                    <button type="button" className="bk-mini-btn" onClick={() => addWindow(day)}><Plus size={13} strokeWidth={1.9} /> {t('pages.addWindow')}</button>
                  ) : (
                    <button type="button" className="bk-day-add" onClick={() => addWindow(day)}>{t('pages.addAvailability')}</button>
                  )}
                </div>
                {open && (
                  <div className="bk-windows">
                    {windows.map((w, i) => (
                      <div className="bk-window" key={i}>
                        <input type="time" value={w.start} onChange={(e) => updateWindow(day, i, { start: e.target.value })} />
                        <span className="bk-window-sep">–</span>
                        <input type="time" value={w.end} onChange={(e) => updateWindow(day, i, { end: e.target.value })} />
                        <button type="button" className="lpe-ctrl-btn danger" onClick={() => removeWindow(day, i)} aria-label={t('pages.removeWindowLabel')}><X size={14} /></button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {err && <p className="m-error lpe-err lpe-err-bottom">{err}</p>}
      <div className="lpe-bottom-actions">
        <button type="button" className="m-btn-cancel" onClick={onBack}>{t('pages.cancel')}</button>
        <button type="button" className="m-btn-save" onClick={save} disabled={busy}>{busy ? t('pages.saving') : t('pages.save')}</button>
      </div>

      {newTypeOpen && (
        <div
          className="bk-tm-overlay"
          dir="rtl"
          role="dialog"
          aria-modal="true"
          aria-label={t('pages.newTypeDialogLabel')}
          onClick={(e) => { if (e.target === e.currentTarget && !addingType) setNewTypeOpen(false) }}
        >
          <div className="bk-tm-card">
            <h3 className="bk-tm-title">{t('pages.newTypeDialogTitle')}</h3>
            <input
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
            <div className="bk-tm-actions">
              <button type="button" className="m-btn-cancel" onClick={() => setNewTypeOpen(false)} disabled={addingType}>{t('pages.cancel')}</button>
              <button type="button" className="m-btn-save" onClick={submitNewType} disabled={addingType || !newTypeName.trim()}>
                {addingType ? t('pages.adding') : t('pages.add')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
