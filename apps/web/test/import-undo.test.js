/* ════════════════════════════════════════════════════════════════
   IMPORT UNDO — the batch id has to be on EVERY row, or it is a lie.
   ════════════════════════════════════════════════════════════════
   "Undo the import" deletes by `import_batch_id` and nothing else. A
   writer that slips out of the stamping wrapper does not fail, warn, or
   look wrong anywhere: it writes rows with a NULL batch, the undo passes
   over them, and the user is left with the half of the import they asked
   to be rid of — the half nobody can now find. So the wrapper is pinned
   here rather than trusted.

   Also pinned: which tables the undo sweeps (they must be the tables the
   importer writes to), and the order it sweeps them in (children before
   parents, or a delete either fails on the FK or cascades — and a cascade
   would take the edited children the undo exists to protect).
   ════════════════════════════════════════════════════════════════ */
import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'

const importer = readFileSync(new URL('../src/lib/onboardingImport.js', import.meta.url), 'utf8')
const undoer = readFileSync(new URL('../src/lib/api/importBatch.js', import.meta.url), 'utf8')

/* Every writer the importer pulls in, by the alias it imports it under. */
const WRITERS = [
  'insertClient', 'insertProject', 'insertTransaction', 'insertPaymentPlan',
  'insertPaymentInstallments', 'insertRecurring', 'insertClientStatus',
  'insertLeadStatus', 'insertLead', 'insertSession', 'insertCategory',
]

describe('every imported row carries its batch', () => {
  it('imports each writer under a Raw alias', () => {
    WRITERS.forEach((name) => {
      expect(importer, `${name} should be imported as ${name}Raw`).toMatch(
        new RegExp(`\\b${name} as ${name}Raw\\b`),
      )
    })
  })

  it('wraps every one of them in stampWith', () => {
    WRITERS.forEach((name) => {
      expect(importer, `${name} is not stamped with the batch id`).toMatch(
        new RegExp(`const ${name} = stampWith\\(batchId, ${name}Raw\\)`),
      )
    })
  })

  /* The wrapper is only airtight while the raw aliases stay unused: calling
     insertClientRaw directly would write an unstamped row past every check
     above. The declarations themselves are the only place they may appear. */
  it('never calls a Raw writer directly', () => {
    WRITERS.forEach((name) => {
      const uses = [...importer.matchAll(new RegExp(`${name}Raw`, 'g'))].length
      expect(uses, `${name}Raw should appear twice — the import and the wrapper`).toBe(2)
    })
  })

  it('hands the batch id back to the caller', () => {
    expect(importer).toMatch(/summary\.batchId = batchId/)
  })
})

describe('the undo sweeps the right tables, in the right order', () => {
  const tables = [...undoer.matchAll(/^ {2}'([a-z_]+)',$/gm)].map((m) => m[1])

  it('covers every table the importer writes to', () => {
    expect(new Set(tables)).toEqual(new Set([
      'clients', 'projects', 'leads', 'transactions', 'sessions',
      'payment_plans', 'payment_installments', 'client_statuses',
      'lead_statuses', 'categories', 'recurring_templates',
    ]))
  })

  it('deletes children before the parents they point at', () => {
    const at = (t) => tables.indexOf(t)
    /* installments → plans → clients, and installments → transactions */
    expect(at('payment_installments')).toBeLessThan(at('payment_plans'))
    expect(at('payment_installments')).toBeLessThan(at('transactions'))
    expect(at('payment_plans')).toBeLessThan(at('clients'))
    /* sessions and transactions both hang off clients */
    expect(at('sessions')).toBeLessThan(at('clients'))
    expect(at('transactions')).toBeLessThan(at('clients'))
    /* transactions hang off categories and recurring templates too */
    expect(at('transactions')).toBeLessThan(at('categories'))
    expect(at('transactions')).toBeLessThan(at('recurring_templates'))
    /* clients and leads hang off their statuses, and off projects */
    expect(at('clients')).toBeLessThan(at('client_statuses'))
    expect(at('leads')).toBeLessThan(at('lead_statuses'))
    expect(at('clients')).toBeLessThan(at('projects'))
    expect(at('leads')).toBeLessThan(at('projects'))
  })
})

describe('the migration matches what the undo asks of it', () => {
  const sql = readFileSync(new URL('../../../supabase/migrations/0116_import_batch_id.sql', import.meta.url), 'utf8')
  const tables = [...undoer.matchAll(/^ {2}'([a-z_]+)',$/gm)].map((m) => m[1])

  it('adds the column to every table the undo reads', () => {
    tables.forEach((table) => {
      expect(sql, `0116 does not add import_batch_id to ${table}`).toMatch(
        new RegExp(`alter table public\\.${table}\\s+add column if not exists import_batch_id uuid;`),
      )
    })
  })

  it('indexes every one of them', () => {
    tables.forEach((table) => {
      expect(sql, `0116 does not index ${table}.import_batch_id`).toMatch(
        new RegExp(`on public\\.${table} \\(import_batch_id\\) where import_batch_id is not null;`),
      )
    })
  })

  /* Nullable, no default, no backfill: a row that pre-dates the column must
     stay NULL, or an undo could reach back and delete history it never
     wrote. Read off the column definitions themselves — the index
     predicates legitimately say `where import_batch_id is not null`. */
  it('leaves every existing row out of reach', () => {
    const columnLines = sql.split('\n').filter((l) => l.includes('add column'))
    expect(columnLines.length).toBeGreaterThan(0)
    columnLines.forEach((line) => {
      expect(line, `${line.trim()} must stay nullable`).not.toMatch(/not null/i)
      expect(line, `${line.trim()} must have no default`).not.toMatch(/\bdefault\b/i)
    })
    /* No backfill of any kind. */
    expect(sql).not.toMatch(/\bupdate\s+public\./i)
  })
})
