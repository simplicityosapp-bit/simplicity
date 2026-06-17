import { useEffect, useState } from 'react'
import Modal from './Modal'
import { Download, FileSpreadsheet } from 'lucide-react'
import { useT } from '../i18n/useT'
import './ExportDataModal.css'

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
      <p className="m-hint">
        {t('export.intro')}
      </p>

      <button type="button" className="set-data-action" onClick={runAll} disabled={busy}>
        <FileSpreadsheet size={15} strokeWidth={1.7} aria-hidden="true" />
        {busy ? t('export.exporting') : t('export.exportAll')}
      </button>
      <p className="set-data-hint">
        {t('export.exportAllHint')}
      </p>

      <div className="export-sens">
        <p className="export-sens-h">{t('export.sensitiveHeading')}</p>
        <p className="export-sens-sub">
          {t('export.sensitiveSub')}
        </p>
        <div className="export-cats">
          {SENSITIVE.map((key) => (
            <label key={key} className={`export-cat${busy ? ' is-disabled' : ''}`}>
              <span className="export-cat-text">
                {t(`export.sensitive.${key}`)}
                <span className="export-cat-sub">{t(`export.sensitive.${key}Sub`)}</span>
              </span>
              <input
                type="checkbox"
                className="export-cat-checkbox"
                checked={!!sel[key]}
                disabled={busy}
                onChange={() => toggle(key)}
              />
            </label>
          ))}
        </div>
      </div>

      {err && <p className="export-err">{t('export.failed')}</p>}

      <button type="button" className="set-data-action" onClick={onExportTransactions} disabled={!hasTransactions || busy} style={{ marginTop: 12 }}>
        <Download size={15} strokeWidth={1.7} aria-hidden="true" />
        {t('export.exportTransactions')}
      </button>
      <button type="button" className="set-data-action" onClick={onExportClients} disabled={!hasClients || busy} style={{ marginTop: 10 }}>
        <Download size={15} strokeWidth={1.7} aria-hidden="true" />
        {t('export.exportClients')}
      </button>
      <button type="button" className="set-data-action" onClick={onExportProjects} disabled={!hasProjects || busy} style={{ marginTop: 10 }}>
        <Download size={15} strokeWidth={1.7} aria-hidden="true" />
        {t('export.exportProjects')}
      </button>
      <p className="set-data-hint">
        {t('export.reimportHint')}
      </p>

      <div className="m-actions">
        <button type="button" className="m-btn-cancel" onClick={onClose} disabled={busy}>{t('common.close')}</button>
      </div>
    </Modal>
  )
}
