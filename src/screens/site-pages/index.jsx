import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Pencil, Trash2, ExternalLink, Copy, Check, LayoutTemplate } from 'lucide-react'
import { useSitePages } from '../../hooks/useSitePages'
import { newSitePageDraft, publicSitePageUrl, KIND_LABEL } from '../../lib/sitePageSchema'
import { ROUTES } from '../../lib/routes'
import { useT } from '../../i18n/useT'
import './siteBuilderI18n'
import Editor from './Editor'
import './SitePagesScreen.css'

/* ════════════════════════════════════════════════════════════════
   PAGE BUILDER HUB — /pages
   ════════════════════════════════════════════════════════════════
   One hub for three page KINDS (landing / lead / booking) on the shared
   block engine. Phase 1 ships the LANDING builder fully; the lead/booking
   tabs point at the existing builders until phases 2-3 fold them onto the
   engine. Selecting a page opens the inline Editor. */

const KINDS = ['landing', 'lead', 'booking']
/* Engine-backed kinds (landing + lead after phase 2); booking still legacy. */
const ENGINE_KINDS = new Set(['landing', 'lead'])
const LEGACY_ROUTE = { booking: ROUTES.BOOKING_PAGES }
const NEW_LABEL = { landing: 'hub.newLanding', lead: 'hub.newLead' }

export default function SitePagesScreen() {
  const { t } = useT('siteBuilder')
  const { pages, loading, addPage, updatePage, removePage } = useSitePages()
  const [kind, setKind] = useState('landing')
  const [editingId, setEditingId] = useState(null)
  const [copied, setCopied] = useState(null)

  const editing = editingId ? pages.find((p) => p.id === editingId) : null
  const list = pages.filter((p) => p.kind === kind)

  const createPage = async () => {
    const row = await addPage(newSitePageDraft(kind))
    setEditingId(row.id)
  }

  const copyLink = (p) => {
    const url = publicSitePageUrl(p.kind, p.slug || p.id)
    navigator.clipboard?.writeText(url)
    setCopied(p.id); setTimeout(() => setCopied(null), 1500)
  }

  if (editing) {
    return (
      <Editor
        page={editing}
        onBack={() => setEditingId(null)}
        onSave={(patch) => updatePage(editing.id, patch)}
      />
    )
  }

  return (
    <div className="screen" data-screen="sitePages">
      <div className="screen-top">
        <h1 className="s-hero">{t('hub.title')}</h1>
        <p className="s-sub">{t('hub.subtitle')}</p>
      </div>

      <div className="spg-tabs">
        {KINDS.map((k) => (
          <button key={k} className={`spg-tab${kind === k ? ' is-on' : ''}`} onClick={() => setKind(k)}>
            {t('kinds.' + k, { defaultValue: KIND_LABEL[k] })}
          </button>
        ))}
      </div>

      {ENGINE_KINDS.has(kind) ? (
        <>
          <div className="spg-toolbar">
            <button className="spg-new" onClick={createPage}><Plus size={16} /> {t(NEW_LABEL[kind])}</button>
          </div>
          {loading ? (
            <p className="spg-muted">{t('hub.loading')}</p>
          ) : list.length === 0 ? (
            <div className="empty">
              <span className="empty-icon"><LayoutTemplate size={28} /></span>
              <p className="empty-text">{t('hub.emptyText')}</p>
              <button className="empty-action" onClick={createPage}><Plus size={16} /> {t(NEW_LABEL[kind])}</button>
            </div>
          ) : (
            <ul className="spg-grid">
              {list.map((p) => (
                <li key={p.id} className="spg-card">
                  <div className="spg-card-main" onClick={() => setEditingId(p.id)}>
                    <span className="spg-card-title">{p.title || t('hub.untitled')}</span>
                    <span className={`spg-badge${p.published ? ' is-pub' : ''}`}>{p.published ? t('hub.badgePublished') : t('hub.badgeDraft')}</span>
                  </div>
                  <div className="spg-card-actions">
                    <button onClick={() => setEditingId(p.id)} title={t('hub.edit')} aria-label={t('hub.edit')}><Pencil size={15} /></button>
                    <button onClick={() => copyLink(p)} title={t('hub.copyLink')} aria-label={t('hub.copyLink')}>{copied === p.id ? <Check size={15} /> : <Copy size={15} />}</button>
                    {p.published ? <a href={publicSitePageUrl(p.kind, p.slug || p.id)} target="_blank" rel="noopener noreferrer" title={t('hub.open')} aria-label={t('hub.open')}><ExternalLink size={15} /></a> : null}
                    <button onClick={() => removePage(p.id)} title={t('hub.delete')} aria-label={t('hub.delete')}><Trash2 size={15} /></button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <div className="spg-legacy">
          <p>{t('hub.legacyText', { kind: t('kinds.' + kind, { defaultValue: KIND_LABEL[kind] }) })}</p>
          <Link className="spg-legacy-link" to={LEGACY_ROUTE[kind]}>{t('hub.legacyLink')}</Link>
        </div>
      )}
    </div>
  )
}
