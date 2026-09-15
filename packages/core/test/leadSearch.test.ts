/* The one lead search both boards use. */
import { describe, it, expect } from 'vitest'
import { matchLead, leadLookups } from '../src/domain/leadSearch'

const dana = { name: 'Dana Cohen', phone: '052-123-4567', notes: 'wants mornings', source_id: 's1', project_id: 'p1' }
const lookups = leadLookups({ sources: [{ id: 's1', name: 'Instagram' }], projects: [{ id: 'p1', name: 'Yoga' }] })

describe('matchLead', () => {
  it('matches blank queries', () => { expect(matchLead(dana, '  ')).toBe(true) })
  it('is case-insensitive', () => { expect(matchLead(dana, 'dana')).toBe(true) })
  it('reaches the phone, notes, source and project', () => {
    expect(matchLead(dana, 'mornings')).toBe(true)
    expect(matchLead(dana, 'instagram', lookups)).toBe(true)
    expect(matchLead(dana, 'yoga', lookups)).toBe(true)
  })
  it('needs every term to match', () => {
    expect(matchLead(dana, 'dana 052')).toBe(true)
    expect(matchLead(dana, 'dana 099')).toBe(false)
  })
  it('matches a phone typed without separators, and only for phone-like terms', () => {
    expect(matchLead(dana, '0521234567')).toBe(true)
    // A term mixing letters and digits gets no digit fallback.
    expect(matchLead(dana, 'zz1')).toBe(false)
    // Fewer than three digits is not a phone search: "1234" only matches once separators are stripped.
    expect(matchLead({ phone: '05-21' }, '0521')).toBe(true)
    expect(matchLead({ phone: '0-5' }, '05')).toBe(false)
  })
})
