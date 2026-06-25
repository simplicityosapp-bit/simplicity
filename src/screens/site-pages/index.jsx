import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Pencil, Trash2, ExternalLink, Copy, Check, LayoutTemplate } from 'lucide-react'
import { useSitePages } from '../../hooks/useSitePages'
import { newSitePageDraft, publicSitePageUrl, KIND_LABEL } from '../../lib/sitePageSchema'
import { ROUTES } from '../../lib/routes'
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
const NEW_LABEL = { landing: 'דף נחיתה חדש', lead: 'דף השארת פרטים חדש' }

export default function SitePagesScreen() {
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
        <h1 className="s-hero">בנאי דפים</h1>
        <p className="s-sub">בנו דפי נחיתה, טפסים ודפי תיאום — בגרירה, עם סקשנים, רקעים ואייקונים.</p>
      </div>

      <div className="spg-tabs">
        {KINDS.map((k) => (
          <button key={k} className={`spg-tab${kind === k ? ' is-on' : ''}`} onClick={() => setKind(k)}>
            {KIND_LABEL[k]}
          </button>
        ))}
      </div>

      {ENGINE_KINDS.has(kind) ? (
        <>
          <div className="spg-toolbar">
            <button className="cta-add" onClick={createPage}><Plus size={16} /> {NEW_LABEL[kind]}</button>
          </div>
          {loading ? (
            <p className="spg-muted">טוען…</p>
          ) : list.length === 0 ? (
            <div className="spg-empty">
              <LayoutTemplate size={32} />
              <p>אין עדיין דפים. צרו את הראשון.</p>
            </div>
          ) : (
            <ul className="spg-grid">
              {list.map((p) => (
                <li key={p.id} className="spg-card">
                  <div className="spg-card-main" onClick={() => setEditingId(p.id)}>
                    <span className="spg-card-title">{p.title || 'דף ללא שם'}</span>
                    <span className={`spg-badge${p.published ? ' is-pub' : ''}`}>{p.published ? 'מפורסם' : 'טיוטה'}</span>
                  </div>
                  <div className="spg-card-actions">
                    <button onClick={() => setEditingId(p.id)} title="עריכה"><Pencil size={15} /></button>
                    <button onClick={() => copyLink(p)} title="העתקת קישור">{copied === p.id ? <Check size={15} /> : <Copy size={15} />}</button>
                    {p.published ? <a href={publicSitePageUrl(p.kind, p.slug || p.id)} target="_blank" rel="noopener noreferrer" title="פתיחה"><ExternalLink size={15} /></a> : null}
                    <button onClick={() => removePage(p.id)} title="מחיקה"><Trash2 size={15} /></button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <div className="spg-legacy">
          <p>הבנאי של «{KIND_LABEL[kind]}» על המנוע החדש מגיע בקרוב.</p>
          <Link className="spg-legacy-link" to={LEGACY_ROUTE[kind]}>למעבר לבנאי הקיים →</Link>
        </div>
      )}
    </div>
  )
}
