import { useState } from 'react'
import { View, Text, TextInput, Pressable } from 'react-native'
import { User, Users, Layers, Plus, Check } from 'lucide-react-native'
import { colors, type } from '../../../theme/theme'
import { themed } from '../../../theme/themed'
import i18n from '../../../lib/i18n'
import { usePreferences } from '../../../lib/preferences'
import { useProjectsData } from '../../../hooks/useProjectsData'
import { useStepCTA } from '../useStepCTA'

/* ════════════════════════════════════════════════════════════════
   Step 2 — "how do you work?"
   ════════════════════════════════════════════════════════════════
   Native port of apps/web Step2Project, and the reasoning is worth
   keeping beside it.

   This step used to ask for a project name, a colour, and any number of
   groups through the full add-group form — which asks a first-time user
   to configure billing mode, package price and a recurring slot for a
   concept nobody has explained to them yet.

   It asks one question instead: do you work one-to-one, in groups, or
   both. That answer IS the teaching — the project appears already named
   from what they do, and the card below shows the shape their answer
   builds, so "project" is learned from their own way of working rather
   than from a definition. Everything else about a group belongs on the
   project screen, where there is room for it and a reason to care.

   An account that already has projects — a restart from Settings, or rows
   made by hand — is offered them as a choice first. The step once only
   knew how to create, so every restart planted a second "אימון אישי"
   beside the first. Choosing an existing project writes nothing to it;
   the flow just remembers which one the first client belongs in.
   ════════════════════════════════════════════════════════════════ */

const MODES = [
  { k: 'solo', Icon: User },
  { k: 'groups', Icon: Users },
  { k: 'both', Icon: Layers },
]

/* The project colours this app already offers — same list as
   AddProjectModal, so a project born in onboarding looks like every other
   project on the screen it lands on. */
const SWATCHES = ['#0e9888', '#0099aa', '#7a5cb8', '#8BA888', '#C97B5E', '#D4A574', '#B5634E', '#4a9a6a']

const wantsGroups = (mode) => mode === 'groups' || mode === 'both'
const wantsSolo = (mode) => mode === 'solo' || mode === 'both'

export default function Step2Project({ ob, setCTA }) {
  const t = (k, vars) => i18n.t('onboardingSteps:' + k, vars)
  const { prefs } = usePreferences()
  const { projects, addProject, updateProject, addGroup, removeGroup } = useProjectsData()

  const initial = ob.state.answers?.projects || {}

  /* The project arrives already named after what they said they do, so the
     first thing on screen is a filled-in example rather than an empty box
     asking for a word they do not have yet. */
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

  const [mode, setMode] = useState(initial.work_mode || null)
  const [name, setName] = useState(initial.name || suggestedName)
  const [color, setColor] = useState(initial.color || SWATCHES[0])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const rtl = (i18n.language || '').startsWith('he')
  const align = { textAlign: rtl ? 'right' : 'left' }

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
           so the closing summary does not claim it, and a starter group is
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
        const cur = (projects || []).find((p) => p.id === projectId)
        if (!cur || cur.name !== trimmed || cur.color !== color) {
          const updated = await updateProject(projectId, { name: trimmed, color }).catch(() => null)
          if (updated === null && !cur) projectId = null /* row is gone — recreate below */
        }
      }
      if (!projectId) projectId = (await addProject({ name: trimmed, color })).id

      /* The starter group exists only to make the concept concrete. If the
         user comes back and switches to one-to-one, ours goes with it — it
         is empty and we created it, so leaving it would plant a group they
         never asked for. */
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
      setErr(t('step2.errSaveFail', { error: e?.message || t('step2.tryAgain') }))
    } finally {
      setBusy(false)
    }
  }

  useStepCTA(setCTA, { onNext, canAdvance, busy, hint })

  return (
    <View style={styles.root}>
      <Text style={[styles.intro, align]}>{t('step2.intro')}</Text>
      <Text style={[styles.introSub, align]}>{t('step2.introSub')}</Text>

      {offerExisting ? (
        <View style={styles.field}>
          <Text style={[styles.label, align]}>{t('step2.existingTitle')}</Text>
          <Text style={[styles.help, align]}>{t('step2.existingSub')}</Text>
          <View style={styles.existingList}>
            {existing.map((p) => {
              const on = choice === p.id
              return (
                <Pressable
                  key={p.id}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: on }}
                  style={[styles.existing, rtl && styles.rowRtl, on && styles.existingOn]}
                  onPress={() => setPick(p.id)}
                >
                  <View style={[styles.dot, { backgroundColor: p.color || colors.brand }]} />
                  <Text style={[styles.existingName, align]} numberOfLines={1}>{p.name}</Text>
                  {on ? <Check size={15} strokeWidth={2.2} color={colors.brand} /> : null}
                </Pressable>
              )
            })}
            <Pressable
              accessibilityRole="radio"
              accessibilityState={{ checked: composing }}
              style={[styles.existing, rtl && styles.rowRtl, composing && styles.existingOn]}
              onPress={() => setPick('new')}
            >
              <Plus size={15} strokeWidth={2} color={colors.textSub} />
              <Text style={[styles.existingName, align]}>{t('step2.pickNew')}</Text>
              {composing ? <Check size={15} strokeWidth={2.2} color={colors.brand} /> : null}
            </Pressable>
          </View>
        </View>
      ) : null}

      {composing ? (
        <View style={styles.field}>
          <View style={styles.modes}>
            {MODES.map(({ k, Icon }) => {
              const on = mode === k
              return (
                <Pressable
                  key={k}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  style={[styles.mode, on && styles.modeOn]}
                  onPress={() => setMode(k)}
                >
                  <Icon size={20} strokeWidth={1.6} color={on ? colors.onBrand : colors.text} />
                  <Text style={[styles.modeLabel, on && styles.modeLabelOn]}>{t(`step2.mode.${k}`)}</Text>
                </Pressable>
              )
            })}
          </View>
          {mode ? <Text style={[styles.help, align]}>{t(`step2.modeHelp.${mode}`)}</Text> : null}
        </View>
      ) : null}

      {composing && mode ? (
        <>
          <View style={styles.field}>
            <Text style={[styles.label, align]}>{t('step2.nameLabel')}</Text>
            <TextInput
              style={[styles.input, align]}
              value={name}
              onChangeText={setName}
              placeholder={suggestedName}
              placeholderTextColor={colors.textFaint}
              returnKeyType="done"
            />
            <Text style={[styles.help, align]}>{t('step2.nameHint')}</Text>
          </View>

          <View style={styles.field}>
            <Text style={[styles.label, align]}>{t('step2.colorLabel')}</Text>
            <View style={styles.swatches}>
              {SWATCHES.map((c) => (
                <Pressable
                  key={c}
                  accessibilityRole="button"
                  accessibilityState={{ selected: color === c }}
                  style={[styles.swatch, { backgroundColor: c }, color === c && styles.swatchOn]}
                  onPress={() => setColor(c)}
                />
              ))}
            </View>
          </View>

          {/* What their answer builds — the same card shape the project
              screen shows, so the concept is already familiar when they
              get there. */}
          <View style={styles.card}>
            <View style={[styles.cardHead, rtl && styles.rowRtl]}>
              <View style={[styles.dot, { backgroundColor: color }]} />
              <Text style={[styles.cardName, align]} numberOfLines={1}>{trimmed || suggestedName}</Text>
            </View>

            {wantsGroups(mode) ? (
              <View style={styles.section}>
                <Text style={[styles.sectionTitle, align]}>{t('step2.groupsTitle')}</Text>
                <View style={[styles.group, rtl && styles.rowRtl]}>
                  <View style={[styles.dot, { backgroundColor: color }]} />
                  <View style={styles.groupBody}>
                    <Text style={[styles.groupName, align]}>{t('step2.firstGroupName')}</Text>
                    <Text style={[styles.groupMeta, align]}>{t('step2.firstGroupMeta')}</Text>
                  </View>
                </View>
              </View>
            ) : null}

            {wantsSolo(mode) ? (
              <View style={styles.section}>
                <Text style={[styles.sectionTitle, align]}>{t('step2.clientsTitle')}</Text>
                <View style={[styles.teaser, rtl && styles.rowRtl]}>
                  <Users size={16} strokeWidth={1.6} color={colors.textSub} />
                  <Text style={[styles.teaserText, align]}>{t('step2.clientsTeaser')}</Text>
                </View>
              </View>
            ) : null}
          </View>
        </>
      ) : null}

      {err ? <Text style={[styles.err, align]}>{err}</Text> : null}
    </View>
  )
}

const styles = themed((c, t) => ({
  root: { gap: 14 },
  rowRtl: { flexDirection: 'row-reverse' },
  intro: { ...t.heading, color: c.text },
  introSub: { ...t.caption, color: c.textSub },
  field: { gap: 7 },
  label: { ...t.caption, color: c.textSub },
  help: { ...t.micro, color: c.textFaint },
  input: {
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 12,
    paddingVertical: 11,
    paddingHorizontal: 14,
    fontSize: 15,
    color: c.text,
    backgroundColor: c.card,
  },
  existingList: { gap: 8 },
  existing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.card,
  },
  existingOn: { borderColor: c.brand, backgroundColor: c.brandSoft },
  existingName: { ...t.body, color: c.text, flex: 1 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  modes: { flexDirection: 'row', gap: 8 },
  mode: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.cardFlat,
  },
  modeOn: { backgroundColor: c.brand, borderColor: c.brand },
  modeLabel: { fontSize: 13, color: c.text },
  modeLabelOn: { color: c.onBrand, fontWeight: '600' },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  swatch: { width: 30, height: 30, borderRadius: 15, borderWidth: 2, borderColor: 'transparent' },
  swatchOn: { borderColor: c.text },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.card,
    padding: 14,
    gap: 12,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardName: { ...t.heading, color: c.text, flex: 1 },
  section: { gap: 6 },
  sectionTitle: { ...t.micro, color: c.textFaint },
  group: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
    borderRadius: 12,
    backgroundColor: c.cardFlat,
  },
  groupBody: { flex: 1, gap: 2 },
  groupName: { ...t.body, color: c.text },
  groupMeta: { ...t.micro, color: c.textFaint },
  teaser: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  teaserText: { ...t.caption, color: c.textSub, flex: 1 },
  err: { ...t.caption, color: c.danger },
}))
