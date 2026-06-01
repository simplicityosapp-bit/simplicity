/* ════════════════════════════════════════════════════════════════
   MULTI IMPORT — many files × many sheets → one merged review.
   ════════════════════════════════════════════════════════════════
   Coaches keep their books across SEVERAL files and, within a file,
   one sheet PER YEAR ("2025", "2026"). Income and expense rows are
   mixed in the same matrix. This module:
     1. Reads every file (CSV = one source; XLSX = one source per sheet).
     2. For each MATRIX source, derives the year from the sheet name
        (overridable) and a per-row income/expense guess (overridable).
     3. Exposes each source as an independent, editable "pivot source"
        so the UI can show one card per file/sheet.
     4. flattenAllSources() merges every source's transactions into one
        list for the unified review wizard.
   Flat (row-per-record) sheets are passed through to the existing CSV
   pipeline untouched; this module only owns the matrix sources.
   ════════════════════════════════════════════════════════════════ */

import { parseXlsxSheets, parseCsvFile } from './csvImport'
import {
  detectMatrix, buildPivotConfig, flattenMatrix, yearFromSheetName,
} from './pivotImport'

/* A stable id for a source (file + sheet), used as React keys + merge. */
const sourceId = (fileName, sheetName) => `${fileName}::${sheetName || ''}`

/* Build one matrix source descriptor from a sheet's rows. */
function buildMatrixSource(fileName, sheetName, rows) {
  const headers = (rows[0] || []).map((h) => (h == null ? '' : String(h)).trim())
  const dataRows = rows.slice(1)
  const detection = detectMatrix(headers)
  const year = yearFromSheetName(sheetName) || yearFromSheetName(fileName)
  const config = buildPivotConfig(headers, dataRows, detection, year)
  const transactions = flattenMatrix(dataRows, { ...config, skipRows: new Set(config.skipRows) })
  return {
    id: sourceId(fileName, sheetName),
    fileName,
    sheetName: sheetName || null,
    headers,
    rows: dataRows,
    detection,
    yearFromName: year,            /* what we read off the name (null if none) */
    config,                        /* { labelCol, periodCols, skipRows, rowTypes, year } */
    transactions,
    isMatrix: detection.isMatrix,
  }
}

/* Read a single File into its sources. XLSX → one per sheet; CSV → one.
   Returns { matrixSources: [], flatParsed: parsed|null }.
   - matrixSources: sheets detected as matrices (editable pivot sources).
   - flatParsed: when a CSV / first sheet is NOT a matrix, the normal
     parsed_data so the flat pipeline still works for plain tables. */
export async function readFileSources(file) {
  const isCsvLike = /\.(csv|tsv|txt)$/i.test(file.name) || file.type === 'text/csv' || file.type === 'text/plain'
  if (isCsvLike) {
    const parsed = await parseCsvFile(file)
    if (parsed?.pivot?.detected) {
      const src = buildMatrixSource(file.name, null, [parsed.headers, ...(parsed.rows || [])])
      return { matrixSources: [src], flatParsed: null }
    }
    return { matrixSources: [], flatParsed: parsed }
  }
  const sheets = await parseXlsxSheets(file)
  const matrixSources = []
  let flatParsed = null
  sheets.forEach(({ sheetName, rows }) => {
    const headers = (rows[0] || []).map((h) => (h == null ? '' : String(h)).trim())
    const det = detectMatrix(headers)
    if (det.isMatrix) {
      matrixSources.push(buildMatrixSource(file.name, sheetName, rows))
    }
  })
  return { matrixSources, flatParsed }
}

/* Read MANY files → a merged set of matrix sources (+ any flat parses).
   Sources keep their identity so the UI shows one editable card each. */
export async function readManyFiles(files) {
  const all = []
  const flats = []
  for (const file of Array.from(files || [])) {
    // eslint-disable-next-line no-await-in-loop
    const { matrixSources, flatParsed } = await readFileSources(file)
    all.push(...matrixSources)
    if (flatParsed) flats.push(flatParsed)
  }
  return { matrixSources: all, flatParsed: flats }
}

/* Re-derive one source's transactions after a config edit. */
export function repivotSource(source, configPatch) {
  const config = { ...source.config, ...configPatch }
  const transactions = flattenMatrix(source.rows, { ...config, skipRows: new Set(config.skipRows || []) })
  return { ...source, config, transactions }
}

/* Merge every source's transactions into one wizard-ready list. Each
   row carries its source id + a synthetic _row key (sourceId+cell) so
   review toggles stay unique across files/sheets. The row label becomes
   a project OR client link per the source's labelKind (income rows
   only); expense rows keep the label as the transaction description. */
export function flattenAllSources(sources) {
  const txns = []
  const projectNames = new Set()
  const clientNames = new Set()
  ;(sources || []).forEach((src) => {
    if (src.skipped || src.removed) return
    const yr = src.config.year
    ;(src.transactions || []).forEach((t) => {
      const asProject = t.labelKind === 'project' && t.label
      const asClient = t.labelKind === 'client' && t.label
      if (asProject) projectNames.add(t.label)
      if (asClient) clientNames.add(t.label)
      txns.push({
        _row: `${src.id}#${t._row}_${t._col}`,
        amount: t.amount,
        type: t.type,
        date: t.date,
        /* Recurring rate-table rows carry their cadence so the import can
           create a recurring rule instead of a (dateless) one-off. */
        recurring: !!t.recurring,
        cadence: t.cadence || null,
        day_of_month: t.day_of_month || null,
        project_name: asProject ? t.label : null,
        client_name: asClient ? t.label : null,
        desc: `${t.label || ''}${t.period ? ` · ${t.period}` : ''}${yr ? ` ${yr}` : ''}`.trim() || null,
        _source: src.id,
      })
    })
  })
  return {
    transactions: txns,
    projects: Array.from(projectNames).map((n) => ({ name: n })),
    clients: Array.from(clientNames).map((n) => ({ name: n })),
  }
}

/* Sources that still need a year (months present, no year resolved) —
   the UI blocks proceeding until each is set. */
export function sourcesMissingYear(sources) {
  return (sources || []).filter((s) => {
    if (s.skipped) return false
    const hasMonths = (s.config.periodCols || []).some((c) => c.month)
    return hasMonths && !s.config.year
  })
}
