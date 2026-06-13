/* Tests for the one-time, irreversible decrypt backfill (lib/decryptMigration).
   Guards its two corruption-prevention invariants:
     (a) only write when the value ACTUALLY decrypted (a failed decrypt — which
         returns the raw "ENC:" string — must NEVER be persisted as plaintext);
     (b) the write is guarded on the column STILL holding the old ciphertext
         (.eq(field, old)) so a concurrent edit isn't clobbered;
   plus: plaintext/empty values are skipped, and a mid-flight key switch aborts
   without flagging the run complete (returns ran:false). */
import { describe, it, expect, beforeEach, vi } from 'vitest'

const h = vi.hoisted(() => ({
  keyQueue: ['KEY'],   // getActiveKey() shifts until one value remains, then sticks
  rows: [],            // the single page the mocked select returns
  updates: [],         // every update({field:val}).eq('id',id).eq(field,old) recorded
}))

vi.mock('../src/lib/fieldCrypto', () => ({
  getActiveKey: () => (h.keyQueue.length > 1 ? h.keyQueue.shift() : h.keyQueue[0]),
  LEGACY_DECRYPT_FIELDS: { clients: ['notes'] },
}))

vi.mock('../src/lib/crypto', () => ({
  isEncrypted: (v) => typeof v === 'string' && v.startsWith('ENC:'),
  // 'ENC:fail' simulates a decrypt failure (real decryptField returns the raw
  // value on failure); anything else "decrypts" to a marked plaintext.
  decryptField: async (v) => (v === 'ENC:fail' ? v : `plain(${v})`),
}))

vi.mock('../src/lib/supabase', () => {
  const makeBuilder = () => {
    const b = { _patch: null, _filters: [] }
    b.select = () => b
    b.order = () => b
    b.range = () => Promise.resolve({ data: h.rows, error: null })
    b.update = (patch) => { b._patch = patch; return b }
    b.eq = (col, val) => {
      b._filters.push({ col, val })
      if (b._filters.length >= 2) { // id + field → the real write resolves here
        h.updates.push({ patch: b._patch, filters: b._filters })
        return Promise.resolve({ error: null })
      }
      return b
    }
    return b
  }
  return { supabase: { from: () => makeBuilder() } }
})

const { runDecryptMigration } = await import('../src/lib/decryptMigration')

beforeEach(() => { h.keyQueue = ['KEY']; h.rows = []; h.updates = [] })

describe('decrypt migration safety', () => {
  it('decrypts an ENC: value and writes plaintext guarded on the old ciphertext', async () => {
    h.rows = [{ id: 'c1', notes: 'ENC:abc' }]
    const res = await runDecryptMigration()
    expect(res).toEqual({ ran: true, updated: 1 })
    expect(h.updates).toHaveLength(1)
    expect(h.updates[0].patch).toEqual({ notes: 'plain(ENC:abc)' })
    // guarded: .eq('id', id) AND .eq('notes', <old ciphertext>)
    expect(h.updates[0].filters).toEqual([
      { col: 'id', val: 'c1' },
      { col: 'notes', val: 'ENC:abc' },
    ])
  })

  it('NEVER persists a value that failed to decrypt (still ENC:)', async () => {
    h.rows = [{ id: 'c1', notes: 'ENC:fail' }]
    const res = await runDecryptMigration()
    expect(res.ran).toBe(true)
    expect(res.updated).toBe(0)
    expect(h.updates).toHaveLength(0)
  })

  it('skips already-plaintext and empty/null values', async () => {
    h.rows = [
      { id: 'a', notes: 'just plain text' },
      { id: 'b', notes: '' },
      { id: 'c', notes: null },
    ]
    const res = await runDecryptMigration()
    expect(res).toEqual({ ran: true, updated: 0 })
    expect(h.updates).toHaveLength(0)
  })

  it('aborts (ran:false) without writing when the active key changes mid-flight', async () => {
    h.keyQueue = ['KEY', 'OTHER'] // capture=KEY, loop-check=OTHER → abort before reading
    h.rows = [{ id: 'c1', notes: 'ENC:abc' }]
    const res = await runDecryptMigration()
    expect(res.ran).toBe(false)
    expect(h.updates).toHaveLength(0)
  })

  it('does nothing when there is no active key', async () => {
    h.keyQueue = [null]
    h.rows = [{ id: 'c1', notes: 'ENC:abc' }]
    const res = await runDecryptMigration()
    expect(res).toEqual({ ran: false, updated: 0 })
    expect(h.updates).toHaveLength(0)
  })
})
