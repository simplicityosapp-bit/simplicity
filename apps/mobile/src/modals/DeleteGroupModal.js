import { useEffect, useMemo, useState } from 'react'
import { View } from 'react-native'
import Sheet from '../components/Sheet'
import { Text } from '../components/Text'
import { Pressable } from '../components/Pressable'
import { DELETE_GROUP_DEFAULTS } from '../lib/groupDelete'
import i18n from '../lib/i18n'
import { themed } from '../theme/themed'

const t = (k, o) => i18n.t(`modalsClient:deleteGroup.${k}`, o)

/* Delete a group, choosing what happens to what hangs off it (web
   DeleteGroupModal). A row appears only for something that exists; the
   destructive half of each choice looks destructive once picked. */
export default function DeleteGroupModal({ open, onClose, group, counts, onConfirm }) {
  const options = useMemo(() => {
    const out = []
    if (counts?.members) out.push({ key: 'keepMembers', label: t('members', { count: counts.members }), sub: t('membersSub'), keep: t('membersKeep'), del: t('membersDelete') })
    if (counts?.futureMeetings) out.push({ key: 'keepFutureMeetings', label: t('futureMeetings', { count: counts.futureMeetings }), sub: t('futureMeetingsSub'), keep: t('keep'), del: t('delete') })
    if (counts?.pastSessions) out.push({ key: 'keepPastSessions', label: t('pastSessions', { count: counts.pastSessions }), sub: t('pastSessionsSub'), keep: t('keep'), del: t('delete') })
    if (counts?.reminders) out.push({ key: 'keepReminders', label: t('reminders', { count: counts.reminders }), sub: t('remindersSub'), keep: t('keep'), del: t('delete') })
    return out
  }, [counts])
  const [choices, setChoices] = useState(DELETE_GROUP_DEFAULTS)
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (open) { setChoices(DELETE_GROUP_DEFAULTS); setBusy(false) } }, [open, group?.id])

  if (!group) return <Sheet open={open} onClose={onClose} title={t('title')} />

  const submit = async () => {
    if (busy) return
    setBusy(true)
    try { await onConfirm?.(choices) } finally { onClose() }
  }

  return (
    <Sheet open={open} onClose={onClose} title={t('titleNamed', { name: group.name })}>
      <Text style={styles.intro}>{options.length ? t('intro') : t('noData')}</Text>
      {options.map((o) => {
        const keep = choices[o.key]
        return (
          <View key={o.key} style={styles.row}>
            <Text style={styles.label}>{o.label}</Text>
            <Text style={styles.sub}>{o.sub}</Text>
            <View style={styles.choice}>
              <Pressable style={[styles.pill, keep && styles.pillOn]} onPress={() => setChoices((c) => ({ ...c, [o.key]: true }))} accessibilityState={{ selected: keep }}>
                <Text style={[styles.pillText, keep && styles.pillTextOn]}>{o.keep}</Text>
              </Pressable>
              <Pressable style={[styles.pill, !keep && styles.pillDanger]} onPress={() => setChoices((c) => ({ ...c, [o.key]: false }))} accessibilityState={{ selected: !keep }}>
                <Text style={[styles.pillText, !keep && styles.pillTextOn]}>{o.del}</Text>
              </Pressable>
            </View>
          </View>
        )
      })}
      <View style={styles.actions}>
        <Pressable style={styles.cancel} onPress={onClose} disabled={busy}><Text style={styles.cancelText}>{i18n.t('modalsClient:common.cancel')}</Text></Pressable>
        <Pressable style={[styles.confirm, busy && styles.off]} onPress={submit} disabled={busy} accessibilityRole="button">
          <Text style={styles.confirmText}>{t('confirm')}</Text>
        </Pressable>
      </View>
    </Sheet>
  )
}

const styles = themed((c) => ({
  intro: { fontSize: 14, color: c.text, lineHeight: 20 },
  row: { gap: 4, paddingVertical: 10, borderTopWidth: 1, borderTopColor: c.divider },
  label: { fontSize: 14, fontWeight: '600', color: c.text },
  sub: { fontSize: 12, color: c.textSub },
  choice: { flexDirection: 'row', gap: 8, marginTop: 6 },
  pill: { flex: 1, minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 999, borderWidth: 1, borderColor: c.border, backgroundColor: c.cardFlat },
  pillOn: { backgroundColor: c.brand, borderColor: c.brand },
  pillDanger: { backgroundColor: c.dangerFill, borderColor: c.danger },
  pillText: { fontSize: 13, color: c.text },
  pillTextOn: { color: c.onBrand, fontWeight: '600' },
  actions: { flexDirection: 'row', gap: 12, marginTop: 8 },
  cancel: { flex: 1, paddingVertical: 13, borderRadius: 12, borderWidth: 1, borderColor: c.border, alignItems: 'center' },
  cancelText: { fontSize: 15, color: c.textSub },
  confirm: { flex: 1, paddingVertical: 13, borderRadius: 12, backgroundColor: c.dangerFill, alignItems: 'center' },
  confirmText: { fontSize: 15, fontWeight: '600', color: c.onBrand },
  off: { opacity: 0.5 },
}))
