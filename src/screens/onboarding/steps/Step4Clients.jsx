import { useEffect, useMemo, useState } from 'react'
import { X } from 'lucide-react'
import { useClients } from '../../../hooks/useClients'
import { useProjects } from '../../../hooks/useProjects'
import { useGroups } from '../../../hooks/useGroups'
import { useGroupMembers } from '../../../hooks/useGroupMembers'
import { clientBalance } from '../../../lib/clients'
import { isr } from '../../../lib/finance'
import ClientFormFields from '../../../components/ClientFormFields'
import MG from '../../../components/MG'
import CsvMappingEditor from '../CsvMappingEditor'
import { addressUser } from '../../../lib/address'

const initials = (name) =>
  (name || '')
    .split(' ')
    .map((w) => w[0] || '')
    .join('')
    .slice(0, 2)
    .toUpperCase()

const blank = (defaultProjectId) => ({
  name: '', status: 'active', status_id: '', sessions: '', price_per_session: '',
  phone: '', project_id: defaultProjectId || '', group_id: '',
  recurring_day: '', recurring_time: '',
})

/* Faithful mini client card — mirrors the in-app .cc card. Balance is
   membership-aware: pass the membership rows + groups so a group-linked
   client reflects the group's sessions + price, exactly like live. */
function ClientPreviewCard({ client, projectName, members, groups, onRemove }) {
  const { paid, balance, sessionsPaid, sessionsTotal } = clientBalance(client, [], [], members, groups)
  return (
    <div className="ob-cc">
      <div className="ob-cc-head">
        <div className="ob-cc-av">{initials(client.name) || '–'}</div>
        <div className="ob-cc-id">
          <p className="ob-cc-name">{client.name || 'לקוח/ה חדש/ה'}</p>
          <div className="ob-cc-meta">
            <span className="ob-cc-status"><MG text="פעיל׌" /></span>
            {projectName && <span className="ob-cc-proj">{projectName}</span>}
          </div>
        </div>
        {onRemove && (
          <button type="button" className="ob-cc-x" onClick={onRemove} aria-label={`הסר ${client.name}`}>
            <X size={14} strokeWidth={2} aria-hidden="true" />
          </button>
        )}
      </div>
      <div className="ob-cc-stats">
        <div className="ob-cc-stat">
          <p className="ob-cc-stat-l">פגישות</p>
          <p className="ob-cc-stat-v mono">{sessionsPaid}/{sessionsTotal || 0}</p>
        </div>
        <div className="ob-cc-stat divided">
          <p className="ob-cc-stat-l">שולם</p>
          <p className="ob-cc-stat-v mono">{isr(paid)}</p>
        </div>
        <div className="ob-cc-stat">
          <p className="ob-cc-stat-l">יתרה</p>
          <p className="ob-cc-stat-v mono">{isr(balance)}</p>
        </div>
      </div>
    </div>
  )
}

/* Step 4 — first client(s). Uses the SHARED <ClientFormFields> (the same
   body as the in-app AddClientModal) so the experience is faithful, plus
   a group select scoped to the chosen project's groups. A live client
   card reflects what's typed — including the group's sessions/price when
   one is selected. "Add to list" commits a real client (and a real
   group_members row when a group is chosen) and stacks it below. */
export default function Step4Clients({ ob, setCTA }) {
  const { addClient, removeClient, clients } = useClients()
  const { projects } = useProjects()
  const { groups, refetch: refetchGroups } = useGroups()
  const { members, addMember, removeMember, refetch: refetchMembers } = useGroupMembers()

  /* Onboarding creates groups in the previous step; make sure this step
     sees them (and any memberships) even if its hooks mounted from a
     stale snapshot. Runs once on entry. */
  useEffect(() => {
    refetchGroups?.()
    refetchMembers?.()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const projectAnswers = ob.state.answers?.projects || {}
  const justCreatedProjectId = projectAnswers.created_ids?.[0]
  const defaultProjectId = justCreatedProjectId || projects[0]?.id || ''
  const initial = ob.state.answers?.clients || {}

  const [form, setForm] = useState(() => blank(initial.project_id || defaultProjectId))
  const [createdIds, setCreatedIds] = useState(initial.created_ids || [])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const set = (k, v) => { setForm((f) => ({ ...f, [k]: v })); if (err) setErr('') }
  const setMeta = (k) => { setForm((f) => ({ ...f, status: k, status_id: '' })); if (err) setErr('') }

  /* Group options follow the chosen project; clear a stale group when the
     project changes. */
  const projectGroups = useMemo(
    () => (form.project_id ? groups.filter((g) => g.project_id === form.project_id) : []),
    [groups, form.project_id],
  )
  useEffect(() => {
    if (form.group_id && !projectGroups.some((g) => g.id === form.group_id)) {
      setForm((f) => ({ ...f, group_id: '' }))
    }
  }, [projectGroups, form.group_id])

  /* Gendered title, matching the form-of-address chosen in step 1 —
     routed through the shared addressUser helper for app-wide consistency. */
  const gender = ob.state.answers?.profile?.gender
  const addTitle = addressUser(gender, {
    male:    'הוסף לקוחות ראשונים',
    female:  'הוסיפי לקוחות ראשונים',
    neutral: 'הוסף/י לקוחות ראשונים',
  })

  const projectName = (id) => projects.find((p) => p.id === id)?.name || ''
  const addedClients = useMemo(
    () => createdIds.map((id) => clients.find((c) => c.id === id)).filter(Boolean),
    [createdIds, clients],
  )

  const composerHasName = form.name.trim().length > 0
  const canAdvance = composerHasName || addedClients.length > 0
  const hint = !canAdvance
    ? addressUser(gender, {
        male:    'הוסף לקוח אחד לפחות, או דלג.',
        female:  'הוסיפי לקוח אחד לפחות, או דלגי.',
        neutral: 'הוסף/י לקוח אחד לפחות, או דלג/י.',
      })
    : null

  const clientPayload = () => ({
    name: form.name.trim(),
    status: form.status,
    status_meta: form.status,
    status_id: form.status_id || null,
    project_id: form.project_id || null,
    /* group_id mirrors the legacy column; the real link is the
       group_members row created below. */
    group_id: form.group_id || null,
    sessions: Number(form.sessions) || 0,
    price_per_session: Number(form.price_per_session) || 0,
    total_override: null,
    has_custom_price: false,
    recurring_day: form.recurring_day !== '' ? Number(form.recurring_day) : null,
    recurring_time: form.recurring_time || null,
    left_mid_process: false,
    phone: form.phone.trim() || null,
    notes: null,
    notes_updated_at: null,
  })

  const resetComposer = () => setForm(blank(defaultProjectId))

  /* Commit the composer: create the client, and if a group is chosen,
     create a real membership row (matches in-app group assignment so the
     balance reflects the group's package/price). */
  const commitComposer = async () => {
    const row = await addClient(clientPayload())
    if (form.group_id) {
      await addMember({
        group_id: form.group_id,
        client_id: row.id,
        joined_at: new Date().toISOString(),
      }).catch(() => { /* non-fatal — client still created */ })
    }
    const nextIds = [...createdIds, row.id]
    setCreatedIds(nextIds)
    await ob.setAnswers('clients', { project_id: form.project_id || null, created_ids: nextIds })
    return nextIds
  }

  const onAddClient = async () => {
    if (!composerHasName) return
    setBusy(true); setErr('')
    try { await commitComposer(); resetComposer() }
    catch (e) { setErr('השמירה נכשלה: ' + (e.message || 'נסה/י שוב')) }
    finally { setBusy(false) }
  }

  const onRemoveClient = async (id) => {
    /* Drop any membership rows first, then the client. */
    members.filter((m) => m.client_id === id).forEach((m) => removeMember(m.id))
    await removeClient(id)
    const nextIds = createdIds.filter((x) => x !== id)
    setCreatedIds(nextIds)
    await ob.setAnswers('clients', { created_ids: nextIds })
  }

  const onNext = async () => {
    setBusy(true); setErr('')
    try {
      if (composerHasName) await commitComposer()
      await ob.advance()
    } catch (e) {
      setErr('השמירה נכשלה: ' + (e.message || 'נסה/י שוב'))
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => { setCTA({ onNext, canAdvance, busy, hint }) }, [form, createdIds, busy, canAdvance, hint]) // eslint-disable-line react-hooks/exhaustive-deps

  const pathA = ob.state.parsed_data?.kind === 'csv'
  const suggestions = (pathA && Array.isArray(ob.state.parsed_data.clients)) ? ob.state.parsed_data.clients.slice(0, 12) : []
  const onPickSuggestion = (s) => {
    setForm((f) => ({
      ...f,
      name: s.name || '',
      sessions: s.sessions ? String(s.sessions) : f.sessions,
      price_per_session: s.price_per_session ? String(s.price_per_session) : f.price_per_session,
    }))
  }

  /* Live preview — build a synthetic membership so the card reflects the
     selected group's sessions + price before the row is committed. */
  const previewClient = {
    id: '__preview__',
    name: form.name, status: 'active', status_meta: 'active',
    project_id: form.project_id || null, group_id: form.group_id || null,
    sessions: Number(form.sessions) || 0, price_per_session: Number(form.price_per_session) || 0,
    total_override: null,
  }
  const previewMembers = form.group_id
    ? [{ id: '__pm__', client_id: '__preview__', group_id: form.group_id, joined_at: 'x' }]
    : []

  return (
    <>
      <p className="ob-intro">{addTitle}</p>

      <CsvMappingEditor parsed={ob.state.parsed_data} onChange={ob.setParsedData} stepKey="clients" title="שדות הלקוח מהקובץ" />

      {pathA && suggestions.length > 0 && (
        <div className="ob-field">
          <p className="ob-label">מהקובץ שלך — {addressUser(gender, { male: 'בחר', female: 'בחרי', neutral: 'בחר/י' })} לקוח כדי למלא את השדות</p>
          <div className="ob-pills">
            {suggestions.map((s, i) => (
              <button
                key={i}
                type="button"
                className={`ob-pill${form.name === s.name ? ' on' : ''}`}
                onClick={() => onPickSuggestion(s)}
                title={s.email || s.phone || ''}
              >
                {s.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Shared add-client fields — identical to the in-app modal, with a
          group select scoped to the chosen project. */}
      <div className="ob-client-form">
        <ClientFormFields
          form={form}
          set={set}
          setMeta={setMeta}
          projects={projects}
          statuses={[]}
          groups={projectGroups}
          err={err}
        />
      </div>

      {/* Live preview card — faithful to the in-app client card. */}
      {composerHasName && (
        <div className="ob-cc-wrap">
          <ClientPreviewCard
            client={previewClient}
            projectName={projectName(form.project_id)}
            members={previewMembers}
            groups={groups}
          />
          <button type="button" className="ob-pc-add" onClick={onAddClient} disabled={busy}>
            + <MG word="client" /> לרשימה
          </button>
        </div>
      )}

      {/* Cumulative list of added clients (real cards). */}
      {addedClients.length > 0 && (
        <div className="ob-cc-list">
          <p className="ob-label ob-cc-list-h">לקוחות שנוספו ({addedClients.length})</p>
          {addedClients.map((c) => (
            <ClientPreviewCard
              key={c.id}
              client={c}
              projectName={projectName(c.project_id)}
              members={members}
              groups={groups}
              onRemove={() => onRemoveClient(c.id)}
            />
          ))}
        </div>
      )}

      {err && <p className="ob-empty-hint" style={{ color: 'var(--clay)' }}>{err}</p>}
    </>
  )
}
