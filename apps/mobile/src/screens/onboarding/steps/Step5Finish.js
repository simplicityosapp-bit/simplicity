import { View } from 'react-native'
import { Text } from '../../../components/Text'
import { Sparkles, Folder, Users, Target } from 'lucide-react-native'
import { colors, type } from '../../../theme/theme'
import { themed } from '../../../theme/themed'
import i18n from '../../../lib/i18n'
import { useStepCTA } from '../useStepCTA'

/* Step 5 — finish, and the closing confirmation.

   The flow creates each entity LIVE as the user advances: the project on
   step 2, clients on step 3, the goal on step 4. So there is nothing left
   to create here. This step only summarises what is already saved —
   read-only, no second write, so nothing can double-create — and its
   primary button flips onboarding.completed_at, which releases the guard
   in App.js and drops the user on the home screen.

   The primary is always enabled, so the shell never offers "skip" on this
   step: skipping is what the footer's quiet exit is for. */
export default function Step5Finish({ ob, onDone, setCTA }) {
  const t = (k, vars) => i18n.t('onboardingSteps:' + k, vars)

  useStepCTA(setCTA, { onNext: onDone, canAdvance: true, nextLabel: t('step5.nextLabel') })

  const rtl = (i18n.language || '').startsWith('he')

  /* "What we set up together" has to mean exactly that. These were once
     whole-account counts, which happen to match on a brand-new account and
     stop matching the moment they do not: someone re-running onboarding
     from Settings saw their entire history presented back as if it had
     just been set up here.

     Each step records the ids it created, so count those. Web additionally
     intersects them with the live rows; here the answers are already the
     authority — step 3 prunes an id from created_ids the moment the client
     is taken back out, and the user is held inside this flow, so no other
     screen can delete a row behind it. Counting the answers directly saves
     mounting three data hooks for three integers, one of which fetches
     eleven tables.

     Only non-empty lines are shown, so a skipped step does not leave a row
     of zeros. */
  const answers = ob?.state?.answers || {}
  const count = (v) => (Array.isArray(v) ? v.filter(Boolean).length : 0)

  const summary = [
    { key: 'projects', Icon: Folder, label: t('step5.projects'), n: count(answers.projects?.created_ids) },
    { key: 'clients', Icon: Users, label: t('step5.clients'), n: count(answers.clients?.created_ids) },
    { key: 'goals', Icon: Target, label: t('step5.goals'), n: count(answers.goals?.created_ids) },
  ].filter((s) => s.n > 0)

  return (
    <View style={styles.root}>
      <View style={styles.titleRow}>
        <Sparkles size={16} strokeWidth={1.7} color={colors.brand} />
        <Text style={styles.title}>{t('step5.title')}</Text>
      </View>

      {summary.length > 0 ? (
        <View style={styles.field}>
          <Text style={styles.heading}>{t('step5.summaryHeading')}</Text>
          <View style={styles.summary}>
            {summary.map(({ key, Icon, label, n }) => (
              <View key={key} style={[styles.row, rtl && styles.rowRtl]}>
                <Icon size={16} strokeWidth={1.6} color={colors.textSub} />
                <Text style={styles.rowLabel}>{label}</Text>
                <Text style={styles.rowCount}>{n}</Text>
              </View>
            ))}
          </View>
          <Text style={styles.note}>
            {t('step5.savedNote', { verb: t('step5.savedNoteVerb') })}
          </Text>
        </View>
      ) : (
        <Text style={styles.note}>
          {t('step5.emptyNote', { verb: t('step5.emptyNoteVerb') })}
        </Text>
      )}

      <View style={styles.field}>
        <Text style={styles.heading}>{t('step5.goodToKnow')}</Text>
        <View style={styles.about}>
          <Text style={styles.aboutLine}>{t('step5.about1')}</Text>
          <Text style={styles.aboutLine}>{t('step5.about2', { verb: t('step5.about2Verb') })}</Text>
          <Text style={styles.aboutLine}>
            {t('step5.about3', {
              allow: t('step5.about3AllowVerb'),
              like: t('step5.about3LikeVerb'),
              wish: t('step5.about3WishVerb'),
            })}
          </Text>
          <Text style={styles.aboutLine}>{t('step5.about4')}</Text>
          <Text style={[styles.aboutLine, styles.aboutLast]}>{t('step5.about5')}</Text>
        </View>
      </View>
    </View>
  )
}

const styles = themed((c, t) => ({
  root: { gap: 16 },
  rowRtl: { flexDirection: 'row-reverse' },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  title: { ...t.heading, color: c.text, textAlign: 'center' },
  field: { gap: 8, alignItems: 'center' },
  heading: { ...t.caption, color: c.textSub, textAlign: 'center' },
  summary: {
    alignSelf: 'stretch',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.card,
    paddingVertical: 4,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, paddingHorizontal: 14 },
  rowLabel: { ...t.body, color: c.text, flex: 1 },
  rowCount: { ...t.body, color: c.brand, fontWeight: '600' },
  note: { ...t.micro, color: c.textFaint, textAlign: 'center' },
  about: { gap: 10, alignSelf: 'stretch' },
  aboutLine: { ...t.caption, color: c.textSub, textAlign: 'center', lineHeight: 21 },
  aboutLast: { color: c.text, fontWeight: '600' },
}))
