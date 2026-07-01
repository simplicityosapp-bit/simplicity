/* ════════════════════════════════════════════════════════════════
   WHATSAPP SUITE — phone normalization + wa.me link building for the
   manual click-to-chat "send via WhatsApp" feature.
   Run: npm test
   ════════════════════════════════════════════════════════════════ */
import { describe, it, expect } from 'vitest'
import { normalizeIsraeliPhone, waLink, fillTemplate, resolveMessage } from '../src/lib/whatsapp'

describe('normalizeIsraeliPhone — local Israeli forms', () => {
  const cases = {
    '0501234567': '972501234567',
    '050-1234567': '972501234567',
    '050 123 4567': '972501234567',
    '(050) 123-4567': '972501234567',
    '03-1234567': '97231234567', // landline
    '  0501234567  ': '972501234567', // surrounding whitespace
    '501234567': '972501234567', // bare national number, no leading 0
  }
  for (const [input, expected] of Object.entries(cases)) {
    it(`${JSON.stringify(input)} → ${expected}`, () => {
      expect(normalizeIsraeliPhone(input)).toBe(expected)
    })
  }
})

describe('normalizeIsraeliPhone — international forms', () => {
  const cases = {
    '972501234567': '972501234567',
    '+972501234567': '972501234567',
    '+972 50 123 4567': '972501234567',
    '00972501234567': '972501234567',
    '+1 (555) 123-4567': '15551234567', // non-IL country code respected
  }
  for (const [input, expected] of Object.entries(cases)) {
    it(`${JSON.stringify(input)} → ${expected}`, () => {
      expect(normalizeIsraeliPhone(input)).toBe(expected)
    })
  }
})

describe('normalizeIsraeliPhone — empty / invalid', () => {
  for (const input of ['', null, undefined, '   ', 'abc', '+', '-- --']) {
    it(`${JSON.stringify(input)} → ''`, () => {
      expect(normalizeIsraeliPhone(input)).toBe('')
    })
  }
})

describe('waLink', () => {
  it('builds a numbered link with encoded Hebrew text', () => {
    expect(waLink('050-1234567', 'שלום דנה')).toBe(
      'https://wa.me/972501234567?text=' + encodeURIComponent('שלום דנה'),
    )
  })

  it('omits the query when there is no text', () => {
    expect(waLink('0501234567', '')).toBe('https://wa.me/972501234567')
    expect(waLink('0501234567')).toBe('https://wa.me/972501234567')
  })

  it('uses the contact-picker form when phone is empty/invalid', () => {
    expect(waLink('', 'hi')).toBe('https://wa.me/?text=hi')
    expect(waLink('abc', 'hi')).toBe('https://wa.me/?text=hi')
  })

  it('encodes newlines and special characters', () => {
    const text = 'שורה ראשונה\nשורה שנייה & עוד'
    expect(waLink('0501234567', text)).toBe(
      'https://wa.me/972501234567?text=' + encodeURIComponent(text),
    )
  })
})

describe('fillTemplate', () => {
  it('replaces tokens with values', () => {
    expect(fillTemplate('שלום {{name}}, פגישה ב-{{date}}', { name: 'דנה', date: '12/06' }))
      .toBe('שלום דנה, פגישה ב-12/06')
  })
  it('tolerates whitespace inside braces', () => {
    expect(fillTemplate('hi {{ name }}', { name: 'A' })).toBe('hi A')
  })
  it('collapses unknown/missing tokens to empty', () => {
    expect(fillTemplate('a {{x}} b {{y}}', { x: 'X' })).toBe('a X b ')
  })
  it('returns empty string for empty template', () => {
    expect(fillTemplate('', { name: 'x' })).toBe('')
    expect(fillTemplate(null)).toBe('')
  })
})

describe('resolveMessage', () => {
  const vars = { name: 'דנה' }
  it('uses the custom template when set', () => {
    expect(resolveMessage('הי {{name}}', vars, 'DEFAULT')).toBe('הי דנה')
  })
  it('falls back to the default when custom is empty/blank', () => {
    expect(resolveMessage('', vars, 'DEFAULT')).toBe('DEFAULT')
    expect(resolveMessage('   ', vars, 'DEFAULT')).toBe('DEFAULT')
    expect(resolveMessage(null, vars, 'DEFAULT')).toBe('DEFAULT')
  })
})
