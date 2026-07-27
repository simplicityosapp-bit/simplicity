import { useState } from 'react'
import { User, Users, Layers } from 'lucide-react'
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

  const [mode, setMode]   = useState(initial.work_mode || null)
  const [name, setName]   = useState(initial.name || suggestedName)
  const [color, setColor] = useState(initial.color || COLORS[0])
  const [busy, setBusy]   = useState(false)
  const [err, setErr]     = useState('')

  const trimmed = name.trim()
  const canAdvance = !!mode && trimmed.length > 0
  const hint = !mode ? t('step2.hintPickMode') : (!trimmed ? t('step2.hintName') : null)

  const onNext = async () => {
    setBusy(true); setErr('')
    try {
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
        created_ids: [projectId], group_ids: groupIds,
      })
      await ob.advance()
    } catch (e) {
      setErr(t('step2.errSaveFail', { error: e.message || t('step2.tryAgain') }))
    } finally {
      setBusy(false)
    }
  }

  useStepCTA(setCTA, { onNext, canAdvance, busy, hint })

  const existingHint = projects?.length > 0 && !initial.created_ids?.length

  return (
    <>
      <Txt as="p" className="ob-intro">{t('step2.intro')}</Txt>
      <Txt as="p" className="ob-intro-sub">{t('step2.introSub')}</Txt>

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

      {mode && (
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

      {existingHint && (
        <Txt as="p" className="ob-empty-hint">{t('step2.existingBanner', { count: projects.length })}</Txt>
      )}

      {err && <Txt as="p" className="ob-empty-hint" style={{ color: 'var(--clay)' }}>{err}</Txt>}
    </>
  )
}
