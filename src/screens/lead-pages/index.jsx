import { useMemo, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  ArrowRight, Plus, Trash2, Copy, Check, ChevronUp, ChevronDown, ExternalLink,
  Settings, Link2, X,
} from 'lucide-react'
import { useT } from '../../i18n/useT'
import { useLeadPages } from '../../hooks/useLeadPages'
import { useBookingPages } from '../../hooks/useBookingPages'
import { useProjects } from '../../hooks/useProjects'
import Coachmark from '../../components/Coachmark'
import InfoPopover from '../../components/InfoPopover'
import DesignToolbox from '../../components/DesignToolbox'
import {
  FIELD_TYPES, DEFAULT_CONTENT, newLeadPageDraft, freeFieldKey,
  publicLeadPageUrl, normalizeSlug, isValidSlug, slugifyInput, isChoiceType, defaultChoiceOptions,
  leadPageSurface,
} from '../../lib/leadPageSchema'
import { ROUTES } from '../../lib/routes'
import { copyText } from '../../lib/clipboard'
import { showError } from '../../lib/toast'
import '../lead-page/LeadPage.css' // WYSIWYG: the canvas reuses the public page's look
import './LeadPagesScreen.css'

/* Field-type display labels resolve via i18n at render time
   (leads:pages.fieldTypes.<type>); see useT inside the builder. */

/* ════════════════════════════════════════════════════════════════
   LEAD PAGES — in-app builder + management for public lead pages.
   Reached from the Leads screen header. A list view ↔ a live builder
   (Google-Forms-style inline editing) toggled by local state.
   ════════════════════════════════════════════════════════════════ */
export default function LeadPagesScreen() {
  const { t } = useT('leads')
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
              <p className="lbl">{t('pages.count', { count: pages.length })}</p>
            </div>
            <p className="lbl-sm">{t('pages.subtitle')}</p>
          </div>
          <p className="t-screen">{t('pages.title')}</p>
        </header>
        <Coachmark id="add-lead-page" radius="50%">
          <button className="cta-add" type="button" onClick={() => setEditingId('new')}>{t('pages.newPage')}</button>
        </Coachmark>
      </div>

      <button type="button" className="lp-back-link" onClick={() => navigate(ROUTES.LEADS)}>
        <ArrowRight size={16} strokeWidth={1.7} aria-hidden="true" /> {t('pages.backToLeads')}
      </button>

      {loading ? (
        <div className="empty"><p className="empty-text">{t('pages.loading')}</p></div>
      ) : error ? (
        <div className="empty"><p className="empty-text">{t('pages.loadError', { error })}</p></div>
      ) : pages.length === 0 ? (
        <div className="empty">
          <p className="empty-text">{t('pages.empty')}</p>
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
  const { t } = useT('leads')
  const [copied, setCopied] = useState(false)
  const url = publicLeadPageUrl(page.slug || page.id)
  const copy = async () => {
    if (await copyText(url)) { setCopied(true); setTimeout(() => setCopied(false), 1600) }
    else showError(t('pages.copyFailed'))
  }
  return (
    <div className="lpm-card">
      <div className="lpm-card-main">
        <p className="lpm-card-title">{page.title?.trim() || t('pages.untitled')}</p>
        <div className="lpm-badges">
          <span className={`lpm-badge${page.published ? ' is-live' : ''}`}>{page.published ? t('pages.badgeLive') : t('pages.badgeDraft')}</span>
          {page.auto_approve
            ? <span className="lpm-badge is-auto">{t('pages.badgeAuto')}</span>
            : <span className="lpm-badge">{t('pages.badgeManual')}</span>}
          <InfoPopover
            label={t('pages.intakeInfoLabel')}
            text={page.auto_approve ? t('pages.intakeInfoAuto') : t('pages.intakeInfoManual')}
          />
        </div>
      </div>
      <div className="lpm-card-actions">
        {page.published && (
          <>
            <button type="button" className="lpm-icon-btn" onClick={copy} aria-label={t('pages.copyLink')} title={t('pages.copyLink')}>
              {copied ? <Check size={16} strokeWidth={2} /> : <Copy size={16} strokeWidth={1.7} />}
            </button>
            <a className="lpm-icon-btn" href={url} target="_blank" rel="noreferrer" aria-label={t('pages.openPage')} title={t('pages.openPage')}>
              <ExternalLink size={16} strokeWidth={1.7} />
            </a>
          </>
        )}
        <button type="button" className="lpm-edit-btn" onClick={onEdit}>{t('pages.edit')}</button>
        <button type="button" className="lpm-icon-btn danger" onClick={onDelete} aria-label={t('pages.delete')} title={t('pages.delete')}>
          <Trash2 size={16} strokeWidth={1.7} />
        </button>
      </div>
    </div>
  )
}

/* ── Builder — live, Google-Forms-style inline editing on the canvas ──── */
function LeadPageBuilder({ page, isNew, onAdd, onUpdate, onBack, onSavedNew }) {
  const { t } = useT('leads')
  const [draft, setDraft] = useState(() => {
    if (isNew || !page) return newLeadPageDraft()
    return {
      title: page.title ?? '',
      published: !!page.published,
      auto_approve: !!page.auto_approve,
      project_id: page.project_id ?? '',
      slug: page.slug ?? '',
      content: { ...DEFAULT_CONTENT, ...(page.content || {}), thankYou: { ...DEFAULT_CONTENT.thankYou, ...(page.content?.thankYou || {}) } },
      fields: Array.isArray(page.fields) && page.fields.length ? page.fields : newLeadPageDraft().fields,
    }
  })
  const { projects } = useProjects()
  const { pages: bookingPages } = useBookingPages()
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
  /* Switching to a choice type seeds default options; switching away keeps
     them (harmless) but they're stripped on save for non-choice types. */
  const changeFieldType = (i, type) => {
    const f = draft.fields[i]
    const patch = { type }
    if (isChoiceType(type) && !(Array.isArray(f.options) && f.options.length)) patch.options = defaultChoiceOptions()
    updateField(i, patch)
  }
  const updateOption = (i, oi, value) => {
    const opts = [...(draft.fields[i].options || [])]
    opts[oi] = value
    updateField(i, { options: opts })
  }
  const addOption = (i) => updateField(i, { options: [...(draft.fields[i].options || []), ''] })
  const removeOption = (i, oi) => updateField(i, { options: (draft.fields[i].options || []).filter((_, idx) => idx !== oi) })
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
    if (busy) return // guard against a fast double-click across the two save buttons
    setErr('')
    if (!draft.title.trim()) { setShowSettings(true); setErr(t('pages.errNeedTitle')); return }
    if (draft.fields.some((f) => !f.label.trim())) { setErr(t('pages.errFieldLabel')); return }
    if (draft.fields.some((f) => isChoiceType(f.type) && (f.options || []).map((o) => o.trim()).filter(Boolean).length < 2)) {
      setErr(t('pages.errChoiceOptions')); return
    }
    const slug = normalizeSlug(draft.slug)
    if (draft.slug.trim() && !isValidSlug(slug)) {
      setShowSettings(true)
      setErr(t('pages.errSlugInvalid'))
      return
    }
    setBusy(true)
    const payload = {
      title: draft.title.trim(),
      published: draft.published,
      auto_approve: draft.auto_approve,
      project_id: draft.project_id || null,
      slug: slug || null,
      content: draft.content,
      fields: draft.fields.map((f) => ({
        key: f.key, label: f.label.trim(), type: f.type, required: !!f.required, builtin: !!f.builtin,
        ...(isChoiceType(f.type) ? { options: (f.options || []).map((o) => o.trim()).filter(Boolean) } : {}),
      })),
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
      // A duplicate slug surfaces as a Postgres 23505 unique-violation.
      if (e?.code === '23505' || /duplicate|unique|idx_lead_pages_slug/i.test(e?.message || '')) {
        setErr(t('pages.errSlugTaken'))
      } else {
        setErr(t('pages.errSaveFailed', { error: e.message || t('pages.errRetry') }))
      }
    } finally {
      setBusy(false)
    }
  }

  const url = page?.id ? publicLeadPageUrl(page.slug || page.id) : null
  const copyLink = async () => {
    if (!url) return
    if (await copyText(url)) { setCopied(true); setTimeout(() => setCopied(false), 1600) }
    else showError(t('pages.copyFailed'))
  }

  const c = draft.content
  const { style: canvasStyle, cls: surfaceCls } = leadPageSurface(c)
  const canvasClass = `lpe-canvas lp-surface${surfaceCls ? ` ${surfaceCls}` : ''}`

  return (
    <div className="screen lpe-screen">
      <DesignToolbox content={draft.content} onChange={setContent} />
      {/* Top bar */}
      <div className="lpe-topbar">
        <button type="button" className="lp-back-link" onClick={onBack}>
          <ArrowRight size={16} strokeWidth={1.7} aria-hidden="true" /> {t('pages.back')}
        </button>
        <span className="lpe-topbar-title">{draft.title.trim() || (isNew ? t('pages.builderNewTitle') : t('pages.builderEditTitle'))}</span>
        <div className="lpe-topbar-actions">
          <button type="button" className={`lpe-settings-btn${showSettings ? ' is-on' : ''}`} onClick={() => setShowSettings((v) => !v)}>
            <Settings size={16} strokeWidth={1.7} aria-hidden="true" /> {t('pages.settings')}
          </button>
          <button type="button" className="m-btn-save" onClick={save} disabled={busy}>{busy ? t('pages.saving') : t('pages.save')}</button>
        </div>
      </div>

      {/* Settings panel (page-level — not part of the form body) */}
      {showSettings && (
        <div className="lpe-settings">
          <div className="m-field">
            <label className="m-label">{t('pages.internalName')}</label>
            <input className="m-input" value={draft.title} onChange={(e) => set({ title: e.target.value })} placeholder={t('pages.internalNamePlaceholder')} />
          </div>
          <div className="lpe-settings-row">
            <label className="lpb-toggle">
              <input type="checkbox" checked={draft.published} onChange={(e) => set({ published: e.target.checked })} />
              <span><strong>{t('pages.publishLabel')}</strong><em>{t('pages.publishHint')}</em></span>
            </label>
            <label className="lpb-toggle">
              <input type="checkbox" checked={draft.auto_approve} onChange={(e) => set({ auto_approve: e.target.checked })} />
              <span><strong>{t('pages.autoApproveLabel')}</strong><em>{t('pages.autoApproveHint')}</em></span>
            </label>
          </div>
          <div className="m-field">
            <label className="m-label">{t('pages.projectLabel')}</label>
            <select className="m-select" value={draft.project_id} onChange={(e) => set({ project_id: e.target.value })}>
              <option value="">{t('pages.none')}</option>
              {(projects || []).filter((p) => !p.deleted_at).map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <p className="lbl-sm">{t('pages.projectHint')}</p>
          </div>
          <div className="m-field">
            <label className="m-label">{t('pages.bookingLabel')}</label>
            <select className="m-select" value={c.bookingPageRef || ''} onChange={(e) => setContent({ bookingPageRef: e.target.value })}>
              <option value="">{t('pages.none')}</option>
              {(bookingPages || []).filter((p) => p.published).map((p) => (
                <option key={p.id} value={p.slug || p.id}>{p.title?.trim() || t('pages.bookingFallbackTitle')}</option>
              ))}
            </select>
            <p className="lbl-sm">{t('pages.bookingHint')}</p>
          </div>
          <div className="m-field">
            <label className="m-label">{t('pages.slugLabel')}</label>
            <div className="lpe-slug-row">
              <span className="lpe-slug-prefix mono" dir="ltr">{window.location.host}/lead/</span>
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
            <label className="m-label">{t('pages.afterSubmit')}</label>
            <div className="lpb-radio-group">
              <label className="lpb-radio">
                <input type="radio" name="thankyou" checked={c.thankYou.mode === 'message'} onChange={() => setThankYou({ mode: 'message' })} />
                {t('pages.thankYouMode')}
              </label>
              <label className="lpb-radio">
                <input type="radio" name="thankyou" checked={c.thankYou.mode === 'redirect'} onChange={() => setThankYou({ mode: 'redirect' })} />
                {t('pages.redirectMode')}
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
              <label className="m-label">{t('pages.publicLink')}</label>
              {draft.published ? (
                <div className="lpb-link-row">
                  <Link2 size={15} strokeWidth={1.7} aria-hidden="true" />
                  <span className="lpb-link-url mono" dir="ltr">{url}</span>
                  <button type="button" className="lpb-copy-btn" onClick={copyLink}>
                    {copied ? <><Check size={14} strokeWidth={2} /> {t('pages.copied')}</> : <><Copy size={14} strokeWidth={1.7} /> {t('pages.copy')}</>}
                  </button>
                </div>
              ) : (
                <p className="lbl-sm">{t('pages.publishForLink')}</p>
              )}
            </div>
          )}
        </div>
      )}

      {err && <p className="m-error lpe-err">{err}</p>}

      {/* Live canvas — edit texts & fields inline, exactly as they'll appear */}
      <div className={canvasClass} style={canvasStyle}>
        <div className="lp-card" onClick={(e) => { if (e.target === e.currentTarget) setActiveKey(null) }}>
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
                    placeholder={t('pages.fieldLabelPlaceholder')}
                    aria-label={t('pages.fieldLabelPlaceholder')}
                  />
                  {/* Non-interactive preview of the answer area */}
                  {isChoiceType(f.type) ? (
                    <div className="lpe-choice-preview">
                      {(f.options || []).map((opt, oi) => (
                        <span className="lpe-choice-opt" key={oi}>
                          <span className={`lpe-choice-mark${f.type === 'select' ? ' radio' : ''}`} aria-hidden="true" />
                          <span className="lpe-choice-opt-label">{opt || t('pages.optionPlaceholder', { num: oi + 1 })}</span>
                        </span>
                      ))}
                    </div>
                  ) : f.type === 'textarea'
                    ? <textarea className="lp-input lp-textarea lpe-preview" rows={3} disabled tabIndex={-1} />
                    : <input className="lp-input lpe-preview" type="text" disabled tabIndex={-1} />}

                  {active && (
                    <>
                      <div className="lpe-field-controls">
                        <select
                          className="m-select lpe-type"
                          value={f.type}
                          onChange={(e) => changeFieldType(i, e.target.value)}
                          disabled={f.builtin}
                          title={f.builtin ? t('pages.fixedField') : t('pages.fieldType')}
                        >
                          {FIELD_TYPES.map((tp) => <option key={tp} value={tp}>{t(`pages.fieldTypes.${tp}`)}</option>)}
                        </select>
                        <label className="lpe-req">
                          <input type="checkbox" checked={!!f.required} onChange={(e) => updateField(i, { required: e.target.checked })} />
                          {t('pages.required')}
                        </label>
                        <span className="lpe-ctrl-spacer" />
                        <button type="button" className="lpe-ctrl-btn" onClick={() => moveField(i, -1)} disabled={i === 0} aria-label={t('pages.moveUp')}><ChevronUp size={16} /></button>
                        <button type="button" className="lpe-ctrl-btn" onClick={() => moveField(i, 1)} disabled={i === draft.fields.length - 1} aria-label={t('pages.moveDown')}><ChevronDown size={16} /></button>
                        <button type="button" className="lpe-ctrl-btn danger" onClick={() => removeField(i)} aria-label={t('pages.removeField')}><Trash2 size={15} /></button>
                      </div>
                      {isChoiceType(f.type) && (
                        <div className="lpe-options">
                          {(f.options || []).map((opt, oi) => (
                            <div className="lpe-option-row" key={oi}>
                              <span className={`lpe-choice-mark${f.type === 'select' ? ' radio' : ''}`} aria-hidden="true" />
                              <input
                                className="m-input lpe-option-input"
                                value={opt}
                                onChange={(e) => updateOption(i, oi, e.target.value)}
                                placeholder={t('pages.optionPlaceholder', { num: oi + 1 })}
                              />
                              <button type="button" className="lpe-ctrl-btn danger" onClick={() => removeOption(i, oi)} disabled={(f.options || []).length <= 1} aria-label={t('pages.removeOption')}><X size={14} /></button>
                            </div>
                          ))}
                          <button type="button" className="lpe-add-option" onClick={() => addOption(i)}>
                            <Plus size={14} strokeWidth={1.8} aria-hidden="true" /> {t('pages.addOption')}
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )
            })}
          </div>

          <button type="button" className="lpe-add" onClick={addFreeField}>
            <Plus size={16} strokeWidth={1.8} aria-hidden="true" /> {t('pages.addField')}
          </button>

          {/* Preview of the public submit button (brand-colored, not clickable) */}
          <div className="lp-submit lpe-submit-preview" aria-hidden="true">{t('pages.submitPreview')}</div>
        </div>
      </div>

      <div className="lpe-bottom-actions">
        <button type="button" className="m-btn-cancel" onClick={onBack}>{t('pages.cancel')}</button>
        <button type="button" className="m-btn-save" onClick={save} disabled={busy}>{busy ? t('pages.saving') : t('pages.save')}</button>
      </div>
    </div>
  )
}
