import { useMemo } from 'react'
import { View, Text, Pressable, StyleSheet, I18nManager } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { ClipboardList, Check, Bell } from 'lucide-react-native'
import { tasksAndReminders, formatWhen } from '@simplicity/core'
import i18n from '../../lib/i18n'
import WidgetCard from '../../components/WidgetCard'
import { colors } from '../../theme/theme'

// "משימות ותזכורות" — one card for everything still owed.
//
// Reminders had a card of their own sitting directly beside this one, which
// split a single question — what do I still owe? — across two boxes with two
// summaries. Web merged them; mobile did not, and the mismatch was worse than
// it looked: web's widget registry has no 'reminders' id at all, so for any
// account whose prefs were written by web that second card never rendered.
// This card had meanwhile been TITLED "משימות ותזכורות" while showing tasks
// alone.
//
// Both kinds now come from core's tasksAndReminders, pressure-ordered:
// overdue → today → flagged urgent → the rest, soonest first, undated last.
// Each row keeps its own ✓ — tasks toggle, reminders complete — and its date,
// which the tasks half never used to show even though it was sorted by it.
export default function NextTasksWidget({ tasks, reminders, onToggle, onCompleteReminder }) {
  const nav = useNavigation()
  const items = useMemo(() => tasksAndReminders(0, { tasks, reminders }), [tasks, reminders])
  const total = items.length
  const overdue = useMemo(() => items.filter((i) => i.bucket === 'overdue').length, [items])
  const today = useMemo(() => items.filter((i) => i.bucket === 'today').length, [items])
  const flip = (i18n.language || '').startsWith('he') && !I18nManager.isRTL

  /* Late beats due-today beats a bare count: a passed deadline is a fact, and
     the closed card only gets one line. Same order web's card states. */
  const summary = total === 0
    ? i18n.t('home:widgets.nextTasks.noOpen')
    : overdue > 0
      ? i18n.t('home:widgets.nextTasks.overdueOf', { count: total, overdueText: i18n.t('home:widgets.nextTasks.overdue', { count: overdue }) })
      : today > 0
        ? i18n.t('home:widgets.nextTasks.todayOf', { count: total, todayText: i18n.t('home:widgets.nextTasks.dueToday', { count: today }) })
        : i18n.t('home:widgets.nextTasks.openSummary', { count: total })

  const complete = (it) => {
    if (it.kind === 'task') onToggle?.(it.task)
    else onCompleteReminder?.(it.reminderId)
  }

  return (
    <WidgetCard
      Icon={ClipboardList}
      title={i18n.t('home:widgets.nextTasks.title')}
      count={total ? i18n.t('home:widgets.nextTasks.link', { count: total }) : null}
      summary={summary}
    >
      {items.length ? (
        items.map((it, i) => (
          <View key={it.id} style={[styles.row, flip && styles.rowFlip, i > 0 && styles.rowBorder]}>
            <Pressable style={[styles.rowMain, flip && styles.rowFlip]} onPress={() => nav.navigate('Tasks')}>
              {/* A reminder gets the bell; a task gets its priority dot. The two
                  kinds read differently at a glance without a word spent. */}
              {it.kind === 'reminder' ? (
                <Bell size={13} strokeWidth={1.7} color={colors.textSub} />
              ) : (
                <View style={[styles.dot, it.priority === 'high' ? styles.dotUrgent : styles.dotRegular]} />
              )}
              <Text style={[styles.text, flip && styles.textRtl]} numberOfLines={1}>{it.title || ''}</Text>
              {/* The date the list is ordered by. Sorting on something invisible
                  reads as an arbitrary order. */}
              {it.when ? (
                <Text style={[styles.when, it.bucket === 'overdue' && styles.whenOverdue]}>{formatWhen(it.when)}</Text>
              ) : null}
            </Pressable>
            <Pressable
              style={styles.check}
              onPress={() => complete(it)}
              hitSlop={8}
              accessibilityLabel={i18n.t('home:widgets.nextTasks.markDone', { defaultValue: 'סמן כבוצע' })}
            >
              <Check size={13} strokeWidth={2} color={colors.positive} />
            </Pressable>
          </View>
        ))
      ) : (
        <Text style={styles.empty}>{i18n.t('home:widgets.nextTasks.allDone', { add: i18n.t('home:widgets.nextTasks.addWord') })}</Text>
      )}
    </WidgetCard>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16 },
  rowFlip: { flexDirection: 'row-reverse' },
  textRtl: { textAlign: 'right' },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13 },
  rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.divider },
  check: { width: 26, height: 26, borderRadius: 13, borderWidth: 1, borderColor: colors.divider, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4 },
  dotUrgent: { backgroundColor: colors.danger },
  dotRegular: { backgroundColor: colors.amberWarn },
  text: { flex: 1, fontSize: 14, color: colors.text },
  when: { fontSize: 11, color: colors.textFaint },
  /* A passed deadline says so in colour, as it does on the tasks screen. */
  whenOverdue: { color: colors.danger },
  empty: { padding: 16, fontSize: 14, color: colors.textFaint, textAlign: 'center' },
})
