import { useState } from 'react'
import { View } from 'react-native'
import { Text, TextInput } from '../../../components/Text'
import { Pressable } from '../../../components/Pressable'
import { Star, Plus, Check } from 'lucide-react-native'
import { formatGoalValue, timeFrameLabel } from '@simplicity/core'
import { colors, type } from '../../../theme/theme'
import { themed } from '../../../theme/themed'
import i18n from '../../../lib/i18n'
import { useGoalsData } from '../../../hooks/useGoalsData'
import { ALL_METRICS, OTHER_METRIC_KEY, OTHER_METRIC, metricName } from '../../../lib/goalPresets'
import { useStepCTA } from '../useStepCTA'

/* ════════════════════════════════════════════════════════════════
   Step 4 — the first goal.
   ════════════════════════════════════════════════════════════════
   Native port of apps/web Step4Goals.

   This was the heaviest screen in the app: a project select, six metric
   tiles, three time frames, a date field, a target, five importance
   stars, two tracking methods, a question to phrase, two answer scales,
   ten icons, a day-of-week schedule picker, and a warning for when the
   target exceeded the days chosen. Thirty-odd controls, three levels
   deep, for a user who had never seen a goal.

   Pick what matters and put a number on it. Monthly, importance 3,
   updated by hand: the defaults every one of those controls already
   carried. The goals screen keeps the full range for when a goal is
   worth that much setup.

   An account that already has goals is offered them first, the way step
   2 offers existing projects. Every restart used to add another
   "הכנסות" goal beside the one from the last pass, because creating was
   the only thing this step knew how to do.
   ════════════════════════════════════════════════════════════════ */

const DEFAULT_TIME_FRAME = 'monthly'
const DEFAULT_IMPORTANCE = 3

export default function Step4Goals({ ob, setCTA }) {
  const t = (k, vars) => i18n.t('onboardingSteps:' + k, vars)
  const { goals, categories, addGoal, updateGoal } = useGoalsData()

  /* Number grouping follows the active UI language, so a Spanish user
     does not see Hebrew-locale formatting. */
  const lang = i18n.language || 'he'
  const numLocale = lang === 'he' ? 'he-IL' : lang

  /* Metrics come from the canonical catalogue, so a new preset appears
     here without touching this file. The manual bucket is the last one. */
  const TYPES = ALL_METRICS.map((m) => ({
    key: m.key,
    label: metricName(m.key),
    icon: m.icon,
    color: m.color,
    hint: m.key === OTHER_METRIC_KEY
      ? t('step4.personalHint')
      : i18n.t(`presets:category.${m.key}.hint`, { defaultValue: '' }),
  }))

  const initial = ob.state.answers?.goals || {}

  /* A goal this flow created on an earlier pass is still ours: updated in
     place below, never offered back as "existing". Everything else is. */
  const flowGoalId = initial.created_ids?.[0] || null
  const existing = (goals || []).filter((g) => g.id !== flowGoalId)
  const offerExisting = existing.length > 0 && !flowGoalId

  /* 'new' opens the composer; a goal id continues with that goal. Derived,
     not stored: goals load after mount, so the chooser has to be able to
     appear once they arrive. */
  const [pick, setPick] = useState(initial.goal_id || null)
  const choice = offerExisting ? pick : 'new'
  const composing = choice === 'new'
  const chosen = composing ? null : (existing.find((g) => g.id === choice) || null)

  /* Named the way the goals screen names them: the label if it has one,
     else the category. The line under it is the same target · time frame
     the goal card prints, through the same core helpers. */
  const catOf = (g) => (categories || []).find((c) => c.id === g.category_id) || null
  const goalTitle = (g) => g.label || catOf(g)?.name || t('step4.personalLabel')
  const goalMeta = (g) => [formatGoalValue(g.target_value, catOf(g)), timeFrameLabel(g)].filter(Boolean).join(' · ')

  const [metric, setMetric] = useState(initial.first_type || null)
  const [target, setTarget] = useState(initial.first_target != null ? String(initial.first_target) : '')
  const [label, setLabel] = useState(initial.personal_label || '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const rtl = (i18n.language || '').startsWith('he')
  const align = { textAlign: rtl ? 'right' : 'left' }

  const isPersonal = metric === OTHER_METRIC_KEY
  const targetNum = Number(target)

  const canAdvance = composing
    ? (!!metric && targetNum > 0 && (!isPersonal || label.trim().length > 0))
    : !!chosen
  const hint = !composing
    ? (chosen ? null : t('step4.hintPickGoal'))
    : !metric ? t('step4.hintPickType')
      : targetNum <= 0 ? t('step4.hintPositive')
        : (isPersonal && !label.trim()) ? t('step4.hintNameGoal')
          : null

  const onNext = async () => {
    setBusy(true); setErr('')
    try {
      if (!composing) {
        /* Nothing is written to the chosen goal; created_ids stays empty
           so the closing summary does not claim it. */
        await ob.setAnswers('goals', { goal_id: chosen.id, created_ids: [] })
        await ob.advance()
        return
      }

      /* addGoal resolves the metric to a category itself — find-or-create
         against the same catalogue the goals screen uses, so onboarding
         never plants a second "income" category beside the real one. */
      const payload = {
        metric_key: metric,
        parent_goal_id: null,
        project_id: null,          /* all projects — the useful default with one */
        group_id: null,
        label: isPersonal ? label.trim() : null,
        time_frame: DEFAULT_TIME_FRAME,
        target_value: targetNum,
        target_date: null,
        importance: DEFAULT_IMPORTANCE,
        tracking_method: 'manual',
        tracked_by_question_id: null,
        measurement_type: isPersonal ? 'manual' : 'auto',
      }

      /* A goal this step created on an earlier pass is UPDATED, never
         skipped (which dropped edits) or recreated (which orphaned the
         first row). Gone from under us → create a fresh one. updateGoal
         takes a patch, so metric_key is dropped: the category it resolves
         to is already on the row. */
      const prevId = initial.created_ids?.[0] || null
      let goal = null
      if (prevId) {
        const { metric_key, ...patch } = payload // eslint-disable-line no-unused-vars
        goal = await updateGoal(prevId, patch).catch(() => null)
      }
      if (!goal) goal = await addGoal(payload)

      await ob.setAnswers('goals', {
        first_type: metric,
        first_target: targetNum,
        personal_label: isPersonal ? label.trim() : null,
        goal_id: goal.id,
        created_ids: [goal.id],
      })
      await ob.advance()
    } catch (e) {
      setErr(t('step4.errSaveFail', { error: e?.message || t('step4.tryAgain') }))
    } finally {
      setBusy(false)
    }
  }

  useStepCTA(setCTA, { onNext, canAdvance, busy, hint })

  const chosenType = TYPES.find((ty) => ty.key === metric)
  const previewName = isPersonal ? (label.trim() || t('step4.personalLabel')) : (chosenType?.label || '')
  const catColor = isPersonal ? OTHER_METRIC.color : (chosenType?.color || colors.textFaint)

  return (
    <View style={styles.root}>
      <Text style={[styles.intro, align]}>{t('step4.intro')}</Text>
      <Text style={[styles.introSub, align]}>{t('step4.introSub')}</Text>

      {offerExisting ? (
        <View style={styles.field}>
          <Text style={[styles.label, align]}>{t('step4.existingTitle')}</Text>
          <Text style={[styles.help, align]}>{t('step4.existingSub')}</Text>
          <View style={styles.list}>
            {existing.map((g) => {
              const on = choice === g.id
              return (
                <Pressable
                  key={g.id}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: on }}
                  style={[styles.existing, rtl && styles.rowRtl, on && styles.existingOn]}
                  onPress={() => setPick(g.id)}
                >
                  <View style={[styles.dot, { backgroundColor: catOf(g)?.color || colors.textFaint }]} />
                  <View style={styles.existingBody}>
                    <Text style={[styles.existingName, align]} numberOfLines={1}>{goalTitle(g)}</Text>
                    <Text style={[styles.existingMeta, align]} numberOfLines={1}>{goalMeta(g)}</Text>
                  </View>
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
              <Text style={[styles.existingName, align]}>{t('step4.pickNew')}</Text>
              {composing ? <Check size={15} strokeWidth={2.2} color={colors.brand} /> : null}
            </Pressable>
          </View>
        </View>
      ) : null}

      {composing ? (
        <View style={styles.field}>
          <View style={styles.grid}>
            {TYPES.map((ty) => {
              const on = metric === ty.key
              return (
                <Pressable
                  key={ty.key}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  style={[styles.tile, on && styles.tileOn]}
                  onPress={() => setMetric(ty.key)}
                >
                  <Text style={styles.tileIcon}>{ty.icon}</Text>
                  <Text style={[styles.tileLabel, on && styles.tileLabelOn]} numberOfLines={2}>{ty.label}</Text>
                </Pressable>
              )
            })}
          </View>
          {/* The chosen metric's line, on the page rather than under a
              hover — there is no hover to put it under. */}
          {chosenType?.hint ? <Text style={[styles.help, align]}>{chosenType.hint}</Text> : null}
        </View>
      ) : null}

      {composing && metric ? (
        <>
          {isPersonal ? (
            <View style={styles.field}>
              <Text style={[styles.label, align]}>{t('step4.goalNameLabel')}</Text>
              <TextInput
                style={[styles.input, align]}
                value={label}
                onChangeText={setLabel}
                placeholder={t('step4.goalNamePlaceholder')}
                placeholderTextColor={colors.textFaint}
                returnKeyType="done"
              />
            </View>
          ) : null}

          <View style={styles.field}>
            <Text style={[styles.label, align]}>{t('step4.targetLabel')}</Text>
            <TextInput
              style={[styles.input, align]}
              value={target}
              onChangeText={setTarget}
              placeholder={metric === 'income' ? t('step4.incomePlaceholder') : t('step4.genericPlaceholder')}
              placeholderTextColor={colors.textFaint}
              keyboardType="numeric"
              returnKeyType="done"
            />
            <Text style={[styles.help, align]}>{t('step4.targetHelp')}</Text>
          </View>

          {/* Live preview — the same shape as the in-app goal card, so the
              board is already familiar. Actual is 0; nothing logged yet. */}
          {targetNum > 0 ? (
            <View style={styles.gcard}>
              <View style={[styles.gcardHead, rtl && styles.rowRtl]}>
                <View style={styles.gcardTitleBlock}>
                  <Text style={[styles.gcardTitle, align]} numberOfLines={1}>{previewName}</Text>
                  <View style={[styles.gcardCat, rtl && styles.rowRtl]}>
                    <View style={[styles.dot, { backgroundColor: catColor }]} />
                    <Text style={styles.gcardCatText} numberOfLines={1}>
                      {chosenType?.label} · {t('step4.monthly')}
                    </Text>
                  </View>
                </View>
                <Text style={styles.gcardPct}>0%</Text>
              </View>

              <View style={styles.gcardTrack}>
                <View style={styles.gcardFill} />
              </View>

              <View style={[styles.gcardMeta, rtl && styles.rowRtl]}>
                <Text style={styles.gcardTarget}>0 / {targetNum.toLocaleString(numLocale)}</Text>
                <View style={styles.stars}>
                  {[1, 2, 3, 4, 5].map((i) => (
                    <Star
                      key={i}
                      size={12}
                      strokeWidth={1.5}
                      color={i <= DEFAULT_IMPORTANCE ? colors.amberWarn : colors.textFaint}
                      fill={i <= DEFAULT_IMPORTANCE ? colors.amberWarn : 'none'}
                    />
                  ))}
                </View>
              </View>
            </View>
          ) : null}
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
  list: { gap: 8 },
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
  existingBody: { flex: 1, gap: 2 },
  existingName: { ...t.body, color: c.text },
  existingMeta: { ...t.micro, color: c.textFaint },
  dot: { width: 10, height: 10, borderRadius: 5 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tile: {
    width: '31.5%',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 12,
    paddingHorizontal: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.cardFlat,
  },
  tileOn: { borderColor: c.brand, backgroundColor: c.brandSoft },
  tileIcon: { fontSize: 20 },
  tileLabel: { fontSize: 12, color: c.text, textAlign: 'center' },
  tileLabelOn: { color: c.brand, fontWeight: '600' },
  gcard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.card,
    padding: 14,
    gap: 10,
  },
  gcardHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  gcardTitleBlock: { flex: 1, gap: 3 },
  gcardTitle: { ...t.heading, color: c.text },
  gcardCat: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  gcardCatText: { ...t.micro, color: c.textFaint, flex: 1 },
  gcardPct: { ...t.body, color: c.textSub },
  gcardTrack: { height: 6, borderRadius: 3, backgroundColor: c.fill, overflow: 'hidden' },
  gcardFill: { width: '0%', height: '100%', backgroundColor: c.brand },
  gcardMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  gcardTarget: { ...t.micro, color: c.textSub },
  stars: { flexDirection: 'row', gap: 2 },
  err: { ...t.caption, color: c.danger },
}))
