import { useState } from 'react'
import { User, Users, Layers, Plus, Check } from 'lucide-react'
import { useProjects } from '../../../hooks/useProjects'
import { useGroups } from '../../../hooks/useGroups'
import { useUserPreferences } from '../../../hooks/useUserPreferences'
import { CATEGORY_SWATCHES as COLORS } from '../../../lib/palette'
import { useT } from '../../../i18n/useT'
import { useStepCTA } from '../useStepCTA'
import { Box, Txt, Btn, Input } from '../../../components/ui'

/* ════════════════════════════════════════════════════════════════
   Step 2 — "how do you work?"
   ════════════════════════════════════════════════════════════════
   This step used to ask for a project name, a colour, and any number of
   groups through the full in-app AddGroupModal — which asks a first-time
   user to configure billing mode, package price and a recurring slot for
   a concept nobody has explained to them yet.

   It asks one question instead: do you work one-to-one, in groups, or
   both. That answer IS the teaching — the project appears already named
   from what they do, and the card below shows the shape their answer
   builds, so "project" is learned from their own way of working rather
   than from a definition. Everything else about a group (price, package,
   the weekly slot) belongs on the project screen, where there is room
   for it and a reason to care.

   An account that already has projects — a restart from Settings, or
   rows made by hand before coming back here — is offered them as a
   choice first. The step only knew how to create, so every restart
   planted a second "אימון אישי" beside the first and a banner at the
   bottom warned about it after the fact. Choosing an existing project
   writes nothing to it; the flow just remembers which one the first
   client belongs in.
   ════════════════════════════════════════════════════════════════ */

const MODES = [
  { k: 'solo',   icon: User },
  { k: 'groups', icon: Users },
  { k: 'both',   icon: Layers },
]

const wantsGroups = (mode) => mode === 'groups' || mode === 'both'
const wantsSolo   = (mode) => mode === 'solo' || mode === 'both'

export default function Step2Project({ ob, setCTA }) {
  const { t } = useT('onboardingSteps')
  const { prefs } = useUserPreferences()
  const { projects, addProject, updateProject } = useProjects()
  const { addGroup, removeGroup } = useGroups()

  const initial = ob.state.answers?.projects || {}
  /* The project arrives already named after what they said they do, so
     the first thing on screen is a filled-in example rather than an empty
     box asking for a word they don't have yet. */
  const role = prefs?.profile?.role
  const suggestedName = role
    ? t(`step2.projectName.${role}`, { defaultValue: t('step2.projectName.fallback') })
    : t('step2.projectName.fallback')

  /* A project this flow created on an earlier pass is still ours: edited in
     place below, never offered back as "existing". Everything else the
     account holds is. */
  const flowProjectId = initial.created_ids?.[0] || null
  const existing = (projects || []).filter((p) => p.id !== flowProjectId)
  const offerExisting = existing.length > 0 && !flowProjectId
  /* 'new' opens the composer; a project id continues with that project.
     Derived, not stored: projects load after mount, so the chooser has to
     be able to appear once they arrive. */
  const [pick, setPick] = useState(initial.project_id || null)
  const choice = offerExisting ? pick : 'new'
  const composing = choice === 'new'
  const chosen = composing ? null : (existing.find((p) => p.id === choice) || null)

  const [mode, setMode]   = useState(initial.work_mode || null)
  const [name, setName]   = useState(initial.name || suggestedName)
  const [color, setColor] = useState(initial.color || COLORS[0])
  const [busy, setBusy]   = useState(false)
  const [err, setErr]     = useState('')

  const trimmed = name.trim()
  const canAdvance = composing ? (!!mode && trimmed.length > 0) : !!chosen
  const hint = !composing
    ? (chosen ? null : t('step2.hintPickProject'))
    : (!mode ? t('step2.hintPickMode') : (!trimmed ? t('step2.hintName') : null))

  const onNext = async () => {
    setBusy(true); setErr('')
    try {
      if (!composing) {
        /* Nothing is written to the chosen project. created_ids stays empty
           so the closing summary doesn't claim it, and a starter group is
           never planted in a project the user built themselves. */
        await ob.setAnswers('projects', {
          project_id: chosen.id, created_ids: [], group_ids: [], work_mode: null,
        })
        await ob.advance()
        return
      }

      /* Rows an earlier pass created — updated, never duplicated. */
      const prevProjectId = initial.created_ids?.[0] || null
      const prevGroupIds = initial.group_ids || []

      let projectId = prevProjectId
      if (projectId) {
        const cur = projects.find((p) => p.id === projectId)
        if (!cur || cur.name !== trimmed || cur.color !== color) {
          const updated = await updateProject(projectId, { name: trimmed, color }).catch(() => null)
          if (!updated && !cur) projectId = null /* row is gone — recreate below */
        }
      }
      if (!projectId) projectId = (await addProject({ name: trimmed, color })).id

      /* The starter group exists only to make the concept concrete. If the
         user comes back and switches to one-to-one, ours goes with it —
         it is empty and we created it, so leaving it would plant a group
         they never asked for. */
      let groupIds = prevGroupIds
      if (wantsGroups(mode) && groupIds.length === 0) {
        const group = await addGroup({
          project_id: projectId,
          name: t('step2.firstGroupName'),
          color,
          billing_mode: 'package',
          package_price: null,
          package_sessions: null,
          price_per_session: null,
          recurring_day: null,
          recurring_time: null,
          recurring_end_time: null,
          recurring_start_date: null,
          recurring_end_date: null,
          status: 'active',
        })
        groupIds = [group.id]
      } else if (!wantsGroups(mode) && groupIds.length > 0) {
        await Promise.all(groupIds.map((id) => removeGroup(id).catch(() => {})))
        groupIds = []
      }

      await ob.setAnswers('projects', {
        work_mode: mode, name: trimmed, color,
        project_id: projectId, created_ids: [projectId], group_ids: groupIds,
      })
      await ob.advance()
    } catch (e) {
      setErr(t('step2.errSaveFail', { error: e.message || t('step2.tryAgain') }))
    } finally {
      setBusy(false)
    }
  }

  useStepCTA(setCTA, { onNext, canAdvance, busy, hint })

  return (
    <>
      <Txt as="p" className="ob-intro">{t('step2.intro')}</Txt>
      <Txt as="p" className="ob-intro-sub">{t('step2.introSub')}</Txt>

      {offerExisting && (
        <Box className="ob-field">
          <Txt as="p" className="ob-label">{t('step2.existingTitle')}</Txt>
          <Txt as="p" className="ob-empty-hint">{t('step2.existingSub')}</Txt>
          <Box className="ob-existing-list" role="radiogroup" aria-label={t('step2.existingTitle')}>
            {existing.map((p) => (
              <Btn
                key={p.id}
                type="button"
                role="radio"
                aria-checked={choice === p.id}
                className={`ob-existing${choice === p.id ? ' on' : ''}`}
                onClick={() => setPick(p.id)}
              >
                <Txt className="ob-pc-group-color" style={{ background: p.color }} />
                <Txt className="ob-existing-name">{p.name}</Txt>
                {choice === p.id && <Check size={15} strokeWidth={2.2} aria-hidden="true" />}
              </Btn>
            ))}
            <Btn
              type="button"
              role="radio"
              aria-checked={composing}
              className={`ob-existing ob-existing-new${composing ? ' on' : ''}`}
              onClick={() => setPick('new')}
            >
              <Plus size={15} strokeWidth={2} aria-hidden="true" />
              <Txt className="ob-existing-name">{t('step2.pickNew')}</Txt>
              {composing && <Check size={15} strokeWidth={2.2} aria-hidden="true" />}
            </Btn>
          </Box>
        </Box>
      )}

      {composing && (
        <Box className="ob-field">
          <Box className="ob-work-modes">
            {MODES.map(({ k, icon: Icon }) => (
              <Btn
                key={k}
                type="button"
                className={`ob-work-mode${mode === k ? ' on' : ''}`}
                aria-pressed={mode === k}
                onClick={() => setMode(k)}
              >
                <Icon size={20} strokeWidth={1.6} aria-hidden="true" />
                <Txt className="ob-work-mode-l">{t(`step2.mode.${k}`)}</Txt>
              </Btn>
            ))}
          </Box>
          {mode && <Txt as="p" className="ob-empty-hint">{t(`step2.modeHelp.${mode}`)}</Txt>}
        </Box>
      )}

      {composing && mode && (
        <>
          <Box className="ob-field">
            <Box as="label" className="ob-label" htmlFor="ob-p-name">{t('step2.nameLabel')}</Box>
            <Input
              id="ob-p-name"
              className="ob-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={suggestedName}
            />
            <Txt as="p" className="ob-empty-hint">{t('step2.nameHint')}</Txt>
          </Box>

          <Box className="ob-field">
            <Txt as="p" className="ob-label">{t('step2.colorLabel')}</Txt>
            <Box className="ob-color-row">
              {COLORS.map((c) => (
                <Btn
                  key={c}
                  type="button"
                  className={`ob-color-swatch${color === c ? ' on' : ''}`}
                  style={{ background: c }}
                  onClick={() => setColor(c)}
                  aria-label={c}
                />
              ))}
            </Box>
          </Box>

          {/* What their answer builds — the same card shape the project
              screen shows, so the concept is already familiar when they
              get there. */}
          <Box className="ob-proj-card">
            <Box className="ob-pc-head">
              <Txt className="ob-pc-color" style={{ background: color }} />
              <Txt as="p" className="ob-pc-name">{trimmed || suggestedName}</Txt>
            </Box>

            {wantsGroups(mode) && (
              <Box as="section" className="ob-pc-section">
                <Txt as="p" className="ob-pc-sec-title">{t('step2.groupsTitle')}</Txt>
                <Box className="ob-pc-group-list">
                  <Box className="ob-pc-group">
                    <Txt className="ob-pc-group-color" style={{ background: color }} />
                    <Box className="ob-pc-group-body">
                      <Txt as="p" className="ob-pc-group-name">{t('step2.firstGroupName')}</Txt>
                      <Txt as="p" className="ob-pc-group-meta">{t('step2.firstGroupMeta')}</Txt>
                    </Box>
                  </Box>
                </Box>
              </Box>
            )}

            {wantsSolo(mode) && (
              <Box as="section" className="ob-pc-section">
                <Txt as="p" className="ob-pc-sec-title">{t('step2.clientsTitle')}</Txt>
                <Box className="ob-pc-teaser">
                  <Users size={16} strokeWidth={1.6} aria-hidden="true" />
                  <Txt>{t('step2.clientsTeaser')}</Txt>
                </Box>
              </Box>
            )}
          </Box>
        </>
      )}

      {err && <Txt as="p" className="ob-empty-hint" style={{ color: 'var(--clay)' }}>{err}</Txt>}
    </>
  )
}
