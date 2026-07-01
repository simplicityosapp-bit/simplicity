import { useState, useMemo } from 'react'
import {
  Search, ChevronDown, BadgeCheck, Plus, Check, X, Users, CreditCard, Hand, Trash2,
  Shield, ShieldCheck, Gem,
} from 'lucide-react'
import { useAdminQuery, callAdmin } from '../../hooks/useAdmin'
import { ADMIN_EMAIL } from '../../lib/routes'
import { useAuth } from '../../auth/AuthContext'
import { adminPerms } from '../../lib/admin'
import { useT } from '../../i18n/useT'
import { Box, Txt, Btn, Input } from '../../components/ui'

/* The three grantable admin permissions, in display order. Console view
   access is implicit for every admin — these gate the sensitive extras.
   Labels resolved via t('users.perms.*') at render. */
const PERM_OPTIONS = [
  { key: 'delete_users', labelKey: 'deleteUsers' },
  { key: 'set_subscriber', labelKey: 'setSubscriber' },
  { key: 'manage_admins', labelKey: 'manageAdmins' },
]

/* dd/mm/yy, or "—" when missing. */
function fmtDate(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

/* "today" / "yesterday" / "N days ago" / date for last-active warmth. */
function fmtLastActive(iso, t) {
  if (!iso) return '—'
  const ts = new Date(iso).getTime()
  if (Number.isNaN(ts)) return '—'
  const days = Math.floor((Date.now() - ts) / 86_400_000)
  if (days <= 0) return t('users.date.today')
  if (days === 1) return t('users.date.yesterday')
  if (days < 30) return t('users.date.daysAgo', { count: days })
  return fmtDate(iso)
}

/* A versioned legal consent → "Version 1.0 · 11/06/26", or "—" when never recorded.
   Shows the server-stamped recorded_at (tamper-proof, migration 0032) — the
   timestamp to trust in a dispute — falling back to accepted_at for old rows. */
function fmtConsent(c, t) {
  if (!c) return '—'
  const v = c.version ? t('users.consent.version', { version: c.version }) : ''
  return `${v}${fmtDate(c.recorded_at || c.accepted_at)}`
}

/* Marketing consent — opted in/out + date (from the durable record), falling
   back to the user_metadata flag when no record exists. */
function fmtMarketing(r, t) {
  const m = r.consent?.marketing
  if (m) return `${m.accepted ? t('users.consent.agreed') : t('users.consent.declined')} · ${fmtDate(m.recorded_at || m.accepted_at)}`
  return r.marketing_consent ? t('users.consent.agreed') : t('users.consent.declined')
}

export default function AdminUsers() {
  const { t } = useT('admin')
  const { user } = useAuth()
  const viewerPerms = adminPerms(user)
  const viewerId = user?.id || null
  const { data, loading, error, refetch } = useAdminQuery('users')
  const [subOverride, setSubOverride] = useState({}) // id → optimistic is_subscriber (manual)
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(null)        // expanded detail row id
  const [busy, setBusy] = useState(null)        // user_id mid-toggle
  const [confirmId, setConfirmId] = useState(null) // user_id awaiting confirm
  const [sections, setSections] = useState({ all: true, subs: true, manual: true, regular: true })

  const toggleSection = (k) => setSections((s) => ({ ...s, [k]: !s[k] }))

  // Derive rows from the fetch + optimistic manual-subscriber edits. A
  // manual override only changes the 'manual' kind; 'regular' (real paid)
  // is read-only here, so an override never touches it.
  const rows = useMemo(() => (data?.rows || []).map((r) => {
    const o = subOverride[r.id]
    if (o === undefined) return r
    const kind = o ? 'manual' : (r.subscriber_kind === 'regular' ? 'regular' : null)
    return { ...r, subscriber_kind: kind, is_subscriber: !!kind }
  }), [data, subOverride])

  const applyToggle = async (u) => {
    const next = !(u.subscriber_kind === 'manual')
    setConfirmId(null)
    setBusy(u.id)
    setSubOverride((s) => ({ ...s, [u.id]: next })) // optimistic
    try {
      await callAdmin('set_subscriber', { user_id: u.id, value: next })
    } catch {
      setSubOverride((s) => ({ ...s, [u.id]: !next })) // rollback
    } finally {
      setBusy(null)
    }
  }

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return rows
    return rows.filter((r) => (r.email || '').toLowerCase().includes(needle))
  }, [rows, q])

  const subs = visible.filter((r) => r.is_subscriber)
  const manual = visible.filter((r) => r.subscriber_kind === 'manual')
  const regular = visible.filter((r) => r.subscriber_kind === 'regular')

  /* Permanently delete a user (and all their data, via DB cascade). The row's
     typed-email confirmation already happened in the UI; refetch on success so
     the deleted user drops out of every section. */
  const handleDelete = async (id) => {
    await callAdmin('delete_user', { user_id: id })
    await refetch()
  }

  /* Promote / update perms / revoke admin. The edge function re-checks the
     caller's manage_admins perm and refuses self- or owner-targeting. */
  const handleSetAdmin = async (id, perms) => {
    await callAdmin('set_admin', { user_id: id, perms })
    await refetch()
  }
  const handleRevokeAdmin = async (id) => {
    await callAdmin('revoke_admin', { user_id: id })
    await refetch()
  }

  /* Set a user's subscription tier and/or beta exemption (new billing model —
     writes user_subscriptions). The edge fn re-checks the set_subscriber perm. */
  const handleSetSubscription = async (id, patch) => {
    await callAdmin('set_subscription', { user_id: id, ...patch })
    await refetch()
  }

  const rowProps = {
    openId: open,
    onToggleRow: (id) => setOpen(open === id ? null : id),
    confirmId,
    busy,
    onRequestConfirm: (id) => setConfirmId(id),
    onCancelConfirm: () => setConfirmId(null),
    onApply: applyToggle,
    onDelete: handleDelete,
    onSetAdmin: handleSetAdmin,
    onRevokeAdmin: handleRevokeAdmin,
    onSetSubscription: handleSetSubscription,
    viewerPerms,
    viewerId,
    t,
  }

  return (
    <>
      <Box as="header" className="admin-head">
        <Txt as="h1">{t('users.title')}</Txt>
        <Txt as="p">{t('users.subtitle')}</Txt>
      </Box>

      {loading && <Box className="admin-state">{t('state.loading')}</Box>}
      {error && <Box className="admin-state err">{t('state.loadError')}</Box>}

      {data && (
        <>
          <Box className="admin-search">
            <Search size={16} strokeWidth={1.8} aria-hidden="true" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('users.searchPlaceholder')} dir="ltr" />
          </Box>

          {/* Summary chips */}
          <Box className="admin-usum">
            <Txt className="admin-usum-chip"><Users size={14} strokeWidth={1.8} aria-hidden="true" />{t('users.summary.total')} <b>{visible.length}</b></Txt>
            <Txt className="admin-usum-chip"><BadgeCheck size={14} strokeWidth={1.8} aria-hidden="true" />{t('users.summary.subscribers')} <b>{subs.length}</b></Txt>
            <Txt className="admin-usum-chip sub"><Hand size={13} strokeWidth={1.8} aria-hidden="true" />{t('users.summary.manual')} <b>{manual.length}</b></Txt>
            <Txt className="admin-usum-chip sub"><CreditCard size={13} strokeWidth={1.8} aria-hidden="true" />{t('users.summary.regular')} <b>{regular.length}</b></Txt>
          </Box>

          {/* All users */}
          <Section icon={Users} title={t('users.sections.all')} count={visible.length} open={sections.all} onToggle={() => toggleSection('all')}>
            <UsersTable rows={visible} {...rowProps} />
          </Section>

          {/* Subscribers → manual + regular */}
          <Section icon={BadgeCheck} title={t('users.sections.subscribers')} count={subs.length} open={sections.subs} onToggle={() => toggleSection('subs')}>
            <Section nested icon={Hand} title={t('users.sections.manual')} count={manual.length} open={sections.manual} onToggle={() => toggleSection('manual')}>
              <UsersTable rows={manual} {...rowProps} emptyText={t('users.empty.manual')} />
            </Section>
            <Section nested icon={CreditCard} title={t('users.sections.regular')} count={regular.length} open={sections.regular} onToggle={() => toggleSection('regular')}>
              <UsersTable rows={regular} {...rowProps} emptyText={t('users.empty.regular')} />
            </Section>
          </Section>
        </>
      )}
    </>
  )
}

/* Collapsible section with a count summary in the header. */
function Section({ icon: Icon, title, count, open, onToggle, nested, children }) {
  return (
    <Box as="section" className={`admin-acc${nested ? ' nested' : ''}`}>
      <Btn type="button" className="admin-acc-head" onClick={onToggle} aria-expanded={open}>
        <ChevronDown size={16} strokeWidth={1.9} className="admin-acc-chev" style={{ transform: open ? 'none' : 'rotate(-90deg)' }} aria-hidden="true" />
        {Icon && <Icon size={16} strokeWidth={1.8} aria-hidden="true" />}
        <Txt className="admin-acc-title">{title}</Txt>
        <Txt className="admin-acc-count">{count}</Txt>
      </Btn>
      {open && <Box className="admin-acc-body">{children}</Box>}
    </Box>
  )
}

function UsersTable({ rows, openId, onToggleRow, confirmId, busy, onRequestConfirm, onCancelConfirm, onApply, onDelete, onSetAdmin, onRevokeAdmin, onSetSubscription, viewerPerms, viewerId, t, emptyText }) {
  return (
    <Box className="admin-card admin-table-wrap">
      <table className="admin-table">
        <thead>
          <tr>
            <th>{t('users.table.email')}</th>
            <th>{t('users.table.subscriber')}</th>
            <th>{t('users.table.joined')}</th>
            <th>{t('users.table.onboardingStage')}</th>
            <th>{t('users.table.reflections')}</th>
            <th>{t('users.table.sessions')}</th>
            <th>{t('users.table.marketing')}</th>
            <th>{t('users.table.lastActive')}</th>
            <th aria-label={t('users.table.expandAria')} style={{ width: 32 }}></th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={9} className="muted">{emptyText ?? t('users.empty.default')}</td></tr>}
          {rows.map((r) => (
            <UserRow
              key={r.id}
              r={r}
              isOpen={openId === r.id}
              confirming={confirmId === r.id}
              busy={busy === r.id}
              onToggle={() => onToggleRow(r.id)}
              onRequestConfirm={() => onRequestConfirm(r.id)}
              onCancelConfirm={onCancelConfirm}
              onApply={() => onApply(r)}
              onDelete={() => onDelete(r.id)}
              onSetAdmin={onSetAdmin}
              onRevokeAdmin={onRevokeAdmin}
              onSetSubscription={onSetSubscription}
              viewerPerms={viewerPerms}
              viewerId={viewerId}
              t={t}
            />
          ))}
        </tbody>
      </table>
    </Box>
  )
}

/* Subscriber cell: real (paid) → static read-only badge; otherwise a
   two-step toggle (click → confirm) so a flag never happens by accident. */
function SubCell({ r, confirming, busy, canToggle, onRequestConfirm, onCancelConfirm, onApply, t }) {
  if (r.subscriber_kind === 'regular') {
    return <Txt className="admin-sub-badge regular"><CreditCard size={12} strokeWidth={2} aria-hidden="true" /> {t('users.sub.regularBadge')}</Txt>
  }
  const on = r.subscriber_kind === 'manual'
  // Admins without the set_subscriber perm see a read-only state, no toggle.
  if (!canToggle) {
    return on ? <Txt className="admin-pill done">{t('users.sub.subscribed')}</Txt> : <Txt className="muted">—</Txt>
  }
  if (confirming) {
    return (
      <Txt className="admin-sub-confirm" onClick={(e) => e.stopPropagation()}>
        <Txt className="admin-sub-confirm-q">{on ? t('users.sub.askCancel') : t('users.sub.askMark')}</Txt>
        <Btn type="button" className="admin-sub-yes" disabled={busy} onClick={onApply} aria-label={t('users.sub.confirmAria')}><Check size={13} strokeWidth={2.4} /></Btn>
        <Btn type="button" className="admin-sub-no" onClick={onCancelConfirm} aria-label={t('users.sub.cancelAria')}><X size={13} strokeWidth={2.4} /></Btn>
      </Txt>
    )
  }
  return (
    <Btn
      type="button"
      className={`admin-sub-toggle${on ? ' on' : ''}`}
      disabled={busy}
      onClick={(e) => { e.stopPropagation(); onRequestConfirm() }}
      title={on ? t('users.sub.titleCancel') : t('users.sub.titleMark')}
    >
      {on ? <><BadgeCheck size={13} strokeWidth={2} aria-hidden="true" /> {t('users.sub.subscribed')}</> : <><Plus size={13} strokeWidth={2} aria-hidden="true" /> {t('users.sub.mark')}</>}
    </Btn>
  )
}

/* Tier + beta-exemption editor (set_subscriber perm). Reads-then-writes via
   the set_subscription action; resyncs to server state after a refetch. */
const SUB_TIERS = ['free', 'basic', 'premium']
const EXEMPT_MONTHS = [1, 3, 6, 12]   // quick-pick beta-exemption lengths
function SubscriptionBlock({ r, onSetSubscription, t }) {
  const [tier, setTier] = useState(r.subscription_tier || 'free')
  const [beta, setBeta] = useState(r.beta_exempt_until ? r.beta_exempt_until.slice(0, 10) : '')
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [err, setErr] = useState(false)
  const [confirming, setConfirming] = useState(false) // two-step save (sensitive: changes billing terms)
  /* Resync local drafts to the server values when they change (after refetch). */
  const sig = `${r.subscription_tier || 'free'}|${r.beta_exempt_until || ''}`
  const [syncedSig, setSyncedSig] = useState(sig)
  if (sig !== syncedSig) {
    setSyncedSig(sig)
    setTier(r.subscription_tier || 'free')
    setBeta(r.beta_exempt_until ? r.beta_exempt_until.slice(0, 10) : '')
    setConfirming(false)
  }
  const save = async () => {
    setBusy(true); setErr(false); setSaved(false)
    try {
      await onSetSubscription(r.id, { tier, beta_exempt_until: beta ? new Date(beta).toISOString() : null })
      setSaved(true)
    } catch { setErr(true) } finally { setBusy(false) }
  }
  /* Grant a beta exemption of N months from now (fills the date below). */
  const setBetaMonths = (n) => {
    const d = new Date()
    d.setMonth(d.getMonth() + n)
    setBeta(d.toISOString().slice(0, 10))
    setSaved(false); setConfirming(false)
  }
  return (
    <Box className="admin-role-block" onClick={(e) => e.stopPropagation()}>
      <Box className="admin-role-head">
        <Gem size={14} strokeWidth={1.9} aria-hidden="true" />
        <Txt>{t('users.subscription.heading')}</Txt>
      </Box>
      <Box className="admin-sub-tiers">
        {SUB_TIERS.map((tk) => (
          <Btn key={tk} type="button" className={`admin-pill${tier === tk ? ' done' : ''}`} onClick={() => { setTier(tk); setSaved(false); setConfirming(false) }}>
            {t('users.subscription.tiers.' + tk)}
          </Btn>
        ))}
      </Box>
      <Box className="admin-sub-exempt">
        <Txt>{t('users.subscription.grantExempt')}</Txt>
        {EXEMPT_MONTHS.map((n) => (
          <Btn key={n} type="button" className="admin-pill" onClick={() => setBetaMonths(n)}>
            {t('users.subscription.exemptM' + n)}
          </Btn>
        ))}
      </Box>
      <Box as="label" className="admin-sub-beta">
        <Txt>{t('users.subscription.betaUntil')}</Txt>
        <Input type="date" value={beta} onChange={(e) => { setBeta(e.target.value); setSaved(false); setConfirming(false) }} />
        {beta && <Btn type="button" className="admin-role-cancel" onClick={() => { setBeta(''); setSaved(false); setConfirming(false) }}>{t('users.subscription.clearBeta')}</Btn>}
      </Box>
      {err && <Txt as="p" className="admin-role-err">{t('users.subscription.failed')}</Txt>}
      {confirming ? (
        <>
          <Txt as="p" className="admin-role-warn">{t('users.subscription.confirmQ', { tier: t('users.subscription.tiers.' + tier) })}</Txt>
          <Box className="admin-role-actions">
            <Btn type="button" className="admin-role-cancel" onClick={() => setConfirming(false)}>{t('users.manage.cancel')}</Btn>
            <Btn type="button" className="admin-role-go" disabled={busy} onClick={async () => { await save(); setConfirming(false) }}>
              {busy ? t('users.subscription.saving') : t('users.manage.confirm')}
            </Btn>
          </Box>
        </>
      ) : (
        <Box className="admin-role-actions">
          <Btn type="button" className="admin-role-go" onClick={() => { setErr(false); setConfirming(true) }}>
            {saved ? t('users.subscription.saved') : t('users.subscription.save')}
          </Btn>
        </Box>
      )}
    </Box>
  )
}

function UserRow({ r, isOpen, confirming, busy, onToggle, onRequestConfirm, onCancelConfirm, onApply, onDelete, onSetAdmin, onRevokeAdmin, onSetSubscription, viewerPerms, viewerId, t }) {
  const [delOpen, setDelOpen] = useState(false)
  const [delText, setDelText] = useState('')
  const [delBusy, setDelBusy] = useState(false)
  const [delErr, setDelErr] = useState(false)
  const isOwner = (r.email || '').toLowerCase() === ADMIN_EMAIL
  const isSelf = r.id === viewerId
  const canManageAdmins = !!viewerPerms?.manage_admins && !isOwner && !isSelf
  const canDelete = !!r.email && delText.trim().toLowerCase() === r.email.toLowerCase()
  // Admin role-management state (promote / update perms / revoke).
  const [permDraft, setPermDraft] = useState(() => ({
    delete_users: !!r.admin_perms?.delete_users,
    set_subscriber: !!r.admin_perms?.set_subscriber,
    manage_admins: !!r.admin_perms?.manage_admins,
  }))
  /* Keep the checkboxes in sync with the server-side perms when they change
     (e.g. after a refetch following grant/revoke). The row is keyed by the
     stable r.id so it never remounts on its own — without this, a revoke would
     leave the boxes showing the pre-action perms. Adjusting state during render
     (not in an effect) is React's recommended way to reset state on a prop
     change. */
  const permsSig = `${!!r.admin_perms?.delete_users}|${!!r.admin_perms?.set_subscriber}|${!!r.admin_perms?.manage_admins}`
  const [syncedPermsSig, setSyncedPermsSig] = useState(permsSig)
  if (permsSig !== syncedPermsSig) {
    setSyncedPermsSig(permsSig)
    setPermDraft({
      delete_users: !!r.admin_perms?.delete_users,
      set_subscriber: !!r.admin_perms?.set_subscriber,
      manage_admins: !!r.admin_perms?.manage_admins,
    })
  }
  const [roleConfirm, setRoleConfirm] = useState(null) // null | 'grant' | 'revoke'
  const [roleBusy, setRoleBusy] = useState(false)
  const [roleErr, setRoleErr] = useState(false)
  const runSetAdmin = async () => {
    setRoleBusy(true); setRoleErr(false)
    try { await onSetAdmin(r.id, permDraft); setRoleConfirm(null) }
    catch { setRoleErr(true) }
    finally { setRoleBusy(false) }
  }
  const runRevoke = async () => {
    setRoleBusy(true); setRoleErr(false)
    try { await onRevokeAdmin(r.id); setRoleConfirm(null) }
    catch { setRoleErr(true) }
    finally { setRoleBusy(false) }
  }
  const runDelete = async () => {
    if (!canDelete || delBusy) return
    setDelBusy(true); setDelErr(false)
    try {
      await onDelete()
      // success → the user is refetched away and this row unmounts.
    } catch {
      setDelBusy(false); setDelErr(true)
    }
  }
  return (
    <>
      <tr className={`clickable${r.is_subscriber ? ' is-sub' : ''}`} onClick={onToggle}>
        <td dir="ltr" style={{ textAlign: 'start' }}>
          {r.email || '—'}
          {r.is_owner
            ? <Txt className="admin-role-chip owner" title={t('users.role.ownerTitle')}><ShieldCheck size={11} strokeWidth={2.2} aria-hidden="true" /> {t('users.role.ownerChip')}</Txt>
            : r.is_admin
              ? <Txt className="admin-role-chip" title={t('users.role.adminTitle')}><Shield size={11} strokeWidth={2.2} aria-hidden="true" /> {t('users.role.adminChip')}</Txt>
              : null}
        </td>
        <td>
          <SubCell
            r={r}
            confirming={confirming}
            busy={busy}
            canToggle={!!viewerPerms?.set_subscriber}
            onRequestConfirm={onRequestConfirm}
            onCancelConfirm={onCancelConfirm}
            onApply={onApply}
            t={t}
          />
        </td>
        <td>{fmtDate(r.created_at)}</td>
        <td><Txt className={`admin-pill${r.onboarding_done ? ' done' : ''}`}>{r.onboarding_label}</Txt></td>
        <td className="num">{r.reflections}</td>
        <td className="num">{r.sessions}</td>
        <td>{r.marketing_consent ? <Check size={15} strokeWidth={2.4} style={{ color: 'var(--sage)' }} aria-label={t('users.marketingConsentAria')} /> : <Txt className="muted">—</Txt>}</td>
        <td>{fmtLastActive(r.last_sign_in_at, t)}</td>
        <td>
          <ChevronDown size={16} strokeWidth={1.8}
            style={{ transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform .15s', color: 'var(--mist)' }}
            aria-hidden="true" />
        </td>
      </tr>
      {isOpen && (
        <tr className="admin-detail">
          <td colSpan={9}>
            <Box className="admin-detail-grid">
              <Box><Box className="k">{t('users.detail.subscriber')}</Box><Box className="v">{r.subscriber_kind === 'regular' ? t('users.detail.subscriberRegular') : r.subscriber_kind === 'manual' ? t('users.detail.subscriberManual') : t('users.detail.subscriberNone')}</Box></Box>
              <Box><Box className="k">{t('users.subscription.tier')}</Box><Box className="v">{t('users.subscription.tiers.' + (r.subscription_tier || 'free'))}{r.beta_exempt_until ? ` · ${t('users.subscription.betaUntil')} ${fmtDate(r.beta_exempt_until)}` : ''}{r.subscribed_at ? ` · ${t('users.subscription.since')} ${fmtDate(r.subscribed_at)}${r.locked_price != null ? ` (₪${r.locked_price})` : ''}` : ''}</Box></Box>
              <Box><Box className="k">{t('users.detail.onboardingStage')}</Box><Box className="v">{r.onboarding_done ? r.onboarding_label : t('users.detail.onboardingStopped', { label: r.onboarding_label })}</Box></Box>
              <Box><Box className="k">{t('users.detail.feedbackLeft')}</Box><Box className="v">{r.feedback_count > 0 ? t('users.detail.feedbackCount', { count: r.feedback_count }) : t('users.detail.feedbackNone')}</Box></Box>
              <Box><Box className="k">{t('users.detail.reflections')}</Box><Box className="v">{r.reflections}</Box></Box>
              <Box><Box className="k">{t('users.detail.sessions')}</Box><Box className="v">{r.sessions}</Box></Box>
              <Box><Box className="k">{t('users.detail.joined')}</Box><Box className="v">{fmtDate(r.created_at)}</Box></Box>
              <Box><Box className="k">{t('users.detail.lastSignIn')}</Box><Box className="v">{fmtLastActive(r.last_sign_in_at, t)}</Box></Box>
            </Box>
            <Box className="admin-detail-consents-h">{t('users.detail.consentsHeading')}</Box>
            <Box className="admin-detail-grid">
              <Box><Box className="k">{t('users.detail.privacy')}</Box><Box className="v">{fmtConsent(r.consent?.privacy, t)}</Box></Box>
              <Box><Box className="k">{t('users.detail.dpa')}</Box><Box className="v">{fmtConsent(r.consent?.dpa, t)}</Box></Box>
              <Box><Box className="k">{t('users.detail.terms')}</Box><Box className="v">{fmtConsent(r.consent?.terms, t)}</Box></Box>
              <Box><Box className="k">{t('users.detail.marketing')}</Box><Box className="v">{fmtMarketing(r, t)}</Box></Box>
            </Box>

            {/* Subscription management (tier + beta exemption) — for viewers
                with the set_subscriber perm. Writes the user_subscriptions table. */}
            {viewerPerms?.set_subscriber && (
              <SubscriptionBlock r={r} onSetSubscription={onSetSubscription} t={t} />
            )}

            {/* Admin role management — only for viewers who can manage admins,
                never on the owner row or your own row. Double confirmation:
                pick perms → button → warning panel → confirm. */}
            {canManageAdmins && (
              <Box className="admin-role-block" onClick={(e) => e.stopPropagation()}>
                <Box className="admin-role-head">
                  <Shield size={14} strokeWidth={1.9} aria-hidden="true" />
                  <Txt>{t('users.manage.heading')}</Txt>
                  {r.is_admin && <Txt className="admin-role-tag">{t('users.manage.tag')}</Txt>}
                </Box>

                {roleConfirm === null && (
                  <>
                    <Txt as="p" className="admin-role-hint">
                      {r.is_admin
                        ? t('users.manage.hintIsAdmin')
                        : t('users.manage.hintNotAdmin')}
                    </Txt>
                    <Box className="admin-role-perms">
                      {PERM_OPTIONS.map(({ key, labelKey }) => (
                        <Box as="label" key={key} className="admin-role-perm">
                          <Input
                            type="checkbox"
                            checked={permDraft[key]}
                            onChange={(e) => setPermDraft((d) => ({ ...d, [key]: e.target.checked }))}
                          />
                          <Txt>{t(`users.perms.${labelKey}`)}</Txt>
                        </Box>
                      ))}
                    </Box>
                    <Box className="admin-role-actions">
                      <Btn type="button" className="admin-role-go" onClick={() => { setRoleErr(false); setRoleConfirm('grant') }}>
                        <ShieldCheck size={13} strokeWidth={2} aria-hidden="true" />
                        {r.is_admin ? t('users.manage.update') : t('users.manage.makeAdmin')}
                      </Btn>
                      {r.is_admin && (
                        <Btn type="button" className="admin-role-revoke" onClick={() => { setRoleErr(false); setRoleConfirm('revoke') }}>
                          {t('users.manage.removeAdmin')}
                        </Btn>
                      )}
                    </Box>
                  </>
                )}

                {roleConfirm === 'grant' && (
                  <Box className="admin-role-confirm">
                    <Txt as="p" className="admin-role-warn">
                      {r.is_admin ? t('users.manage.grantWarnUpdatePre') : t('users.manage.grantWarnMakePre')}
                      <b dir="ltr">{r.email}</b>
                      {r.is_admin ? t('users.manage.grantWarnUpdatePost') : t('users.manage.grantWarnMakePost')}
                    </Txt>
                    <Box as="ul" className="admin-role-summary">
                      {PERM_OPTIONS.map(({ key, labelKey }) => (
                        <Box as="li" key={key} className={permDraft[key] ? 'on' : 'off'}>
                          {permDraft[key] ? <Check size={12} strokeWidth={2.4} aria-hidden="true" /> : <X size={12} strokeWidth={2.4} aria-hidden="true" />}
                          {t(`users.perms.${labelKey}`)}
                        </Box>
                      ))}
                    </Box>
                    {roleErr && <Txt as="p" className="admin-role-err">{t('users.manage.actionFailed')}</Txt>}
                    <Box className="admin-role-actions">
                      <Btn type="button" className="admin-role-cancel" onClick={() => { setRoleConfirm(null); setRoleErr(false) }}>{t('users.manage.cancel')}</Btn>
                      <Btn type="button" className="admin-role-go" disabled={roleBusy} onClick={runSetAdmin}>
                        {roleBusy ? t('users.manage.saving') : t('users.manage.confirm')}
                      </Btn>
                    </Box>
                  </Box>
                )}

                {roleConfirm === 'revoke' && (
                  <Box className="admin-role-confirm">
                    <Txt as="p" className="admin-role-warn">
                      {t('users.manage.revokeWarnPre')}<b dir="ltr">{r.email}</b>{t('users.manage.revokeWarnPost')}
                    </Txt>
                    {roleErr && <Txt as="p" className="admin-role-err">{t('users.manage.actionFailed')}</Txt>}
                    <Box className="admin-role-actions">
                      <Btn type="button" className="admin-role-cancel" onClick={() => { setRoleConfirm(null); setRoleErr(false) }}>{t('users.manage.cancel')}</Btn>
                      <Btn type="button" className="admin-role-revoke" disabled={roleBusy} onClick={runRevoke}>
                        {roleBusy ? t('users.manage.removing') : t('users.manage.removeAdmin')}
                      </Btn>
                    </Box>
                  </Box>
                )}
              </Box>
            )}

            {!isOwner && !isSelf && viewerPerms?.delete_users && (
              <Box className="admin-detail-danger">
                {!delOpen ? (
                  <Btn type="button" className="admin-del-btn" onClick={(e) => { e.stopPropagation(); setDelOpen(true) }}>
                    <Trash2 size={13} strokeWidth={2} aria-hidden="true" /> {t('users.delete.button')}
                  </Btn>
                ) : (
                  <Box className="admin-del-confirm" onClick={(e) => e.stopPropagation()}>
                    <Txt as="p" className="admin-del-warn">
                      {t('users.delete.warnPre')}<b dir="ltr">{r.email}</b>{t('users.delete.warnPost')}
                    </Txt>
                    <Input
                      className="admin-del-input"
                      dir="ltr"
                      value={delText}
                      onChange={(e) => { setDelText(e.target.value); setDelErr(false) }}
                      placeholder={r.email}
                      autoComplete="off"
                    />
                    {delErr && <Txt as="p" className="admin-del-err">{t('users.delete.failed')}</Txt>}
                    <Box className="admin-del-actions">
                      <Btn type="button" className="admin-del-cancel" onClick={() => { setDelOpen(false); setDelText(''); setDelErr(false) }}>{t('users.delete.cancel')}</Btn>
                      <Btn type="button" className="admin-del-go" disabled={!canDelete || delBusy} onClick={runDelete}>
                        {delBusy ? t('users.delete.deleting') : t('users.delete.confirm')}
                      </Btn>
                    </Box>
                  </Box>
                )}
              </Box>
            )}
          </td>
        </tr>
      )}
    </>
  )
}
