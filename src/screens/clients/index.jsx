import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { statusMetaOf, paidForClients, sessionsCountForClients, clientBalance } from '../../lib/clients'
import { currentMonthRange, isr } from '../../lib/finance'
import { useClients } from '../../hooks/useClients'
import { useProjects } from '../../hooks/useProjects'
import { useTransactions } from '../../hooks/useTransactions'
import { useTasks } from '../../hooks/useTasks'
import { useReminders } from '../../hooks/useReminders'
import { useSessions } from '../../hooks/useSessions'
import { useScheduledMeetings } from '../../hooks/useScheduledMeetings'
import { useGroups } from '../../hooks/useGroups'
import { useGroupMembers } from '../../hooks/useGroupMembers'
import { useClientStatuses } from '../../hooks/useClientStatuses'
import ClientTabs from './ClientTabs'
import ClientCard from './ClientCard'
import ClientDrawer from '../../drawers/client/ClientDrawer'
import AddClientModal from '../../modals/AddClientModal'
import ConfirmModal from '../../modals/ConfirmModal'
import './ClientsScreen.css'

const HERO_LABEL = {
  active: 'סיכום לקוחות פעילים',
  wandering: 'סיכום לקוחות ביניים',
  past: 'סיכום לקוחות לשעבר',
  no_status: 'סיכום ללא סטטוס',
}

export default function ClientsScreen() {
  const { clients: clientList, loading, error, addClient, updateClient, removeClient } = useClients()
  const { projects } = useProjects()
  const { transactions, addTransaction } = useTransactions()
  const { tasks } = useTasks()
  const { reminders } = useReminders()
  const { sessions, addSession } = useSessions()
  const { addMeeting } = useScheduledMeetings()
  const { groups } = useGroups()
  const { members } = useGroupMembers()
  const { statuses: clientStatuses } = useClientStatuses()
  const [tab, setTab] = useState('active')
  const [scope, setScope] = useState('monthly')
  const [query, setQuery] = useState('')
  const [openId, setOpenId] = useState(null)
  const [showAdd, setShowAdd] = useState(false)
  const [pendingDelete, setPendingDelete] = useState(null)
  const openClient = openId ? clientList.find((c) => c.id === openId) : null

  const byMeta = useMemo(() => {
    const g = { active: [], wandering: [], past: [], no_status: [] }
    clientList.forEach((c) => { (g[statusMetaOf(c)] || g.no_status).push(c) })
    return g
  }, [clientList])
  const counts = {
    active: byMeta.active.length,
    wandering: byMeta.wandering.length,
    past: byMeta.past.length,
    no_status: byMeta.no_status.length,
  }
  const total = counts.active + counts.wandering + counts.past + counts.no_status

  const tabClients = useMemo(() => byMeta[tab] || [], [byMeta, tab])
  const list = useMemo(() => {
    const q = query.trim()
    return q ? tabClients.filter((c) => c.name.includes(q)) : tabClients
  }, [tabClients, query])

  /* Hero — per tab. Monthly/cumulative affects פגישות + שולם; balance is always current. */
  const hero = useMemo(() => {
    const range = scope === 'monthly' ? currentMonthRange() : {}
    const paid = paidForClients(tabClients, range, transactions)
    const balance = tabClients.reduce((s, c) => s + clientBalance(c, transactions, sessions, members, groups).balance, 0)
    if (tab === 'past' || tab === 'no_status') {
      return [
        { l: 'לקוחות', v: tabClients.length },
        { l: 'פגישות', v: sessionsCountForClients(tabClients, range, sessions) },
        { l: 'שולם', v: isr(paid) },
      ]
    }
    let sessionsLabel
    if (scope === 'monthly') {
      sessionsLabel = String(sessionsCountForClients(tabClients, range, sessions))
    } else {
      const done = tabClients.reduce((s, c) => s + clientBalance(c, transactions, sessions, members, groups).sessionsPaid, 0)
      const allot = tabClients.reduce((s, c) => s + (c.sessions || 0), 0)
      sessionsLabel = `${done}/${allot}`
    }
    return [
      { l: 'פגישות', v: sessionsLabel },
      { l: 'שולם', v: isr(paid) },
      { l: 'יתרה פתוחה', v: isr(balance) },
    ]
  }, [tab, scope, tabClients, transactions, sessions, members, groups])

  return (
    <div className="screen">
      <div className="screen-top">
        <header className="screen-head">
          <div>
            <div className="screen-head-meta">
              <p className="lbl">{total} לקוחות</p>
              <span className="lbl dot">·</span>
              <p className="lbl">סיכום</p>
            </div>
            <p className="lbl-sm">בניית קשרים יוצרת תוצאות.</p>
          </div>
          <p className="t-screen">לקוחות</p>
        </header>
        <button className="cta-add" type="button" aria-label="הוסף לקוח" onClick={() => setShowAdd(true)}>הוסף לקוח +</button>
      </div>

      <ClientTabs active={tab} counts={counts} showNoStatus={counts.no_status > 0} onChange={setTab} />

      <div className="c-search">
        <Search size={16} strokeWidth={1.6} aria-hidden="true" />
        <input
          type="search"
          placeholder="חיפוש לקוח…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <section className="c-hero">
        <div className="s-hero">
          <div className="mg-toggle" role="tablist" aria-label="טווח סכומים">
            <button type="button" className={`mg-toggle-btn${scope === 'monthly' ? ' on' : ''}`} onClick={() => setScope('monthly')}>חודשי</button>
            <button type="button" className={`mg-toggle-btn${scope === 'cumulative' ? ' on' : ''}`} onClick={() => setScope('cumulative')}>מצטבר</button>
          </div>
          <p className="c-hero-title">{HERO_LABEL[tab]}</p>
          <div className="c-hero-grid">
            {hero.map((s, i) => (
              <div key={s.l} className={`c-hero-stat${i === 1 ? ' divided' : ''}`}>
                <p className="c-hero-stat-l">{s.l}</p>
                <p className="c-hero-stat-v mono">{s.v}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="c-list">
        {loading ? (
          <div className="empty"><p className="empty-text">טוען לקוחות…</p></div>
        ) : error ? (
          <div className="empty"><p className="empty-text">שגיאה בטעינת הלקוחות: {error}</p></div>
        ) : list.length === 0 ? (
          <div className="empty">
            <p className="empty-text">
              {query ? 'לא נמצאו לקוחות בחיפוש.' : total === 0 ? 'עדיין אין לקוחות. הוסף/י את הראשון!' : 'אין לקוחות בקטגוריה זו.'}
            </p>
          </div>
        ) : (
          list.map((c, i) => <ClientCard key={c.id} client={c} index={i} onOpen={setOpenId} projects={projects} txns={transactions} sessions={sessions} members={members} groups={groups} statuses={clientStatuses} />)
        )}
      </section>

      <ClientDrawer
        client={openClient}
        onClose={() => setOpenId(null)}
        onDelete={() => setPendingDelete(openClient)}
        projects={projects}
        txns={transactions}
        tasks={tasks}
        reminders={reminders}
        sessions={sessions}
        members={members}
        groups={groups}
        statuses={clientStatuses}
        onLogSession={addSession}
        onScheduleMeeting={addMeeting}
        onAddPayment={addTransaction}
        onUpdateClient={updateClient}
      />

      <AddClientModal
        open={showAdd}
        onClose={() => setShowAdd(false)}
        projects={projects}
        statuses={clientStatuses}
        onSave={async (c) => { await addClient(c); setTab(c.status_meta) }}
      />

      <ConfirmModal
        open={!!pendingDelete}
        onClose={() => setPendingDelete(null)}
        title="מחיקת לקוח"
        message={pendingDelete ? `למחוק את "${pendingDelete.name}"? אפשר יהיה לשחזר מהזבל.` : ''}
        confirmLabel="מחק"
        danger
        onConfirm={() => {
          if (pendingDelete) {
            removeClient(pendingDelete.id)
            setOpenId(null)
          }
        }}
      />
    </div>
  )
}
