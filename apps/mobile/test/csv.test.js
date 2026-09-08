/* ════════════════════════════════════════════════════════════════
   CSV EXPORT — a spreadsheet must not run what a client typed.
   ════════════════════════════════════════════════════════════════
   Both export paths (Finance and Settings) hand these cells to
   Share.share(), so whatever a client's name or note contains ends up in
   a file someone opens in Excel or Sheets. A cell starting with =, +, -,
   @, tab or CR is a FORMULA there, and =HYPERLINK / =WEBSERVICE / =cmd
   are the usual ways that gets abused.

   The rule has a second half that is easy to lose in a refactor: phone
   numbers and negative amounts also start with + and -, and quoting those
   would corrupt every export in exchange for nothing, since a payload
   needs a letter or a '(' to do anything. These pin both halves — the
   dangerous shapes get neutralised AND the ordinary ones survive
   re-import intact.
   ════════════════════════════════════════════════════════════════ */

import { describe, it, expect } from 'vitest'
import { neutralizeFormula, csvCell } from '../src/lib/csv'

describe('a cell a spreadsheet would execute', () => {
  it('is prefixed so it opens as text', () => {
    expect(neutralizeFormula('=1+1')).toBe("'=1+1")
    expect(neutralizeFormula('=HYPERLINK("http://x","click")')).toBe("'=HYPERLINK(\"http://x\",\"click\")")
    expect(neutralizeFormula('@SUM(A1:A9)')).toBe("'@SUM(A1:A9)")
    expect(neutralizeFormula('+cmd|calc')).toBe("'+cmd|calc")
    expect(neutralizeFormula('-2+3+cmd')).toBe("'-2+3+cmd")
  })

  it('covers the whitespace leaders too, not just the obvious ones', () => {
    expect(neutralizeFormula('\t=1+1')).toBe("'\t=1+1")
    expect(neutralizeFormula('\r=1+1')).toBe("'\r=1+1")
  })
})

describe('a cell that only looks dangerous', () => {
  /* The other half of the rule. Quoting these would corrupt ordinary
     exports — a phone number that comes back as text with a leading
     apostrophe is no longer a phone number. */
  it('leaves phone numbers alone', () => {
    expect(neutralizeFormula('+972-50-1234567')).toBe('+972-50-1234567')
    expect(neutralizeFormula('050-1234567')).toBe('050-1234567')
    expect(neutralizeFormula('+972 (50) 123.4567')).toBe('+972 (50) 123.4567')
  })

  it('leaves negative numbers alone', () => {
    expect(neutralizeFormula('-1200')).toBe('-1200')
    expect(neutralizeFormula('-1200.50')).toBe('-1200.50')
  })

  /* Digits and punctuation cannot carry a payload, but the moment a
     LETTER appears the exemption has to stop — that is what separates
     "-1200" from "-2+3+cmd". */
  it('stops exempting the moment a letter appears', () => {
    expect(neutralizeFormula('-1200abc')).toBe("'-1200abc")
    expect(neutralizeFormula('+972cmd')).toBe("'+972cmd")
  })
})

describe('ordinary text', () => {
  it('passes through untouched', () => {
    expect(neutralizeFormula('דנה כהן')).toBe('דנה כהן')
    expect(neutralizeFormula('Session #3')).toBe('Session #3')
    expect(neutralizeFormula('')).toBe('')
  })
})

describe('csvCell', () => {
  it('quotes every value', () => {
    expect(csvCell('דנה')).toBe('"דנה"')
    expect(csvCell(1200)).toBe('"1200"')
  })

  /* A quote inside a cell must be doubled, or it closes the field early
     and every column after it shifts. */
  it('doubles inner quotes so the row does not shift', () => {
    expect(csvCell('she said "yes"')).toBe('"she said ""yes"""')
  })

  it('turns null and undefined into an empty cell, not the word', () => {
    expect(csvCell(null)).toBe('""')
    expect(csvCell(undefined)).toBe('""')
  })

  it('neutralises and quotes together', () => {
    expect(csvCell('=1+1')).toBe('"\'=1+1"')
  })

  /* A comma or a newline inside a cell is safe only because the whole
     field is quoted — worth pinning, since dropping the quotes would look
     harmless in a diff. */
  it('contains commas and newlines inside the quoted field', () => {
    expect(csvCell('a,b')).toBe('"a,b"')
    expect(csvCell('line1\nline2')).toBe('"line1\nline2"')
  })
})
