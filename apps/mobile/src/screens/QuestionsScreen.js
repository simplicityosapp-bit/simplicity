import { useState } from 'react'
import { View, Text, Pressable, StyleSheet, ScrollView, ActivityIndicator, RefreshControl } from 'react-native'
import { Trash2 } from 'lucide-react-native'
import { questionText } from '@simplicity/core'
import i18n from '../lib/i18n'
import Screen from '../components/Screen'
import ScreenHead from '../components/ScreenHead'
import Card from '../components/Card'
import AddQuestionModal from '../modals/AddQuestionModal'
import { colors } from '../theme/theme'
import { useQuestions } from '../hooks/useQuestions'

// Daily-questions management (mirrors web Settings › שאלות יומיות) — list, add,
// toggle active, delete. Feeds the home InsightsWidget.
export default function QuestionsScreen() {
  const { questions, loading, error, refetch, addQuestion, toggleActive, removeQuestion } = useQuestions()
  const [showAdd, setShowAdd] = useState(false)

  const nextOrder = questions.reduce((m, q) => Math.max(m, (q.order ?? 0) + 1), 0)
  const usedTemplateKeys = questions.map((q) => q.template_key).filter(Boolean)

  return (
    <Screen name="tasks">
      <ScreenHead
        title={i18n.t('settings:sections.questions.title', { defaultValue: 'שאלות יומיות' })}
        meta={questions.length ? [i18n.t('settings:questions.count', { count: questions.length, defaultValue: `${questions.length} שאלות` })] : []}
        onAdd={() => setShowAdd(true)}
        addLabel={i18n.t('settings:questions.add', { defaultValue: 'הוספת שאלה' })}
      />
      <AddQuestionModal open={showAdd} onClose={() => setShowAdd(false)} onSave={addQuestion} nextOrder={nextOrder} usedTemplateKeys={usedTemplateKeys} />

      {loading && !questions.length ? (
        <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={refetch} tintColor={colors.brand} />}
        >
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {questions.length ? (
            <Card padded={false}>
              {questions.map((q, i) => (
                <View key={q.id} style={[styles.row, i > 0 && styles.rowBorder]}>
                  <Text style={styles.icon}>{q.icon || '🫧'}</Text>
                  <Text style={[styles.text, !q.active && styles.textOff]} numberOfLines={1}>{questionText(q)}</Text>
                  <Pressable onPress={() => toggleActive(q)} hitSlop={8}>
                    <View style={[styles.toggle, q.active && styles.toggleOn]}>
                      <View style={[styles.knob, q.active && styles.knobOn]} />
                    </View>
                  </Pressable>
                  <Pressable onPress={() => removeQuestion(q.id)} hitSlop={8}>
                    <Trash2 size={17} strokeWidth={1.7} color={colors.textFaint} />
                  </Pressable>
                </View>
              ))}
            </Card>
          ) : (
            <Text style={styles.empty}>{i18n.t('settings:questions.empty', { defaultValue: 'עדיין אין שאלות יומיות. הוסף/י את הראשונה.' })}</Text>
          )}
        </ScrollView>
      )}
    </Screen>
  )
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: 20, paddingBottom: 40, gap: 12 },
  error: { color: colors.danger, fontSize: 13 },
  empty: { color: colors.textFaint, fontSize: 14, textAlign: 'center', marginTop: 24, paddingHorizontal: 20, lineHeight: 20 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, paddingHorizontal: 16 },
  rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.divider },
  icon: { fontSize: 20 },
  text: { flex: 1, fontSize: 15, color: colors.text },
  textOff: { color: colors.textFaint },
  toggle: { width: 40, height: 24, borderRadius: 12, backgroundColor: 'rgba(42,37,32,0.14)', padding: 3, justifyContent: 'center' },
  toggleOn: { backgroundColor: colors.positive },
  knob: { width: 18, height: 18, borderRadius: 9, backgroundColor: '#fff' },
  knobOn: { alignSelf: 'flex-end' },
})
