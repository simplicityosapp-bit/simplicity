import { useState } from 'react'
import { View, Alert, Linking, ActivityIndicator } from 'react-native'
import { CalendarClock, RefreshCw, Link2Off, Check, CircleAlert, ExternalLink } from 'lucide-react-native'
import { fmtShortDate, fmtTime } from '@simplicity/core'
import { Text } from './Text'
import { Pressable } from './Pressable'
import Card from './Card'
import { useGoogleCalendar } from '../hooks/useGoogleCalendar'
import { syncCalendar, disconnectCalendar } from '../lib/googleCalendar'
import { showToast } from '../lib/toast'
import i18n from '../lib/i18n'
import { colors } from '../theme/theme'
import { themed } from '../theme/themed'

const T = (k, o) => i18n.t(`connections:${k}`, o)
// Connecting is Google's OAuth redirect back to a registered web URL, so it
// happens in the web app; this opens it there.
const CONNECT_URL = 'https://simplicity-os.com/connections'

/* Google Calendar on the Connections screen — the manage half of web's
   CalendarConnection: live status, "sync now" and disconnect. It used to be
   a static "set up on the computer" row even for an account that was
   already connected. */
export default function GoogleCalendarCard() {
  const { status, loading, busy, error } = useGoogleCalendar()
  const connected = !!status?.connected
  const [action, setAction] = useState(null) // 'sync' | 'disconnect'

  const onSync = async () => {
    setAction('sync')
    try {
      const res = await syncCalendar()
      showToast(T('calendar.syncResult', {
        synced: res?.synced ?? 0,
        removed: res?.removed ? T('calendar.syncRemoved', { count: res.removed }) : '',
      }))
    } catch {
      /* the error line below shows what went wrong */
    } finally {
      setAction(null)
    }
  }

  const onDisconnect = () => {
    Alert.alert('Google Calendar', T('calendar.disconnectConfirm'), [
      { text: i18n.t('common:cancel', { defaultValue: 'ביטול' }), style: 'cancel' },
      {
        text: T('calendar.disconnect'),
        style: 'destructive',
        onPress: async () => { setAction('disconnect'); await disconnectCalendar(); setAction(null) },
      },
    ])
  }

  const sub = loading
    ? T('loading')
    : connected
      ? (status?.last_synced_at
        ? T('calendar.connectedSynced', { date: `${fmtShortDate(status.last_synced_at)} · ${fmtTime(status.last_synced_at)}` })
        : T('calendar.connected'))
      : T('calendar.notConnectedHint')

  return (
    <Card contentStyle={styles.card}>
      <View style={styles.head}>
        <View style={[styles.chip, connected && styles.chipOn]}>
          <CalendarClock size={18} strokeWidth={1.7} color={connected ? colors.positive : colors.textSub} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Google Calendar</Text>
          <View style={styles.subRow}>
            {connected && !loading ? <Check size={12} strokeWidth={2} color={colors.positive} /> : null}
            <Text style={styles.sub}>{sub}</Text>
          </View>
        </View>
      </View>

      {error ? (
        <View style={styles.errorRow} accessibilityRole="alert">
          <CircleAlert size={14} strokeWidth={1.7} color={colors.danger} />
          <Text style={styles.error}>{error}</Text>
        </View>
      ) : null}

      {loading ? null : connected ? (
        <View style={styles.actions}>
          <Pressable style={[styles.btn, styles.primary, busy && styles.off]} onPress={onSync} disabled={busy} accessibilityRole="button">
            {action === 'sync'
              ? <ActivityIndicator size="small" color={colors.onBtn} />
              : <RefreshCw size={15} strokeWidth={1.8} color={colors.onBtn} />}
            <Text style={styles.primaryText}>{action === 'sync' ? T('calendar.syncing') : T('calendar.syncNow')}</Text>
          </Pressable>
          <Pressable style={[styles.btn, styles.ghost, busy && styles.off]} onPress={onDisconnect} disabled={busy} accessibilityRole="button">
            <Link2Off size={15} strokeWidth={1.8} color={colors.danger} />
            <Text style={styles.ghostText}>{action === 'disconnect' ? T('calendar.disconnecting') : T('calendar.disconnect')}</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <Pressable style={[styles.btn, styles.ghostNeutral]} onPress={() => Linking.openURL(CONNECT_URL).catch(() => {})} accessibilityRole="link">
            <ExternalLink size={15} strokeWidth={1.8} color={colors.text} />
            <Text style={styles.neutralText}>{T('calendar.connect')}</Text>
          </Pressable>
          <Text style={styles.note}>{T('list.desktopSetup')}</Text>
        </>
      )}
    </Card>
  )
}

const styles = themed((c) => ({
  card: { gap: 12 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  chip: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', borderWidth: 0.5, borderColor: c.divider, backgroundColor: c.glassTint },
  chipOn: { backgroundColor: 'rgba(139,168,136,0.16)', borderColor: 'rgba(139,168,136,0.32)' },
  title: { fontSize: 15, fontWeight: '600', color: c.text },
  subRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 1 },
  sub: { flexShrink: 1, fontSize: 12, color: c.textSub },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  error: { flexShrink: 1, fontSize: 13, color: c.danger },
  actions: { flexDirection: 'row', gap: 10 },
  btn: { flex: 1, minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 14, paddingHorizontal: 12 },
  primary: { backgroundColor: c.btnBg },
  primaryText: { fontSize: 14, fontWeight: '600', color: c.onBtn },
  ghost: { borderWidth: 1, borderColor: c.border },
  ghostText: { fontSize: 14, fontWeight: '500', color: c.danger },
  ghostNeutral: { flex: 0, borderWidth: 1, borderColor: c.border },
  neutralText: { fontSize: 14, fontWeight: '500', color: c.text },
  note: { fontSize: 12, color: c.textFaint, textAlign: 'center' },
  off: { opacity: 0.5 },
}))
