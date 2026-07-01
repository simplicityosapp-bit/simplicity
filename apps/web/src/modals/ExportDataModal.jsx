import { useEffect, useState } from 'react'
import Modal from './Modal'
import { Download, FileSpreadsheet } from 'lucide-react'
import { useT } from '../i18n/useT'
import './ExportDataModal.css'
import { Box, Txt, Btn, Input } from '../components/ui'

/* Consolidates every export into one window: a single "all data" Excel file
   (a sheet per entity) plus the individual re-importable CSVs. Replaces the
   three loose buttons that used to sit on the Settings → data section.

   Sensitive categories (sessions/goals/daily answers/reflections) are opt-in
   checkboxes — OFF by default — that add extra sheets to the "all data" file.
   These fields are stored plaintext at rest; the export simply includes the
   extra sensitive columns. */
const SENSITIVE = ['sessions', 'goals', 'dailyAnswers', 'moon']

export default function ExportDataModal({
  open, onClose,
  onExportAll, onExportTransactions, onExportClients, onExportProjects,
  hasTransactions, hasClients, hasProjects,
}) {
  const { t } = useT('modalsSystem')
  const [sel, setSel] = useState({})   // category key → included?
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(false)

  /* Reset the opt-in sensitive selections each time the modal opens — they
     export decrypted PII and must never silently carry over from a prior open. */
  useEffect(() => { if (open) { setSel({}); setErr(false) } }, [open])

  const toggle = (key) => setSel((s) => ({ ...s, [key]: !s[key] }))

  /* The "all data" export now fetches the checked sensitive categories, so it
     is async — guard against double-clicks and surface a failure. */
  const runAll = async () => {
    if (busy) return
    setBusy(true); setErr(false)
    try {
      await onExportAll(sel)
    } catch (e) {
      console.error('[export] failed', e)
      setErr(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={t('export.title')}>
      <Txt as="p" className="m-hint">
        {t('export.intro')}
      </Txt>

      <Btn type="button" className="set-data-action" onClick={runAll} disabled={busy}>
        <FileSpreadsheet size={15} strokeWidth={1.7} aria-hidden="true" />
        {busy ? t('export.exporting') : t('export.exportAll')}
      </Btn>
      <Txt as="p" className="set-data-hint">
        {t('export.exportAllHint')}
      </Txt>

      <Box className="export-sens">
        <Txt as="p" className="export-sens-h">{t('export.sensitiveHeading')}</Txt>
        <Txt as="p" className="export-sens-sub">
          {t('export.sensitiveSub')}
        </Txt>
        <Box className="export-cats">
          {SENSITIVE.map((key) => (
            <Box as="label" key={key} className={`export-cat${busy ? ' is-disabled' : ''}`}>
              <Txt className="export-cat-text">
                {t(`export.sensitive.${key}`)}
                <Txt className="export-cat-sub">{t(`export.sensitive.${key}Sub`)}</Txt>
              </Txt>
              <Input
                type="checkbox"
                className="export-cat-checkbox"
                checked={!!sel[key]}
                disabled={busy}
                onChange={() => toggle(key)}
              />
            </Box>
          ))}
        </Box>
      </Box>

      {err && <Txt as="p" className="export-err">{t('export.failed')}</Txt>}

      <Btn type="button" className="set-data-action" onClick={onExportTransactions} disabled={!hasTransactions || busy} style={{ marginTop: 12 }}>
        <Download size={15} strokeWidth={1.7} aria-hidden="true" />
        {t('export.exportTransactions')}
      </Btn>
      <Btn type="button" className="set-data-action" onClick={onExportClients} disabled={!hasClients || busy} style={{ marginTop: 10 }}>
        <Download size={15} strokeWidth={1.7} aria-hidden="true" />
        {t('export.exportClients')}
      </Btn>
      <Btn type="button" className="set-data-action" onClick={onExportProjects} disabled={!hasProjects || busy} style={{ marginTop: 10 }}>
        <Download size={15} strokeWidth={1.7} aria-hidden="true" />
        {t('export.exportProjects')}
      </Btn>
      <Txt as="p" className="set-data-hint">
        {t('export.reimportHint')}
      </Txt>

      <Box className="m-actions">
        <Btn type="button" className="m-btn-cancel" onClick={onClose} disabled={busy}>{t('common.close')}</Btn>
      </Box>
    </Modal>
  )
}
