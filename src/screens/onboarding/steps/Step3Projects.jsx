import { useEffect, useState } from 'react'
import { Plus, X, Users } from 'lucide-react'
import { useProjects } from '../../../hooks/useProjects'
import { useGroups } from '../../../hooks/useGroups'
import { useT } from '../../../i18n/useT'
import { isr } from '../../../lib/finance'
import AddGroupModal from '../../../modals/AddGroupModal'
import CsvMappingEditor from '../CsvMappingEditor'
import { CATEGORY_SWATCHES as COLORS } from '../../../lib/palette'
import { Box, Txt, Btn, Input } from '../../../components/ui'

/* Weekday names, by index, for a group's recurring-time label. */
const DAY_KEYS = ['daySun', 'dayMon', 'dayTue', 'dayWed', 'dayThu', 'dayFri', 'daySat']

/* Price label for a group, by its billing mode — mirrors the in-app
   project-detail group card. */
function groupPriceLabel(g, t) {
  const mode = g.billing_mode || 'package'
  if (mode === 'per_session') return g.price_per_session ? t('step3.perSession', { price: isr(g.price_per_session) }) : ''
  if (mode === 'none') return t('step3.priceNone')
  return g.package_price ? t('step3.package', { price: isr(g.package_price), count: g.package_sessions || 1 }) : ''
}

/* Step 3 — build the first project as a real, inline project card that
   mirrors the in-app project-detail screen. The user names the project,
   then a card appears where they can add one or more real groups (via
   the same AddGroupModal used inside the app). Clients are previewed
   here but actually assigned in step 4. The project row is created the
   moment it's needed (first group add, or on advancing). */
export default function Step3Projects({ ob, setCTA }) {
  const { t } = useT('onboardingSteps')
  const { projects, addProject, updateProject } = useProjects()
  const { groups, addGroup, removeGroup } = useGroups()
  const initial = ob.state.answers?.projects || {}
  const [name, setName] = useState(initial.name || '')
  const [color, setColor] = useState(initial.color || COLORS[0])
  const [projectId, setProjectId] = useState(initial.created_ids?.[0] || null)
  const [addGroupOpen, setAddGroupOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  /* Groups already created under this project (real rows). */
  const projectGroups = projectId ? groups.filter((g) => g.project_id === projectId) : []
  const hasName = name.trim().length > 0
  const canAdvance = hasName
  const hint = !hasName ? t('step3.hintName') : null

  /* Ensure the project row exists, returning its id. Created lazily so a
     user who never adds a group still gets exactly one project on Next,
     and back+next never duplicates it. Keeps name/color in sync. */
  const ensureProject = async () => {
    if (projectId) {
      /* keep an existing row's name/color current */
      const cur = projects.find((p) => p.id === projectId)
      if (cur && (cur.name !== name.trim() || cur.color !== color)) {
        await updateProject(projectId, { name: name.trim(), color }).catch(() => {})
      }
      return projectId
    }
    const created = await addProject({ name: name.trim(), color })
    setProjectId(created.id)
    await ob.setAnswers('projects', {
      name: name.trim(), color, created_ids: [created.id],
    })
    return created.id
  }

  const openAddGroup = async () => {
    if (!hasName) return
    setBusy(true); setErr('')
    try {
      await ensureProject()
      setAddGroupOpen(true)
    } catch (e) {
      setErr(t('step3.errCreateFail', { error: e.message || t('step3.tryAgain') }))
    } finally {
      setBusy(false)
    }
  }

  const onNext = async () => {
    setBusy(true); setErr('')
    try {
      const pid = await ensureProject()
      await ob.setAnswers('projects', {
        name: name.trim(),
        color,
        group_mode: projectGroups.length > 0,
        created_ids: [pid],
      })
      await ob.advance()
    } catch (e) {
      setErr(t('step3.errSaveFail', { error: e.message || t('step3.tryAgain') }))
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => { setCTA({ onNext, canAdvance, busy, hint }) }, [name, color, projectId, projectGroups.length, busy, canAdvance, hint]) // eslint-disable-line react-hooks/exhaustive-deps

  const existingHint = projects?.length > 0 && !projectId
  const projectForModal = projectId ? { id: projectId, name: name.trim(), color } : null

  return (
    <>
      <Txt as="p" className="ob-intro">{t('step3.intro')}</Txt>
      <Txt as="p" className="ob-intro-sub">{t('step3.introSub', { verb: t('step3.introSubVerb') })}</Txt>

      {existingHint && (
        <Box className="ob-pre-fill-banner">
          {t('step3.existingBanner', { count: projects.length })}
        </Box>
      )}

      <CsvMappingEditor parsed={ob.state.parsed_data} onChange={ob.setParsedData} stepKey="projects" title={t('step3.csvTitle')} />

      <Box className="ob-field">
        <Box as="label" className="ob-label" htmlFor="ob-p-name">{t('step3.nameLabel')}</Box>
        <Input
          id="ob-p-name"
          className="ob-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('step3.namePlaceholder')}
          autoFocus
        />
      </Box>

      <Box className="ob-field">
        <Txt as="p" className="ob-label">{t('step3.colorLabel')}</Txt>
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

      {/* Live project card — appears once the project has a name, mirroring
          the in-app project-detail card so the user sees what they're
          building (groups now, clients next step). */}
      {hasName && (
        <Box className="ob-proj-card">
          <Box className="ob-pc-head">
            <Txt className="ob-pc-color" style={{ background: color }} />
            <Txt as="p" className="ob-pc-name">{name.trim()}</Txt>
          </Box>

          {/* Groups — real, multiple, via the same modal used in-app. */}
          <Box as="section" className="ob-pc-section">
            <Txt as="p" className="ob-pc-sec-title">
              {t('step3.groupsTitle')} {projectGroups.length > 0 && <Txt className="ob-pc-count">{projectGroups.length}</Txt>}
            </Txt>
            {projectGroups.length === 0 ? (
              <Txt as="p" className="ob-pc-empty">{t('step3.groupsEmpty')}</Txt>
            ) : (
              <Box className="ob-pc-group-list">
                {projectGroups.map((g) => {
                  const price = groupPriceLabel(g, t)
                  const recurring = g.recurring_day != null && g.recurring_time
                    ? `${t('step3.' + DAY_KEYS[g.recurring_day])} ${g.recurring_time}` : null
                  return (
                    <Box key={g.id} className="ob-pc-group">
                      <Txt className="ob-pc-group-color" style={{ background: g.color || color }} />
                      <Box className="ob-pc-group-body">
                        <Txt as="p" className="ob-pc-group-name">{g.name}</Txt>
                        {(price || recurring) && (
                          <Txt as="p" className="ob-pc-group-meta">
                            {price}{price && recurring ? ' · ' : ''}{recurring}
                          </Txt>
                        )}
                      </Box>
                      <Btn
                        type="button"
                        className="ob-pc-group-x"
                        onClick={() => removeGroup(g.id)}
                        aria-label={t('step3.removeGroupAria', { name: g.name })}
                      >
                        <X size={13} strokeWidth={2} aria-hidden="true" />
                      </Btn>
                    </Box>
                  )
                })}
              </Box>
            )}
            <Btn type="button" className="ob-pc-add" onClick={openAddGroup} disabled={busy}>
              <Plus size={14} strokeWidth={1.9} aria-hidden="true" /> {t('step3.addGroup')}
            </Btn>
          </Box>

          {/* Clients — preview only; real assignment happens in step 4. */}
          <Box as="section" className="ob-pc-section">
            <Txt as="p" className="ob-pc-sec-title">{t('step3.clientsTitle')}</Txt>
            <Box className="ob-pc-teaser">
              <Users size={16} strokeWidth={1.6} aria-hidden="true" />
              <Txt>{t('step3.clientsTeaser', { verb: t('step3.clientsTeaserVerb') })}</Txt>
            </Box>
          </Box>
        </Box>
      )}

      {err && <Txt as="p" className="ob-empty-hint" style={{ color: 'var(--clay)' }}>{err}</Txt>}

      <AddGroupModal
        open={addGroupOpen}
        onClose={() => setAddGroupOpen(false)}
        project={projectForModal}
        onSave={addGroup}
      />
    </>
  )
}
