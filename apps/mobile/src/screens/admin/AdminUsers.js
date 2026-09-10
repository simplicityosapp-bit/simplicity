import { useState, useMemo, useCallback, memo } from 'react'
import { View, Text, Pressable, TextInput } from 'react-native'
import { Search, ChevronDown, Shield, ShieldCheck, Check, Trash2 } from 'lucide-react-native'
import { ADMIN_EMAIL, adminPerms } from '@simplicity/core'
import i18n from '../../lib/i18n'
import Card from '../../components/Card'
import { useAdminQuery, callAdmin } from '../../hooks/useAdmin'
import { useAuth } from '../../lib/auth'
import { colors } from '../../theme/theme'
import { themed } from '../../theme/themed'
import { AdminState, Pill } from './AdminBits'

const T = (k, o) => i18n.t(`admin:${k}`, o)

const SECTIONS = ['all', 'subscribers', 'manual', 'regular']
const PERM_OPTIONS = ['delete_users', 'set_subscriber', 'manage_admins']
const PERM_LABEL = { delete_users: 'deleteUsers', set_subscriber: 'setSubscriber', manage_admins: 'manageAdmins' }

function fmtDate(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

/* "today" / "yesterday" / "N days ago" / a date — last-active warmth. */
function fmtLastActive(iso) {
  if (!iso) return '—'
  const ts = new Date(iso).getTime()
  if (Number.isNaN(ts)) return '—'
  const days = Math.floor((Date.now() - ts) / 86_400_000)
  if (days <= 0) return T('users.date.today')
  if (days === 1) return T('users.date.yesterday')
  if (days < 30) return T('users.date.daysAgo', { count: days })
  return fmtDate(iso)
}

/* A versioned legal consent → "גרסה 1.0 · 11/06/26". Shows the
   server-stamped recorded_at — the timestamp to trust in a dispute —
   falling back to accepted_at for rows that predate it. */
function fmtConsent(c) {
  if (!c) return '—'
  const v = c.version ? T('users.consent.version', { version: c.version }) : ''
  return `${v}${fmtDate(c.recorded_at || c.accepted_at)}`
}

function fmtMarketing(r) {
  const m = r.consent?.marketing
  if (m) return `${m.accepted ? T('users.consent.agreed') : T('users.consent.declined')} · ${fmtDate(m.recorded_at || m.accepted_at)}`
  return r.marketing_consent ? T('users.consent.agreed') : T('users.consent.declined')
}

function Field({ k, v }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldK}>{k}</Text>
      <Text style={styles.fieldV}>{v}</Text>
    </View>
  )
}

/* One user. Collapsed it is an email, a role chip and a subscriber dot;
   expanded it is the same detail grid web shows, plus the three actions
   the viewer's permissions allow.

   Every destructive action keeps web's confirmation exactly as it is —
   a typed-email match to delete, a two-step confirm to change a role or
   a billing tier. Those gates are the whole safety story, and a phone is
   the last place to loosen them. */
const UserRow = memo(function UserRow({ r, isOpen, onToggle, viewerPerms, viewerId, onChanged }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(false)
  const [delText, setDelText] = useState('')
  const [confirm, setConfirm] = useState(null) // null | 'sub' | 'grant' | 'revoke' | 'delete'
  const [permDraft, setPermDraft] = useState(() => ({
    delete_users: !!r.admin_perms?.delete_users,
    set_subscriber: !!r.admin_perms?.set_subscriber,
    manage_admins: !!r.admin_perms?.manage_admins,
  }))

  /* Keep the permission toggles in step with the server after a refetch.
     The row is keyed by a stable id so it never remounts on its own, and
     without this a revoke would leave the boxes showing the old perms.
     Adjusting state during render is React's own recipe for resetting
     state on a changed prop. */
  const permsSig = `${!!r.admin_perms?.delete_users}|${!!r.admin_perms?.set_subscriber}|${!!r.admin_perms?.manage_admins}`
  const [syncedSig, setSyncedSig] = useState(permsSig)
  if (permsSig !== syncedSig) {
    setSyncedSig(permsSig)
    setPermDraft({
      delete_users: !!r.admin_perms?.delete_users,
      set_subscriber: !!r.admin_perms?.set_subscriber,
      manage_admins: !!r.admin_perms?.manage_admins,
    })
  }

  const isOwner = (r.email || '').toLowerCase() === ADMIN_EMAIL
  const isSelf = r.id === viewerId
  const canManageAdmins = !!viewerPerms?.manage_admins && !isOwner && !isSelf
  const canDeleteUsers = !!viewerPerms?.delete_users && !isOwner && !isSelf
  const deleteArmed = !!r.email && delText.trim().toLowerCase() === r.email.toLowerCase()

  const run = async (fn) => {
    setBusy(true); setErr(false)
    try { await fn(); setConfirm(null); await onChanged() }
    catch { setErr(true) }
    finally { setBusy(false) }
  }

  return (
    <Card style={styles.row}>
      <Pressable style={styles.rowHead} onPress={() => onToggle(r.id)}>
        <View style={styles.rowMain}>
          <Text style={styles.email} numberOfLines={1}>{r.email || '—'}</Text>
          <View style={styles.rowMeta}>
            {r.is_owner ? (
              <View style={styles.roleChip}><ShieldCheck size={10} strokeWidth={2.2} color={colors.brand} /><Text style={styles.roleChipText}>{T('users.role.ownerChip')}</Text></View>
            ) : r.is_admin ? (
              <View style={styles.roleChip}><Shield size={10} strokeWidth={2.2} color={colors.moonDeep} /><Text style={styles.roleChipText}>{T('users.role.adminChip')}</Text></View>
            ) : null}
            {r.is_subscriber ? <Pill label={T(`users.sections.${r.subscriber_kind === 'regular' ? 'regular' : 'manual'}`)} tone="positive" /> : null}
            <Text style={styles.lastActive}>{fmtLastActive(r.last_sign_in_at)}</Text>
          </View>
        </View>
        <ChevronDown size={16} strokeWidth={1.8} color={colors.textFaint} style={isOpen ? styles.chevOpen : null} />
      </Pressable>

      {isOpen ? (
        <View style={styles.detail}>
          <Field k={T('users.detail.subscriber')} v={r.subscriber_kind === 'regular' ? T('users.detail.subscriberRegular') : r.subscriber_kind === 'manual' ? T('users.detail.subscriberManual') : T('users.detail.subscriberNone')} />
          <Field k={T('users.subscription.tier')} v={T('users.subscription.tiers.' + (r.subscription_tier || 'free')) + (r.beta_exempt_until ? ` · ${T('users.subscription.betaUntil')} ${fmtDate(r.beta_exempt_until)}` : '')} />
          <Field k={T('users.detail.onboardingStage')} v={r.onboarding_done ? r.onboarding_label : T('users.detail.onboardingStopped', { label: r.onboarding_label })} />
          <Field k={T('users.detail.feedbackLeft')} v={r.feedback_count > 0 ? T('users.detail.feedbackCount', { count: r.feedback_count }) : T('users.detail.feedbackNone')} />
          <Field k={T('users.detail.reflections')} v={String(r.reflections ?? 0)} />
          <Field k={T('users.detail.sessions')} v={String(r.sessions ?? 0)} />
          <Field k={T('users.detail.joined')} v={fmtDate(r.created_at)} />
          <Field k={T('users.detail.lastSignIn')} v={fmtLastActive(r.last_sign_in_at)} />

          <Text style={styles.subHead}>{T('users.detail.consentsHeading')}</Text>
          <Field k={T('users.detail.privacy')} v={fmtConsent(r.consent?.privacy)} />
          <Field k={T('users.detail.dpa')} v={fmtConsent(r.consent?.dpa)} />
          <Field k={T('users.detail.terms')} v={fmtConsent(r.consent?.terms)} />
          <Field k={T('users.detail.marketing')} v={fmtMarketing(r)} />

          {err ? <Text style={styles.err}>{T('users.manage.actionFailed')}</Text> : null}

          {/* ── subscriber flag ── */}
          {viewerPerms?.set_subscriber ? (
            confirm === 'sub' ? (
              <Confirm
                q={r.is_subscriber ? T('users.sub.askCancel') : T('users.sub.askMark')}
                busy={busy}
                onCancel={() => setConfirm(null)}
                onYes={() => run(() => callAdmin('set_subscriber', { user_id: r.id, value: !r.is_subscriber }))}
              />
            ) : (
              <Pressable style={styles.action} onPress={() => setConfirm('sub')}>
                <Check size={14} strokeWidth={2} color={colors.textSub} />
                <Text style={styles.actionText}>{r.is_subscriber ? T('users.sub.askCancel') : T('users.sub.askMark')}</Text>
              </Pressable>
            )
          ) : null}

          {/* ── admin role ── */}
          {canManageAdmins ? (
            <View style={styles.roleBlock}>
              <Text style={styles.subHead}>{T('users.manage.heading')}</Text>
              {PERM_OPTIONS.map((p) => (
                <Pressable key={p} style={styles.permRow} onPress={() => setPermDraft((d) => ({ ...d, [p]: !d[p] }))}>
                  <View style={[styles.permBox, permDraft[p] && styles.permBoxOn]}>
                    {permDraft[p] ? <Check size={11} strokeWidth={3} color={colors.onBrand} /> : null}
                  </View>
                  <Text style={styles.permText}>{T(`users.perms.${PERM_LABEL[p]}`)}</Text>
                </Pressable>
              ))}
              {confirm === 'grant' ? (
                <Confirm q={T('users.role.confirmGrant')} busy={busy} onCancel={() => setConfirm(null)}
                  onYes={() => run(() => callAdmin('set_admin', { user_id: r.id, perms: permDraft }))} />
              ) : confirm === 'revoke' ? (
                <Confirm q={T('users.role.confirmRevoke')} busy={busy} onCancel={() => setConfirm(null)}
                  onYes={() => run(() => callAdmin('revoke_admin', { user_id: r.id }))} danger />
              ) : (
                <View style={styles.roleBtns}>
                  <Pressable style={styles.action} onPress={() => setConfirm('grant')}>
                    <Text style={styles.actionText}>{r.is_admin ? T('users.manage.update') : T('users.manage.makeAdmin')}</Text>
                  </Pressable>
                  {r.is_admin ? (
                    <Pressable style={[styles.action, styles.actionDanger]} onPress={() => setConfirm('revoke')}>
                      <Text style={styles.actionDangerText}>{T('users.manage.removeAdmin')}</Text>
                    </Pressable>
                  ) : null}
                </View>
              )}
            </View>
          ) : null}

          {/* ── delete, behind a typed-email match (same gate as web) ── */}
          {canDeleteUsers ? (
            <View style={styles.delBlock}>
              {confirm === 'delete' ? (
                <>
                  <Text style={styles.delWarn}>{T('users.delete.warnPre') + (r.email || '') + T('users.delete.warnPost')}</Text>
                  <TextInput
                    style={styles.delInput}
                    value={delText}
                    onChangeText={setDelText}
                    placeholder={r.email || ''}
                    placeholderTextColor={colors.textFaint}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="email-address"
                  />
                  <View style={styles.roleBtns}>
                    <Pressable style={styles.action} onPress={() => { setConfirm(null); setDelText('') }} disabled={busy}>
                      <Text style={styles.actionText}>{i18n.t('common:cancel')}</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.action, styles.actionDanger, !deleteArmed && styles.actionDisabled]}
                      disabled={!deleteArmed || busy}
                      onPress={() => run(() => callAdmin('delete_user', { user_id: r.id }))}
                    >
                      <Trash2 size={13} strokeWidth={2} color={deleteArmed ? colors.danger : colors.textFaint} />
                      <Text style={[styles.actionDangerText, !deleteArmed && styles.actionDisabledText]}>{T('users.delete.button')}</Text>
                    </Pressable>
                  </View>
                </>
              ) : (
                <Pressable style={[styles.action, styles.actionDanger]} onPress={() => setConfirm('delete')}>
                  <Trash2 size={13} strokeWidth={2} color={colors.danger} />
                  <Text style={styles.actionDangerText}>{T('users.delete.button')}</Text>
                </Pressable>
              )}
            </View>
          ) : null}
        </View>
      ) : null}
    </Card>
  )
})

function Confirm({ q, busy, onYes, onCancel, danger }) {
  return (
    <View style={styles.confirm}>
      <Text style={styles.confirmQ}>{q}</Text>
      <View style={styles.roleBtns}>
        <Pressable style={styles.action} onPress={onCancel} disabled={busy}>
          <Text style={styles.actionText}>{i18n.t('common:cancel')}</Text>
        </Pressable>
        <Pressable style={[styles.action, danger ? styles.actionDanger : styles.actionPrimary]} onPress={onYes} disabled={busy}>
          <Text style={danger ? styles.actionDangerText : styles.actionPrimaryText}>{T('users.manage.confirm')}</Text>
        </Pressable>
      </View>
    </View>
  )
}

export default function AdminUsers() {
  const { session } = useAuth()
  const viewerId = session?.user?.id || null
  /* adminPerms() builds a fresh object per call — memoise it, or every row
     below sees a changed prop on every keystroke in the search box. */
  const viewerPerms = useMemo(() => adminPerms(session?.user), [session])
  const { data, loading, error, refetch } = useAdminQuery('users')

  const [q, setQ] = useState('')
  const [section, setSection] = useState('all')
  const [open, setOpen] = useState(null)

  const onToggle = useCallback((id) => setOpen((cur) => (cur === id ? null : id)), [])

  const rows = data?.rows || []
  const counts = useMemo(() => ({
    total: rows.length,
    subscribers: rows.filter((r) => r.is_subscriber).length,
    manual: rows.filter((r) => r.subscriber_kind === 'manual').length,
    regular: rows.filter((r) => r.subscriber_kind === 'regular').length,
  }), [rows])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return rows.filter((r) => {
      if (section === 'subscribers' && !r.is_subscriber) return false
      if (section === 'manual' && r.subscriber_kind !== 'manual') return false
      if (section === 'regular' && r.subscriber_kind !== 'regular') return false
      if (needle && !(r.email || '').toLowerCase().includes(needle)) return false
      return true
    })
  }, [rows, q, section])

  return (
    <>
      <View style={styles.summary}>
        <Text style={styles.summaryText}>
          {T('users.summary.total')} {counts.total} · {T('users.summary.subscribers')} {counts.subscribers}
          {counts.manual ? ` (${T('users.summary.manual')} ${counts.manual}` : ''}
          {counts.manual && counts.regular ? ` · ${T('users.summary.regular')} ${counts.regular})` : counts.manual ? ')' : ''}
        </Text>
      </View>

      <View style={styles.searchWrap}>
        <Search size={15} strokeWidth={1.8} color={colors.textFaint} />
        <TextInput
          style={styles.search}
          value={q}
          onChangeText={setQ}
          placeholder={T('users.searchPlaceholder')}
          placeholderTextColor={colors.textFaint}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      <View style={styles.tabs}>
        {SECTIONS.map((s) => (
          <Pressable
            key={s}
            style={[styles.tab, section === s && styles.tabOn]}
            onPress={() => setSection(s)}
            accessibilityRole="button"
            accessibilityState={{ selected: section === s }}
          >
            <Text style={[styles.tabText, section === s && styles.tabTextOn]}>{T(`users.sections.${s}`)}</Text>
          </Pressable>
        ))}
      </View>

      <AdminState loading={loading} error={error} hasData={!!data} />

      {data && filtered.length === 0 ? <Text style={styles.empty}>{T('users.empty')}</Text> : null}

      <View style={styles.list}>
        {filtered.map((r) => (
          <UserRow
            key={r.id}
            r={r}
            isOpen={open === r.id}
            onToggle={onToggle}
            viewerPerms={viewerPerms}
            viewerId={viewerId}
            onChanged={refetch}
          />
        ))}
      </View>
    </>
  )
}

const styles = themed((c, t) => ({
  summary: { paddingBottom: 8 },
  summaryText: { ...t.micro, color: c.textSub },

  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12,
    borderRadius: 12, borderWidth: 1, borderColor: c.border, backgroundColor: c.inputBg,
  },
  search: { flex: 1, paddingVertical: 10, fontSize: 14, color: c.text, writingDirection: 'ltr' },

  tabs: { flexDirection: 'row', gap: 6, marginTop: 8, flexWrap: 'wrap' },
  tab: { paddingHorizontal: 11, paddingVertical: 6, borderRadius: 999, backgroundColor: c.fill },
  tabOn: { backgroundColor: c.brand },
  tabText: { fontSize: 12, color: c.textSub, fontWeight: '500' },
  tabTextOn: { color: c.onBrand, fontWeight: '600' },

  empty: { ...t.caption, color: c.textFaint, textAlign: 'center', paddingVertical: 24 },
  list: { gap: 8, marginTop: 8 },

  row: { paddingVertical: 10, gap: 8 },
  rowHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowMain: { flex: 1, gap: 3 },
  /* Emails are Latin in an RTL app — pin them or the dots and @ drift. */
  email: { ...t.caption, color: c.text, fontWeight: '600', writingDirection: 'ltr', textAlign: 'left' },
  rowMeta: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  roleChip: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999, backgroundColor: c.fill },
  roleChipText: { fontSize: 10, color: c.textSub, fontWeight: '600' },
  lastActive: { ...t.micro, color: c.textFaint },
  chevOpen: { transform: [{ rotate: '180deg' }] },

  detail: { gap: 6, borderTopWidth: 1, borderTopColor: c.divider, paddingTop: 8 },
  field: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  fieldK: { ...t.micro, color: c.textFaint, width: 104 },
  fieldV: { ...t.micro, color: c.text, flex: 1 },
  subHead: { ...t.caption, color: c.textSub, fontWeight: '700', marginTop: 8 },
  err: { ...t.micro, color: c.danger, marginTop: 4 },

  action: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 9, paddingHorizontal: 12, borderRadius: 10, backgroundColor: c.fill, flex: 1,
  },
  actionText: { fontSize: 12, color: c.textSub, fontWeight: '600' },
  actionPrimary: { backgroundColor: c.brand },
  actionPrimaryText: { fontSize: 12, color: c.onBrand, fontWeight: '700' },
  actionDanger: { backgroundColor: 'rgba(181,99,78,0.12)' },
  actionDangerText: { fontSize: 12, color: c.danger, fontWeight: '700' },
  actionDisabled: { opacity: 0.5 },
  actionDisabledText: { color: c.textFaint },

  confirm: { gap: 8, marginTop: 8, padding: 10, borderRadius: 10, backgroundColor: c.fill },
  confirmQ: { ...t.micro, color: c.text },

  roleBlock: { gap: 6, marginTop: 4 },
  roleBtns: { flexDirection: 'row', gap: 8 },
  permRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 3 },
  permBox: { width: 17, height: 17, borderRadius: 5, borderWidth: 1, borderColor: c.border, alignItems: 'center', justifyContent: 'center' },
  permBoxOn: { backgroundColor: c.brand, borderColor: c.brand },
  permText: { ...t.micro, color: c.textSub },

  delBlock: { gap: 8, marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: c.divider },
  delWarn: { ...t.micro, color: c.danger },
  delInput: {
    borderWidth: 1, borderColor: c.border, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8,
    fontSize: 13, color: c.text, backgroundColor: c.inputBg, writingDirection: 'ltr', textAlign: 'left',
  },
}))
