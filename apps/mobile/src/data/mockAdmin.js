/* ════════════════════════════════════════════════════════════════
   ADMIN CONSOLE FIXTURES — preview only.
   ════════════════════════════════════════════════════════════════
   The console's every figure comes from the `admin` edge function,
   which cannot run under the mock — it needs the service_role key and
   a real database. So the payloads are synthesised here instead, one
   per action, close enough in shape that the four tabs render and
   behave end-to-end.

   Adapted from apps/web/src/lib/mockSupabase.js, which does the same
   for the web console. Kept as fixtures on each side rather than moved
   to core on purpose: this is scaffolding whose whole job is to be
   dropped from the production bundle (`__DEV__` here, `import.meta.env.DEV`
   there), and a shared package is the wrong place for something that
   must not ship.

   Built lazily and cached, so an edit made in preview — a status
   change, a promotion, a deletion — sticks until reload.
   ════════════════════════════════════════════════════════════════ */

const dayISO = (offset) => {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  return d.toISOString().slice(0, 10)
}

/* Mirrors ONBOARDING_STEPS / STEP_LABELS in supabase/functions/admin/index.ts,
   which is what the real console reports. The flow is four steps and a
   close; a longer list here would make the funnel and the per-user stage
   disagree with each other. */
const STEP_LABELS = ['פרופיל', 'פרויקטים', 'לקוחות', 'יעדים', 'סיום']

let MOCK_ADMIN = null

function fixtures() {
  if (MOCK_ADMIN) return MOCK_ADMIN
  const names = ['dana', 'yossi', 'maya', 'avi', 'noa', 'tom', 'rina', 'omer', 'lior', 'shira', 'gal', 'eden']
  const users = names.map((n, i) => ({
    id: `u${i}`,
    email: `${n}@example.com`,
    created_at: dayISO(-(i * 6 + 2)),
    last_sign_in_at: i % 5 === 0 ? dayISO(-20) : dayISO(-(i % 7)),
    onboarding_index: i === 0 ? STEP_LABELS.length : (i % STEP_LABELS.length),
    onboarding_label: i === 0 ? 'הושלם' : STEP_LABELS[i % STEP_LABELS.length],
    onboarding_done: i === 0,
    reflections: Math.max(0, 14 - i * 2),
    sessions: Math.max(0, 30 - i * 3),
    feedback_count: i % 3 === 0 ? 1 : 0,
    marketing_consent: i % 2 === 0,
    /* Latest consent per kind. The last user has not re-accepted the
       terms, so that row renders "—" and the empty case gets seen. */
    consent: {
      privacy: { version: '1.0', accepted: true, accepted_at: dayISO(-(i * 6 + 2)) },
      dpa: { version: '1.0', accepted: true, accepted_at: dayISO(-(i * 6 + 2)) },
      ...(i === names.length - 1 ? {} : { terms: { version: '1.0', accepted: true, accepted_at: dayISO(-(i % 4)) } }),
      marketing: { version: null, accepted: i % 2 === 0, accepted_at: dayISO(-(i * 6 + 2)) },
    },
    _paid: i === 0,     // a real (paid) subscriber
    _manual: i === 1,   // an owner-flagged one
    _admin: i === 2,    // already promoted, so the chip + revoke flow render
    _adminPerms: i === 2
      ? { delete_users: true, set_subscriber: true, manage_admins: false }
      : { delete_users: false, set_subscriber: false, manage_admins: false },
  }))

  const feedback = [
    { type: 'bug', status: 'new', message: 'הכפתור של הוספת לקוח לא נפתח במובייל.', classification: 'bug', surface: 'technical', platform: 'mobile' },
    { type: 'idea', status: 'new', message: 'אשמח לראות ייצוא לאקסל של הדוחות.', classification: 'dev', surface: 'technical', platform: 'desktop' },
    { type: 'praise', status: 'in_progress', message: 'אפליקציה מהממת, עוזרת לי כל יום!', classification: null, surface: null, platform: 'both' },
    { type: 'bug', status: 'done', message: 'תאריך הפגישה הוצג לא נכון.', classification: 'bug', surface: 'technical', platform: 'desktop' },
    { type: 'other', status: 'new', message: 'איך מוחקים קבוצה?', classification: 'unclear', surface: null, platform: 'unknown' },
    { type: 'idea', status: 'in_progress', message: 'תזכורות גם בוואטסאפ יהיה אדיר.', classification: 'dev', surface: 'both', platform: 'mobile' },
  ].map((f, i) => ({ id: `f${i}`, email: users[i % users.length].email, created_at: dayISO(-i), source: 'app', title: null, notes: null, ...f }))

  const buckets = (days, max) => {
    const out = []
    for (let d = days; d >= 0; d--) out.push({ date: dayISO(-d), count: Math.round(Math.abs(Math.sin(d)) * max) })
    return out
  }

  MOCK_ADMIN = { users, feedback, buckets }
  return MOCK_ADMIN
}

export function adminInvoke(body) {
  const { action } = body || {}
  const fx = fixtures()
  const kindOf = (u) => (u._paid ? 'regular' : u._manual ? 'manual' : null)

  if (action === 'dashboard') {
    return {
      ok: true,
      totals: {
        totalUsers: fx.users.length,
        subscribers: fx.users.filter((u) => u._paid || u._manual).length,
        active7d: 7,
        openFeedback: fx.feedback.filter((f) => f.status !== 'done').length,
        sessionsThisWeek: 23,
      },
      signups: Array.from({ length: 12 }, (_, i) => ({ weekStart: dayISO(-(11 - i) * 7), count: Math.round(2 + Math.abs(Math.sin(i)) * 5) })),
    }
  }

  if (action === 'users') {
    return {
      ok: true,
      rows: fx.users.map((u) => ({
        ...u,
        subscriber_kind: kindOf(u),
        is_subscriber: !!kindOf(u),
        subscription_tier: u._tier || (u._paid ? 'premium' : 'free'),
        beta_exempt_until: u._betaUntil ?? (u._manual ? new Date(Date.now() + 90 * 86400000).toISOString() : null),
        subscribed_at: u._subAt ?? (u._paid ? new Date(Date.now() - 60 * 86400000).toISOString() : null),
        locked_price: u._lockedPrice ?? (u._paid ? 89 : null),
        is_owner: false, // none of the example users is the hardcoded owner
        is_admin: !!u._admin,
        admin_perms: u._adminPerms || { delete_users: false, set_subscriber: false, manage_admins: false },
      })),
      caller: { is_owner: false, perms: { delete_users: true, set_subscriber: true, manage_admins: true } },
    }
  }

  if (action === 'set_subscriber') {
    const u = fx.users.find((x) => x.id === body.user_id)
    if (u) u._manual = !!body.value
    return { ok: true, is_subscriber: u ? !!kindOf(u) : false }
  }

  if (action === 'set_admin') {
    const u = fx.users.find((x) => x.id === body.user_id)
    if (u) {
      u._admin = true
      u._adminPerms = {
        delete_users: !!body.perms?.delete_users,
        set_subscriber: !!body.perms?.set_subscriber,
        manage_admins: !!body.perms?.manage_admins,
      }
    }
    return { ok: true, role: 'admin', admin_perms: u?._adminPerms }
  }

  if (action === 'revoke_admin') {
    const u = fx.users.find((x) => x.id === body.user_id)
    if (u) { u._admin = false; u._adminPerms = { delete_users: false, set_subscriber: false, manage_admins: false } }
    return { ok: true }
  }

  if (action === 'delete_user') {
    const idx = fx.users.findIndex((x) => x.id === body.user_id)
    if (idx >= 0) fx.users.splice(idx, 1)
    return { ok: true }
  }

  if (action === 'feedback_list') return { ok: true, items: fx.feedback }

  if (action === 'feedback_update' || action === 'feedback_update_status') {
    const row = fx.feedback.find((f) => f.id === body.id)
    if (row) {
      for (const k of ['status', 'classification', 'surface', 'title', 'notes']) {
        if (body[k] !== undefined) row[k] = body[k]
      }
    }
    return { ok: true }
  }

  if (action === 'feedback_delete') {
    const ids = new Set(body.ids || [])
    MOCK_ADMIN.feedback = fx.feedback.filter((f) => !ids.has(f.id))
    return { ok: true, deleted: ids.size }
  }

  if (action === 'analytics') {
    /* The edge function's five windows. 120 days of fixtures stand in for
       "since the first row", and every card scales with the window so the
       range pills visibly bite instead of redrawing the same chart. */
    const span = body.range === 'today' ? 0
      : body.range === 'week' ? 7
      : body.range === 'month' ? new Date().getDate() - 1
      : body.range === 'all' ? 120
      : 30
    const scale = (n) => Math.max(1, Math.round((n * (span + 1)) / 31))
    return {
      ok: true,
      range: body.range,
      totalUsers: fx.users.length,
      sessionsOverTime: fx.buckets(span, 8),
      reflectionsOverTime: fx.buckets(span, 5),
      funnel: STEP_LABELS.map((label, i) => ({ step: String(i), label, count: scale((fx.users.length - i) * 5) })),
      landingFunnel: [
        { label: 'כניסות לדף', count: scale(310) },
        { label: 'התחילו הרשמה', count: scale(62) },
        { label: 'השלימו הרשמה', count: scale(19) },
      ],
      landingEngagement: [
        { label: 'גללו לאמצע', count: scale(180) },
        { label: 'גללו לרובו', count: scale(120) },
        { label: 'הגיעו לתחתית', count: scale(70) },
        { label: 'פתחו שאלות נפוצות', count: scale(40) },
        { label: 'קראו לעומק (30ש+)', count: scale(55) },
      ],
      topUsers: fx.users.slice(0, 10).map((u) => ({ email: u.email, sessions: u.sessions })),
    }
  }

  return { ok: true }
}
