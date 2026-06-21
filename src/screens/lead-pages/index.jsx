import { useMemo, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  ArrowRight, Plus, Trash2, Copy, Check, ChevronUp, ChevronDown, ExternalLink,
  Settings, Link2,
} from 'lucide-react'
import { useLeadPages } from '../../hooks/useLeadPages'
import { useProjects } from '../../hooks/useProjects'
import Coachmark from '../../components/Coachmark'
import {
  FIELD_TYPES, DEFAULT_CONTENT, newLeadPageDraft, freeFieldKey,
  publicLeadPageUrl,
} from '../../lib/leadPageSchema'
import { ROUTES } from '../../lib/routes'
import '../lead-page/LeadPage.css' // WYSIWYG: the canvas reuses the public page's look
import './LeadPagesScreen.css'

const FIELD_TYPE_LABELS = { text: 'טקסט', tel: 'טלפון', email: 'אימייל', textarea: 'טקסט ארוך' }

/* ════════════════════════════════════════════════════════════════
   LEAD PAGES — in-app builder + management for public lead pages.
   Reached from the Leads screen header. A list view ↔ a live builder
   (Google-Forms-style inline editing) toggled by local state.
   ════════════════════════════════════════════════════════════════ */
export default function LeadPagesScreen() {
  const navigate = useNavigate()
  const location = useLocation()
  const { pages, loading, error, addPage, updatePage, removePage } = useLeadPages()
  /* Deep-link from the project detail screen: { state: { editPageId } } opens
     that page's builder directly. */
  const [editingId, setEditingId] = useState(() => location.state?.editPageId ?? null) // page id, or 'new', or null (list)

  const editing = useMemo(() => {
    if (editingId === 'new') return null
    return pages.find((p) => p.id === editingId) || null
  }, [editingId, pages])

  if (editingId) {
    return (
      <LeadPageBuilder
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
    <div className="screen">
      <div className="screen-top">
        <header className="screen-head">
          <div>
            <div className="screen-head-meta">
              <p className="lbl">{pages.length} דפים</p>
            </div>
            <p className="lbl-sm">דפי נחיתה ציבוריים לאיסוף לידים</p>
          </div>
          <p className="t-screen">דפי נחיתה</p>
        </header>
        <Coachmark id="add-lead-page" radius="50%">
          <button className="cta-add" type="button" onClick={() => setEditingId('new')}>דף חדש</button>
        </Coachmark>
      </div>

      <button type="button" className="lp-back-link" onClick={() => navigate(ROUTES.LEADS)}>
        <ArrowRight size={16} strokeWidth={1.7} aria-hidden="true" /> חזרה ללידים
      </button>

      {loading ? (
        <div className="empty"><p className="empty-text">טוען…</p></div>
      ) : error ? (
        <div className="empty"><p className="empty-text">שגיאה בטעינה: {error}</p></div>
      ) : pages.length === 0 ? (
        <div className="empty">
          <p className="empty-text">עוד אין דפי נחיתה. צרו דף ראשון כדי לאסוף לידים אוטומטית.</p>
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
  const url = publicLeadPageUrl(page.id)
  const copy = async () => {
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1600) } catch { /* noop */ }
  }
  return (
    <div className="lpm-card">
      <div className="lpm-card-main">
        <p className="lpm-card-title">{page.title?.trim() || 'דף ללא שם'}</p>
        <div className="lpm-badges">
          <span className={`lpm-badge${page.published ? ' is-live' : ''}`}>{page.published ? 'פעיל' : 'טיוטה'}</span>
          {page.auto_approve
            ? <span className="lpm-badge is-auto">הזנה אוטומטית</span>
            : <span className="lpm-badge">דורש אישור</span>}
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

/* ── Builder — live, Google-Forms-style inline editing on the canvas ──── */
function LeadPageBuilder({ page, isNew, onAdd, onUpdate, onBack, onSavedNew }) {
  const [draft, setDraft] = useState(() => {
    if (isNew || !page) return newLeadPageDraft()
    return {
      title: page.title ?? '',
      published: !!page.published,
      auto_approve: !!page.auto_approve,
      project_id: page.project_id ?? '',
      content: { ...DEFAULT_CONTENT, ...(page.content || {}), thankYou: { ...DEFAULT_CONTENT.thankYou, ...(page.content?.thankYou || {}) } },
      fields: Array.isArray(page.fields) && page.fields.length ? page.fields : newLeadPageDraft().fields,
    }
  })
  const { projects } = useProjects()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [copied, setCopied] = useState(false)
  const [showSettings, setShowSettings] = useState(isNew) // a new page needs a name first
  const [activeKey, setActiveKey] = useState(null) // the field card being edited

  const set = (patch) => setDraft((d) => ({ ...d, ...patch }))
  const setContent = (patch) => setDraft((d) => ({ ...d, content: { ...d.content, ...patch } }))
  const setThankYou = (patch) => setDraft((d) => ({ ...d, content: { ...d.content, thankYou: { ...d.content.thankYou, ...patch } } }))

  const setFields = (next) => setDraft((d) => ({ ...d, fields: next }))
  const updateField = (i, patch) => setFields(draft.fields.map((f, idx) => (idx === i ? { ...f, ...patch } : f)))
  const removeField = (i) => setFields(draft.fields.filter((_, idx) => idx !== i))
  const moveField = (i, dir) => {
    const j = i + dir
    if (j < 0 || j >= draft.fields.length) return
    const next = [...draft.fields]
    ;[next[i], next[j]] = [next[j], next[i]]
    setFields(next)
  }
  const addFreeField = () => {
    const key = freeFieldKey(draft.fields)
    setFields([...draft.fields, { key, label: '', type: 'text', required: false, builtin: false }])
    setActiveKey(key)
  }

  const save = async () => {
    setErr('')
    if (!draft.title.trim()) { setShowSettings(true); setErr('יש לתת שם פנימי לדף (לזיהוי בלבד).'); return }
    if (draft.fields.some((f) => !f.label.trim())) { setErr('לכל שדה צריך להיות תווית.'); return }
    setBusy(true)
    const payload = {
      title: draft.title.trim(),
      published: draft.published,
      auto_approve: draft.auto_approve,
      project_id: draft.project_id || null,
      content: draft.content,
      fields: draft.fields.map((f) => ({ key: f.key, label: f.label.trim(), type: f.type, required: !!f.required, builtin: !!f.builtin })),
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
      setErr(`שמירה נכשלה: ${e.message || 'נסו שוב'}`)
    } finally {
      setBusy(false)
    }
  }

  const url = page?.id ? publicLeadPageUrl(page.id) : null
  const copyLink = async () => {
    if (!url) return
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1600) } catch { /* noop */ }
  }

  const c = draft.content
  const canvasStyle = { '--lp-brand': c.brandColor || DEFAULT_CONTENT.brandColor }

  return (
    <div className="screen lpe-screen">
      {/* Top bar */}
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

      {/* Settings panel (page-level — not part of the form body) */}
      {showSettings && (
        <div className="lpe-settings">
          <div className="m-field">
            <label className="m-label">שם פנימי (לזיהוי, לא מוצג בדף)</label>
            <input className="m-input" value={draft.title} onChange={(e) => set({ title: e.target.value })} placeholder="לדוגמה: דף קמפיין אינסטגרם" />
          </div>
          <div className="lpe-settings-row">
            <label className="lpb-toggle">
              <input type="checkbox" checked={draft.published} onChange={(e) => set({ published: e.target.checked })} />
              <span><strong>פרסום הדף</strong><em>כשכבוי — טיוטה, לא נגיש לציבור.</em></span>
            </label>
            <label className="lpb-toggle">
              <input type="checkbox" checked={draft.auto_approve} onChange={(e) => set({ auto_approve: e.target.checked })} />
              <span><strong>הזנה אוטומטית</strong><em>כשכבוי — לידים ממתינים לאישור ידני.</em></span>
            </label>
          </div>
          <div className="m-field">
            <label className="m-label">שיוך לפרויקט (אופציונלי)</label>
            <select className="m-select" value={draft.project_id} onChange={(e) => set({ project_id: e.target.value })}>
              <option value="">ללא</option>
              {(projects || []).filter((p) => !p.deleted_at).map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <p className="lbl-sm">לידים מהדף יקושרו לפרויקט, ובמסך הפרויקט יופיע קישור לדף.</p>
          </div>
          <div className="m-field">
            <label className="m-label">צבע מותג</label>
            <div className="lpb-color">
              <input type="color" value={c.brandColor} onChange={(e) => setContent({ brandColor: e.target.value })} />
              <span className="lpb-color-hex mono">{c.brandColor}</span>
            </div>
          </div>
          <div className="m-field">
            <label className="m-label">אחרי השליחה</label>
            <div className="lpb-radio-group">
              <label className="lpb-radio">
                <input type="radio" name="thankyou" checked={c.thankYou.mode === 'message'} onChange={() => setThankYou({ mode: 'message' })} />
                הצגת הודעת תודה
              </label>
              <label className="lpb-radio">
                <input type="radio" name="thankyou" checked={c.thankYou.mode === 'redirect'} onChange={() => setThankYou({ mode: 'redirect' })} />
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

      {/* Live canvas — edit texts & fields inline, exactly as they'll appear */}
      <div className="lpe-canvas" style={canvasStyle}>
        <div className="lp-card" onClick={(e) => { if (e.target === e.currentTarget) setActiveKey(null) }}>
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

          <div className="lpe-fields">
            {draft.fields.map((f, i) => {
              const active = activeKey === f.key
              return (
                <div
                  key={f.key}
                  className={`lpe-field${active ? ' is-active' : ''}`}
                  onMouseDown={() => setActiveKey(f.key)}
                >
                  <input
                    className="lp-label lpe-edit lpe-field-label"
                    value={f.label}
                    onChange={(e) => updateField(i, { label: e.target.value })}
                    onFocus={() => setActiveKey(f.key)}
                    placeholder="תווית השדה"
                    aria-label="תווית השדה"
                  />
                  {/* Non-interactive preview of the answer area */}
                  {f.type === 'textarea'
                    ? <textarea className="lp-input lp-textarea lpe-preview" rows={3} disabled tabIndex={-1} />
                    : <input className="lp-input lpe-preview" type="text" disabled tabIndex={-1} />}

                  {active && (
                    <div className="lpe-field-controls">
                      <select
                        className="m-select lpe-type"
                        value={f.type}
                        onChange={(e) => updateField(i, { type: e.target.value })}
                        disabled={f.builtin}
                        title={f.builtin ? 'שדה קבוע' : 'סוג השאלה'}
                      >
                        {FIELD_TYPES.map((tp) => <option key={tp} value={tp}>{FIELD_TYPE_LABELS[tp]}</option>)}
                      </select>
                      <label className="lpe-req">
                        <input type="checkbox" checked={!!f.required} onChange={(e) => updateField(i, { required: e.target.checked })} />
                        חובה
                      </label>
                      <span className="lpe-ctrl-spacer" />
                      <button type="button" className="lpe-ctrl-btn" onClick={() => moveField(i, -1)} disabled={i === 0} aria-label="העלאה"><ChevronUp size={16} /></button>
                      <button type="button" className="lpe-ctrl-btn" onClick={() => moveField(i, 1)} disabled={i === draft.fields.length - 1} aria-label="הורדה"><ChevronDown size={16} /></button>
                      <button type="button" className="lpe-ctrl-btn danger" onClick={() => removeField(i)} aria-label="הסרת שדה"><Trash2 size={15} /></button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          <button type="button" className="lpe-add" onClick={addFreeField}>
            <Plus size={16} strokeWidth={1.8} aria-hidden="true" /> הוספת שדה
          </button>

          {/* Preview of the public submit button (brand-colored, not clickable) */}
          <div className="lp-submit lpe-submit-preview" aria-hidden="true">שליחה</div>
        </div>
      </div>

      <div className="lpe-bottom-actions">
        <button type="button" className="m-btn-cancel" onClick={onBack}>ביטול</button>
        <button type="button" className="m-btn-save" onClick={save} disabled={busy}>{busy ? 'שומר…' : 'שמירה'}</button>
      </div>
    </div>
  )
}
