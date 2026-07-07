import { View, Text, Pressable, StyleSheet, ScrollView, ActivityIndicator, RefreshControl } from 'react-native'
import { Trash2, RotateCcw, User, FolderOpen, Users, CheckSquare, UserPlus, Tag, Banknote, Repeat, CalendarDays, Bell, Target, LayoutGrid, BarChart3, HelpCircle, MessageCircle } from 'lucide-react-native'
import Screen from '../components/Screen'
import ScreenHead from '../components/ScreenHead'
import Card from '../components/Card'
import { useTrash, TRASH_TYPES } from '../hooks/useTrash'
import i18n from '../lib/i18n'
import { colors } from '../theme/theme'

// Recycle bin (mirrors web TrashScreen) — soft-deleted rows grouped by entity,
// each restorable within 30 days.
const ICONS = {
  clients: User, projects: FolderOpen, groups: Users, tasks: CheckSquare, leads: UserPlus,
  leadSources: Tag, leadStatuses: Tag, transactions: Banknote, categories: Tag, recurring: Repeat,
  sessions: CalendarDays, reminders: Bell, goals: Target, goalCategories: LayoutGrid,
  goalEntries: BarChart3, userQuestions: HelpCircle, dailyAnswers: MessageCircle,
}
const FIELD = Object.fromEntries(TRASH_TYPES.map((t) => [t.key, t.field]))

export default function TrashScreen() {
  const { trash, totalCount, loading, error, restore, refetch } = useTrash()

  return (
    <Screen name="tasks">
      <ScreenHead
        title={i18n.t('trash:title', { defaultValue: 'סל מיחזור' })}
        meta={[i18n.t('trash:itemCount', { count: totalCount, defaultValue: `${totalCount} פריטים` }), i18n.t('trash:keptDays', { defaultValue: 'נשמרים 30 יום' })]}
        tagline={i18n.t('trash:stillReversible', { defaultValue: 'כל מחיקה כאן עוד הפיכה.' })}
      />

      {loading && !totalCount ? (
        <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={refetch} tintColor={colors.brand} />}
        >
          {error ? <Text style={styles.error}>{i18n.t('trash:error', { error, defaultValue: error })}</Text> : null}

          {totalCount === 0 ? (
            <View style={styles.empty}>
              <Trash2 size={34} strokeWidth={1.4} color={colors.textFaint} />
              <Text style={styles.emptyText}>{i18n.t('trash:empty.body', { deleteVerb: i18n.t('trash:deleteVerb', { defaultValue: 'תמחק/י' }), defaultValue: 'סל המיחזור ריק 🌱' }).replace(/<br\s*\/?>(\s*)/g, '\n')}</Text>
            </View>
          ) : (
            TRASH_TYPES.map((t) => {
              const items = trash[t.key]
              if (!items || !items.length) return null
              const Icon = ICONS[t.key] || Trash2
              return (
                <View key={t.key} style={styles.group}>
                  <View style={styles.groupHead}>
                    <Icon size={15} strokeWidth={1.5} color={colors.textSub} />
                    <Text style={styles.groupName}>{i18n.t(`trash:entities.${t.key}`)}</Text>
                    <Text style={styles.groupCount}>{items.length}</Text>
                  </View>
                  <Card padded={false}>
                    {items.map((row, i) => (
                      <View key={row.id} style={[styles.row, i > 0 && styles.rowBorder]}>
                        <Text style={styles.rowLabel} numberOfLines={1}>{row[FIELD[t.key]] || i18n.t(`trash:entities.${t.key}`)}</Text>
                        <Pressable style={styles.restore} onPress={() => restore(t.key, row.id)} hitSlop={6}>
                          <RotateCcw size={14} strokeWidth={1.8} color={colors.textSub} />
                          <Text style={styles.restoreText}>{i18n.t('trash:restore', { defaultValue: 'שחזור' })}</Text>
                        </Pressable>
                      </View>
                    ))}
                  </Card>
                </View>
              )
            })
          )}
        </ScrollView>
      )}
    </Screen>
  )
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: 20, paddingBottom: 40, gap: 16 },
  error: { color: colors.danger, fontSize: 13 },
  empty: { alignItems: 'center', gap: 12, paddingVertical: 60 },
  emptyText: { fontSize: 14, color: colors.textFaint, textAlign: 'center', lineHeight: 20 },
  group: { gap: 8 },
  groupHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  groupName: { fontSize: 14, fontWeight: '600', color: colors.textSub, flex: 1 },
  groupCount: { fontSize: 13, color: colors.textFaint },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 16 },
  rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.divider },
  rowLabel: { flex: 1, fontSize: 14, color: colors.text },
  restore: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 6, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: colors.divider, backgroundColor: 'transparent' },
  restoreText: { fontSize: 13, fontWeight: '500', color: colors.text },
})
