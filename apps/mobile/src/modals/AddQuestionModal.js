import { useState, useEffect } from 'react'
import { View } from 'react-native'
import { Text, TextInput } from '../components/Text'
import { Pressable } from '../components/Pressable'
import { QUESTION_TEMPLATES, qtext, questionSchedulePattern, scheduleFromPattern } from '@simplicity/core'
import Sheet from '../components/Sheet'
import ScheduleDayPicker from '../components/ScheduleDayPicker'
import i18n from '../lib/i18n'
import { colors } from '../theme/theme'
import { themed } from '../theme/themed'

// Add or edit a daily question — from a ready template or custom (text + scale
// + icon), and WHEN it is asked: every day, chosen weekdays or every X days (web
// QuestionScheduleEditor). The phone could never set a schedule: every question
// it made was daily, and one made elsewhere couldn't be changed here. onSave
// gets a user_questions-ready row; "every day" is written as {} because the
// column is NOT NULL (core questionSchedulePattern).
const ICONS = ['🫧', '⚡', '🌙', '🎯', '🏃', '📚', '🧘', '✍️', '🌱', '💡']
const SCALES = [
  { k: '1-10', l: 'scaleRange' },
  { k: 'yes_no', l: 'scaleYesNo' },
]

export default function AddQuestionModal({ open, onClose, onSave, nextOrder = 0, usedTemplateKeys = [], editQuestion = null }) {
  const isEdit = !!editQuestion
  const [mode, setMode] = useState('template')
  const [tmplKey, setTmplKey] = useState('')
  const [form, setForm] = useState({ text: '', scale_type: '1-10', icon: ICONS[0] })
  const [sched, setSched] = useState(() => scheduleFromPattern(null))
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  const close = () => { setMode('template'); setTmplKey(''); setForm({ text: '', scale_type: '1-10', icon: ICONS[0] }); setErr(''); setBusy(false); onClose() }

  // Editing prefills the custom fields (a template question's text becomes editable
  // custom text on save); adding resets to the template picker.
  useEffect(() => {
    if (!open) return
    if (editQuestion) {
      setMode('custom')
      setForm({ text: editQuestion.custom_text || qtext(editQuestion.template_key) || '', scale_type: editQuestion.scale_type || '1-10', icon: editQuestion.icon || ICONS[0] })
      setSched(scheduleFromPattern(editQuestion.schedule_pattern))
    } else {
      setMode('template'); setTmplKey(''); setForm({ text: '', scale_type: '1-10', icon: ICONS[0] })
      setSched(scheduleFromPattern(null))
    }
    setErr('')
  }, [open, editQuestion])

  const availableTemplates = QUESTION_TEMPLATES.filter((tmpl) => !usedTemplateKeys.includes(tmpl.key))
  const onlyCustom = isEdit || availableTemplates.length === 0
  const effMode = onlyCustom ? 'custom' : mode

  const submit = async () => {
    if (sched.mode === 'days_of_week' && !sched.days.length) { setErr(i18n.t('modalsData:addGoal.needAtLeastOneDay')); return }
    const schedule_pattern = questionSchedulePattern(sched.mode, sched.days, sched.x)
    let row
    if (isEdit) {
      /* Text and icon only (web EditQuestionModal). The scale is not editable:
         answers are stored against it, so flipping 1-10 ↔ yes/no corrupts the
         history, the averages and any goal summing them. And a template
         question saved with its wording unchanged keeps tracking the template
         — its text is localised, and nulling template_key froze it in one
         language. */
      const v = form.text.trim()
      if (!v) { setErr(i18n.t('modalsTask:question.textRequired')); return }
      const sameAsTemplate = editQuestion.template_key && !editQuestion.custom_text && v === (qtext(editQuestion.template_key) || '')
      row = sameAsTemplate ? { icon: form.icon, schedule_pattern } : { template_key: null, custom_text: v, icon: form.icon, schedule_pattern }
    } else if (effMode === 'template') {
      const tmpl = QUESTION_TEMPLATES.find((x) => x.key === tmplKey)
      if (!tmpl) { setErr(i18n.t('modalsTask:question.questionRequired')); return }
      row = { template_key: tmpl.key, custom_text: null, scale_type: tmpl.scale_type, icon: tmpl.icon, active: true, order: nextOrder, schedule_pattern }
    } else {
      if (!form.text.trim()) { setErr(i18n.t('modalsTask:question.textRequired')); return }
      row = { template_key: null, custom_text: form.text.trim(), scale_type: form.scale_type, icon: form.icon, active: true, order: nextOrder, schedule_pattern }
    }
    setBusy(true)
    setErr('')
    try {
      await onSave(row)
      close()
    } catch (e) {
      setBusy(false)
      setErr(i18n.t('modalsTask:common.saveFailed', { error: e.message || i18n.t('modalsTask:common.tryAgain') }))
    }
  }

  return (
    <Sheet open={open} onClose={close} title={isEdit ? i18n.t('modalsTask:question.titleEdit', { defaultValue: 'עריכת שאלה' }) : i18n.t('modalsTask:question.title')}>
      {!onlyCustom ? (
        <View style={styles.pills}>
          <Pressable style={[styles.pill, effMode === 'template' && styles.pillOn]} onPress={() => { setMode('template'); setErr('') }}>
            <Text style={[styles.pillText, effMode === 'template' && styles.pillTextOn]}>{i18n.t('modalsTask:question.modeTemplate')}</Text>
          </Pressable>
          <Pressable style={[styles.pill, effMode === 'custom' && styles.pillOn]} onPress={() => { setMode('custom'); setErr('') }}>
            <Text style={[styles.pillText, effMode === 'custom' && styles.pillTextOn]}>{i18n.t('modalsTask:question.modeCustom')}</Text>
          </Pressable>
        </View>
      ) : null}

      {effMode === 'template' ? (
        <View style={styles.field}>
          <Text style={styles.label}>{i18n.t('modalsTask:question.pickQuestion')}</Text>
          <View style={styles.tmplList}>
            {availableTemplates.map((tmpl) => {
              const on = tmplKey === tmpl.key
              return (
                <Pressable key={tmpl.key} style={[styles.tmpl, on && styles.tmplOn]} onPress={() => { setTmplKey(tmpl.key); if (err) setErr('') }}>
                  <Text style={styles.tmplIc}>{tmpl.icon}</Text>
                  <Text style={[styles.tmplText, on && styles.tmplTextOn]} numberOfLines={1}>{qtext(tmpl.key)}</Text>
                </Pressable>
              )
            })}
          </View>
        </View>
      ) : (
        <>
          <View style={styles.field}>
            <Text style={styles.label}>{i18n.t('modalsTask:question.theQuestion')}</Text>
            <TextInput
              style={[styles.input, err && !form.text.trim() && styles.inputErr]}
              value={form.text}
              onChangeText={(v) => { set('text', v); if (err) setErr('') }}
              placeholder={i18n.t('modalsTask:question.textPlaceholder')}
              placeholderTextColor={colors.textFaint}
            />
          </View>
          {/* The scale can't change once answers are stored against it — say why the picker isn't here. */}
          {isEdit ? (
            <Text style={styles.hint}>{i18n.t(editQuestion.scale_type === 'yes_no' ? 'modalsTask:question.scaleLockedYesNo' : 'modalsTask:question.scaleLockedRange')}</Text>
          ) : (
            <View style={styles.field}>
              <Text style={styles.label}>{i18n.t('modalsTask:question.answerType')}</Text>
              <View style={styles.pills}>
                {SCALES.map((s) => {
                  const on = form.scale_type === s.k
                  return (
                    <Pressable key={s.k} style={[styles.pill, on && styles.pillOn]} onPress={() => set('scale_type', s.k)}>
                      <Text style={[styles.pillText, on && styles.pillTextOn]}>{i18n.t(`modalsTask:question.${s.l}`)}</Text>
                    </Pressable>
                  )
                })}
              </View>
            </View>
          )}
          <View style={styles.field}>
            <Text style={styles.label}>{i18n.t('modalsTask:question.icon')}</Text>
            <View style={styles.iconRow}>
              {ICONS.map((ic) => {
                const on = form.icon === ic
                return (
                  <Pressable key={ic} style={[styles.iconPill, on && styles.iconPillOn]} onPress={() => set('icon', ic)}>
                    <Text style={styles.iconText}>{ic}</Text>
                  </Pressable>
                )
              })}
            </View>
          </View>
        </>
      )}

      <View style={styles.field}>
        <Text style={styles.label}>{i18n.t('modalsData:addGoal.whenAsked')}</Text>
        <ScheduleDayPicker mode={sched.mode} days={sched.days} x={sched.x} onChange={(next) => { setSched(next); if (err) setErr('') }} />
      </View>

      {err ? <Text style={styles.error}>{err}</Text> : null}

      <View style={styles.actions}>
        <Pressable style={styles.cancel} onPress={close}><Text style={styles.cancelText}>{i18n.t('modalsTask:common.cancel')}</Text></Pressable>
        <Pressable style={[styles.save, busy && styles.saveOff]} onPress={submit} disabled={busy}>
          <Text style={styles.saveText}>{busy ? i18n.t('modalsTask:common.saving') : i18n.t('modalsTask:common.save')}</Text>
        </Pressable>
      </View>
    </Sheet>
  )
}

const styles = themed((c, t) => ({
  field: { gap: 6 },
  label: { fontSize: 13, color: c.textSub },
  input: { borderWidth: 1, borderColor: c.border, borderRadius: 12, paddingVertical: 11, paddingHorizontal: 14, fontSize: 15, color: c.text, backgroundColor: c.card },
  inputErr: { borderColor: c.danger },
  pills: { flexDirection: 'row', gap: 8 },
  pill: { flex: 1, paddingVertical: 10, borderRadius: 999, borderWidth: 1, borderColor: c.border, backgroundColor: c.cardFlat, alignItems: 'center' },
  pillOn: { backgroundColor: c.brand, borderColor: c.brand },
  pillText: { fontSize: 14, color: c.text },
  pillTextOn: { color: c.onBrand, fontWeight: '600' },
  tmplList: { gap: 8 },
  tmpl: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, borderColor: c.border, backgroundColor: c.card },
  tmplOn: { borderColor: c.brand, backgroundColor: c.brandSoft },
  tmplIc: { fontSize: 20 },
  tmplText: { flex: 1, fontSize: 15, color: c.text },
  tmplTextOn: { fontWeight: '600' },
  iconRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  iconPill: { width: 42, height: 42, borderRadius: 12, borderWidth: 1, borderColor: c.border, backgroundColor: c.cardFlat, alignItems: 'center', justifyContent: 'center' },
  iconPillOn: { borderColor: c.brand, backgroundColor: c.brandSoft },
  iconText: { fontSize: 20 },
  error: { color: c.danger, fontSize: 13 },
  hint: { fontSize: 12, color: c.textSub, lineHeight: 17 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4 },
  cancel: { flex: 1, paddingVertical: 13, borderRadius: 12, borderWidth: 1, borderColor: c.border, alignItems: 'center' },
  cancelText: { fontSize: 15, color: c.textSub },
  save: { flex: 1, paddingVertical: 13, borderRadius: 12, backgroundColor: c.btnBg, alignItems: 'center' },
  saveOff: { opacity: 0.5 },
  saveText: { fontSize: 15, fontWeight: '600', color: c.onBtn },
}))
