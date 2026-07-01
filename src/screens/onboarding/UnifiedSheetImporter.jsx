import { useMemo } from 'react'
import { FileSpreadsheet, X, AlertTriangle, CheckCircle2, HelpCircle, ChevronUp, ChevronDown } from 'lucide-react'
import {
  SHEET_TYPES, SHEET_TYPE_LABELS, SHEET_TYPE_HELP, ENTITY_FIELDS,
  setSheetType, remapSheetColumn, projectSheet,
} from '../../lib/sheetMapper'
import { flattenMatrix } from '../../lib/pivotImport'
import { useT } from '../../i18n/useT'
import './UnifiedSheetImporter.css'
import { Box, Txt, Btn } from '../../components/ui'

/* ════════════════════════════════════════════════════════════════
   UNIFIED SHEET IMPORTER — one card per sheet, "detect + ask".
   ════════════════════════════════════════════════════════════════
   Every sheet (from every file) gets a card:
     - ENTITY TYPE selector (clients / projects / leads / transactions /
       matrix / ignore) — auto-guessed, always changeable.
     - For flat entities: a column→field mapping where each header is a
       dropdown. UNRECOGNISED columns are highlighted so the user sets
       them (or leaves them ignored). Nothing is dropped silently.
     - For matrix sheets: year + per-row income/expense (reuses pivot).
   A footer previews the merged totals across all sheets.

   Props:
     - sheets:  array of sheet-mapping descriptors.
     - onChange(nextSheets): writes back.
   ════════════════════════════════════════════════════════════════ */

const THIS_YEAR = new Date().getFullYear()
const YEARS = [THIS_YEAR - 3, THIS_YEAR - 2, THIS_YEAR - 1, THIS_YEAR, THIS_YEAR + 1]

export default function UnifiedSheetImporter({ sheets, onChange }) {
  const { t } = useT('onboarding')
  const live = (sheets || []).filter((s) => !s.removed)

  const patch = (id, next) => onChange((sheets || []).map((s) => (s.id === id ? next : s)))
  const remove = (id) => onChange((sheets || []).map((s) => (s.id === id ? { ...s, removed: true } : s)))

  const changeType = (sheet, type) => patch(sheet.id, setSheetType(sheet, type))
  const changeColumn = (sheet, colIdx, field) => patch(sheet.id, remapSheetColumn(sheet, colIdx, field))

  /* Matrix helpers (year + per-row type). */
  const repivot = (sheet, cfgPatch) => {
    const pivot = { ...sheet.pivot, ...cfgPatch }
    const pivotTransactions = flattenMatrix(sheet.rows, { ...pivot, skipRows: new Set(pivot.skipRows || []) })
    return { ...sheet, pivot, pivotTransactions }
  }
  const setYear = (sheet, year) => patch(sheet.id, repivot(sheet, { year: year ? Number(year) : null }))
  const setRowType = (sheet, rowIdx, type) => {
    const rowTypes = { ...(sheet.pivot.rowTypes || {}) }
    let skipRows = sheet.pivot.skipRows || []
    if (type === 'skip') skipRows = Array.from(new Set([...skipRows, rowIdx]))
    else { skipRows = skipRows.filter((i) => i !== rowIdx); rowTypes[rowIdx] = type }
    patch(sheet.id, repivot(sheet, { rowTypes, skipRows }))
  }

  /* Merged preview across all live sheets. */
  const totals = useMemo(() => {
    let clients = 0; let projects = 0; let leads = 0; let txns = 0
    live.forEach((s) => {
      if (s.type === 'matrix') { txns += (s.pivotTransactions || []).length; return }
      const p = projectSheet(s)
      clients += p.clients.length; projects += p.projects.length; leads += p.leads.length; txns += p.transactions.length
    })
    return { clients, projects, leads, txns }
  }, [live])

  if (!live.length) return null

  return (
    <Box className="usi">
      {live.map((sheet) => {
        const isFlat = sheet.type !== 'matrix' && sheet.type !== 'ignore'
        const fields = ENTITY_FIELDS[sheet.type] || []
        const sample = (colIdx) => {
          for (const r of sheet.rows) { const v = String(r[colIdx] ?? '').trim(); if (v) return v }
          return ''
        }
        /* What this one table will actually produce — so a sheet typed as
           the wrong entity (yielding nothing) gets a visible, fixable nudge
           instead of silently contributing zero. */
        let cardYield = 0
        if (sheet.type === 'matrix') cardYield = (sheet.pivotTransactions || []).length
        else if (sheet.type !== 'ignore') { const p = projectSheet(sheet); cardYield = p.clients.length + p.projects.length + p.leads.length + p.transactions.length + (p.sessions?.length || 0) }
        const yieldHintField = t(`sheet.yieldField.${sheet.type}`, { defaultValue: t('sheet.yieldField.default') })
        return (
          <Box className="usi-card" key={sheet.id}>
            <Box className="usi-head">
              <Txt className="usi-ic"><FileSpreadsheet size={15} strokeWidth={1.7} aria-hidden="true" /></Txt>
              <Box className="usi-id">
                <Txt as="p" className="usi-name">{sheet.sheetName || sheet.fileName}</Txt>
                {sheet.sheetName && <Txt as="p" className="usi-file">{sheet.fileName}</Txt>}
              </Box>
              <Btn type="button" className="usi-x" onClick={() => remove(sheet.id)} aria-label={t('sheet.removeAria')}><X size={14} strokeWidth={2} aria-hidden="true" /></Btn>
            </Box>

            {/* Raw preview — first rows exactly as read, so the user can
                spot a mis-read (wrong header row, shifted columns) before
                trusting the mapping. Collapsed by default. */}
            <Btn type="button" className="usi-toggle-cols" aria-expanded={!!sheet._showRaw}
              onClick={() => patch(sheet.id, { ...sheet, _showRaw: !sheet._showRaw })}>
              {sheet._showRaw ? t('sheet.rawHide') : t('sheet.rawShow')} {t('sheet.rawToggle')} {sheet._showRaw ? <ChevronUp size={14} strokeWidth={1.5} aria-hidden="true" /> : <ChevronDown size={14} strokeWidth={1.5} aria-hidden="true" />}
            </Btn>
            {sheet._showRaw && (
              <Box className="usi-raw">
                <table className="usi-raw-table">
                  <thead>
                    <tr>{sheet.headers.map((h, i) => <th key={i}>{h || t('sheet.rawEmpty')}</th>)}</tr>
                  </thead>
                  <tbody>
                    {sheet.rows.slice(0, 3).map((r, ri) => (
                      <tr key={ri}>{sheet.headers.map((_, ci) => <td key={ci}>{String(r[ci] ?? '')}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </Box>
            )}

            {/* Entity type */}
            <Box className="usi-field">
              <Box as="label" className="usi-label" id={`usi-type-${sheet.id}`}>{t('sheet.whatsHere')}</Box>
              <select className="usi-select" value={sheet.type} aria-labelledby={`usi-type-${sheet.id}`}
                onChange={(e) => changeType(sheet, e.target.value)}>
                {SHEET_TYPES.map((st) => <option key={st} value={st}>{SHEET_TYPE_LABELS[st]}</option>)}
              </select>
              {SHEET_TYPE_HELP[sheet.type] && <Txt as="p" className="usi-hint">{SHEET_TYPE_HELP[sheet.type]}</Txt>}
            </Box>

            {/* Flat entity → column mapping. Unmapped columns are shown
                first and highlighted (they need the user); recognized ones
                collapse behind a toggle so a 15-column sheet isn't a wall. */}
            {isFlat && (() => {
              const colData = sheet.headers
                .map((h, colIdx) => ({ h, colIdx, field: sheet.mapping[colIdx] || '' }))
                /* Keep columns that have a header AND either are already
                   mapped or actually contain data — an unmapped, totally
                   empty column is just noise, so we don't ask about it. */
                .filter((c) => c.h && (c.field || sample(c.colIdx)))
              const unmapped = colData.filter((c) => !c.field)
              const recognized = colData.filter((c) => c.field)
              const showAll = !!sheet._showAllCols
              const renderCol = ({ h, colIdx, field }) => (
                <Box className={`usi-col${field ? '' : ' unmapped'}`} key={colIdx}>
                  <Txt className="usi-col-name">
                    {field ? <CheckCircle2 size={12} strokeWidth={2} aria-hidden="true" /> : <HelpCircle size={12} strokeWidth={2} aria-hidden="true" />}
                    <Txt className="usi-col-h" title={h}><bdi>{h}</bdi></Txt>
                    {sample(colIdx) && <Txt className="usi-col-sample" title={sample(colIdx)}>{t('sheet.colSample')}<bdi>{sample(colIdx)}</bdi></Txt>}
                  </Txt>
                  <select className="usi-select usi-col-select" value={field} aria-label={t('sheet.colMapAria', { header: h })} onChange={(e) => changeColumn(sheet, colIdx, e.target.value)}>
                    <option value="">{t('sheet.colIgnore')}</option>
                    {fields.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                  </select>
                </Box>
              )
              return (
                <Box className="usi-cols">
                  <Txt as="p" className="usi-cols-intro">
                    {t('sheet.colsIntro')}
                  </Txt>
                  {colData.length === 0 && (
                    <Txt as="p" className="usi-ask"><AlertTriangle size={13} strokeWidth={1.9} aria-hidden="true" /> {t('sheet.noCols')}</Txt>
                  )}
                  {unmapped.length > 0 && (
                    <>
                      <Txt as="p" className="usi-ask"><HelpCircle size={13} strokeWidth={1.9} aria-hidden="true" /> {t('sheet.unmapped', { count: unmapped.length })}</Txt>
                      {unmapped.map(renderCol)}
                    </>
                  )}
                  {recognized.length > 0 && (
                    <>
                      <Btn type="button" className="usi-toggle-cols" aria-expanded={showAll} onClick={() => patch(sheet.id, { ...sheet, _showAllCols: !showAll })}>
                        {showAll ? t('sheet.recognizedHide', { count: recognized.length }) : t('sheet.recognizedShow', { count: recognized.length })} {showAll ? <ChevronUp size={14} strokeWidth={1.5} aria-hidden="true" /> : <ChevronDown size={14} strokeWidth={1.5} aria-hidden="true" />}
                      </Btn>
                      {showAll && recognized.map(renderCol)}
                    </>
                  )}
                </Box>
              )
            })()}

            {/* Matrix → year + per-row type */}
            {sheet.type === 'matrix' && sheet.pivot && (() => {
              const skip = new Set(sheet.pivot.skipRows || [])
              const rowTypes = sheet.pivot.rowTypes || {}
              const hasMonths = (sheet.pivot.periodCols || []).some((c) => c.month)
              const labelCol = sheet.pivot.labelCol
              return (
                <>
                  {hasMonths && (
                    <Box className="usi-field">
                      <Box as="label" className="usi-label" id={`usi-year-${sheet.id}`}>{sheet.pivot.year ? t('sheet.yearDetected') : t('sheet.yearLabel')}</Box>
                      <select className="usi-select" value={sheet.pivot.year || ''} aria-labelledby={`usi-year-${sheet.id}`} onChange={(e) => setYear(sheet, e.target.value)}>
                        <option value="">{t('sheet.pickYear')}</option>
                        {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
                      </select>
                      {!sheet.pivot.year && <Txt as="p" className="usi-ask"><AlertTriangle size={13} strokeWidth={1.9} aria-hidden="true" /> {t('sheet.yearMissing')}</Txt>}
                    </Box>
                  )}
                  <Txt as="p" className="usi-cols-intro">
                    {t('sheet.matrixIntro')}
                  </Txt>
                  <Box className="usi-rows">
                    {sheet.rows.map((r, rowIdx) => {
                      const label = String(r[labelCol] ?? '').trim()
                      if (!label) return null
                      const isSkip = skip.has(rowIdx)
                      const type = rowTypes[rowIdx] || 'income'
                      return (
                        <Box className={`usi-row${isSkip ? ' skip' : ''}`} key={rowIdx}>
                          <Txt className="usi-row-label">{label}</Txt>
                          <Box className="usi-row-types" role="group" aria-label={t('sheet.rowTypeAria', { label })}>
                            <Btn type="button" aria-pressed={!isSkip && type === 'income'} className={`usi-rt${!isSkip && type === 'income' ? ' on income' : ''}`} onClick={() => setRowType(sheet, rowIdx, 'income')}>{t('sheet.income')}</Btn>
                            <Btn type="button" aria-pressed={!isSkip && type === 'expense'} className={`usi-rt${!isSkip && type === 'expense' ? ' on expense' : ''}`} onClick={() => setRowType(sheet, rowIdx, 'expense')}>{t('sheet.expense')}</Btn>
                            <Btn type="button" aria-pressed={isSkip} className={`usi-rt${isSkip ? ' on skip' : ''}`} onClick={() => setRowType(sheet, rowIdx, 'skip')}>{t('sheet.skip')}</Btn>
                          </Box>
                        </Box>
                      )
                    })}
                  </Box>
                </>
              )
            })()}

            {sheet.type !== 'ignore' && cardYield === 0 && (
              <Txt as="p" className="usi-ask"><AlertTriangle size={13} strokeWidth={1.9} aria-hidden="true" /> {t('sheet.noYield', { field: yieldHintField })}</Txt>
            )}
          </Box>
        )
      })}

      <Box className="usi-summary">
        {totals.clients + totals.projects + totals.leads + totals.txns === 0 ? (
          <Txt as="p" className="usi-summary-line">{t('sheet.summaryEmpty')}</Txt>
        ) : (
          <Txt as="p" className="usi-summary-line">
            {t('sheet.summaryLead')}
            {totals.clients > 0 && <> <strong>{totals.clients}</strong> {t('sheet.summary.clients')} ·</>}
            {totals.projects > 0 && <> <strong>{totals.projects}</strong> {t('sheet.summary.projects')} ·</>}
            {totals.leads > 0 && <> <strong>{totals.leads}</strong> {t('sheet.summary.leads')} ·</>}
            {' '}<strong>{totals.txns}</strong> {t('sheet.summary.transactions')}
          </Txt>
        )}
      </Box>
    </Box>
  )
}
