import { useEffect, useMemo, useRef } from 'react'
import { X, FileSpreadsheet, CheckCircle2, AlertTriangle, CreditCard, Sparkles } from 'lucide-react'
import { SHEET_TYPES, SHEET_TYPE_LABELS, setSheetType, projectSheet, sheetRecognitionInfo } from '../../lib/sheetMapper'
import { useT } from '../../i18n/useT'
import './RecognitionWizard.css'
import { Box, Txt, Btn } from '../../components/ui'

/* ════════════════════════════════════════════════════════════════
   RECOGNITION WIZARD — "we read your file; confirm what's in it".
   ════════════════════════════════════════════════════════════════
   A large centered dialog shown right after a file is read, BEFORE the
   detailed per-column mapping (UnifiedSheetImporter). It is ADAPTIVE:
     - a clear file → a one-line summary + a single "looks good" confirm,
     - an ambiguous sheet (yields nothing, or a payments table that also
       holds a client roster) → a focused nudge with the entity-type
       picker pre-set to our guess, so the user only confirms/corrects.
   It owns NO data of its own — it reads the same sheet descriptors the
   importer uses and writes type changes back through onChange, so the
   detailed editor (reachable via "advanced") stays the single source.
   ════════════════════════════════════════════════════════════════ */

export default function RecognitionWizard({ sheets, onChange, onConfirm, onEditManually }) {
  const { t } = useT('onboarding')
  const panelRef = useRef(null)
  const restoreFocusRef = useRef(null)

  const live = useMemo(() => (sheets || []).filter((s) => !s.removed), [sheets])
  const infos = useMemo(() => live.map((s) => ({ sheet: s, info: sheetRecognitionInfo(s) })), [live])

  /* Merged headline totals across all sheets. */
  const totals = useMemo(() => {
    let clients = 0; let projects = 0; let leads = 0; let payments = 0
    live.forEach((s) => {
      if (s.type === 'matrix') { payments += (s.pivotTransactions || []).length; return }
      if (s.type === 'ignore') return
      const p = projectSheet(s)
      clients += p.clients.length; projects += p.projects.length; leads += p.leads.length
      payments += p.transactions.length
    })
    return { clients, projects, leads, payments }
  }, [live])

  const changeType = (id, type) => onChange((sheets || []).map((s) => (s.id === id ? setSheetType(s, type) : s)))

  /* Focus the dialog on mount; restore focus on close. Escape confirms
     (closing into the inline editor, which is the safe continuation). */
  useEffect(() => {
    restoreFocusRef.current = document.activeElement
    panelRef.current?.focus()
    const onKey = (e) => { if (e.key === 'Escape') onConfirm() }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      try { restoreFocusRef.current?.focus?.() } catch { /* element gone */ }
    }
  }, [onConfirm])

  const summaryParts = []
  if (totals.clients) summaryParts.push(t('recognize.sum.clients', { count: totals.clients }))
  if (totals.payments) summaryParts.push(t('recognize.sum.payments', { count: totals.payments }))
  if (totals.leads) summaryParts.push(t('recognize.sum.leads', { count: totals.leads }))
  if (totals.projects) summaryParts.push(t('recognize.sum.projects', { count: totals.projects }))

  return (
    <Box className="rw-back" role="dialog" aria-modal="true" aria-label={t('recognize.title')}>
      <Box className="rw-panel" ref={panelRef} tabIndex={-1}>
        <Box as="header" className="rw-head">
          <Box className="rw-head-txt">
            <Txt as="p" className="rw-title"><Sparkles size={16} strokeWidth={1.8} aria-hidden="true" /> {t('recognize.title')}</Txt>
            <Txt as="p" className="rw-sub">{t('recognize.sub')}</Txt>
          </Box>
          <Btn type="button" className="rw-x" onClick={onConfirm} aria-label={t('recognize.closeAria')}>
            <X size={18} strokeWidth={1.8} aria-hidden="true" />
          </Btn>
        </Box>

        <Box className="rw-body">
          <Txt as="p" className="rw-summary">
            {summaryParts.length
              ? <>{t('recognize.summaryLead')} <strong>{summaryParts.join(' · ')}</strong></>
              : t('recognize.summaryEmpty')}
          </Txt>

          <Box className="rw-sheets">
            {infos.map(({ sheet, info }) => (
              <Box className={`rw-sheet${info.empty ? ' attention' : ''}`} key={sheet.id}>
                <Box className="rw-sheet-head">
                  <Txt className="rw-sheet-ic"><FileSpreadsheet size={15} strokeWidth={1.7} aria-hidden="true" /></Txt>
                  <Txt className="rw-sheet-name" title={sheet.fileName}>{sheet.sheetName || sheet.fileName}</Txt>
                  <Box as="label" className="rw-sheet-type">
                    <Txt className="rw-sheet-type-lbl">{t('recognize.detectedAs')}</Txt>
                    <select className="rw-select" value={sheet.type} aria-label={t('recognize.typeAria', { name: sheet.sheetName || sheet.fileName })}
                      onChange={(e) => changeType(sheet.id, e.target.value)}>
                      {SHEET_TYPES.map((st) => <option key={st} value={st}>{SHEET_TYPE_LABELS[st]}</option>)}
                    </select>
                  </Box>
                </Box>

                <Box className="rw-sheet-tags">
                  {info.hasMethod && (
                    <Txt className="rw-tag"><CreditCard size={11} strokeWidth={2} aria-hidden="true" /> {t('recognize.badge.method')}</Txt>
                  )}
                  {sheet.type === 'clients' && info.hasPayments && (
                    <Txt className="rw-tag"><CheckCircle2 size={11} strokeWidth={2} aria-hidden="true" /> {t('recognize.badge.payments')}</Txt>
                  )}
                </Box>

                {info.empty && (
                  <Txt as="p" className="rw-nudge"><AlertTriangle size={13} strokeWidth={1.9} aria-hidden="true" /> {t('recognize.nudge.empty')}</Txt>
                )}
              </Box>
            ))}
          </Box>
        </Box>

        <Box as="footer" className="rw-foot">
          <Btn type="button" className="ob-btn ghost" onClick={onEditManually}>{t('recognize.editManually')}</Btn>
          <Btn type="button" className="ob-btn primary" onClick={onConfirm}>{t('recognize.confirm')}</Btn>
        </Box>
      </Box>
    </Box>
  )
}
