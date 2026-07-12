import { useEffect, useState } from 'react'
import { useUserQuestions } from '../../../hooks/useUserQuestions'
import { QUESTION_TEMPLATES, qtext } from '@simplicity/core'
import { useT } from '../../../i18n/useT'
import { Box, Txt, Btn, Input } from '../../../components/ui'

/* Starter presets — derived from the SHARED QUESTION_TEMPLATES so onboarding
   and the in-app AddQuestionModal always offer the same set (single source).
   All presets use the 1-10 scale. The optional custom ("אחר") question
   matches AddQuestionModal's custom mode exactly (text + scale + icon). */
const PRESETS = QUESTION_TEMPLATES.map((tpl) => ({ key: tpl.key, icon: tpl.icon }))

/* Mirror AddQuestionModal — same scales + same icon palette so the
   user gets the same affordances they'll see later under Settings. */
const SCALES = [
  { k: '1-10',  labelKey: 'step5.scale110' },
  { k: 'yes_no', labelKey: 'step5.scaleYesNo' },
]
const ICONS = ['🫧', '⚡', '🌙', '🎯', '🏃', '📚', '🧘', '✍️', '🌱', '💡']

/* Step 5 — daily questions. Multi-select from 6 preset chips + an
   optional fully-configurable custom question ("אחר"). Each selected
   preset becomes a real user_questions row (active=true, scale 1-10).
   The custom slot saves with the user-chosen scale + icon. */
export default function Step5DailyQuestions({ ob, setCTA }) {
  const { t } = useT('onboardingSteps')
  const gender = ob.state.answers?.profile?.gender
  const { addQuestion } = useUserQuestions()
  const initial = ob.state.answers?.daily_questions || {}
  const [picked, setPicked] = useState(initial.preset_keys || [])
  const [custom, setCustom] = useState(initial.custom_text || '')
  const [customScale, setCustomScale] = useState(initial.custom_scale || '1-10')
  const [customIcon, setCustomIcon] = useState(initial.custom_icon || ICONS[0])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const toggle = (k) => setPicked((p) => (p.includes(k) ? p.filter((x) => x !== k) : [...p, k]))

  const canAdvance = picked.length > 0 || custom.trim().length > 0
  /* No CTA hint here — selecting is self-evident; the empty footer reads cleaner. */
  const hint = null
  useEffect(() => { setCTA({ onNext, canAdvance, busy, hint }) }, [picked, custom, customScale, customIcon, busy, canAdvance, hint]) // eslint-disable-line react-hooks/exhaustive-deps, react-hooks/immutability

  const onNext = async () => {
    setBusy(true); setErr('')
    try {
      /* Idempotent: skip recreate if selection identical to prior pass. */
      const prevKeys = initial.preset_keys || []
      const sameKeys = prevKeys.length === picked.length && prevKeys.every((k) => picked.includes(k))
      const sameCustom = (initial.custom_text || '') === custom.trim()
        && (initial.custom_scale || '1-10') === customScale
        && (initial.custom_icon || ICONS[0]) === customIcon
      if (sameKeys && sameCustom && (initial.question_ids?.length || 0) > 0) {
        await ob.advance()
        return
      }
      const ids = []
      for (const k of picked) {
        // eslint-disable-next-line no-await-in-loop
        const row = await addQuestion({
          template_key: k,
          custom_text: null,
          scale_type: '1-10',
          icon: PRESETS.find((p) => p.key === k)?.icon || null,
          active: true,
          schedule_pattern: {},
        })
        ids.push(row.id)
      }
      if (custom.trim().length > 0) {
        // eslint-disable-next-line no-await-in-loop
        const row = await addQuestion({
          template_key: null,
          custom_text: custom.trim(),
          scale_type: customScale,
          icon: customIcon,
          active: true,
          schedule_pattern: {},
        })
        ids.push(row.id)
      }
      await ob.setAnswers('daily_questions', {
        preset_keys: picked,
        custom_text: custom.trim(),
        custom_scale: customScale,
        custom_icon: customIcon,
        question_ids: ids,
      })
      await ob.advance()
    } catch (e) {
      setErr(t('step5.errSaveFail', { error: e.message || t('step5.tryAgain') }))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Txt as="p" className="ob-intro">{t('step5.intro', { verb: t('step5.introVerb') })}</Txt>
      <Txt as="p" className="ob-intro-sub">{t('step5.introSub', { verb: t('step5.introSubVerb') })}</Txt>

      <Box className="ob-field">
        <Box className="ob-pills">
          {PRESETS.map((p) => {
            const text = qtext(p.key, gender)
            return (
            <Btn
              key={p.key}
              type="button"
              className={`ob-pill${picked.includes(p.key) ? ' on' : ''}`}
              onClick={() => toggle(p.key)}
              title={text}
            >
              <Txt style={{ marginInlineEnd: 4 }}>{p.icon}</Txt>
              {text}
            </Btn>
          )})}
        </Box>
      </Box>

      {/* "אחר" — full custom-question creator, identical shape to
          AddQuestionModal's custom mode (text + scale + icon). */}
      <Box className="ob-field">
        <Box as="label" className="ob-label" htmlFor="ob-q-custom">{t('step5.customLabel')}</Box>
        <Input
          id="ob-q-custom"
          className="ob-input"
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          placeholder={t('step5.customPlaceholder', { adj: t('step5.customAdj') })}
        />
      </Box>

      {custom.trim().length > 0 && (
        <>
          <Box className="ob-field">
            <Txt as="p" className="ob-label">{t('step5.answerTypeLabel')}</Txt>
            <Box className="ob-pills">
              {SCALES.map((s) => (
                <Btn
                  key={s.k}
                  type="button"
                  className={`ob-pill${customScale === s.k ? ' on' : ''}`}
                  onClick={() => setCustomScale(s.k)}
                >
                  {t(s.labelKey)}
                </Btn>
              ))}
            </Box>
          </Box>

          <Box className="ob-field">
            <Txt as="p" className="ob-label">{t('step5.iconLabel')}</Txt>
            <Box className="ob-pills">
              {ICONS.map((ic) => (
                <Btn
                  key={ic}
                  type="button"
                  className={`ob-pill${customIcon === ic ? ' on' : ''}`}
                  onClick={() => setCustomIcon(ic)}
                  aria-label={t('step5.iconAria', { icon: ic })}
                >
                  {ic}
                </Btn>
              ))}
            </Box>
          </Box>
        </>
      )}

      {err && <Txt as="p" className="ob-empty-hint" style={{ color: 'var(--clay)' }}>{err}</Txt>}

    </>
  )
}
