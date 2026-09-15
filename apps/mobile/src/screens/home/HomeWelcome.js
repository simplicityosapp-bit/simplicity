import { View } from 'react-native'
import { Sprout, Sparkles, Repeat, Upload, Check, ChevronLeft, X } from 'lucide-react-native'
import { setupTasks } from '@simplicity/core'
import { Text } from '../../components/Text'
import { Pressable } from '../../components/Pressable'
import Card from '../../components/Card'
import i18n from '../../lib/i18n'
import { colors } from '../../theme/theme'
import { themed } from '../../theme/themed'

const t = (k, o) => i18n.t(`home:welcome.${k}`, o)
const ICONS = { setup: Sprout, import: Upload, questions: Sparkles, recurring: Repeat }

/* The file import lives in web's Settings and has no phone counterpart, so a
   task that could only say "go to the computer" stays off this card. Whether
   each remaining task is done comes from core, the same signals web uses. */
const PHONE_TASKS = new Set(['setup', 'questions', 'recurring'])
export const phoneSetupTasks = (input) => setupTasks(input).filter((task) => PHONE_TASKS.has(task.key))

/* ════════════════════════════════════════════════════════════════
   HomeWelcome — finish setting up, from the home screen.
   ════════════════════════════════════════════════════════════════
   Port of web's HomeWelcome. Someone who skipped the intro on the phone
   had no way back into it and nothing pointing at the setup it used to
   ask for; web has had this card since that setup moved out of the flow.
   Each task opens the screen it belongs to, ticks itself off from the
   data, and the card retires once they are done. Dismissible: none of it
   is required.
   ════════════════════════════════════════════════════════════════ */
export default function HomeWelcome({ tasks, onOpen, onDismiss }) {
  return (
    <Card contentStyle={styles.card}>
      <View style={styles.head}>
        <View style={styles.headText}>
          <Text style={styles.eyebrow}>{t('eyebrow')}</Text>
          <Text style={styles.title}>{t('title')}</Text>
          <Text style={styles.sub}>{t('sub')}</Text>
        </View>
        {onDismiss ? (
          <Pressable style={styles.close} onPress={onDismiss} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('close')}>
            <X size={15} strokeWidth={1.8} color={colors.textSub} />
          </Pressable>
        ) : null}
      </View>
      {tasks.map(({ key, done, started }) => {
        const Icon = ICONS[key]
        /* "Pick up where you left off" is only true of someone who left. */
        const fresh = key === 'setup' && !started
        return (
          <Pressable key={key} style={[styles.task, done && styles.taskDone]} onPress={() => onOpen(key)} accessibilityRole="button">
            <View style={[styles.mark, done && styles.markDone]}>
              {done ? <Check size={14} strokeWidth={2.6} color={colors.onBrand} /> : <Icon size={17} strokeWidth={1.6} color={colors.brand} />}
            </View>
            <View style={styles.taskText}>
              <Text style={styles.taskTitle}>{t(fresh ? 'tasks.setup.titleFresh' : `tasks.${key}.title`)}</Text>
              <Text style={styles.taskSub}>{done ? t('taskDone') : t(fresh ? 'tasks.setup.subFresh' : `tasks.${key}.sub`)}</Text>
            </View>
            <ChevronLeft size={15} strokeWidth={1.8} color={colors.textFaint} />
          </Pressable>
        )
      })}
    </Card>
  )
}

const styles = themed((c) => ({
  card: { gap: 10 },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 2 },
  headText: { flex: 1, gap: 2 },
  eyebrow: { fontSize: 11, fontWeight: '600', color: c.brand, letterSpacing: 0.4 },
  title: { fontSize: 17, fontWeight: '700', color: c.text },
  sub: { fontSize: 13, color: c.textSub, lineHeight: 18 },
  close: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: c.fillStrong },
  task: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 16, borderWidth: 0.5, borderColor: c.border, backgroundColor: c.inputBg },
  taskDone: { opacity: 0.6 },
  mark: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: c.glassTint, borderWidth: 0.5, borderColor: c.divider },
  markDone: { backgroundColor: c.brand, borderColor: c.brand },
  taskText: { flex: 1, gap: 1 },
  taskTitle: { fontSize: 14, fontWeight: '600', color: c.text },
  taskSub: { fontSize: 12, color: c.textSub, lineHeight: 16 },
}))
