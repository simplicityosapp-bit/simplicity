/* ════════════════════════════════════════════════════════════════
   IMPORT FLOW — shared file→sheets→review pipeline.
   ════════════════════════════════════════════════════════════════
   ONE engine behind BOTH entry points so the experience is identical:
     - onboarding Step 2 ("I have data")  ── multi-file, multi-sheet
     - in-app Settings → "ייבוא מקובץ"     ── same, was single-sheet-flat
   buildSheetsFromFiles() reads every sheet of every file into editable
   sheet descriptors (entity type + column mapping + matrix pivot), and
   buildReviewFromSheets() projects those descriptors into the merged
   review object the review wizard consumes. Both are the exact logic
   the onboarding flow already used — lifted here so the in-app path
   gets multi-sheet + matrix + the richer recognition for free.
   ════════════════════════════════════════════════════════════════ */

import { parseXlsxSheets, parseCsvFile, ROW_CAP } from './csvImport'
import { buildSheetMapping, projectSheet } from './sheetMapper'
import { buildPivotConfig, detectMatrix, flattenMatrix, yearFromSheetName } from './pivotImport'
import { flattenAllSources } from './multiImport'

/* The accepted file types — shared by BOTH file inputs (onboarding Step 2
   and the in-app Settings import) so they never drift. */
export const ACCEPT = '.csv,.tsv,.txt,.xlsx,.xls,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

const isCsvLike = (file) => /\.(csv|tsv|txt)$/i.test(file.name) || file.type === 'text/csv' || file.type === 'text/plain'

/* Read EVERY sheet of EVERY picked file into a unified list of editable
   sheet descriptors. CSV → one descriptor; XLSX → one per sheet (coaches
   keep one sheet per year). Each is capped to ROW_CAP persisted rows
   (flagged truncated), and matrix sheets carry a pre-filled pivot config.
   Returns { sheets, names } — names is the comma-joined file list. */
export async function buildSheetsFromFiles(fileList) {
  const files = Array.from(fileList || [])
  const sheets = []
  for (const file of files) {
    let raw
    if (isCsvLike(file)) {
      const csv = await parseCsvFile(file) // parse ONCE; reuse headers+rows
      raw = [{ sheetName: null, rows: [csv.headers, ...(csv.rows || [])] }]
    } else {
      raw = await parseXlsxSheets(file)
    }
    raw.forEach(({ sheetName, rows }) => {
      /* Cap the data rows we persist — parsed_data lives in a JSONB blob,
         so an oversized sheet would bloat it. Keep header + first ROW_CAP
         and flag the cut so the UI can surface it. */
      const rawDataCount = Math.max(0, (rows?.length || 0) - 1)
      const capped = rawDataCount > ROW_CAP ? [rows[0], ...rows.slice(1, ROW_CAP + 1)] : rows
      const sheet = buildSheetMapping(file.name, sheetName, capped)
      if (rawDataCount > ROW_CAP) {
        sheet.truncated = true
        sheet.raw_rows = rawDataCount
        sheet.row_cap = ROW_CAP
      }
      if (sheet.type === 'matrix') {
        const headers = sheet.headers
        const det = detectMatrix(headers)
        const year = yearFromSheetName(sheetName) || yearFromSheetName(file.name)
        sheet.pivot = buildPivotConfig(headers, sheet.rows, det, year)
        sheet.pivotTransactions = flattenMatrix(sheet.rows, { ...sheet.pivot, skipRows: new Set(sheet.pivot.skipRows) })
      }
      sheets.push(sheet)
    })
  }
  return { sheets, names: files.map((f) => f.name).join(', ') }
}

/* Project the sheet descriptors in `pd.sheets` into the merged review
   object the wizard consumes: { clients, projects, leads, transactions,
   sessions }. Flat sheets project their rows; matrix sheets flatten to
   transactions (with project/client links per labelKind). Records are
   MERGED by name across sheets (the same client appears on the clients,
   meetings and payments sheets, each carrying different fields), filling
   empty fields from later occurrences so nothing is lost. Sessions are a
   ledger — each row is a distinct meeting, so they are NOT merged.
   Returns null when nothing is reviewable. */
export function buildReviewFromSheets(pd) {
  if (!pd) return null
  let review = pd
  if (pd.sheets?.length) {
    const live = pd.sheets.filter((s) => !s.removed)
    const acc = { clients: [], projects: [], leads: [], transactions: [], sessions: [] }
    let truncated = false; let rowCap = ROW_CAP; let rawRows = 0
    live.forEach((sheet) => {
      if (sheet.truncated) { truncated = true; rowCap = sheet.row_cap || ROW_CAP; rawRows += sheet.raw_rows || 0 }
      if (sheet.type === 'matrix') {
        const merged = flattenAllSources([{ id: sheet.id, config: sheet.pivot, transactions: sheet.pivotTransactions, fileName: sheet.fileName }])
        acc.transactions.push(...merged.transactions)
        acc.projects.push(...merged.projects)
        acc.clients.push(...merged.clients)
      } else {
        const p = projectSheet(sheet)
        acc.clients.push(...p.clients)
        acc.projects.push(...p.projects)
        acc.leads.push(...p.leads)
        acc.transactions.push(...p.transactions)
        acc.sessions.push(...(p.sessions || []))
      }
    })
    const mergeByName = (arr) => {
      const byKey = new Map()
      arr.forEach((x) => {
        const k = (x.name || '').trim().toLowerCase()
        if (!k) return
        if (!byKey.has(k)) { byKey.set(k, { ...x }); return }
        const cur = byKey.get(k)
        Object.entries(x).forEach(([field, val]) => {
          const empty = cur[field] == null || cur[field] === '' || cur[field] === 0
          const incoming = val != null && val !== '' && val !== 0
          if (empty && incoming) cur[field] = val
        })
      })
      return Array.from(byKey.values())
    }
    review = {
      ...pd, ...acc,
      projects: mergeByName(acc.projects), clients: mergeByName(acc.clients), leads: mergeByName(acc.leads),
      sessions: acc.sessions, /* ledger — not merged by name */
      truncated, row_cap: rowCap, raw_rows: rawRows,
    }
  }
  const reviewable =
    pd.kind === 'csv' &&
    ((review.clients?.length || 0) + (review.projects?.length || 0)
      + (review.leads?.length || 0) + (review.transactions?.length || 0)
      + (review.sessions?.length || 0)) > 0
  return reviewable ? review : null
}
