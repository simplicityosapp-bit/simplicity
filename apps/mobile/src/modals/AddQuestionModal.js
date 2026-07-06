import { useState } from 'react'
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native'
import { QUESTION_TEMPLATES, qtext } from '@simplicity/core'
import Sheet from '../components/Sheet'
import i18n from '../lib/i18n'
import { colors } from '../theme/theme'

// Add a daily question — from a ready template or custom (text + scale + icon).
// Mirrors web AddQuestionModal. Schedule defaults to every-day (no picker on
// mobile v1); onSave gets a user_questions-ready row.
const ICONS = ['🫧', '⚡', '🌙', '🎯', '🏃', '📚', '🧘', '✍️', '🌱', '💡']
const SCALES = [
  { k: '1-10', l: 'scaleRange' },
  { k: 'yes_no', l: 'scaleYesNo' },
]

export default function AddQuestionModal({ open, onClose, onSave, nextOrder = 0, usedTemplateKeys = [] }) {
  const [mode, setMode] = useState('template')
  const [tmplKey, setTmplKey] = useState('')
  const [form, setForm] = useState({ text: '', scale_type: '1-10', icon: ICONS[0] })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  const close = () => { setMode('template'); setTmplKey(''); setForm({ text: '', scale_type: '1-10', icon: ICONS[0] }); setErr(''); setBusy(false); onClose() }

  const availableTemplates = QUESTION_TEMPLATES.filter((tmpl) => !usedTemplateKeys.includes(tmpl.key))
  const onlyCustom = availableTemplates.length === 0
  const effMode = onlyCustom ? 'custom' : mode

  const submit = async () => {
    let row
    if (effMode === 'template') {
      const tmpl = QUESTION_TEMPLATES.find((x) => x.key === tmplKey)
      if (!tmpl) { setErr(i18n.t('modalsTask:question.questionRequired')); return }
      row = { template_key: tmpl.key, custom_text: null, scale_type: tmpl.scale_type, icon: tmpl.icon, active: true, order: nextOrder, schedule_pattern: {} }
    } else {
      if (!form.text.trim()) { setErr(i18n.t('modalsTask:question.textRequired')); return }
      row = { template_key: null, custom_text: form.text.trim(), scale_type: form.scale_type, icon: form.icon, active: true, order: nextOrder, schedule_pattern: {} }
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
    <Sheet open={open} onClose={close} title={i18n.t('modalsTask:question.title')}>
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

const styles = StyleSheet.create({
  field: { gap: 6 },
  label: { fontSize: 13, color: colors.textSub },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingVertical: 11, paddingHorizontal: 14, fontSize: 15, color: colors.text, backgroundColor: colors.card },
  inputErr: { borderColor: colors.danger },
  pills: { flexDirection: 'row', gap: 8 },
  pill: { flex: 1, paddingVertical: 10, borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.cardFlat, alignItems: 'center' },
  pillOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  pillText: { fontSize: 14, color: colors.text },
  pillTextOn: { color: colors.onBrand, fontWeight: '600' },
  tmplList: { gap: 8 },
  tmpl: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  tmplOn: { borderColor: colors.brand, backgroundColor: colors.brandSoft },
  tmplIc: { fontSize: 20 },
  tmplText: { flex: 1, fontSize: 15, color: colors.text },
  tmplTextOn: { fontWeight: '600' },
  iconRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  iconPill: { width: 42, height: 42, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.cardFlat, alignItems: 'center', justifyContent: 'center' },
  iconPillOn: { borderColor: colors.brand, backgroundColor: colors.brandSoft },
  iconText: { fontSize: 20 },
  error: { color: colors.danger, fontSize: 13 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4 },
  cancel: { flex: 1, paddingVertical: 13, borderRadius: 12, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  cancelText: { fontSize: 15, color: colors.textSub },
  save: { flex: 1, paddingVertical: 13, borderRadius: 12, backgroundColor: colors.brand, alignItems: 'center' },
  saveOff: { opacity: 0.5 },
  saveText: { fontSize: 15, fontWeight: '600', color: colors.onBrand },
})
