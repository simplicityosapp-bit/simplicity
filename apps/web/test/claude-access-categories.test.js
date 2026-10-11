/* ════════════════════════════════════════════════════════════════
   CLAUDE-ACCESS CATEGORIES — the UI's category list must match the server's.
   The single source is supabase/functions/_shared/mcp-categories.ts; the UI
   (src/lib/claudeAccess.js) and the CHECK constraint in migration 0109 mirror
   it. If any of the three drifts, a user could tick a box the server rejects,
   or the server could allow a category the UI never shows.
   Run: npm test
   ════════════════════════════════════════════════════════════════ */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { CLAUDE_CATEGORIES, CLAUDE_CONSENT_VERSION, CLAUDE_ERROR_CODES, categoriesNeedingConsent, claudeConnectCommand, claudeErrorKey, consentLines } from '../src/lib/claudeAccess'

const here = dirname(fileURLToPath(import.meta.url))
const repo = join(here, '..', '..', '..')
const read = (...p) => readFileSync(join(repo, ...p), 'utf8')

const uiKeys = CLAUDE_CATEGORIES.map((c) => c.key)

function sharedKeys() {
  const src = read('supabase', 'functions', '_shared', 'mcp-categories.ts')
  const block = src.match(/export const MCP_CATEGORIES = \[([\s\S]*?)\] as const/)
  expect(block, 'MCP_CATEGORIES not found').toBeTruthy()
  return [...block[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1])
}
function sharedSensitive() {
  const src = read('supabase', 'functions', '_shared', 'mcp-categories.ts')
  const block = src.match(/SENSITIVE_CATEGORIES[^[]*\[([\s\S]*?)\]/)
  return [...block[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1])
}
function migrationKeys() {
  const sql = read('supabase', 'migrations', '0109_mcp_tokens.sql')
  const block = sql.match(/categories\s*<@\s*ARRAY\[([\s\S]*?)\]::text\[\]/)
  expect(block, 'CHECK array not found').toBeTruthy()
  return [...block[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1])
}

describe('Claude access — category lists agree', () => {
  it('UI list == _shared/mcp-categories.ts (same keys, same order)', () => {
    expect(uiKeys).toEqual(sharedKeys())
  })

  it('UI list == migration 0109 CHECK', () => {
    expect([...uiKeys].sort()).toEqual([...migrationKeys()].sort())
  })

  it('UI sensitive badges == server sensitive set', () => {
    expect(CLAUDE_CATEGORIES.filter((c) => c.sensitive).map((c) => c.key).sort()).toEqual(sharedSensitive().sort())
  })

  it('free-text note is on tasks, finance and leads only', () => {
    expect(CLAUDE_CATEGORIES.filter((c) => c.freeText).map((c) => c.key).sort()).toEqual(['finance', 'leads', 'tasks'])
  })

  it('no category is preselected by the list itself', () => {
    for (const c of CLAUDE_CATEGORIES) expect(Object.keys(c).sort()).not.toContain('checked')
  })
})

describe('Claude access — i18n', () => {
  for (const lang of ['he', 'en', 'es', 'fr']) {
    it(`${lang}: every category, error code and flag has a string`, () => {
      const j = JSON.parse(read('packages', 'core', 'src', 'i18n', 'locales', lang, 'connections.json'))
      for (const k of uiKeys) {
        expect(j.claude.cats[k]?.name, `${lang} ${k}.name`).toBeTruthy()
        expect(j.claude.cats[k]?.desc, `${lang} ${k}.desc`).toBeTruthy()
      }
      for (const code of [...CLAUDE_ERROR_CODES, 'unknown']) expect(j.claude.errors[code], `${lang} errors.${code}`).toBeTruthy()
      expect(j.claude.sensitive).toBeTruthy()
      expect(j.claude.freeText).toBeTruthy()
      expect(j.list.expired).toBeTruthy()
    })
  }

  it('he: the two descriptions the owner specified', () => {
    const j = JSON.parse(read('packages', 'core', 'src', 'i18n', 'locales', 'he', 'connections.json'))
    expect(j.claude.cats.journal.desc).toBe('תשובות אישיות, רפלקציות וציוני Moon.')
    expect(j.claude.cats.calendar_titles.name).toBe('כותרות אירועי יומן')
    expect(j.claude.freeText).toBe('כולל טקסט חופשי שכתבת')
  })
})

describe('Claude access — consent text', () => {
  const he = JSON.parse(read('packages', 'core', 'src', 'i18n', 'locales', 'he', 'connections.json'))
  // Minimal t over the Hebrew file, honouring i18next {{var}} interpolation.
  const t = (key, vars = {}) => {
    const v = key.split('.').reduce((o, k) => o?.[k], he)
    return String(v ?? `MISSING:${key}`).replace(/\{\{(\w+)\}\}/g, (_, n) => vars[n] ?? '')
  }

  for (const lang of ['he', 'en', 'es', 'fr']) {
    it(`${lang}: every consent string exists and the placeholder is gone`, () => {
      const j = JSON.parse(read('packages', 'core', 'src', 'i18n', 'locales', lang, 'connections.json'))
      for (const k of ['reads', 'transfer', 'freeText', 'sensitive', 'responsibility', 'revoke', 'agree']) {
        expect(j.claude.consent?.[k], `${lang} consent.${k}`).toBeTruthy()
      }
      expect(j.claude.consentBody).toBeUndefined()
    })
  }

  it('he: gendered variants for the lines that address the user', () => {
    for (const k of ['transfer', 'agree', 'responsibility']) {
      expect(he.claude.consent[`${k}_male`], `${k}_male`).toBeTruthy()
      expect(he.claude.consent[`${k}_female`], `${k}_female`).toBeTruthy()
    }
    expect(he.claude.consent.responsibility_male).toContain('ואתה אחראי לוודא')
    expect(he.claude.consent.responsibility_female).toContain('ואת אחראית לוודא')
  })

  it("he: the owner's responsibility and revoke wording", () => {
    expect(he.claude.consent.responsibility).toBe('הלקוחות והמתאמנים שלך סומכים עליך. החלטה להעביר את המידע שלהם ל-Claude היא שלך, ואתה/את אחראי/ת לוודא שהיא מתאימה למה שהסכמת איתם ולחוק החל עליך.')
    expect(he.claude.consent.revoke).toContain('מידע שכבר נשלח לשיחות קיימות עם Claude נשאר בשיחות האלה, ואפשר למחוק אותן מתוך Claude.')
  })

  it('says what Claude reads, that client data goes to Claude, responsibility, and revocation', () => {
    const text = consentLines(['clients', 'tasks'], t, 'he').join('\n')
    expect(text).toContain('לקוחות וקבוצות')
    expect(text).toContain('משימות ותזכורות')
    expect(text).toMatch(/Anthropic/)
    expect(text).toMatch(/שמות, טלפונים והערות/)
    expect(text).toMatch(/סומכים עליך/)
    expect(text).toMatch(/לכבות את הגישה בכל רגע/)
    expect(text).toMatch(/שיחות קיימות עם Claude/)
    expect(text).not.toContain('MISSING')
  })

  it('consent version: UI == _shared (the server rejects any other value)', () => {
    const src = read('supabase', 'functions', '_shared', 'mcp-categories.ts')
    const server = src.match(/export const CONSENT_VERSION = '([^']+)'/)?.[1]
    expect(server).toBeTruthy()
    expect(CLAUDE_CONSENT_VERSION).toBe(server)
  })

  it('adds the free-text line only when a free-text category is picked', () => {
    expect(consentLines(['clients'], t, 'he').join('\n')).not.toContain('טקסט חופשי')
    expect(consentLines(['finance'], t, 'he').join('\n')).toContain('טקסט חופשי')
  })

  it('names the sensitive categories when any is picked', () => {
    expect(consentLines(['clients'], t, 'he').join('\n')).not.toContain('מידע רגיש')
    const s = consentLines(['clients', 'journal', 'tax_ids'], t, 'he').join('\n')
    expect(s).toMatch(/מידע רגיש: .*ת"ז \/ ח\.פ\..*יומן אישי|מידע רגיש: .*יומן אישי/)
  })
})

describe('Claude access — re-consent when editing', () => {
  it('any category outside the consent needs consent, sensitive or not', () => {
    expect(categoriesNeedingConsent(['clients', 'tasks'], ['clients', 'journal'])).toEqual(['tasks'])
    expect(categoriesNeedingConsent(['clients', 'session_notes'], ['clients'])).toEqual(['session_notes'])
  })
  it('removing, or re-choosing already-consented categories, needs none', () => {
    expect(categoriesNeedingConsent(['clients'], ['clients', 'journal'])).toEqual([])
    expect(categoriesNeedingConsent(['journal', 'clients'], ['clients', 'journal'])).toEqual([])
  })
  it('missing consent list is treated as empty (everything needs consent)', () => {
    expect(categoriesNeedingConsent(['clients'], undefined)).toEqual(['clients'])
  })
  for (const lang of ['he', 'en', 'es', 'fr']) {
    it(`${lang}: has the re-consent heading`, () => {
      const j = JSON.parse(read('packages', 'core', 'src', 'i18n', 'locales', lang, 'connections.json'))
      expect(j.claude.reconsentTitle).toBeTruthy()
    })
  }
})

describe('Claude access — error mapping', () => {
  it('known codes map to their own sentence, anything else to unknown', () => {
    expect(claudeErrorKey('rate_limited')).toBe('claude.errors.rate_limited')
    expect(claudeErrorKey('consent_required')).toBe('claude.errors.consent_required')
    expect(claudeErrorKey('unauthorized')).toBe('claude.errors.unauthorized')
    expect(claudeErrorKey('relation "mcp_tokens" does not exist')).toBe('claude.errors.unknown')
    expect(claudeErrorKey(undefined)).toBe('claude.errors.unknown')
  })
})

describe('Claude access — setup command', () => {
  it('matches the agreed format', () => {
    expect(claudeConnectCommand('https://x.supabase.co/functions/v1/claude-mcp', 'smp_abc'))
      .toBe('claude mcp add --transport http simplicity https://x.supabase.co/functions/v1/claude-mcp --header "Authorization: Bearer smp_abc"')
  })
})
