/* Consent rules, now shared by both apps. The phone had its own copy of the
   versions and no re-acceptance gate; these pin the rules the gate runs on. */
import { describe, it, expect } from 'vitest'
import {
  PRIVACY_VERSION, DPA_VERSION, TERMS_VERSION,
  buildConsent, buildReacceptance, needsReacceptance, consentRowsFromMetadata,
} from '../src/domain/legal'

const NOW = '2026-09-15T10:00:00.000Z'

describe('needsReacceptance', () => {
  it('asks a user with no recorded consent', () => {
    expect(needsReacceptance({ user_metadata: {} })).toBe(true)
    expect(needsReacceptance(null)).toBe(true)
  })

  it('lets an up-to-date user through', () => {
    expect(needsReacceptance({ user_metadata: buildConsent({}, NOW) })).toBe(false)
  })

  it('asks again when any single document moved — the DPA included', () => {
    const md = buildConsent({}, NOW)
    expect(needsReacceptance({ user_metadata: { ...md, privacy_version: '0.9' } })).toBe(true)
    expect(needsReacceptance({ user_metadata: { ...md, dpa_version: '0.9' } })).toBe(true)
    expect(needsReacceptance({ user_metadata: { ...md, terms_version: '0.9' } })).toBe(true)
  })
})

describe('buildReacceptance', () => {
  it('restamps the three documents and leaves the marketing choice alone', () => {
    const r = buildReacceptance(NOW)
    expect(r).toEqual({
      privacy_accepted_at: NOW, privacy_version: PRIVACY_VERSION,
      dpa_accepted_at: NOW, dpa_version: DPA_VERSION,
      terms_accepted_at: NOW, terms_version: TERMS_VERSION,
    })
    expect('marketing_consent' in r).toBe(false)
  })
})

describe('consentRowsFromMetadata', () => {
  it('records every acceptance and the marketing choice, keyed by the moment', () => {
    const rows = consentRowsFromMetadata(buildConsent({ marketing: false }, NOW), 'google_oauth')
    expect(rows.map((r) => r.kind)).toEqual(['privacy', 'dpa', 'terms', 'marketing'])
    expect(rows.every((r) => r.source === 'google_oauth' && r.accepted_at === NOW)).toBe(true)
    expect(rows[3]).toMatchObject({ kind: 'marketing', accepted: false, version: null })
  })

  it('records nothing for a user who never consented', () => {
    expect(consentRowsFromMetadata({})).toEqual([])
    expect(consentRowsFromMetadata(null)).toEqual([])
  })
})
