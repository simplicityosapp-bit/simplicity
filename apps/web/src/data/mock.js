/* ════════════════════════════════════════════════════════════════
   MOCK DATA — Simplicity (dev only, pre-Supabase)
   ════════════════════════════════════════════════════════════════
   דאטה לדוגמה לפיתוח קומפוננטות לפני חיבור Supabase.
   מבוסס על HTML for MVP/data md/data-model.md + src/lib/enums.js.

   מוסכמות:
   - id        → UUID אמיתי דרך crypto.randomUUID()
   - user_id   → קבוע 'mock-user-001'
   - שמות שדות → snake_case (לפי data-model.md)
   - תאריכים   → relative ל-today. שדה מסוג `date` → 'YYYY-MM-DD';
                 שדה `timestamptz` → ISO מלא.
   - FK        → דרך אינדקסי המערכים (clients[0].id וכו') לעקביות.

   ⚠️ נוספו 2 ישויות שאינן ברשימת הפרומפט אך נדרשות לקוהרנטיות:
      group_members (D20 — מקור האמת לחברות) ו-lead_sources (FK של leads.source_id).
   ════════════════════════════════════════════════════════════════ */

const uid = () => crypto.randomUUID()
const USER = 'mock-user-001'

const now = Date.now()
const DAY = 86400000
const iso = (ms) => new Date(ms).toISOString()
const daysAgo = (n) => iso(now - n * DAY)        // timestamptz
const daysFromNow = (n) => iso(now + n * DAY)    // timestamptz
const endAfter = (days, mins) => iso(now + days * DAY + mins * 60000) // start+duration
const dateAgo = (n) => daysAgo(n).slice(0, 10)   // date (YYYY-MM-DD)
const dateFromNow = (n) => daysFromNow(n).slice(0, 10)
const _D = new Date()
const monthDay = (day) => new Date(_D.getFullYear(), _D.getMonth(), day, 12).toISOString().slice(0, 10)

/* ── categories (finance) — אין שדה type בסכמה; ההבחנה הכנסה/הוצאה לפי שימוש ── */
export const categories = [
  { id: uid(), user_id: USER, name: 'ייעוץ פרטי', color: '#8BA888' },
  { id: uid(), user_id: USER, name: 'שכירות סטודיו', color: '#B5634E' },
]

/* ── projects — אחד פרטי, אחד "קבוצתי" (מחזיק קבוצות) ── */
export const projects = [
  { id: uid(), user_id: USER, name: 'טיפול פרטני', color: '#0e9888', created_at: daysAgo(300) },
  { id: uid(), user_id: USER, name: 'סדנאות קבוצתיות', color: '#0099aa', created_at: daysAgo(200) },
]

/* ── groups — אחת פעילה, אחת שהסתיימה ── */
export const groups = [
  { id: uid(), user_id: USER, project_id: projects[1].id, name: 'מעגל בוקר', color: '#0099aa', package_price: 1600, package_sessions: 8, recurring_day: 0, recurring_time: '10:00', status: 'active', created_at: daysAgo(120), updated_at: daysAgo(10), deleted_at: null },
  { id: uid(), user_id: USER, project_id: projects[1].id, name: 'סדנת חורף', color: '#7a5cb8', package_price: 1200, package_sessions: 6, recurring_day: 3, recurring_time: '18:00', status: 'ended', created_at: daysAgo(280), updated_at: daysAgo(60), deleted_at: null },
]

/* ── client_statuses — תת-סטטוס ברירת-מחדל אחד לכל meta_category ── */
export const client_statuses = [
  { id: uid(), user_id: USER, meta_category: 'active', display_name: 'פעיל׌', icon: '🟢', is_default: true, created_at: daysAgo(300), updated_at: daysAgo(300), deleted_at: null },
  { id: uid(), user_id: USER, meta_category: 'wandering', display_name: 'ביניים', icon: '🟡', is_default: true, created_at: daysAgo(300), updated_at: daysAgo(300), deleted_at: null },
  { id: uid(), user_id: USER, meta_category: 'past', display_name: 'לשעבר', icon: '⚫', is_default: true, created_at: daysAgo(300), updated_at: daysAgo(300), deleted_at: null },
  { id: uid(), user_id: USER, meta_category: 'no_status', display_name: 'ללא סטטוס', icon: '⚪', is_default: true, created_at: daysAgo(300), updated_at: daysAgo(300), deleted_at: null },
]

/* ── lead_statuses — ברירת-מחדל אחת לכל meta_category ── */
export const lead_statuses = [
  { id: uid(), user_id: USER, meta_category: 'in_process', display_name: 'חדש', color: '#7a5cb8', icon: '✨', is_default: true, legacy_key: 'new', created_at: daysAgo(200), deleted_at: null },
  { id: uid(), user_id: USER, meta_category: 'converted', display_name: 'הומר ללקוח', color: '#8BA888', icon: '🤝', is_default: true, legacy_key: 'closed', created_at: daysAgo(200), deleted_at: null },
  { id: uid(), user_id: USER, meta_category: 'not_relevant', display_name: 'לא רלוונטי', color: '#B5634E', icon: '✕', is_default: true, legacy_key: null, created_at: daysAgo(200), deleted_at: null },
  { id: uid(), user_id: USER, meta_category: 'not_relevant', display_name: 'רפאים', color: '#A8A097', icon: '🌫', is_default: false, legacy_key: 'ghost', created_at: daysAgo(200), deleted_at: null },
]

/* ── lead_sources (נוסף — FK של leads.source_id) ── */
export const lead_sources = [
  { id: uid(), user_id: USER, name: 'אינסטגרם', color: '#7a5cb8', created_at: daysAgo(150) },
  { id: uid(), user_id: USER, name: 'המלצה', color: '#8BA888', created_at: daysAgo(150) },
]

/* ── meeting_types (migration 0043 — FK של clients.meeting_type_id) ── */
export const meeting_types = [
  { id: uid(), user_id: USER, name: 'פיזית', default_price: 380, color: null, sort_order: 0, created_at: daysAgo(150), updated_at: daysAgo(150), deleted_at: null },
  { id: uid(), user_id: USER, name: 'אונליין', default_price: 300, color: null, sort_order: 1, created_at: daysAgo(150), updated_at: daysAgo(150), deleted_at: null },
]

/* ── clients — 5 מצבים שונים ── */
export const clients = [
  // 0 — פעיל, פרטי, חשבון חלקי (12 פגישות, חלקן שולמו)
  { id: uid(), user_id: USER, name: 'רעות מדיון', status: 'active', status_id: client_statuses[0].id, status_meta: 'active', project_id: projects[0].id, group_id: null, sessions: 12, price_per_session: 380, total_override: null, has_custom_price: false, meeting_type_id: meeting_types[0].id, price_overridden: false, recurring_day: 1, recurring_time: '18:00', left_mid_process: false, phone: '052-1234567', notes: 'עובדים על קצב פנימי.', notes_updated_at: daysAgo(5), created_at: daysAgo(220) },
  // 1 — ביניים
  { id: uid(), user_id: USER, name: 'יעל אריאל', status: 'wandering', status_id: client_statuses[1].id, status_meta: 'wandering', project_id: projects[0].id, group_id: null, sessions: 6, price_per_session: 380, total_override: null, has_custom_price: false, meeting_type_id: meeting_types[0].id, price_overridden: false, recurring_day: null, recurring_time: null, left_mid_process: false, phone: '052-7778899', notes: 'סיימה חבילה — לא חזרה לחדש.', notes_updated_at: daysAgo(40), created_at: daysAgo(150) },
  // 2 — לשעבר
  { id: uid(), user_id: USER, name: 'אסף ברק', status: 'past', status_id: client_statuses[2].id, status_meta: 'past', project_id: projects[0].id, group_id: null, sessions: 20, price_per_session: 350, total_override: null, has_custom_price: false, recurring_day: null, recurring_time: null, left_mid_process: false, phone: null, notes: 'סיים מסע של 20 פגישות.', notes_updated_at: daysAgo(60), created_at: daysAgo(330) },
  // 3 — ללא סטטוס (פנייה טרייה)
  { id: uid(), user_id: USER, name: 'דניאל רגב', status: 'no_status', status_id: client_statuses[3].id, status_meta: 'no_status', project_id: null, group_id: null, sessions: 0, price_per_session: 0, total_override: null, has_custom_price: false, recurring_day: null, recurring_time: null, left_mid_process: false, phone: '050-1239876', notes: null, notes_updated_at: null, created_at: daysAgo(10) },
  // 4 — חבר קבוצה (מעגל בוקר)
  { id: uid(), user_id: USER, name: 'נופר אדמון', status: 'active', status_id: client_statuses[0].id, status_meta: 'active', status_overridden: false, project_id: projects[1].id, group_id: groups[0].id, sessions: 8, price_per_session: 0, total_override: 1600, has_custom_price: false, recurring_day: null, recurring_time: null, left_mid_process: false, phone: '052-3334455', notes: null, notes_updated_at: null, created_at: daysAgo(90) },
  // 5 — הייתה בקבוצה שהסתיימה (סדנת חורף) ועברה לתהליך אישי; הסטטוס נדרס ידנית ל'פעיל' (הקבוצה הייתה נותנת 'לשעבר'), והנתונים מהקבוצה נשמרים
  { id: uid(), user_id: USER, name: 'שירה כהן', status: 'active', status_id: client_statuses[0].id, status_meta: 'active', status_overridden: true, project_id: projects[1].id, group_id: groups[1].id, sessions: 4, price_per_session: 380, total_override: null, has_custom_price: false, meeting_type_id: meeting_types[0].id, price_overridden: false, recurring_day: null, recurring_time: null, left_mid_process: false, phone: '053-2223344', notes: 'סיימה את סדנת החורף, ממשיכה בתהליך אישי.', notes_updated_at: daysAgo(8), created_at: daysAgo(200) },
]

/* ── group_members (נוסף — D20, חברות של נופר במעגל בוקר) ── */
export const group_members = [
  { id: uid(), user_id: USER, group_id: groups[0].id, client_id: clients[4].id, joined_at: daysAgo(90), left_at: null, total_override: 1600, has_custom_price: false, package_sessions_override: 8, left_mid_process: false, created_at: daysAgo(90), updated_at: daysAgo(90), deleted_at: null },
  // שירה — חברה בקבוצה שהסתיימה (סדנת חורף); נשארת חברה כדי שהנתונים יישמרו, אך הסטטוס נדרס ידנית
  { id: uid(), user_id: USER, group_id: groups[1].id, client_id: clients[5].id, joined_at: daysAgo(200), left_at: null, total_override: null, has_custom_price: false, package_sessions_override: null, left_mid_process: false, created_at: daysAgo(200), updated_at: daysAgo(60), deleted_at: null },
]

/* ── recurring_templates — תבנית חודשית פעילה ── */
export const recurring_templates = [
  { id: uid(), user_id: USER, amount: 380, type: 'income', desc: 'מנוי חודשי — רעות', project_id: projects[0].id, client_id: clients[0].id, category_id: categories[0].id, cadence_type: 'monthly_date', day_of_month: 1, day_of_week: null, until_date: null, active: true, created_at: daysAgo(100), updated_at: daysAgo(10) },
]

/* ── transactions — confirmed income / pending income / confirmed expense / skipped ── */
export const transactions = [
  { id: uid(), user_id: USER, amount: 380, type: 'income', desc: 'פגישה — רעות', date: dateAgo(3), created_at: daysAgo(3), status: 'confirmed', project_id: projects[0].id, client_id: clients[0].id, category_id: categories[0].id, payment_method: 'bank_transfer', recurring_id: null, orphaned_from: null },
  { id: uid(), user_id: USER, amount: 380, type: 'income', desc: 'מנוי חודשי — ממתין לאישור', date: dateAgo(0), created_at: daysAgo(0), status: 'pending', project_id: projects[0].id, client_id: clients[0].id, category_id: categories[0].id, recurring_id: recurring_templates[0].id, orphaned_from: null },
  { id: uid(), user_id: USER, amount: 1200, type: 'expense', desc: 'שכירות סטודיו', date: dateAgo(15), created_at: daysAgo(15), status: 'confirmed', project_id: null, client_id: null, category_id: categories[1].id, recurring_id: null, orphaned_from: null },
  { id: uid(), user_id: USER, amount: 380, type: 'income', desc: 'מנוי שדולג', date: dateAgo(33), created_at: daysAgo(33), status: 'skipped', project_id: projects[0].id, client_id: clients[1].id, category_id: categories[0].id, recurring_id: recurring_templates[0].id, orphaned_from: null },
]

/* ── tasks — high todo / medium done / low todo ── */
export const tasks = [
  { id: uid(), user_id: USER, title: 'להכין חומרים לסדנת בוקר', priority: 'high', status: 'todo', project_id: projects[1].id, client_id: null, created_at: daysAgo(2), completed_at: null },
  { id: uid(), user_id: USER, title: 'לשלוח סיכום פגישה לרעות', priority: 'medium', status: 'done', project_id: projects[0].id, client_id: clients[0].id, created_at: daysAgo(8), completed_at: daysAgo(6) },
  { id: uid(), user_id: USER, title: 'לעדכן טקסט באתר', priority: 'low', status: 'todo', project_id: null, client_id: null, created_at: daysAgo(1), completed_at: null },
]

/* ── leads — in_process / converted / ghost ── */
export const leads = [
  { id: uid(), user_id: USER, name: 'מירב כהן', phone: '054-1112233', source_id: lead_sources[0].id, status: 'new', status_id: lead_statuses[0].id, status_meta: 'in_process', inquiry_date: dateAgo(5), follow_up_date: dateFromNow(2), last_status_changed_at: daysAgo(5), notes: 'מעוניינת בליווי אישי.', created_at: daysAgo(5), converted_to_client_id: null, converted_at: null },
  { id: uid(), user_id: USER, name: 'תום לוי', phone: '050-9998877', source_id: lead_sources[1].id, status: 'closed', status_id: lead_statuses[1].id, status_meta: 'converted', inquiry_date: dateAgo(60), follow_up_date: null, last_status_changed_at: daysAgo(40), notes: null, created_at: daysAgo(60), converted_to_client_id: clients[0].id, converted_at: daysAgo(40) },
  { id: uid(), user_id: USER, name: 'נועה שחר', phone: null, source_id: lead_sources[0].id, status: 'new', status_id: lead_statuses[3].id, status_meta: 'not_relevant', inquiry_date: dateAgo(80), follow_up_date: null, last_status_changed_at: daysAgo(50), notes: 'לא הגיבה לפניות.', created_at: daysAgo(80), converted_to_client_id: null, converted_at: null },
  /* Pending public-page submission (preview): surfaces in the review section
     + the home "דורש תשומת לב" widget, NOT in the kanban / stats. */
  { id: uid(), user_id: USER, name: 'דניאל אברהם', phone: '052-7654321', email: 'daniel@example.com', page_id: 'mock-lead-page-1', pending_review: true, data: { field_1: 'אינסטגרם' }, source_id: null, status: 'new', status_id: null, status_meta: 'in_process', inquiry_date: dateAgo(0), follow_up_date: null, last_status_changed_at: daysAgo(0), notes: 'הגעתי דרך הסטורי שלכם', created_at: daysAgo(0), converted_to_client_id: null, converted_at: null },
]

/* ── sessions — פרטי + קבוצתי (polymorphic subject_type/subject_id) ── */
export const sessions = [
  { id: uid(), user_id: USER, client_id: clients[0].id, group_id: null, subject_type: 'client', subject_id: clients[0].id, date: daysAgo(7), notes: 'התקדמות יפה בקצב.', summary: 'עבדנו על גבולות ופניות. צעד הבא: תרגול יומי.', num: 11 },
  { id: uid(), user_id: USER, client_id: null, group_id: groups[0].id, subject_type: 'group', subject_id: groups[0].id, date: daysAgo(4), notes: null, summary: 'מפגש קבוצתי רביעי — נוכחות מלאה.', num: 4 },
]

/* ── scheduled_meetings — פגישה עתידית ממתינה ── */
export const scheduled_meetings = [
  { id: uid(), user_id: USER, subject_type: 'client', subject_id: clients[0].id, scheduled_at: daysFromNow(2), status: 'pending', session_id: null, created_at: daysAgo(1) },
]

/* ── calendar_events — Google Calendar sync (preview): grouped by EVERY
   identified entity (client / project / lead / group). g-1 is matched to
   both a client and a project, so it appears under both. Plus a lead match,
   a group match, an unidentified event and an all-day one. ── */
export const calendar_events = [
  { id: uid(), user_id: USER, google_event_id: 'g-1', client_id: clients[0].id, project_id: projects[0].id, lead_id: null, group_id: null, title: 'פגישה עם רעות מדיון', start_time: daysFromNow(1), end_time: endAfter(1, 50), all_day: false, duration_minutes: 50, confidence_score: 0.92, matched_manually: false, created_at: daysAgo(1), updated_at: daysAgo(1), deleted_at: null },
  { id: uid(), user_id: USER, google_event_id: 'g-2', client_id: clients[0].id, project_id: null, lead_id: null, group_id: null, title: 'מעקב — רעות', start_time: daysFromNow(8), end_time: endAfter(8, 50), all_day: false, duration_minutes: 50, confidence_score: 0.85, matched_manually: false, created_at: daysAgo(1), updated_at: daysAgo(1), deleted_at: null },
  { id: uid(), user_id: USER, google_event_id: 'g-3', client_id: null, project_id: projects[1].id, lead_id: null, group_id: null, title: 'סדנת בוקר — קבוצה', start_time: daysFromNow(3), end_time: endAfter(3, 90), all_day: false, duration_minutes: 90, confidence_score: 0.8, matched_manually: false, created_at: daysAgo(1), updated_at: daysAgo(1), deleted_at: null },
  { id: uid(), user_id: USER, google_event_id: 'g-6', client_id: null, project_id: null, lead_id: leads[0].id, group_id: null, title: 'שיחת היכרות — מירב כהן', start_time: daysFromNow(2), end_time: endAfter(2, 30), all_day: false, duration_minutes: 30, confidence_score: 0.78, matched_manually: false, created_at: daysAgo(1), updated_at: daysAgo(1), deleted_at: null },
  { id: uid(), user_id: USER, google_event_id: 'g-7', client_id: null, project_id: null, lead_id: null, group_id: groups[0].id, title: 'מעגל בוקר', start_time: daysFromNow(4), end_time: endAfter(4, 90), all_day: false, duration_minutes: 90, confidence_score: 0.83, matched_manually: false, created_at: daysAgo(1), updated_at: daysAgo(1), deleted_at: null },
  { id: uid(), user_id: USER, google_event_id: 'g-4', client_id: null, project_id: null, lead_id: null, group_id: null, title: 'רופא שיניים', start_time: daysFromNow(2), end_time: endAfter(2, 30), all_day: false, duration_minutes: 30, confidence_score: 0, matched_manually: false, created_at: daysAgo(1), updated_at: daysAgo(1), deleted_at: null },
  { id: uid(), user_id: USER, google_event_id: 'g-5', client_id: null, project_id: null, lead_id: null, group_id: null, title: 'חופשה', start_time: daysFromNow(10), end_time: daysFromNow(11), all_day: true, duration_minutes: null, confidence_score: 0, matched_manually: false, created_at: daysAgo(1), updated_at: daysAgo(1), deleted_at: null },
]

/* ── goal_categories — auto אחת, manual שתיים ── */
export const goal_categories = [
  { id: uid(), user_id: USER, key: 'income', name: 'הכנסות', icon: '💰', color: '#0e9888', measurement_type: 'auto', data_source: 'transactions', graph_type: 'delta', builtin: true, created_at: daysAgo(300) },
  { id: uid(), user_id: USER, key: 'content', name: 'יצירת תוכן', icon: '🎨', color: '#7a5cb8', measurement_type: 'manual', data_source: null, graph_type: 'delta', builtin: true, created_at: daysAgo(300) },
  { id: uid(), user_id: USER, key: null, name: 'פעילות גופנית', icon: '🏃', color: '#8BA888', measurement_type: 'manual', data_source: null, graph_type: 'delta', builtin: true, created_at: daysAgo(300) },
]

/* ── goals — monthly (auto income) + deadline (manual content, ביצוע חלקי) ── */
export const goals = [
  { id: uid(), user_id: USER, category_id: goal_categories[0].id, parent_goal_id: null, project_id: null, group_id: null, label: 'הכנסה חודשית', time_frame: 'monthly', target_value: 8000, target_date: null, importance: 5, tracking_method: 'manual', tracked_by_question_id: null, measurement_type: null, data_source: null, manual_input_type: null, schedule_pattern: null, created_at: daysAgo(60), updated_at: daysAgo(5) },
  { id: uid(), user_id: USER, category_id: goal_categories[1].id, parent_goal_id: null, project_id: null, group_id: null, label: 'לכתוב 12 מאמרים', time_frame: 'deadline', target_value: 12, target_date: dateFromNow(90), importance: 3, tracking_method: 'manual', tracked_by_question_id: null, measurement_type: 'manual', data_source: null, manual_input_type: 'number', schedule_pattern: null, created_at: daysAgo(45), updated_at: daysAgo(3) },
]

/* ── goal_entries — 3 הזנות לחודש הנוכחי (קטגוריית "יצירת תוכן", sum=4 → ~33% מ-12) ── */
export const goal_entries = [
  { id: uid(), user_id: USER, category_id: goal_categories[1].id, project_id: null, group_id: null, date: monthDay(2), value: 1, note: 'מאמר ראשון', created_at: daysAgo(20) },
  { id: uid(), user_id: USER, category_id: goal_categories[1].id, project_id: null, group_id: null, date: monthDay(9), value: 2, note: null, created_at: daysAgo(13) },
  { id: uid(), user_id: USER, category_id: goal_categories[1].id, project_id: null, group_id: null, date: monthDay(16), value: 1, note: null, created_at: daysAgo(6) },
]

/* ── user_questions — אחת 1-10, אחת yes_no ── */
export const user_questions = [
  { id: uid(), user_id: USER, template_key: 'mood', custom_text: null, scale_type: '1-10', icon: '🫧', active: true, order: 0, schedule_pattern: { type: 'days_of_week', values: [0, 1, 2, 3, 4, 5, 6] }, created_at: daysAgo(100), updated_at: daysAgo(100) },
  { id: uid(), user_id: USER, template_key: null, custom_text: 'התאמנת היום?', scale_type: 'yes_no', icon: '🏃', active: true, order: 1, schedule_pattern: { type: 'every_x_days', x: 2 }, created_at: daysAgo(50), updated_at: daysAgo(50) },
]

/* ── daily_answers — 6 תשובות לשבוע האחרון ── */
export const daily_answers = [
  { id: uid(), user_id: USER, user_question_id: user_questions[0].id, date: dateAgo(1), value_num: 8, value_text: null, note: null, created_at: daysAgo(1) },
  { id: uid(), user_id: USER, user_question_id: user_questions[0].id, date: dateAgo(2), value_num: 7, value_text: null, note: 'יום עמוס', created_at: daysAgo(2) },
  { id: uid(), user_id: USER, user_question_id: user_questions[0].id, date: dateAgo(3), value_num: 6, value_text: null, note: null, created_at: daysAgo(3) },
  { id: uid(), user_id: USER, user_question_id: user_questions[1].id, date: dateAgo(1), value_num: 1, value_text: null, note: null, created_at: daysAgo(1) },
  { id: uid(), user_id: USER, user_question_id: user_questions[1].id, date: dateAgo(3), value_num: 0, value_text: null, note: null, created_at: daysAgo(3) },
  { id: uid(), user_id: USER, user_question_id: user_questions[1].id, date: dateAgo(5), value_num: 1, value_text: null, note: null, created_at: daysAgo(5) },
]

/* ── reminders — מקושרת ללקוח + עצמאית (חוזרת) ── */
export const reminders = [
  { id: uid(), user_id: USER, title: 'להתקשר לרעות', description: 'לתאם פגישה הבאה', scheduled_at: daysFromNow(1), recurrence_type: 'none', recurrence_pattern: null, end_date: null, linked_to_type: 'client', linked_to_id: clients[0].id, status: 'pending', type: 'custom', channel: 'in-app', created_at: daysAgo(2), updated_at: daysAgo(2), deleted_at: null },
  { id: uid(), user_id: USER, title: 'סיכום שבועי', description: null, scheduled_at: daysFromNow(3), recurrence_type: 'weekly', recurrence_pattern: { dayOfWeek: 0 }, end_date: null, linked_to_type: null, linked_to_id: null, status: 'pending', type: 'custom', channel: 'in-app', created_at: daysAgo(20), updated_at: daysAgo(2), deleted_at: null },
]

/* ── quotes — system (ללא user_id) ── */
export const quotes = [
  { id: uid(), text: 'התקדמות קטנה היא עדיין התקדמות.', author: null, created_at: daysAgo(30) },
  { id: uid(), text: 'מה שאתה מודד — גדל.', author: 'פיטר דרוקר', created_at: daysAgo(30) },
  { id: uid(), text: 'הדרך היחידה לעשות עבודה נהדרת היא לאהוב את מה שאתה עושה.', author: 'סטיב ג׳ובס', created_at: daysAgo(30) },
]

/* ── user_quotes — ציטוטים אישיים (migration 0013) ── */
export const user_quotes = [
  { id: uid(), user_id: USER, text: 'הציטוט האישי הראשון שלי.', author: null, created_at: daysAgo(5), updated_at: daysAgo(5), deleted_at: null },
]

/* ── קהילה — הפרופילים הציבוריים והחדר ─────────────────────────────
   שלושה חברים כדי שאפשר יהיה לראות את מה שחדר אמיתי מראה: הודעות שלי
   (עם אפשרות מחיקה) לצד הודעות של אחרים (בלי), וחשבון רשמי מאומת. */
const MEMBER_2 = 'mock-user-002'
const MEMBER_3 = 'mock-user-003'

export const community_profiles = [
  { id: uid(), user_id: USER, display_name: 'נועה לדוגמה', avatar_url: null, is_verified: false, created_at: daysAgo(20),
    headline: 'מאמנת אישית · קריירה', bio: 'מלווה נשים בצמתים מקצועיים — מעברים בקריירה, חזרה מחופשת לידה, ובניית ביטחון. אוהבת תהליכים קצרים וממוקדים.', specialties: ['קריירה', 'זוגיות', 'הורות'], link: 'https://noa-example.co.il' },
  { id: uid(), user_id: MEMBER_2, display_name: 'דנה לוי', avatar_url: null, is_verified: false, created_at: daysAgo(18),
    headline: 'מטפלת רגשית · CBT', bio: 'עובדת עם מתבגרים והורים. מאמינה שקצת כלים פרקטיים עושים את כל ההבדל.', specialties: ['מתבגרים', 'חרדה', 'הורות'], link: 'https://dana-example.com' },
  { id: uid(), user_id: MEMBER_3, display_name: 'Simplicity', avatar_url: null, is_verified: true, created_at: daysAgo(30),
    headline: 'צוות סימפליסיטי', bio: 'העדכונים הרשמיים, טיפים והזמנות למפגשי הקהילה.', specialties: ['הכרזות', 'עזרה'], link: 'https://simplicity-os.com' },
]

/* Each row carries an inline `community_profiles` object because the real
   query embeds the author through the 0086 FK, and the mock's select() ignores
   the select string entirely — so the fixture has to shape itself like the
   response PostgREST would return. No deleted rows: the real SELECT policy
   hides those server-side (0081) and the mock has no policies to do it. */
const author = (u) => {
  const p = community_profiles.find((x) => x.user_id === u)
  /* null, never a throw: the real embed returns null for a missing profile,
     and a fixture helper must not be able to take the whole app down at
     module load if the two lists drift apart. */
  return p ? { display_name: p.display_name, avatar_url: p.avatar_url, is_verified: p.is_verified } : null
}
/* The "pricing" question gets a reply thread (reply_to_id → Q_ID). Flat model:
   every reply points at the root. */
const Q_ID = uid()
/* Filler history so the room is long enough to page: the "load older" button
   only shows once the first window fills (≥ MESSAGES_PAGE). All older than the
   story below (daysAgo > 3), varied authors, distinct times → ascending. */
const FILLER_AUTHORS = [USER, MEMBER_2, MEMBER_3]
const FILLER_LINES = [
  'תודה על השיתוף, ממש עזר לי 🙏',
  'מישהי ניסתה את הגישה הזאת עם לקוחות חדשים?',
  'אני עובדת ככה כבר שנה וזה משנה תמונה.',
  'שאלה קטנה — איך אתם מתמודדים עם ביטולים?',
  'הטיפ הזה שווה זהב, תודה!',
  'גם אני נתקלתי בזה השבוע.',
  'מסכים לגמרי, חשוב לשים גבולות.',
  'איזה כלי אתם ממליצים למעקב?',
  'עשיתי את זה אתמול, עבד מצוין 🎉',
  'מחכה למפגש הקהילה הבא 🌿',
]
const communityFiller = Array.from({ length: 50 }, (_, i) => {
  const u = FILLER_AUTHORS[i % FILLER_AUTHORS.length]
  return {
    id: uid(), user_id: u,
    content: `${FILLER_LINES[i % FILLER_LINES.length]} (#${i + 1})`,
    created_at: daysAgo(28 - i * 0.5), deleted_at: null, reply_to_id: null,
    community_profiles: author(u),
    community_message_reactions: [], community_message_mentions: [],
  }
})
export const community_messages = [
  ...communityFiller,
  { id: uid(), user_id: MEMBER_3, content: 'ברוכים הבאים לחדר הקהילה 🌿 המדריך המלא כאן: https://simplicity-os.com/guide (שווה קריאה).', created_at: daysAgo(3), deleted_at: null, reply_to_id: null, pinned_at: endAfter(0, -5), community_profiles: author(MEMBER_3),
    community_message_reactions: [{ emoji: '❤️', user_id: MEMBER_2 }, { emoji: '❤️', user_id: USER }, { emoji: '🙏', user_id: MEMBER_3 }] },
  { id: Q_ID, user_id: MEMBER_2, content: 'שאלה: איך אתן מתמחרות פגישת היכרות? אצלי היא בחינם וכבר לא בטוחה.', created_at: daysAgo(2), deleted_at: null, reply_to_id: null, community_profiles: author(MEMBER_2),
    community_message_reactions: [{ emoji: '👍', user_id: USER }] },
  { id: uid(), user_id: USER, content: '@דנה לוי אצלי היא בתשלום סמלי — מסננת יפה ומכבדת את הזמן של שנינו.', created_at: daysAgo(1), deleted_at: null, reply_to_id: null, community_profiles: author(USER),
    community_message_reactions: [], community_message_mentions: [{ mentioned_user_id: MEMBER_2, community_profiles: { display_name: 'דנה לוי' } }] },
  /* thread under the pricing question (distinct times so they order naturally) */
  { id: uid(), user_id: USER, content: 'אני גובה 50% מהמחיר הרגיל לפגישת היכרות — לא חינם, אבל נגיש.', created_at: endAfter(-2, 30), deleted_at: null, reply_to_id: Q_ID, community_profiles: author(USER),
    community_message_reactions: [] },
  { id: uid(), user_id: MEMBER_3, content: 'רעיון טוב 🙏 גם אני אאמץ את זה.', created_at: endAfter(-2, 90), deleted_at: null, reply_to_id: Q_ID, community_profiles: author(MEMBER_3),
    community_message_reactions: [{ emoji: '❤️', user_id: MEMBER_2 }] },
]

/* An admin moderation queue: one reported message (the pricing question),
   flagged by another member. message embed is inlined (mock ignores select). */
export const community_message_reports = [
  { id: uid(), message_id: Q_ID, reporter_id: MEMBER_3, reason: 'לא רלוונטי לחדר', created_at: endAfter(0, -18),
    message: { id: Q_ID, content: 'שאלה: איך אתן מתמחרות פגישת היכרות? אצלי היא בחינם וכבר לא בטוחה.', deleted_at: null, community_profiles: { display_name: 'דנה לוי' } } },
]

/* Community calendar events (0092). created_by resolves to a member name via
   the events screen's member map; USER's event shows the delete action. */
export const community_events = [
  { id: uid(), created_by: MEMBER_3, title: 'מפגש קהילה חודשי (זום)', description: 'נדבר על תמחור, גבולות ולקוחות. מוזמנות ומוזמנים 🌿', location: 'זום', link: 'https://zoom.us/j/example', starts_at: endAfter(3, 18 * 60), ends_at: endAfter(3, 19 * 60), created_at: daysAgo(2) },
  { id: uid(), created_by: MEMBER_2, title: 'סדנת כתיבה שיווקית', description: null, location: 'תל אביב', link: null, starts_at: endAfter(6, 10 * 60), ends_at: endAfter(6, 12 * 60), created_at: daysAgo(1) },
  { id: uid(), created_by: USER, title: 'וובינר: אוטומציות בעסק', description: 'איך לחסוך 5 שעות בשבוע עם כמה אוטומציות פשוטות.', location: null, link: 'https://example.com/webinar', starts_at: endAfter(10, 20 * 60), ends_at: null, created_at: daysAgo(0) },
]

/* Notifications for the mock user (נועה) — two unread @-mentions. actor + message
   are inlined because the mock's select() ignores the embed string. */
export const community_notifications = [
  { id: uid(), recipient_id: USER, actor_id: MEMBER_2, type: 'mention', message_id: uid(), read_at: null, created_at: endAfter(0, -25),
    actor: { display_name: 'דנה לוי', avatar_url: null }, message: { content: '@נועה לדוגמה תודה על הטיפ, אימצתי!' } },
  { id: uid(), recipient_id: USER, actor_id: MEMBER_3, type: 'mention', message_id: uid(), read_at: null, created_at: endAfter(0, -140),
    actor: { display_name: 'Simplicity', avatar_url: null }, message: { content: '@נועה לדוגמה מוזמנת למפגש הקהילה הבא 🌿' } },
]

/* ── user_preferences — אובייקט אחד עם ברירות מחדל (snake_case; הפרוטוטיפ השתמש ב-camelCase) ── */
export const user_preferences = {
  user_id: USER,
  full_name: 'מאמן/ת לדוגמה',
  role: 'therapist',
  currency: 'ILS',
  date_format: 'DD/MM/YY',
  time_format: '24h',
  week_start: 'sunday',
  text_size: 'normal',
  gender: 'neutral',
  calendar_default_view: 'schedule',
  theme: 'light',
}

/* ── MOCK_DB — הכל במקום אחד ── */
/* Route B: staged incoming invoices awaiting import (preview only). */
export const pending_invoice_imports = [
  { id: uid(), user_id: USER, provider: 'sumit', external_document_id: '900123', document_type: 'invoice_receipt', document_number: '1042', amount: 380, currency: 'ILS', doc_date: new Date().toISOString().slice(0, 10), customer_name: 'רעות מדיון', document_url: 'https://example.com/doc.pdf', client_id: clients[0].id, status: 'pending', created_at: daysAgo(0) },
  { id: uid(), user_id: USER, provider: 'sumit', external_document_id: '900124', document_type: 'receipt', document_number: '1043', amount: 520, currency: 'ILS', doc_date: new Date().toISOString().slice(0, 10), customer_name: 'לקוח מזדמן', document_url: null, client_id: null, status: 'pending', created_at: daysAgo(0) },
]

/* Lead pages (preview): one published page the pending lead above came from. */
export const lead_pages = [
  {
    id: 'mock-lead-page-1', user_id: USER, title: 'דף קמפיין אינסטגרם', slug: 'dana-instagram',
    published: true, auto_approve: false,
    content: {
      logoText: 'הסטודיו של דנה', heading: 'רוצים לשמוע עוד?',
      body: 'השאירו פרטים ונחזור אליכם בהקדם.', brandColor: '#C97B5E',
      background: 'leads', cardOpacity: 62, cardBlur: 16, bold: true, textColor: 'light', textAlign: 'start',
      thankYou: { mode: 'message', message: 'תודה! נחזור אליך בהקדם.', url: '' },
    },
    fields: [
      { key: 'name', label: 'שם', type: 'text', required: true, builtin: true },
      { key: 'phone', label: 'טלפון', type: 'tel', required: false, builtin: true },
      { key: 'email', label: 'אימייל', type: 'email', required: false, builtin: true },
      { key: 'field_1', label: 'איך הגעת אלינו?', type: 'text', required: false, builtin: false },
      { key: 'field_2', label: 'באיזה תחום?', type: 'select', required: false, builtin: false, options: ['אימון אישי', 'ייעוץ עסקי', 'סדנאות'] },
      { key: 'field_3', label: 'ימים מועדפים', type: 'checkbox', required: false, builtin: false, options: ['ראשון', 'שלישי', 'חמישי'] },
    ],
    created_at: daysAgo(1),
  },
]

/* ── payment plans — clients[0] has a 6-installment plan, 2 received ── */
export const payment_plans = [
  { id: uid(), user_id: USER, client_id: clients[0].id, project_id: projects[0].id, total_amount: 3600, num_installments: 6, notes: null, created_at: daysAgo(40), updated_at: daysAgo(5) },
]
export const payment_installments = [1, 2, 3, 4, 5, 6].map((n) => ({
  id: uid(),
  user_id: USER,
  plan_id: payment_plans[0].id,
  num: n,
  due_date: dateAgo(60 - n * 30),
  amount: 600,
  received: n <= 2,
  received_date: n <= 2 ? dateAgo((3 - n) * 30) : null,
  payment_method: n === 1 ? 'bank_transfer' : n === 2 ? 'cash' : null,
  transaction_id: null,
  created_at: daysAgo(40),
  updated_at: daysAgo(5),
}))

/* Page-builder demo (kind='landing') so /pages renders end-to-end in preview. */
const site_pages = [{
  id: 'sp-demo-1',
  user_id: 'mock-user-001',
  kind: 'landing',
  title: 'דף לדוגמה',
  published: true,
  slug: 'demo',
  theme: { font: 'heebo', brandColor: '#C97B5E', textColor: 'dark', textAlign: 'start', bold: false, background: { type: 'scene', value: 'clients' }, cardOpacity: 92, cardBlur: 14, cardRadius: 24 },
  sections: [
    { id: 's_1', type: 'hero', props: { eyebrow: 'אימון אישי', heading: 'הצעד הראשון לשינוי', subheading: 'מרחב בטוח לצמיחה אישית', ctaLabel: 'לשיחת היכרות', ctaAction: { type: 'scrollToForm', url: '' } }, style: {} },
    { id: 's_2', type: 'iconText', props: { items: [{ icon: 'Compass', title: 'כיוון ברור', body: 'נמצא יחד את היעד' }, { icon: 'Heart', title: 'יחס אישי', body: 'תהליך מותאם לך' }, { icon: 'Target', title: 'תוצאות', body: 'צעדים מעשיים' }, { icon: 'Sun', title: 'אנרגיה', body: 'מוטיבציה מתחדשת' }] }, style: {} },
    { id: 's_3', type: 'form', props: { heading: 'השאירו פרטים', submitLabel: 'שליחה', fields: [{ key: 'name', label: 'שם', type: 'text', required: true, builtin: true }, { key: 'phone', label: 'טלפון', type: 'tel', required: false, builtin: true }] }, style: {} },
    { id: 's_4', type: 'booking', props: { heading: 'קביעת פגישה', subheading: 'בחרו מועד שנוח לכם', bookingSlug: 'demo-book' }, style: {} },
  ],
  config: {},
  created_at: new Date().toISOString(),
}, {
  // Simulates a migrated lead page (kind='lead') so /lead/<slug> renders on
  // the engine in preview (phase 2 read-path switch).
  id: 'sp-lead-1',
  user_id: 'mock-user-001',
  kind: 'lead',
  title: 'השארת פרטים לדוגמה',
  published: true,
  slug: 'demo-lead',
  theme: { font: 'heebo', brandColor: '#8BA888', textColor: 'dark', textAlign: 'start', bold: false, background: { type: 'scene', value: 'leads' }, cardOpacity: 96, cardBlur: 14, cardRadius: 24 },
  sections: [
    { id: 's_1', type: 'hero', props: { eyebrow: 'דנה קואצ׳', heading: 'בואו נדבר', subheading: 'השאירו פרטים ואחזור אליכם.', ctaLabel: '', ctaAction: { type: 'scrollToForm', url: '' } }, style: {} },
    { id: 's_2', type: 'form', props: { heading: '', submitLabel: 'שליחה', fields: [{ key: 'name', label: 'שם', type: 'text', required: true, builtin: true }, { key: 'phone', label: 'טלפון', type: 'tel', required: false, builtin: true }, { key: 'email', label: 'אימייל', type: 'email', required: false, builtin: true }] }, style: {} },
  ],
  config: { autoApprove: false, thankYou: { mode: 'message', message: 'תודה! קיבלנו את הפנייה.', url: '' } },
  created_at: new Date().toISOString(),
}]

/* A published booking page so the page-builder's inline booking block has a
   real target in preview (the booking-intake mock serves its config + slots). */
const booking_pages = [{
  id: 'bp-demo-1',
  user_id: 'mock-user-001',
  slug: 'demo-book',
  title: 'פגישת היכרות',
  published: true,
  deleted_at: null,
  content: { heading: 'קביעת פגישה', thankYou: { mode: 'message', message: 'נתראה! נשלח אישור במייל.' } },
  created_at: new Date().toISOString(),
}]

export const MOCK_DB = {
  booking_pages,
  pending_invoice_imports,
  lead_pages,
  site_pages,
  projects,
  groups,
  group_members,
  clients,
  client_statuses,
  categories,
  transactions,
  recurring_templates,
  tasks,
  lead_sources,
  meeting_types,
  leads,
  lead_statuses,
  sessions,
  scheduled_meetings,
  calendar_events,
  goal_categories,
  goals,
  goal_entries,
  user_questions,
  daily_answers,
  reminders,
  quotes,
  user_quotes,
  community_profiles,
  community_messages,
  community_message_reactions: [],   /* toggle target; embed is inline on messages above */
  community_message_mentions: [],    /* insert target; embed is inline on messages above */
  community_notifications,
  community_message_reports,
  community_events,
  user_preferences,
  payment_plans,
  payment_installments,
  /* Subscription: a beta-exempt 'free' row — matches what every existing
     user gets from migration 0075's backfill (premium for the beta window).
     Lets Settings → מנוי render the real "beta access until <date>" state. */
  user_subscriptions: [
    { id: 'sub-001', user_id: USER, tier: 'free', status: null, beta_exempt_until: new Date(now + 90 * 86400000).toISOString(), created_at: new Date(now).toISOString() },
  ],
}
