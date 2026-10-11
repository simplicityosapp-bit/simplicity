// ════════════════════════════════════════════════════════════════
//  claude-mcp / tools.ts — the read-only tool catalogue.
// ════════════════════════════════════════════════════════════════
//  Each tool belongs to exactly ONE data category (or none: get_access_info).
//  The server shows a tool in tools/list and lets tools/call run it only when
//  the token's categories include that category — both checked independently
//  in server.ts.
//
//  Rules every tool follows:
//    - Reads only through ctx.read(), which is db.readRows() pre-bound to the
//      verified token's user id. No tool can name a user.
//    - Every read lists its columns explicitly (an allowlist). Sensitive
//      fields live only in the tools of their own sensitive category — never
//      mixed into a general tool.
//    - Finance tools return client_id, never client names.
//    - There is NO write, edit or delete tool, of any kind.
// ════════════════════════════════════════════════════════════════
import { CATEGORY_INFO, MCP_CATEGORIES, SENSITIVE_CATEGORIES, type McpCategory } from '../_shared/mcp-categories.ts'
import { DEFAULT_ROWS, MAX_ROWS, type Filter, type ReadSpec } from './db.ts'

type Args = Record<string, unknown>
type Row = Record<string, unknown>

export type ToolContext = {
  args: Args
  read: (spec: ReadSpec) => Promise<Row[]>
  categories: readonly McpCategory[]
  expiresAt: string
}

export type Tool = {
  name: string
  category: McpCategory | null   // null = available to every valid token
  description: string
  inputSchema: Record<string, unknown>
  run: (ctx: ToolContext) => Promise<unknown>
}

/* A refusal the model can read. Its message is shown verbatim — keep it a
   fixed sentence, never echo input. */
export class ArgError extends Error {}

// ── Argument parsing (untrusted input) ───────────────────────────────
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DATE = /^\d{4}-\d{2}-\d{2}([T ][0-9:.]+(Z|[+-]\d{2}:?\d{2})?)?$/

function limitArg(a: Args): number {
  if (a.limit === undefined || a.limit === null) return DEFAULT_ROWS
  const n = Number(a.limit)
  if (!Number.isFinite(n)) throw new ArgError('limit must be a number between 1 and 200.')
  return Math.min(Math.max(Math.trunc(n), 1), MAX_ROWS)
}
function uuidArg(a: Args, k: string): string | undefined {
  const v = a[k]
  if (v === undefined || v === null || v === '') return undefined
  if (typeof v !== 'string' || !UUID.test(v)) throw new ArgError(`${k} must be an id returned by another tool.`)
  return v
}
function uuidListArg(a: Args, k: string): string[] | undefined {
  const v = a[k]
  if (v === undefined || v === null) return undefined
  if (!Array.isArray(v) || v.length > MAX_ROWS || !v.every((x) => typeof x === 'string' && UUID.test(x))) {
    throw new ArgError(`${k} must be a list of up to 200 ids returned by other tools.`)
  }
  return v.length ? (v as string[]) : undefined
}
function dateArg(a: Args, k: string): string | undefined {
  const v = a[k]
  if (v === undefined || v === null || v === '') return undefined
  if (typeof v !== 'string' || !DATE.test(v) || Number.isNaN(Date.parse(v))) {
    throw new ArgError(`${k} must be a date like 2026-10-01.`)
  }
  return v
}
function enumArg<T extends string>(a: Args, k: string, values: readonly T[]): T | undefined {
  const v = a[k]
  if (v === undefined || v === null || v === '') return undefined
  if (typeof v !== 'string' || !(values as readonly string[]).includes(v)) {
    throw new ArgError(`${k} must be one of: ${values.join(', ')}.`)
  }
  return v as T
}
function textArg(a: Args, k: string, max = 100): string | undefined {
  const v = a[k]
  if (v === undefined || v === null) return undefined
  if (typeof v !== 'string' || v.length > max) throw new ArgError(`${k} must be text of up to ${max} characters.`)
  return v.trim() || undefined
}

// Filter builders that drop undefined values.
const eq = (col: string, value: string | undefined): Filter[] => (value === undefined ? [] : [{ op: 'eq', col, value }])
const inList = (col: string, values: string[] | undefined): Filter[] => (values ? [{ op: 'in', col, values }] : [])
const range = (col: string, from?: string, to?: string): Filter[] => [
  ...(from ? [{ op: 'gte' as const, col, value: from }] : []),
  ...(to ? [{ op: 'lte' as const, col, value: to }] : []),
]
const search = (col: string, value: string | undefined): Filter[] =>
  (value === undefined ? [] : [{ op: 'contains_text', col, value }])

// JSON-schema fragments.
const P = {
  limit: { type: 'integer', minimum: 1, maximum: MAX_ROWS, description: 'Max rows (1-200). Default 50.' },
  from: { type: 'string', description: 'Start date, inclusive (YYYY-MM-DD).' },
  to: { type: 'string', description: 'End date, inclusive (YYYY-MM-DD or ISO date-time).' },
  id: (what: string) => ({ type: 'string', description: `Id of a ${what}, from another tool.` }),
  ids: (what: string) => ({ type: 'array', items: { type: 'string' }, maxItems: MAX_ROWS, description: `Ids of ${what}, from other tools.` }),
}
const schema = (properties: Record<string, unknown>, required: string[] = []) =>
  ({ type: 'object', properties, ...(required.length ? { required } : {}), additionalProperties: false })

const truncated = (rows: Row[], limit: number) => rows.length >= limit

// ── Column allowlists (the primary control on what leaves the server) ──
export const COLUMNS = {
  clients: ['id', 'name', 'status_meta', 'status_id', 'project_id', 'group_id', 'meeting_type_id', 'sessions',
    'price_per_session', 'billing_mode', 'total_override', 'recurring_day', 'recurring_time', 'recurring_end_time',
    'recurring_start_date', 'recurring_end_date', 'left_mid_process', 'created_at', 'last_status_changed_at'],
  client_statuses: ['id', 'display_name', 'meta_category'],
  groups: ['id', 'name', 'project_id', 'status', 'package_price', 'package_sessions', 'price_per_session',
    'billing_mode', 'recurring_day', 'recurring_time', 'recurring_end_time', 'recurring_start_date',
    'recurring_end_date', 'created_at'],
  group_members: ['id', 'group_id', 'client_id', 'joined_at', 'left_at'],

  contact_clients: ['id', 'phone', 'email', 'address', 'birth_date'],
  contact_leads: ['id', 'phone', 'email', 'data'],
  contact_bookings: ['id', 'name', 'phone', 'email', 'note', 'data'],
  contact_transactions: ['id', 'recipient_name', 'recipient_email', 'recipient_phone'],

  session_notes: ['id', 'client_id', 'group_id', 'date', 'notes', 'summary'],
  client_notes: ['id', 'notes', 'notes_updated_at'],
  lead_notes: ['id', 'notes'],

  sessions: ['id', 'client_id', 'group_id', 'subject_type', 'subject_id', 'date', 'num'],
  scheduled_meetings: ['id', 'subject_type', 'subject_id', 'scheduled_at', 'duration_minutes', 'status', 'session_id'],
  calendar_busy: ['id', 'start_time', 'end_time', 'all_day', 'client_id'],
  bookings: ['id', 'meeting_type_id', 'starts_at', 'ends_at', 'status', 'payment_status'],
  meeting_types: ['id', 'name', 'default_price', 'duration_minutes'],

  calendar_titles: ['id', 'title', 'start_time'],

  leads: ['id', 'name', 'status_meta', 'status_id', 'source_id', 'inquiry_date', 'follow_up_date',
    'last_status_changed_at', 'converted_to_client_id', 'converted_at', 'closed_at', 'project_id', 'group_id',
    'pending_review', 'created_at'],
  lead_sources: ['id', 'name'],
  lead_statuses: ['id', 'display_name', 'meta_category'],

  transactions: ['id', 'amount', 'type', 'desc', 'date', 'status', 'project_id', 'client_id', 'group_id',
    'category_id', 'recurring_id', 'payment_method', 'invoice_provider', 'invoice_document_number',
    'invoice_document_type', 'invoice_credit_document_number', 'created_at'],
  transactions_summary: ['amount', 'type', 'status', 'date', 'category_id'],
  categories: ['id', 'name'],
  payment_plans: ['id', 'client_id', 'project_id', 'total_amount', 'num_installments', 'notes', 'created_at'],
  payment_installments: ['id', 'plan_id', 'num', 'due_date', 'amount', 'received', 'received_date',
    'payment_method', 'transaction_id'],
  payment_requests: ['id', 'client_id', 'transaction_id', 'installment_id', 'booking_id', 'source', 'amount',
    'description', 'status', 'paid_at', 'created_at'],
  recurring_templates: ['id', 'amount', 'type', 'desc', 'project_id', 'client_id', 'category_id', 'cadence_type',
    'day_of_month', 'day_of_week', 'until_date', 'active', 'trigger_type'],
  client_adjustments: ['id', 'client_id', 'kind', 'reason', 'amount', 'note', 'occurred_on'],
  investments: ['id', 'amount', 'invested_on', 'transaction_id', 'note'],

  tax_ids: ['id', 'recipient_tax_id'],

  tasks: ['id', 'title', 'description', 'priority', 'status', 'status_id', 'category_id', 'project_id',
    'client_id', 'due_at', 'completed_at', 'created_at'],
  task_statuses: ['id', 'display_name', 'meta_category'],
  task_categories: ['id', 'name'],
  reminders: ['id', 'title', 'description', 'scheduled_at', 'recurrence_type', 'recurrence_pattern', 'end_date',
    'linked_to_type', 'linked_to_id', 'status', 'type', 'category_id'],

  projects: ['id', 'name', 'status', 'created_at'],
  goals: ['id', 'category_id', 'parent_goal_id', 'project_id', 'group_id', 'label', 'time_frame', 'target_value',
    'target_date', 'importance', 'tracking_method', 'measurement_type', 'data_source', 'created_at'],
  goal_categories: ['id', 'key', 'name', 'measurement_type'],
  goal_entries: ['id', 'goal_id', 'category_id', 'project_id', 'group_id', 'date', 'value', 'note'],

  user_questions: ['id', 'template_key', 'custom_text', 'scale_type', 'active'],
  daily_answers: ['id', 'user_question_id', 'date', 'value_num', 'value_text', 'note'],
  moon_snapshots: ['id', 'date', 'score', 'paced', 'confidence', 'breakdown', 'reflection'],
} as const

// Summary pagination bound: aggregates may scan up to this many rows, in
// pages of MAX_ROWS, and say so if there were more.
const SUMMARY_MAX_PAGES = 25

// ── The catalogue ────────────────────────────────────────────────────
export const TOOLS: Tool[] = [
  // ── always available ──
  {
    name: 'get_access_info',
    category: null,
    description: 'Which data categories the user has enabled for this connection, which are not enabled, and when access expires. Call this when a question needs data you have no tool for, to tell the user which category to enable in Simplicity (Connections → Claude).',
    inputSchema: schema({}),
    run: async ({ categories, expiresAt }) => {
      const describe = (key: McpCategory) => ({ key, ...CATEGORY_INFO[key], sensitive: SENSITIVE_CATEGORIES.has(key) })
      return {
        enabled: MCP_CATEGORIES.filter((c) => categories.includes(c)).map(describe),
        not_enabled: MCP_CATEGORIES.filter((c) => !categories.includes(c)).map(describe),
        expires_at: expiresAt,
        how_to_change: 'The user changes categories in the Simplicity app: Connections → Claude.',
      }
    },
  },

  // ── clients ──
  {
    name: 'list_clients',
    category: 'clients',
    description: "List the coach's clients: name, status, group/project, pricing and fixed schedule. No contact details or notes. Read-only.",
    inputSchema: schema({
      search: { type: 'string', description: 'Case-insensitive part of the name.' },
      status_meta: { type: 'string', description: 'Filter by status category (as returned in status_meta).' },
      project_id: P.id('project'), group_id: P.id('group'), limit: P.limit,
    }),
    run: async ({ args, read }) => {
      const limit = limitArg(args)
      const clients = await read({
        table: 'clients', columns: COLUMNS.clients, limit,
        filters: [
          ...search('name', textArg(args, 'search')),
          ...eq('status_meta', textArg(args, 'status_meta', 40)),
          ...eq('project_id', uuidArg(args, 'project_id')),
          ...eq('group_id', uuidArg(args, 'group_id')),
        ],
        order: { col: 'name', ascending: true },
      })
      const statuses = await read({ table: 'client_statuses', columns: COLUMNS.client_statuses, limit: MAX_ROWS })
      return { clients, statuses, truncated: truncated(clients, limit) }
    },
  },
  {
    name: 'get_client',
    category: 'clients',
    description: 'One client by id, with the groups they belong to. No contact details or notes.',
    inputSchema: schema({ client_id: P.id('client') }, ['client_id']),
    run: async ({ args, read }) => {
      const id = uuidArg(args, 'client_id')
      if (!id) throw new ArgError('client_id is required.')
      const [client] = await read({ table: 'clients', columns: COLUMNS.clients, filters: eq('id', id), limit: 1 })
      if (!client) return { client: null }
      const memberships = await read({ table: 'group_members', columns: COLUMNS.group_members, filters: eq('client_id', id), limit: MAX_ROWS })
      return { client, memberships }
    },
  },
  {
    name: 'list_groups',
    category: 'clients',
    description: 'Groups (name, pricing, schedule) and which clients are members.',
    inputSchema: schema({ project_id: P.id('project'), limit: P.limit }),
    run: async ({ args, read }) => {
      const limit = limitArg(args)
      const groups = await read({
        table: 'groups', columns: COLUMNS.groups, limit,
        filters: eq('project_id', uuidArg(args, 'project_id')),
        order: { col: 'name', ascending: true },
      })
      const ids = groups.map((g) => String(g.id))
      const members = ids.length
        ? await read({ table: 'group_members', columns: COLUMNS.group_members, filters: inList('group_id', ids), limit: MAX_ROWS })
        : []
      return { groups, members, truncated: truncated(groups, limit) }
    },
  },

  // ── contact_details (sensitive) ──
  {
    name: 'get_contact_details',
    category: 'contact_details',
    description: 'SENSITIVE. Contact details for specific people: client phone/email/address/birth date, lead phone/email/form answers, booking contact details, invoice recipient contact details. Pass the ids you need (from other tools).',
    inputSchema: schema({
      client_ids: P.ids('clients'), lead_ids: P.ids('leads'),
      booking_ids: P.ids('bookings'), transaction_ids: P.ids('transactions'),
    }),
    run: async ({ args, read }) => {
      const client_ids = uuidListArg(args, 'client_ids')
      const lead_ids = uuidListArg(args, 'lead_ids')
      const booking_ids = uuidListArg(args, 'booking_ids')
      const transaction_ids = uuidListArg(args, 'transaction_ids')
      if (!client_ids && !lead_ids && !booking_ids && !transaction_ids) {
        throw new ArgError('Pass at least one of client_ids, lead_ids, booking_ids, transaction_ids.')
      }
      return {
        clients: client_ids ? await read({ table: 'clients', columns: COLUMNS.contact_clients, filters: inList('id', client_ids), limit: MAX_ROWS }) : [],
        leads: lead_ids ? await read({ table: 'leads', columns: COLUMNS.contact_leads, filters: inList('id', lead_ids), limit: MAX_ROWS }) : [],
        bookings: booking_ids ? await read({ table: 'bookings', columns: COLUMNS.contact_bookings, filters: inList('id', booking_ids), limit: MAX_ROWS }) : [],
        transaction_recipients: transaction_ids ? await read({ table: 'transactions', columns: COLUMNS.contact_transactions, filters: inList('id', transaction_ids), limit: MAX_ROWS }) : [],
      }
    },
  },

  // ── session_notes (sensitive) ──
  {
    name: 'get_session_notes',
    category: 'session_notes',
    description: 'SENSITIVE. Notes and summaries written on sessions, filtered by client, group or date range. Newest first.',
    inputSchema: schema({ client_id: P.id('client'), group_id: P.id('group'), from: P.from, to: P.to, limit: P.limit }),
    run: async ({ args, read }) => {
      const limit = limitArg(args)
      const notes = await read({
        table: 'sessions', columns: COLUMNS.session_notes, limit,
        filters: [
          ...eq('client_id', uuidArg(args, 'client_id')),
          ...eq('group_id', uuidArg(args, 'group_id')),
          ...range('date', dateArg(args, 'from'), dateArg(args, 'to')),
        ],
        order: { col: 'date', ascending: false },
      })
      return { notes, truncated: truncated(notes, limit) }
    },
  },

  // ── client_notes (sensitive) ──
  {
    name: 'get_client_notes',
    category: 'client_notes',
    description: 'SENSITIVE. Free-text notes on clients and leads. Pass ids, or nothing to get the most recently updated client notes.',
    inputSchema: schema({ client_ids: P.ids('clients'), lead_ids: P.ids('leads'), limit: P.limit }),
    run: async ({ args, read }) => {
      const limit = limitArg(args)
      const client_ids = uuidListArg(args, 'client_ids')
      const lead_ids = uuidListArg(args, 'lead_ids')
      const both = !client_ids && !lead_ids
      return {
        clients: client_ids || both
          ? await read({
            table: 'clients', columns: COLUMNS.client_notes, limit,
            filters: [...inList('id', client_ids), { op: 'not_null', col: 'notes' }],
            order: { col: 'notes_updated_at', ascending: false },
          })
          : [],
        leads: lead_ids
          ? await read({ table: 'leads', columns: COLUMNS.lead_notes, limit, filters: [...inList('id', lead_ids), { op: 'not_null', col: 'notes' }] })
          : [],
      }
    },
  },

  // ── meetings ──
  {
    name: 'list_sessions',
    category: 'meetings',
    description: 'Sessions that took place (date, client or group, number). No notes. Newest first.',
    inputSchema: schema({ client_id: P.id('client'), group_id: P.id('group'), from: P.from, to: P.to, limit: P.limit }),
    run: async ({ args, read }) => {
      const limit = limitArg(args)
      const sessions = await read({
        table: 'sessions', columns: COLUMNS.sessions, limit,
        filters: [
          ...eq('client_id', uuidArg(args, 'client_id')),
          ...eq('group_id', uuidArg(args, 'group_id')),
          ...range('date', dateArg(args, 'from'), dateArg(args, 'to')),
        ],
        order: { col: 'date', ascending: false },
      })
      return { sessions, truncated: truncated(sessions, limit) }
    },
  },
  {
    name: 'list_upcoming',
    category: 'meetings',
    description: 'The schedule in a date range (default: today to 30 days ahead): scheduled meetings, bookings, and external calendar events as busy time only (start, end, linked client id; no titles).',
    inputSchema: schema({ from: P.from, to: P.to, limit: P.limit }),
    run: async ({ args, read }) => {
      const limit = limitArg(args)
      const from = dateArg(args, 'from') ?? new Date().toISOString().slice(0, 10)
      const to = dateArg(args, 'to') ?? new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10)
      const toEnd = to.length === 10 ? `${to}T23:59:59.999Z` : to
      const [meetings, bookings, busy] = [
        await read({ table: 'scheduled_meetings', columns: COLUMNS.scheduled_meetings, limit, filters: range('scheduled_at', from, toEnd), order: { col: 'scheduled_at', ascending: true } }),
        await read({ table: 'bookings', columns: COLUMNS.bookings, limit, filters: range('starts_at', from, toEnd), order: { col: 'starts_at', ascending: true } }),
        await read({ table: 'calendar_events', columns: COLUMNS.calendar_busy, limit, filters: range('start_time', from, toEnd), order: { col: 'start_time', ascending: true } }),
      ]
      return {
        from, to,
        scheduled_meetings: meetings,
        bookings,
        calendar_busy: busy,
        truncated: truncated(meetings, limit) || truncated(bookings, limit) || truncated(busy, limit),
      }
    },
  },
  {
    name: 'list_meeting_types',
    category: 'meetings',
    description: 'Meeting types with default price and duration.',
    inputSchema: schema({}),
    run: async ({ read }) => ({
      meeting_types: await read({ table: 'meeting_types', columns: COLUMNS.meeting_types, limit: MAX_ROWS, order: { col: 'name', ascending: true } }),
    }),
  },

  // ── calendar_titles (sensitive) ──
  {
    name: 'get_calendar_event_titles',
    category: 'calendar_titles',
    description: 'SENSITIVE. Titles of external calendar events, by ids (from list_upcoming) or by date range.',
    inputSchema: schema({ event_ids: P.ids('calendar events'), from: P.from, to: P.to, limit: P.limit }),
    run: async ({ args, read }) => {
      const limit = limitArg(args)
      const event_ids = uuidListArg(args, 'event_ids')
      const from = dateArg(args, 'from')
      const to = dateArg(args, 'to')
      if (!event_ids && !from && !to) throw new ArgError('Pass event_ids or a date range.')
      const titles = await read({
        table: 'calendar_events', columns: COLUMNS.calendar_titles, limit,
        filters: [...inList('id', event_ids), ...range('start_time', from, to && to.length === 10 ? `${to}T23:59:59.999Z` : to)],
        order: { col: 'start_time', ascending: true },
      })
      return { titles, truncated: truncated(titles, limit) }
    },
  },

  // ── leads ──
  {
    name: 'list_leads',
    category: 'leads',
    description: 'Leads: name, status, source, inquiry and follow-up dates, conversion. No contact details or notes.',
    inputSchema: schema({
      search: { type: 'string', description: 'Case-insensitive part of the name.' },
      status_meta: { type: 'string', description: 'Filter by status category (as returned in status_meta).' },
      source_id: P.id('lead source'), project_id: P.id('project'),
      from: { ...P.from, description: 'Inquiry date from (YYYY-MM-DD).' },
      to: { ...P.to, description: 'Inquiry date to (YYYY-MM-DD).' },
      limit: P.limit,
    }),
    run: async ({ args, read }) => {
      const limit = limitArg(args)
      const leads = await read({
        table: 'leads', columns: COLUMNS.leads, limit,
        filters: [
          ...search('name', textArg(args, 'search')),
          ...eq('status_meta', textArg(args, 'status_meta', 40)),
          ...eq('source_id', uuidArg(args, 'source_id')),
          ...eq('project_id', uuidArg(args, 'project_id')),
          ...range('inquiry_date', dateArg(args, 'from'), dateArg(args, 'to')),
        ],
        order: { col: 'inquiry_date', ascending: false },
      })
      const sources = await read({ table: 'lead_sources', columns: COLUMNS.lead_sources, limit: MAX_ROWS })
      const statuses = await read({ table: 'lead_statuses', columns: COLUMNS.lead_statuses, limit: MAX_ROWS })
      return { leads, sources, statuses, truncated: truncated(leads, limit) }
    },
  },

  // ── finance ──
  {
    name: 'list_transactions',
    category: 'finance',
    description: 'Income and expense transactions with amount, date, status, category and linked client id (not name). Newest first.',
    inputSchema: schema({
      from: P.from, to: P.to,
      type: { type: 'string', enum: ['income', 'expense'] },
      status: { type: 'string', enum: ['confirmed', 'pending', 'skipped'] },
      client_id: P.id('client'), project_id: P.id('project'), category_id: P.id('category'),
      limit: P.limit,
    }),
    run: async ({ args, read }) => {
      const limit = limitArg(args)
      const transactions = await read({
        table: 'transactions', columns: COLUMNS.transactions, limit,
        filters: [
          ...range('date', dateArg(args, 'from'), dateArg(args, 'to')),
          ...eq('type', enumArg(args, 'type', ['income', 'expense'] as const)),
          ...eq('status', enumArg(args, 'status', ['confirmed', 'pending', 'skipped'] as const)),
          ...eq('client_id', uuidArg(args, 'client_id')),
          ...eq('project_id', uuidArg(args, 'project_id')),
          ...eq('category_id', uuidArg(args, 'category_id')),
        ],
        order: { col: 'date', ascending: false },
      })
      const categories = await read({ table: 'categories', columns: COLUMNS.categories, limit: MAX_ROWS })
      return { transactions, categories, truncated: truncated(transactions, limit) }
    },
  },
  {
    name: 'get_finance_summary',
    category: 'finance',
    description: 'Totals of transactions in a date range, grouped by month or by category, split by type (income/expense) and status.',
    inputSchema: schema({ from: P.from, to: P.to, group_by: { type: 'string', enum: ['month', 'category'] } }),
    run: async ({ args, read }) => {
      const groupBy = enumArg(args, 'group_by', ['month', 'category'] as const) ?? 'month'
      const filters = range('date', dateArg(args, 'from'), dateArg(args, 'to'))
      const totals = new Map<string, { group: string; type: unknown; status: unknown; total: number; count: number }>()
      let scanned = 0
      let complete = false
      for (let page = 0; page < SUMMARY_MAX_PAGES; page++) {
        const rows = await read({
          table: 'transactions', columns: COLUMNS.transactions_summary, filters,
          order: { col: 'date', ascending: true }, limit: MAX_ROWS, offset: page * MAX_ROWS,
        })
        for (const r of rows) {
          const group = groupBy === 'month' ? String(r.date ?? '').slice(0, 7) : String(r.category_id ?? 'none')
          const key = `${group}|${r.type}|${r.status}`
          const t = totals.get(key) ?? { group, type: r.type, status: r.status, total: 0, count: 0 }
          t.total += Number(r.amount) || 0
          t.count += 1
          totals.set(key, t)
        }
        scanned += rows.length
        if (rows.length < MAX_ROWS) { complete = true; break }
      }
      return {
        group_by: groupBy,
        rows: [...totals.values()].sort((a, b) => a.group.localeCompare(b.group)),
        transactions_scanned: scanned,
        complete,
      }
    },
  },
  {
    name: 'list_payment_plans',
    category: 'finance',
    description: 'Payment plans with their installments and payment requests. Client ids, not names.',
    inputSchema: schema({ client_id: P.id('client'), limit: P.limit }),
    run: async ({ args, read }) => {
      const limit = limitArg(args)
      const client_id = uuidArg(args, 'client_id')
      const plans = await read({ table: 'payment_plans', columns: COLUMNS.payment_plans, limit, filters: eq('client_id', client_id), order: { col: 'created_at', ascending: false } })
      const planIds = plans.map((p) => String(p.id))
      const installments = planIds.length
        ? await read({ table: 'payment_installments', columns: COLUMNS.payment_installments, filters: inList('plan_id', planIds), limit: MAX_ROWS, order: { col: 'due_date', ascending: true } })
        : []
      const requests = await read({ table: 'payment_requests', columns: COLUMNS.payment_requests, limit, filters: eq('client_id', client_id), order: { col: 'created_at', ascending: false } })
      return { plans, installments, payment_requests: requests, truncated: truncated(plans, limit) || installments.length >= MAX_ROWS }
    },
  },
  {
    name: 'list_finance_records',
    category: 'finance',
    description: "Other finance records, one kind per call: 'recurring' (recurring income/expense templates), 'adjustments' (manual client balance adjustments), 'investments'.",
    inputSchema: schema({ kind: { type: 'string', enum: ['recurring', 'adjustments', 'investments'] }, client_id: P.id('client'), limit: P.limit }, ['kind']),
    run: async ({ args, read }) => {
      const limit = limitArg(args)
      const kind = enumArg(args, 'kind', ['recurring', 'adjustments', 'investments'] as const)
      if (!kind) throw new ArgError('kind is required.')
      const client_id = uuidArg(args, 'client_id')
      const rows = kind === 'recurring'
        ? await read({ table: 'recurring_templates', columns: COLUMNS.recurring_templates, limit, filters: eq('client_id', client_id) })
        : kind === 'adjustments'
          ? await read({ table: 'client_adjustments', columns: COLUMNS.client_adjustments, limit, filters: eq('client_id', client_id), order: { col: 'occurred_on', ascending: false } })
          : await read({ table: 'investments', columns: COLUMNS.investments, limit, order: { col: 'invested_on', ascending: false } })
      return { kind, rows, truncated: truncated(rows, limit) }
    },
  },

  // ── tax_ids (sensitive) ──
  {
    name: 'get_tax_ids',
    category: 'tax_ids',
    description: 'SENSITIVE. Tax id (ת"ז / ח.פ.) of invoice recipients, for specific transactions.',
    inputSchema: schema({ transaction_ids: P.ids('transactions') }, ['transaction_ids']),
    run: async ({ args, read }) => {
      const ids = uuidListArg(args, 'transaction_ids')
      if (!ids) throw new ArgError('transaction_ids is required.')
      return { tax_ids: await read({ table: 'transactions', columns: COLUMNS.tax_ids, filters: inList('id', ids), limit: MAX_ROWS }) }
    },
  },

  // ── tasks ──
  {
    name: 'list_tasks',
    category: 'tasks',
    description: 'Tasks with description, priority, status, due date and links. Open tasks only unless include_completed is true.',
    inputSchema: schema({
      include_completed: { type: 'boolean' },
      client_id: P.id('client'), project_id: P.id('project'),
      due_from: P.from, due_to: P.to, limit: P.limit,
    }),
    run: async ({ args, read }) => {
      const limit = limitArg(args)
      const includeCompleted = args.include_completed === true
      const rows = await read({
        table: 'tasks', columns: COLUMNS.tasks, limit: includeCompleted ? limit : MAX_ROWS,
        filters: [
          ...eq('client_id', uuidArg(args, 'client_id')),
          ...eq('project_id', uuidArg(args, 'project_id')),
          ...range('due_at', dateArg(args, 'due_from'), dateArg(args, 'due_to')),
        ],
        order: { col: 'created_at', ascending: false },
      })
      const tasks = (includeCompleted ? rows : rows.filter((t) => !t.completed_at)).slice(0, limit)
      const statuses = await read({ table: 'task_statuses', columns: COLUMNS.task_statuses, limit: MAX_ROWS })
      const categories = await read({ table: 'task_categories', columns: COLUMNS.task_categories, limit: MAX_ROWS })
      return { tasks, statuses, categories, truncated: truncated(rows, includeCompleted ? limit : MAX_ROWS) || tasks.length >= limit }
    },
  },
  {
    name: 'list_reminders',
    category: 'tasks',
    description: 'Reminders, optionally in a date range.',
    inputSchema: schema({ from: P.from, to: P.to, limit: P.limit }),
    run: async ({ args, read }) => {
      const limit = limitArg(args)
      const reminders = await read({
        table: 'reminders', columns: COLUMNS.reminders, limit,
        filters: range('scheduled_at', dateArg(args, 'from'), dateArg(args, 'to')),
        order: { col: 'scheduled_at', ascending: true },
      })
      return { reminders, truncated: truncated(reminders, limit) }
    },
  },

  // ── projects_goals ──
  {
    name: 'list_projects',
    category: 'projects_goals',
    description: 'Projects (name, status).',
    inputSchema: schema({}),
    run: async ({ read }) => ({
      projects: await read({ table: 'projects', columns: COLUMNS.projects, limit: MAX_ROWS, order: { col: 'name', ascending: true } }),
    }),
  },
  {
    name: 'list_goals',
    category: 'projects_goals',
    description: 'Goals with their categories, and progress entries in a date range.',
    inputSchema: schema({ project_id: P.id('project'), from: P.from, to: P.to, limit: P.limit }),
    run: async ({ args, read }) => {
      const limit = limitArg(args)
      const project_id = uuidArg(args, 'project_id')
      const goals = await read({ table: 'goals', columns: COLUMNS.goals, limit: MAX_ROWS, filters: eq('project_id', project_id) })
      const categories = await read({ table: 'goal_categories', columns: COLUMNS.goal_categories, limit: MAX_ROWS })
      const entries = await read({
        table: 'goal_entries', columns: COLUMNS.goal_entries, limit,
        filters: [...eq('project_id', project_id), ...range('date', dateArg(args, 'from'), dateArg(args, 'to'))],
        order: { col: 'date', ascending: false },
      })
      return { goals, categories, entries, truncated: truncated(entries, limit) || goals.length >= MAX_ROWS }
    },
  },

  // ── journal (sensitive) ──
  {
    name: 'list_journal',
    category: 'journal',
    description: 'SENSITIVE. The coach\'s personal journal: daily questions and answers, reflections and Moon scores, in a date range. Newest first.',
    inputSchema: schema({ from: P.from, to: P.to, limit: P.limit }),
    run: async ({ args, read }) => {
      const limit = limitArg(args)
      const filters = range('date', dateArg(args, 'from'), dateArg(args, 'to'))
      const questions = await read({ table: 'user_questions', columns: COLUMNS.user_questions, limit: MAX_ROWS })
      const answers = await read({ table: 'daily_answers', columns: COLUMNS.daily_answers, limit, filters, order: { col: 'date', ascending: false } })
      const moon = await read({ table: 'moon_snapshots', columns: COLUMNS.moon_snapshots, limit, filters, order: { col: 'date', ascending: false } })
      return { questions, answers, moon_snapshots: moon, truncated: truncated(answers, limit) || truncated(moon, limit) }
    },
  },
]

export const toolAllowed = (tool: Tool, categories: readonly string[]) =>
  tool.category === null || categories.includes(tool.category)
