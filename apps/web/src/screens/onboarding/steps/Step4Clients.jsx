import { useEffect, useMemo, useState } from 'react'
import { X } from 'lucide-react'
import { useClients } from '../../../hooks/useClients'
import { useProjects } from '../../../hooks/useProjects'
import { useGroups } from '../../../hooks/useGroups'
import { useGroupMembers } from '../../../hooks/useGroupMembers'
import { clientBalance, isr } from '@simplicity/core'
import ClientFormFields from '../../../components/ClientFormFields'
import MG from '../../../components/MG'
import { useT } from '../../../i18n/useT'
import { Box, Txt, Btn } from '../../../components/ui'

const initials = (name) =>
  (name || '')
    .split(' ')
    .map((w) => w[0] || '')
    .join('')
    .slice(0, 2)
    .toUpperCase()

const blank = (defaultProjectId) => ({
  name: '', status: 'active', status_id: '', sessions: '', price_per_session: '',
  phone: '', email: '', address: '', birth_date: '', project_id: defaultProjectId || '', group_id: '',
  recurring_day: '', recurring_time: '',
})

/* Faithful mini client card — mirrors the in-app .cc card. Balance is
   membership-aware: pass the membership rows + groups so a group-linked
   client reflects the group's sessions + price, exactly like live. */
function ClientPreviewCard({ client, projectName, members, groups, onRemove, t }) {
  const { paid, balance, sessionsPaid, sessionsTotal } = clientBalance(client, [], [], members, groups)
  return (
    <Box className="ob-cc">
      <Box className="ob-cc-head">
        <Box className="ob-cc-av">{initials(client.name) || '–'}</Box>
        <Box className="ob-cc-id">
          <Txt as="p" className="ob-cc-name">{client.name || t('step4.previewName')}</Txt>
          <Box className="ob-cc-meta">
            <Txt className="ob-cc-status"><MG text={t('step4.statusActive')} /></Txt>
            {projectName && <Txt className="ob-cc-proj">{projectName}</Txt>}
          </Box>
        </Box>
        {onRemove && (
          <Btn type="button" className="ob-cc-x" onClick={onRemove} aria-label={t('step4.removeAria', { name: client.name })}>
            <X size={14} strokeWidth={2} aria-hidden="true" />
          </Btn>
        )}
      </Box>
      <Box className="ob-cc-stats">
        <Box className="ob-cc-stat">
          <Txt as="p" className="ob-cc-stat-l">{t('step4.sessions')}</Txt>
          <Txt as="p" className="ob-cc-stat-v mono">{sessionsPaid}/{sessionsTotal || 0}</Txt>
        </Box>
        <Box className="ob-cc-stat divided">
          <Txt as="p" className="ob-cc-stat-l">{t('step4.paid')}</Txt>
          <Txt as="p" className="ob-cc-stat-v mono">{isr(paid)}</Txt>
        </Box>
        <Box className="ob-cc-stat">
          <Txt as="p" className="ob-cc-stat-l">{t('step4.balance')}</Txt>
          <Txt as="p" className="ob-cc-stat-v mono">{isr(balance)}</Txt>
        </Box>
      </Box>
    </Box>
  )
}

/* Step 4 — first client(s). Uses the SHARED <ClientFormFields> (the same
   body as the in-app AddClientModal) so the experience is faithful, plus
   a group select scoped to the chosen project's groups. A live client
   card reflects what's typed — including the group's sessions/price when
   one is selected. "Add to list" commits a real client (and a real
   group_members row when a group is chosen) and stacks it below. */
export default function Step4Clients({ ob, setCTA }) {
  const { t } = useT('onboardingSteps')
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
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clear a group selection that no longer belongs to the chosen project.
      setForm((f) => ({ ...f, group_id: '' }))
    }
  }, [projectGroups, form.group_id])

  /* Gendered title, matching the form-of-address chosen in step 1 —
     i18next applies the gender context via useT for app-wide consistency. */
  const addTitle = t('step4.title')

  const projectName = (id) => projects.find((p) => p.id === id)?.name || ''
  const addedClients = useMemo(
    () => createdIds.map((id) => clients.find((c) => c.id === id)).filter(Boolean),
    [createdIds, clients],
  )

  const composerHasName = form.name.trim().length > 0
  const canAdvance = composerHasName || addedClients.length > 0
  const hint = !canAdvance ? t('step4.hintAddOne') : null

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
    email: form.email?.trim() || null,
    address: form.address?.trim() || null,
    birth_date: form.birth_date || null,
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
    catch (e) { setErr(t('step4.errSaveFail', { error: e.message || t('step4.tryAgain') })) }
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
      setErr(t('step4.errSaveFail', { error: e.message || t('step4.tryAgain') }))
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => { setCTA({ onNext, canAdvance, busy, hint }) }, [form, createdIds, busy, canAdvance, hint]) // eslint-disable-line react-hooks/exhaustive-deps

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
      <Txt as="p" className="ob-intro">{addTitle}</Txt>

      {/* Shared add-client fields — identical to the in-app modal, with a
          group select scoped to the chosen project. */}
      <Box className="ob-client-form">
        <ClientFormFields
          form={form}
          set={set}
          setMeta={setMeta}
          projects={projects}
          statuses={[]}
          groups={projectGroups}
          err={err}
        />
      </Box>

      {/* Live preview card — faithful to the in-app client card. */}
      {composerHasName && (
        <Box className="ob-cc-wrap">
          <ClientPreviewCard
            client={previewClient}
            projectName={projectName(form.project_id)}
            members={previewMembers}
            groups={groups}
            t={t}
          />
          <Btn type="button" className="ob-pc-add" onClick={onAddClient} disabled={busy}>
            + <MG word="client" /> {t('step4.addToList')}
          </Btn>
        </Box>
      )}

      {/* Cumulative list of added clients (real cards). */}
      {addedClients.length > 0 && (
        <Box className="ob-cc-list">
          <Txt as="p" className="ob-label ob-cc-list-h">{t('step4.addedHeading', { count: addedClients.length })}</Txt>
          {addedClients.map((c) => (
            <ClientPreviewCard
              key={c.id}
              client={c}
              projectName={projectName(c.project_id)}
              members={members}
              groups={groups}
              onRemove={() => onRemoveClient(c.id)}
              t={t}
            />
          ))}
        </Box>
      )}

      {err && <Txt as="p" className="ob-empty-hint" style={{ color: 'var(--clay)' }}>{err}</Txt>}
    </>
  )
}
