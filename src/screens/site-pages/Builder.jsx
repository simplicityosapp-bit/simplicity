import { useState } from 'react'
import { useParams, useNavigate, Navigate } from 'react-router-dom'
import { ArrowRight, Plus, Pencil, Trash2, ExternalLink, Copy, Check, LayoutTemplate, Files } from 'lucide-react'
import { useSitePages } from '../../hooks/useSitePages'
import { useSubscription } from '../../hooks/useSubscription'
import { useUpgradeNav } from '../../hooks/useUpgradeNav'
import { newSitePageDraft, publicSitePageUrl, KIND_LABEL } from '../../lib/sitePageSchema'
import { ROUTES } from '../../lib/routes'
import { showError } from '../../lib/toast'
import { useT } from '../../i18n/useT'
import './siteBuilderI18n'
import Editor from './Editor'
import TemplatePicker from './TemplatePicker'
import SiteRenderer from '../site-page/SiteRenderer'
import './SitePagesScreen.css'
import { Box, Txt, Btn, Lnk } from '../../components/ui'

/* ════════════════════════════════════════════════════════════════
   PAGE BUILDER — a single kind's dedicated sub-screen (/pages/<kind>).
   ════════════════════════════════════════════════════════════════
   Reached from the hub (/pages). Lists this kind's pages, creates new ones,
   and opens the inline Editor. Only the engine-backed kinds (landing / lead)
   route here; booking still uses its legacy builder. */

const ENGINE_KINDS = new Set(['landing', 'lead'])
const NEW_LABEL = { landing: 'hub.newLanding', lead: 'hub.newLead' }

export default function SitePagesBuilder() {
  const { t } = useT('siteBuilder')
  const { t: ts } = useT('subscription')
  const navigate = useNavigate()
  const { kind } = useParams()
  const { pages, loading, error, refetch, addPage, updatePage, removePage } = useSitePages()
  const { limits } = useSubscription()
  const goUpgrade = useUpgradeNav()
  const [editingId, setEditingId] = useState(null)
  const [copied, setCopied] = useState(null)
  const [picking, setPicking] = useState(false)

  // Unknown kind (or booking, which has its own builder) → back to the hub.
  if (!ENGINE_KINDS.has(kind)) return <Navigate to={ROUTES.SITE_PAGES} replace />

  const editing = editingId ? pages.find((p) => p.id === editingId) : null
  const list = pages.filter((p) => p.kind === kind)
  /* Free tier gets ONE page of each kind — manage it freely, but creating a
     second is gated. Infinity while billing isn't enforced → never blocks. */
  const pageMax = kind === 'lead' ? limits.leadPages : limits.landingPages
  const atLimit = list.length >= pageMax

  /* New page: open the template picker; the choice seeds theme + sections. */
  const createFrom = async (tpl) => {
    setPicking(false)
    const draft = newSitePageDraft(kind)
    if (tpl) { draft.theme = structuredClone(tpl.theme); draft.sections = structuredClone(tpl.sections) }
    try { const row = await addPage(draft); if (row?.id) setEditingId(row.id) } catch { showError(t('hub.actionFailed')) }
  }

  const copyLink = (p) => {
    const url = publicSitePageUrl(p.kind, p.slug || p.id)
    navigator.clipboard?.writeText(url)
    setCopied(p.id); setTimeout(() => setCopied(null), 1500)
  }

  /* Clone a page as a fresh draft (new slug, unpublished) to use as a start. */
  const duplicatePage = async (p) => {
    if (atLimit) { goUpgrade(); return }   // duplicating creates a new page → gated
    try {
      const row = await addPage({
        kind: p.kind, title: `${p.title || ''} ${t('hub.copySuffix')}`.trim(),
        published: false, slug: null, project_id: p.project_id || null,
        theme: p.theme || {}, sections: p.sections || [], config: p.config || {},
      })
      if (row?.id) setEditingId(row.id)
    } catch { showError(t('hub.actionFailed')) }
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

  const kindLabel = t('kinds.' + kind, { defaultValue: KIND_LABEL[kind] })

  return (
    <Box className="screen" data-screen="sitePages">
      <Box className="spg-builder-top">
        <Btn className="spe-icon-btn" onClick={() => navigate(ROUTES.SITE_PAGES)} title={t('hub.back')} aria-label={t('hub.back')}><ArrowRight size={18} /></Btn>
        <Txt as="h1" className="t-screen">{kindLabel}</Txt>
      </Box>

      <Box className="spg-toolbar">
        <Btn className="spg-new" onClick={() => (atLimit ? goUpgrade() : setPicking(true))}><Plus size={16} /> {t(NEW_LABEL[kind])}</Btn>
      </Box>
      {atLimit && (
        <Btn type="button" className="sub-limit-note" onClick={goUpgrade}>{ts('limit.pages')} · {ts('limit.upgrade')}</Btn>
      )}

      {loading ? (
        <Box as="ul" className="spg-grid" aria-hidden="true">
          {[0, 1, 2, 3].map((i) => (
            <Box as="li" key={i} className="spg-card spg-card-skel">
              <Box className="spg-card-thumb spg-skel" />
              <Box className="spg-card-body">
                <Box className="spg-skel-line" />
                <Box className="spg-skel-line spg-skel-line-sm" />
              </Box>
            </Box>
          ))}
        </Box>
      ) : error ? (
        <Box className="empty">
          <Txt className="empty-icon"><LayoutTemplate size={28} /></Txt>
          <Txt as="p" className="empty-text">{t('hub.loadError')}</Txt>
          <Btn className="empty-action" onClick={() => refetch?.()}>{t('hub.retry')}</Btn>
        </Box>
      ) : list.length === 0 ? (
        <Box className="empty">
          <Txt className="empty-icon"><LayoutTemplate size={28} /></Txt>
          <Txt as="p" className="empty-text">{t('hub.emptyText')}</Txt>
          <Btn className="empty-action" onClick={() => setPicking(true)}><Plus size={16} /> {t(NEW_LABEL[kind])}</Btn>
        </Box>
      ) : (
        <Box as="ul" className="spg-grid">
          {list.map((p) => (
            <Box as="li" key={p.id} className="spg-card">
              <Box className="spg-card-thumb" onClick={() => setEditingId(p.id)} role="button" tabIndex={0}
                aria-label={`${p.title || t('hub.untitled')} — ${t('hub.edit')}`}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setEditingId(p.id) } }}>
                {p.sections && p.sections.length ? (
                  <Box className="spg-card-thumb-scale" aria-hidden="true">
                    <SiteRenderer theme={p.theme} sections={p.sections} interactive={false} />
                  </Box>
                ) : (
                  <Box className="spg-card-thumb-empty"><LayoutTemplate size={24} /></Box>
                )}
              </Box>
              <Box className="spg-card-body">
                <Box className="spg-card-main" onClick={() => setEditingId(p.id)}>
                  <Txt className="spg-card-title">{p.title || t('hub.untitled')}</Txt>
                  <Txt className={`spg-badge${p.published ? ' is-pub' : ''}`}>{p.published ? t('hub.badgePublished') : t('hub.badgeDraft')}</Txt>
                </Box>
                <Box className="spg-card-actions">
                  <Btn onClick={() => setEditingId(p.id)} title={t('hub.edit')} aria-label={t('hub.edit')}><Pencil size={15} /></Btn>
                  <Btn onClick={() => duplicatePage(p)} title={t('hub.duplicate')} aria-label={t('hub.duplicate')}><Files size={15} /></Btn>
                  <Btn onClick={() => copyLink(p)} title={t('hub.copyLink')} aria-label={t('hub.copyLink')}>{copied === p.id ? <Check size={15} /> : <Copy size={15} />}</Btn>
                  {p.published ? <Lnk href={publicSitePageUrl(p.kind, p.slug || p.id)} target="_blank" rel="noopener noreferrer" title={t('hub.open')} aria-label={t('hub.open')}><ExternalLink size={15} /></Lnk> : null}
                  <Btn onClick={() => removePage(p.id)} title={t('hub.delete')} aria-label={t('hub.delete')}><Trash2 size={15} /></Btn>
                </Box>
              </Box>
            </Box>
          ))}
        </Box>
      )}

      {picking ? <TemplatePicker kind={kind} onPick={createFrom} onClose={() => setPicking(false)} /> : null}
    </Box>
  )
}
