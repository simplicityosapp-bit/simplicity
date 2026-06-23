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
  DEFAULT_CONTENT, DEFAULT_AVAILABILITY, newBookingPageDraft, WEEKDAYS,
  publicBookingPageUrl, normalizeSlug, isValidSlug, leadPageSurface,
} from '../../lib/bookingPageSchema'
import DesignToolbox from '../../components/DesignToolbox'
import { ROUTES } from '../../lib/routes'
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
              <p className="lbl">{pages.length} דפים</p>
            </div>
            <p className="lbl-sm">דפים ציבוריים לקביעת פגישות, מסונכרנים ליומן</p>
          </div>
          <p className="t-screen">דפי קביעת פגישות</p>
        </header>
        <Coachmark id="add-booking-page" radius="50%">
          <button className="cta-add" type="button" onClick={() => setEditingId('new')}>דף חדש</button>
        </Coachmark>
      </div>

      <button type="button" className="lp-back-link" onClick={() => navigate(ROUTES.CALENDAR)}>
        <ArrowRight size={16} strokeWidth={1.7} aria-hidden="true" /> חזרה ליומן
      </button>

      {loading ? (
        <div className="empty"><p className="empty-text">טוען…</p></div>
      ) : error ? (
        <div className="empty"><p className="empty-text">שגיאה בטעינה: {error}</p></div>
      ) : pages.length === 0 ? (
        <div className="empty">
          <p className="empty-text">עוד אין דפי קביעת פגישות. צרו דף ראשון כדי לקבל תורים אוטומטית ליומן.</p>
          <button type="button" className="lpm-empty-cta" onClick={() => setEditingId('new')}>
            <Plus size={16} strokeWidth={1.8} aria-hidden="true" /> דף חדש
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
  const [copied, setCopied] = useState(false)
  const url = publicBookingPageUrl(page.slug || page.id)
  const copy = async () => {
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1600) } catch { /* noop */ }
  }
  return (
    <div className="lpm-card">
      <div className="lpm-card-main">
        <p className="lpm-card-title">{page.title?.trim() || 'דף ללא שם'}</p>
        <div className="lpm-badges">
          <span className={`lpm-badge${page.published ? ' is-live' : ''}`}>{page.published ? 'פעיל' : 'טיוטה'}</span>
          {page.auto_confirm
            ? <span className="lpm-badge is-auto">אישור אוטומטי</span>
            : <span className="lpm-badge">דורש אישור</span>}
          <InfoPopover
            label="הסבר על אופן אישור התורים"
            text={page.auto_confirm
              ? 'תורים מהדף הזה מאושרים אוטומטית ונכנסים ישר ליומן. אפשר לשנות ל"דורש אישור" בהגדרות הדף.'
              : 'תורים מהדף הזה ממתינים לאישורך ("דורש תשומת לב" בבית), ותופסים את הזמן עד שתאשר/י או תדחה/י. אפשר לשנות ל"אישור אוטומטי" בהגדרות הדף.'}
          />
        </div>
      </div>
      <div className="lpm-card-actions">
        {page.published && (
          <>
            <button type="button" className="lpm-icon-btn" onClick={copy} aria-label="העתקת קישור" title="העתקת קישור">
              {copied ? <Check size={16} strokeWidth={2} /> : <Copy size={16} strokeWidth={1.7} />}
            </button>
            <a className="lpm-icon-btn" href={url} target="_blank" rel="noreferrer" aria-label="פתיחת הדף" title="פתיחת הדף">
              <ExternalLink size={16} strokeWidth={1.7} />
            </a>
          </>
        )}
        <button type="button" className="lpm-edit-btn" onClick={onEdit}>עריכה</button>
        <button type="button" className="lpm-icon-btn danger" onClick={onDelete} aria-label="מחיקה" title="מחיקה">
          <Trash2 size={16} strokeWidth={1.7} />
        </button>
      </div>
    </div>
  )
}

/* ── Builder ─────────────────────────────────────────────────────────── */
function BookingPageBuilder({ page, isNew, onAdd, onUpdate, onBack, onSavedNew }) {
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
    }
  })
  const { projects } = useProjects()
  const { types, addType, updateType } = useMeetingTypes()
  const { status: gcalStatus } = useGoogleCalendar()
  const gcalConnected = !!gcalStatus?.connected
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [copied, setCopied] = useState(false)
  const [showSettings, setShowSettings] = useState(isNew)

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

  const dayWindows = (day) => {
    const w = draft.availability.weekly?.[day]
    return Array.isArray(w) ? w : []
  }
  const addWindow = (day) => setWeekly(day, [...dayWindows(day), { start: '09:00', end: '17:00' }])
  const updateWindow = (day, i, patch) => setWeekly(day, dayWindows(day).map((w, idx) => (idx === i ? { ...w, ...patch } : w)))
  const removeWindow = (day, i) => setWeekly(day, dayWindows(day).filter((_, idx) => idx !== i))

  const addQuickType = async () => {
    const name = (window.prompt('שם סוג הפגישה החדש:') || '').trim()
    if (!name) return
    try {
      const row = await addType({ name, sort_order: availTypes.length, duration_minutes: draft.availability.defaultDurationMinutes })
      toggleType(row.id)
    } catch (e) { setErr(`הוספת סוג נכשלה: ${e.message || ''}`) }
  }

  const save = async () => {
    setErr('')
    if (!draft.title.trim()) { setShowSettings(true); setErr('יש לתת שם פנימי לדף (לזיהוי בלבד).'); return }
    const slug = normalizeSlug(draft.slug)
    if (draft.slug.trim() && !isValidSlug(slug)) {
      setShowSettings(true)
      setErr('הקישור הקצר חייב להיות 3–40 תווים: אותיות אנגלית קטנות, ספרות ומקפים.')
      return
    }
    // Sanity: an active page with no availability has no slots to offer.
    const anyAvail = WEEKDAYS.some((_, d) => dayWindows(d).length > 0)
    if (draft.published && !anyAvail) { setErr('אין שעות זמינות מוגדרות — הוסיפו לפחות חלון זמן אחד לפני פרסום.'); return }

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
      availability: draft.availability,
      meeting_type_ids: draft.meeting_type_ids,
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
        setErr('הקישור הקצר הזה כבר תפוס — בחר/י אחר.')
      } else {
        setErr(`שמירה נכשלה: ${e.message || 'נסו שוב'}`)
      }
    } finally {
      setBusy(false)
    }
  }

  const url = page?.id ? publicBookingPageUrl(page.slug || page.id) : null
  const copyLink = async () => {
    if (!url) return
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1600) } catch { /* noop */ }
  }

  const c = draft.content
  const { style: canvasStyle, cls: surfaceCls } = leadPageSurface(c)
  const canvasClass = `lpe-canvas lp-surface${surfaceCls ? ` ${surfaceCls}` : ''}`

  return (
    <div className="screen lpe-screen bk-screen">
      <DesignToolbox content={draft.content} onChange={setContent} />
      <div className="lpe-topbar">
        <button type="button" className="lp-back-link" onClick={onBack}>
          <ArrowRight size={16} strokeWidth={1.7} aria-hidden="true" /> חזרה
        </button>
        <span className="lpe-topbar-title">{draft.title.trim() || (isNew ? 'דף חדש' : 'עריכת דף')}</span>
        <div className="lpe-topbar-actions">
          <button type="button" className={`lpe-settings-btn${showSettings ? ' is-on' : ''}`} onClick={() => setShowSettings((v) => !v)}>
            <Settings size={16} strokeWidth={1.7} aria-hidden="true" /> הגדרות
          </button>
          <button type="button" className="m-btn-save" onClick={save} disabled={busy}>{busy ? 'שומר…' : 'שמירה'}</button>
        </div>
      </div>

      {showSettings && (
        <div className="lpe-settings">
          <div className="m-field">
            <label className="m-label">שם פנימי (לזיהוי, לא מוצג בדף)</label>
            <input className="m-input" value={draft.title} onChange={(e) => set({ title: e.target.value })} placeholder="לדוגמה: פגישות היכרות" />
          </div>
          <div className="lpe-settings-row">
            <label className="lpb-toggle">
              <input type="checkbox" checked={draft.published} onChange={(e) => set({ published: e.target.checked })} />
              <span><strong>פרסום הדף</strong><em>כשכבוי — טיוטה, לא נגיש לציבור.</em></span>
            </label>
            <label className="lpb-toggle">
              <input type="checkbox" checked={draft.auto_confirm} onChange={(e) => set({ auto_confirm: e.target.checked })} />
              <span><strong>אישור אוטומטי</strong><em>כשכבוי — תורים ממתינים לאישור ידני.</em></span>
            </label>
          </div>

          <div className="m-field">
            <label className="m-label">יומן Google</label>
            <label className={`lpb-toggle${gcalConnected ? '' : ' is-disabled'}`}>
              <input
                type="checkbox"
                checked={draft.write_to_google}
                disabled={!gcalConnected}
                onChange={(e) => set({ write_to_google: e.target.checked })}
              />
              <span>
                <strong>כתיבת תורים מאושרים ליומן Google שלי</strong>
                <em>{gcalConnected
                  ? 'כל תור מאושר מהדף (ידני או אוטומטי) ייכתב כאירוע ביומן שלך.'
                  : 'יש לחבר יומן Google ב"חיבורים" כדי להפעיל.'}</em>
              </span>
            </label>
            {gcalConnected && draft.write_to_google && (
              <label className="lpb-toggle">
                <input type="checkbox" checked={draft.invite_client} onChange={(e) => set({ invite_client: e.target.checked })} />
                <span><strong>הזמן את הלקוח לאירוע</strong><em>אם הלקוח השאיר מייל — Google ישלח לו הזמנה.</em></span>
              </label>
            )}
          </div>
          <div className="m-field">
            <label className="m-label">שיוך לפרויקט (אופציונלי)</label>
            <select className="m-select" value={draft.project_id} onChange={(e) => set({ project_id: e.target.value })}>
              <option value="">ללא</option>
              {(projects || []).filter((p) => !p.deleted_at).map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div className="m-field">
            <label className="m-label">קישור קצר (אופציונלי)</label>
            <div className="lpe-slug-row">
              <span className="lpe-slug-prefix mono" dir="ltr">{window.location.host}/book/</span>
              <input
                className="m-input lpe-slug-input"
                dir="ltr"
                value={draft.slug}
                onChange={(e) => set({ slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]+/g, '-') })}
                placeholder="dana-coaching"
                maxLength={40}
              />
            </div>
            <p className="lbl-sm">קישור קצר וקריא במקום המזהה הארוך. אותיות אנגלית קטנות, ספרות ומקפים (3–40). אם ריק — נשתמש במזהה.</p>
          </div>
          {/* Appearance (colour, background, opacity, blur, bold, text) lives in
              the left-side "ארגז כלים" toolbox — kept out of settings on purpose. */}
          <div className="m-field">
            <label className="m-label">אחרי הקביעה</label>
            <div className="lpb-radio-group">
              <label className="lpb-radio">
                <input type="radio" name="bk-thankyou" checked={c.thankYou.mode === 'message'} onChange={() => setThankYou({ mode: 'message' })} />
                הצגת הודעת תודה
              </label>
              <label className="lpb-radio">
                <input type="radio" name="bk-thankyou" checked={c.thankYou.mode === 'redirect'} onChange={() => setThankYou({ mode: 'redirect' })} />
                הפניה לקישור חיצוני
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
              <label className="m-label">הקישור הציבורי</label>
              {draft.published ? (
                <div className="lpb-link-row">
                  <Link2 size={15} strokeWidth={1.7} aria-hidden="true" />
                  <span className="lpb-link-url mono" dir="ltr">{url}</span>
                  <button type="button" className="lpb-copy-btn" onClick={copyLink}>
                    {copied ? <><Check size={14} strokeWidth={2} /> הועתק</> : <><Copy size={14} strokeWidth={1.7} /> העתקה</>}
                  </button>
                </div>
              ) : (
                <p className="lbl-sm">פרסמו את הדף כדי לקבל קישור ציבורי.</p>
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
            placeholder="לוגו (טקסט)"
            aria-label="לוגו"
          />
          <input
            className="lp-heading lpe-edit"
            value={c.heading}
            onChange={(e) => setContent({ heading: e.target.value })}
            placeholder="כותרת ראשית"
            aria-label="כותרת"
          />
          <textarea
            className="lp-body lpe-edit"
            value={c.body}
            onChange={(e) => setContent({ body: e.target.value })}
            placeholder="טקסט הסבר (אופציונלי)"
            rows={2}
            aria-label="טקסט"
          />
          <div className="bk-preview-hint" aria-hidden="true">
            <CalendarClock size={15} strokeWidth={1.6} /> כאן המבקר יבחר סוג פגישה, יום ושעה
          </div>
          <div className="lp-submit lpe-submit-preview" aria-hidden="true">קביעת הפגישה</div>
        </div>
      </div>

      {/* Meeting types */}
      <div className="bk-config-card">
        <div className="bk-config-head">
          <h3 className="bk-config-title"><CalendarClock size={17} strokeWidth={1.7} aria-hidden="true" /> סוגי פגישה שהדף מציע</h3>
          <button type="button" className="bk-mini-btn" onClick={addQuickType}><Plus size={14} strokeWidth={1.9} /> סוג חדש</button>
        </div>
        <p className="lbl-sm">בחרו אילו סוגי פגישה יוצגו למבקר. המשך של כל סוג קובע את אורך הפגישה ביומן.</p>
        {availTypes.length === 0 ? (
          <p className="bk-empty-note">עוד אין סוגי פגישה. הוסיפו סוג חדש (או דרך ההגדרות), או שהדף יציע "פגישה" באורך ברירת המחדל.</p>
        ) : (
          <div className="bk-type-list">
            {availTypes.map((t) => {
              const on = draft.meeting_type_ids.includes(t.id)
              return (
                <div key={t.id} className={`bk-type-row${on ? ' on' : ''}`}>
                  <label className="bk-type-pick">
                    <input type="checkbox" checked={on} onChange={() => toggleType(t.id)} />
                    <span className="bk-type-name">{t.name}</span>
                  </label>
                  <div className="bk-type-dur">
                    <Clock size={14} strokeWidth={1.6} aria-hidden="true" />
                    <input
                      type="number" min="5" step="5"
                      className="bk-dur-input"
                      value={t.duration_minutes ?? ''}
                      placeholder={String(draft.availability.defaultDurationMinutes)}
                      onChange={(e) => updateType(t.id, { duration_minutes: e.target.value === '' ? null : Number(e.target.value) })}
                      aria-label={`משך ${t.name} בדקות`}
                    />
                    <span className="bk-dur-unit">דק׳</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Availability */}
      <div className="bk-config-card">
        <h3 className="bk-config-title"><Clock size={17} strokeWidth={1.7} aria-hidden="true" /> זמינות</h3>
        <div className="bk-settings-grid">
          <label className="bk-num-field">
            <span>מרווח בין מועדים (דק׳)</span>
            <input type="number" min="5" step="5" value={draft.availability.slotMinutes} onChange={(e) => setAvail({ slotMinutes: Number(e.target.value) })} />
          </label>
          <label className="bk-num-field">
            <span>אורך ברירת מחדל (דק׳)</span>
            <input type="number" min="5" step="5" value={draft.availability.defaultDurationMinutes} onChange={(e) => setAvail({ defaultDurationMinutes: Number(e.target.value) })} />
          </label>
          <label className="bk-num-field">
            <span>מרווח אחרי פגישה (דק׳)</span>
            <input type="number" min="0" step="5" value={draft.availability.bufferMinutes} onChange={(e) => setAvail({ bufferMinutes: Number(e.target.value) })} />
          </label>
          <label className="bk-num-field">
            <span>התראה מוקדמת (שעות)</span>
            <input type="number" min="0" step="1" value={draft.availability.minNoticeHours} onChange={(e) => setAvail({ minNoticeHours: Number(e.target.value) })} />
          </label>
          <label className="bk-num-field">
            <span>טווח קדימה (ימים)</span>
            <input type="number" min="1" step="1" value={draft.availability.maxDaysAhead} onChange={(e) => setAvail({ maxDaysAhead: Number(e.target.value) })} />
          </label>
        </div>

        <div className="bk-week">
          {WEEKDAYS.map((label, day) => {
            const windows = dayWindows(day)
            const open = windows.length > 0
            return (
              <div key={day} className={`bk-day${open ? ' open' : ''}`}>
                <div className="bk-day-head">
                  <span className="bk-day-name">{label}</span>
                  {open ? (
                    <button type="button" className="bk-mini-btn" onClick={() => addWindow(day)}><Plus size={13} strokeWidth={1.9} /> חלון</button>
                  ) : (
                    <button type="button" className="bk-day-add" onClick={() => addWindow(day)}>הוספת זמינות</button>
                  )}
                </div>
                {open && (
                  <div className="bk-windows">
                    {windows.map((w, i) => (
                      <div className="bk-window" key={i}>
                        <input type="time" value={w.start} onChange={(e) => updateWindow(day, i, { start: e.target.value })} />
                        <span className="bk-window-sep">–</span>
                        <input type="time" value={w.end} onChange={(e) => updateWindow(day, i, { end: e.target.value })} />
                        <button type="button" className="lpe-ctrl-btn danger" onClick={() => removeWindow(day, i)} aria-label="הסרת חלון"><X size={14} /></button>
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
        <button type="button" className="m-btn-cancel" onClick={onBack}>ביטול</button>
        <button type="button" className="m-btn-save" onClick={save} disabled={busy}>{busy ? 'שומר…' : 'שמירה'}</button>
      </div>
    </div>
  )
}
