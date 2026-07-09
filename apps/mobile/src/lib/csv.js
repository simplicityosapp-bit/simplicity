// CSV cell helpers (ported from web lib/export.js). neutralizeFormula prevents
// CSV/formula injection: a cell a spreadsheet would treat as a formula
// (=, +, -, @, tab, CR) is prefixed with a quote so it opens as text. Phone
// numbers (+972…) and negative numbers are left intact — made only of digits and
// number/phone punctuation, they can't carry a payload (HYPERLINK/WEBSERVICE/cmd
// all need a letter or '(') and stay re-importable.
export function neutralizeFormula(s) {
  if (!/^[=+@\t\r-]/.test(s)) return s
  if (/^[+-]?[\d\s()./-]+$/.test(s)) return s
  return `'${s}`
}

// A fully-escaped CSV cell: formula-neutralized, then double-quoted with inner
// quotes doubled.
export function csvCell(v) {
  const s = v == null ? '' : neutralizeFormula(String(v))
  return `"${s.replace(/"/g, '""')}"`
}
