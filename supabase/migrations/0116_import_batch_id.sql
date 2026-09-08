-- ════════════════════════════════════════════════════════════════
-- 0116 — import_batch_id: make a spreadsheet import undoable.
-- ════════════════════════════════════════════════════════════════
-- Importing a file is the heaviest, rarest and most frightening thing a
-- coach does in this app: one click writes clients, projects, leads,
-- payments, meetings, payment plans, statuses and categories at once, and
-- until now there was no way back from it. Undoing meant finding every
-- created row by hand and deleting it one at a time — for a 400-row file,
-- not a real offer.
--
-- One nullable uuid per table the importer writes to. Every row a single
-- import creates carries the same value, so "delete exactly what that
-- import made" becomes one indexed predicate per table.
--
-- ADDITIVE AND NULLABLE, deliberately:
--   * every existing row keeps NULL and is never matched by an undo, so
--     nothing written before this migration can be swept up by one;
--   * no backfill — there is nothing truthful to backfill WITH, since the
--     imports that already happened were never grouped;
--   * no default — a row only carries a batch when the importer says so,
--     which means a hand-typed client can never be deleted by an undo;
--   * no constraint and no FK: batches are not an entity, they are a
--     label. There is no batches table to point at, and inventing one
--     would need its own lifecycle for something the UI reads once.
--
-- The indexes are PARTIAL (`where import_batch_id is not null`). Almost
-- every row in these tables is hand-entered and holds NULL; a full index
-- would be mostly one repeated key, and undo only ever asks about the
-- non-null side.
--
-- Follows 0115_transactions_group_id, which added a nullable column plus
-- its partial index the same way.
-- ════════════════════════════════════════════════════════════════

alter table public.clients              add column if not exists import_batch_id uuid;
alter table public.projects             add column if not exists import_batch_id uuid;
alter table public.leads                add column if not exists import_batch_id uuid;
alter table public.transactions         add column if not exists import_batch_id uuid;
alter table public.sessions             add column if not exists import_batch_id uuid;
alter table public.payment_plans        add column if not exists import_batch_id uuid;
alter table public.payment_installments add column if not exists import_batch_id uuid;
alter table public.client_statuses      add column if not exists import_batch_id uuid;
alter table public.lead_statuses        add column if not exists import_batch_id uuid;
alter table public.categories           add column if not exists import_batch_id uuid;
alter table public.recurring_templates  add column if not exists import_batch_id uuid;

create index if not exists idx_clients_import_batch
  on public.clients (import_batch_id) where import_batch_id is not null;
create index if not exists idx_projects_import_batch
  on public.projects (import_batch_id) where import_batch_id is not null;
create index if not exists idx_leads_import_batch
  on public.leads (import_batch_id) where import_batch_id is not null;
create index if not exists idx_transactions_import_batch
  on public.transactions (import_batch_id) where import_batch_id is not null;
create index if not exists idx_sessions_import_batch
  on public.sessions (import_batch_id) where import_batch_id is not null;
create index if not exists idx_payment_plans_import_batch
  on public.payment_plans (import_batch_id) where import_batch_id is not null;
create index if not exists idx_payment_installments_import_batch
  on public.payment_installments (import_batch_id) where import_batch_id is not null;
create index if not exists idx_client_statuses_import_batch
  on public.client_statuses (import_batch_id) where import_batch_id is not null;
create index if not exists idx_lead_statuses_import_batch
  on public.lead_statuses (import_batch_id) where import_batch_id is not null;
create index if not exists idx_categories_import_batch
  on public.categories (import_batch_id) where import_batch_id is not null;
create index if not exists idx_recurring_templates_import_batch
  on public.recurring_templates (import_batch_id) where import_batch_id is not null;

comment on column public.clients.import_batch_id is
  'The spreadsheet import that created this row, or NULL for anything entered by hand. Undo deletes by this and nothing else.';
