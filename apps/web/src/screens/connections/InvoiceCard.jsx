import { useEffect, useRef, useState } from 'react'
import { FileText, Check, CircleAlert, Link2Off, RefreshCw, HelpCircle, Loader2, TriangleAlert } from 'lucide-react'
import { useInvoiceProvider } from '../../hooks/useInvoiceProvider'
import { useT } from '../../i18n/useT'
import { Box, Txt, Btn, Input } from '../../components/ui'

/* Supported invoice services. Each declares its two credential SLOTS — the
   generic api_key/api_secret slots are LABELLED per provider (Green Invoice:
   key id + secret; SUMIT: company id + API key). The display label, field
   labels, help text and steps come from the translation file (keyed by `tk`).
   Adding a provider here + in the edge function's providers.ts is all it takes. */
const PROVIDERS = [
  { key: 'greeninvoice', tk: 'gi', enabled: true, fields: [{ slot: 'apiKey', type: 'text' }, { slot: 'apiSecret', type: 'password' }] },
  { key: 'sumit', tk: 'sumit', enabled: true, fields: [{ slot: 'apiKey', type: 'text' }, { slot: 'apiSecret', type: 'password' }] },
]
const providerDef = (k) => PROVIDERS.find((p) => p.key === k) || PROVIDERS[0]

/* Map the function's coarse error CODE to a translated sentence (gender via
   useT context). Provider-neutral wording — works for both services. */
function errMsg(code, t) {
  switch (code) {
    case 'invalid_credentials':
      return t('invoiceCard.err.invalidCredentials')
    case 'missing_api_key':
    case 'missing_api_secret':
      return t('invoiceCard.err.missingFields')
    case 'provider_unreachable':
      return t('invoiceCard.err.providerUnreachable')
    default:
      return t('invoiceCard.err.generic')
  }
}

/* Invoice connection card — sits on /connections beside the Google Calendar
   card. The user picks a provider + environment, pastes their credentials,
   and connects. Credentials go straight to the `invoices` edge function; the
   browser never reads them back (status carries no secret). */
export default function InvoiceCard() {
  const { t } = useT('connections')
  const inv = useInvoiceProvider()
  const providerLabel = (k) => (k === 'greeninvoice' || k === 'sumit' ? t(`providers.${k}`) : k)
  const envLabel = (e) => (e === 'production' ? t('env.production') : t('env.sandbox'))
  const status = inv.status
  const connected = !!status?.connected
  const credsInvalid = connected && !!status?.credentials_invalid // provider rejected the stored key

  const [provider, setProvider] = useState('greeninvoice')
  const [environment, setEnvironment] = useState('production') // both providers are production-only (no sandbox)
  const [creds, setCreds] = useState({ apiKey: '', apiSecret: '' })
  const [localErr, setLocalErr] = useState('')
  const [okMsg, setOkMsg] = useState('')
  const [showHelp, setShowHelp] = useState(false)
  const [reconnecting, setReconnecting] = useState(false) // re-entering creds for a broken connection

  const [busyAction, setBusyAction] = useState(null) // 'connect' | 'test' | 'disconnect'
  const [confirmDisc, setConfirmDisc] = useState(false)
  const [togglingAuto, setTogglingAuto] = useState(false)
  const [togglingScan, setTogglingScan] = useState(false)
  const discTimer = useRef(0)
  /* Business type (עוסק פטור / מורשה) — picked locally; only WRITTEN on an explicit
     confirm so it never changes by accident. `pendingBiz` tracks the selection,
     synced to the saved value during render (no effect) so it resets after a save
     and once the status first loads. */
  const [bizBusy, setBizBusy] = useState(false)
  const [pendingBiz, setPendingBiz] = useState(status?.business_type ?? null)
  const [bizSynced, setBizSynced] = useState(status?.business_type ?? null)
  {
    const serverBiz = status?.business_type ?? null
    if (serverBiz !== bizSynced) {
      // Adopt the server value ONLY if the user hasn't made an unsaved pick
      // (pendingBiz still matches the last-synced value) — a background status
      // refetch must never clobber a selection the user is about to confirm.
      if (pendingBiz === bizSynced) setPendingBiz(serverBiz)
      setBizSynced(serverBiz)
    }
  }
  /* Clear the 2-step-confirm auto-disarm timer if we unmount mid-confirm. */
  useEffect(() => () => window.clearTimeout(discTimer.current), [])

  const def = providerDef(provider)

  const pickProvider = (k) => {
    setProvider(k)
    setCreds({ apiKey: '', apiSecret: '' }) // different service → clear the fields
    setEnvironment('production') // production-only for both providers (GI sandbox removed)
    setLocalErr(''); setOkMsg('')
  }

  /* Broken connection → re-enter credentials for the SAME provider. */
  const startReconnect = () => {
    setProvider(status.provider)
    setEnvironment('production')
    setCreds({ apiKey: '', apiSecret: '' })
    setLocalErr(''); setOkMsg(''); setShowHelp(false)
    setReconnecting(true)
  }

  const onConnect = async () => {
    setLocalErr(''); setOkMsg(''); setBusyAction('connect')
    try {
      await inv.connect({ provider, apiKey: creds.apiKey.trim(), apiSecret: creds.apiSecret.trim(), environment })
      setCreds({ apiKey: '', apiSecret: '' }) // never keep credentials in component state
      setReconnecting(false)
      setOkMsg(t('invoiceCard.connectSuccess'))
    } catch (e) {
      setLocalErr(errMsg(e.message, t))
    } finally {
      setBusyAction(null)
    }
  }

  const onTest = async () => {
    setLocalErr(''); setOkMsg(''); setBusyAction('test')
    try {
      await inv.test()
      setOkMsg(t('invoiceCard.testOk'))
    } catch (e) {
      setLocalErr(errMsg(e.message, t))
    } finally {
      setBusyAction(null)
    }
  }

  const onDisconnect = async () => {
    if (!confirmDisc) {
      /* Two-step confirm (no undo) — same pattern as the calendar card. */
      setConfirmDisc(true)
      window.clearTimeout(discTimer.current)
      discTimer.current = window.setTimeout(() => setConfirmDisc(false), 4000)
      return
    }
    window.clearTimeout(discTimer.current); setConfirmDisc(false)
    setLocalErr(''); setOkMsg(''); setBusyAction('disconnect')
    try {
      await inv.disconnect()
    } catch (e) {
      setLocalErr(errMsg(e.message, t))
    } finally {
      setBusyAction(null)
    }
  }

  const onToggleAutoImport = async (value) => {
    if (togglingAuto) return /* ignore rapid double-toggles — they can desync the checkbox from the server */
    setLocalErr(''); setOkMsg(''); setTogglingAuto(true)
    try {
      await inv.setAutoImport(value)
      setOkMsg(value ? t('invoiceCard.autoImportOn') : t('invoiceCard.autoImportOff'))
    } catch (e) {
      setLocalErr(errMsg(e.message, t))
    } finally {
      setTogglingAuto(false)
    }
  }

  const onToggleScheduledScan = async (value) => {
    if (togglingScan) return /* ignore rapid double-toggles — keep the checkbox in sync with the server */
    setLocalErr(''); setOkMsg(''); setTogglingScan(true)
    try {
      await inv.setScheduledScan(value)
      setOkMsg(value ? t('invoiceCard.scheduledScanOn') : t('invoiceCard.scheduledScanOff'))
    } catch (e) {
      setLocalErr(errMsg(e.message, t))
    } finally {
      setTogglingScan(false)
    }
  }

  /* Save the business type — only when it actually changed (the confirm button
     is shown only then), so an accidental tap can't rewrite it. */
  const bizDirty = !!pendingBiz && pendingBiz !== (status?.business_type ?? null)
  const onSaveBiz = async () => {
    if (!bizDirty) return
    setLocalErr(''); setOkMsg(''); setBizBusy(true)
    try {
      await inv.setBusinessType(pendingBiz)
      setOkMsg(t('invoiceCard.businessType.saved'))
    } catch (e) {
      setLocalErr(errMsg(e.message, t))
    } finally {
      setBizBusy(false)
    }
  }

  const canConnect = !inv.busy && !!creds.apiKey.trim() && !!creds.apiSecret.trim()

  return (
    <Box as="section" className="conn-card">
      <Box className="conn-card-head">
        <Txt className="conn-icon"><FileText size={22} strokeWidth={1.6} aria-hidden="true" /></Txt>
        <Box className="conn-card-titles">
          <Txt as="p" className="conn-card-title">{t('invoiceCard.title')}</Txt>
          <Txt as="p" className="conn-card-sub">
            {inv.loading ? t('loading')
              : connected
                ? (credsInvalid
                    ? <><TriangleAlert size={13} strokeWidth={2} aria-hidden="true" /> {t('invoiceCard.needsReconnectStatus', { provider: providerLabel(status.provider) })}</>
                    : <><Check size={13} strokeWidth={2} aria-hidden="true" /> {t('invoiceCard.connectedStatus', { provider: providerLabel(status.provider), env: envLabel(status.environment) })}</>)
                : t('invoiceCard.notConnectedHint')}
          </Txt>
        </Box>
      </Box>

      {/* Always-on caution: the provider's own API may bill the user for
          issuing documents — make them check that service's terms first. */}
      <Box className="conn-cost-warning" role="note">
        <TriangleAlert size={16} strokeWidth={1.8} aria-hidden="true" />
        <Txt>{t('invoiceCard.costWarning')}</Txt>
      </Box>

      {localErr && (
        <Txt as="p" className="conn-error" role="alert"><CircleAlert size={14} strokeWidth={1.7} aria-hidden="true" /> {localErr}</Txt>
      )}

      {credsInvalid && !reconnecting && (
        <Box className="conn-broken" role="alert">
          <TriangleAlert size={16} strokeWidth={1.8} aria-hidden="true" />
          <Txt>{t('invoiceCard.brokenMsg')}</Txt>
          <Btn type="button" className="conn-btn primary conn-broken-btn" onClick={startReconnect}>
            {t('invoiceCard.reconnect')}
          </Btn>
        </Box>
      )}

      {(!connected || reconnecting) ? (
        <Box className="conn-connect">
          <Box className="conn-lbl-row">
            <Txt className="conn-field-lbl">{t('invoiceCard.pickProvider')}</Txt>
            <Btn type="button" className="conn-help-btn" onClick={() => setShowHelp((v) => !v)} aria-expanded={showHelp}>
              <HelpCircle size={15} strokeWidth={1.7} aria-hidden="true" /> {t('invoiceCard.howTo')}
            </Btn>
          </Box>
          {showHelp && (
            <Box as="ol" className="conn-help-steps">
              {t(`invoiceCard.steps.${def.tk}`, { returnObjects: true }).map((s, i) => <Box as="li" key={i}>{s}</Box>)}
            </Box>
          )}
          <Box className="conn-pills" role="group" aria-label={t('invoiceCard.providerGroupAria')}>
            {PROVIDERS.map((p) => (
              <Btn
                key={p.key}
                type="button"
                className={`conn-type-pill${provider === p.key ? ' on' : ''}`}
                aria-pressed={provider === p.key}
                disabled={!p.enabled}
                onClick={() => p.enabled && pickProvider(p.key)}
              >
                {providerLabel(p.key)}{!p.enabled && <Txt className="conn-soon">{t('invoiceCard.soon')}</Txt>}
              </Btn>
            ))}
          </Box>

          {/* Both providers are production-only (Green Invoice sandbox was
              removed — it never worked reliably), so there's no environment
              choice; `environment` is forced to 'production'. */}

          {def.fields.map((f) => (
            <Box as="label" key={f.slot} className="conn-field">
              <Txt className="conn-field-lbl">{t(`invoiceCard.fields.${def.tk}.${f.slot}`)}</Txt>
              <Input
                type={f.type}
                className="conn-input"
                value={creds[f.slot]}
                onChange={(e) => setCreds((c) => ({ ...c, [f.slot]: e.target.value }))}
                autoComplete="off"
                dir="ltr"
                placeholder={t('invoiceCard.pastePlaceholder')}
              />
            </Box>
          ))}

          <Btn type="button" className="conn-btn primary" disabled={!canConnect} aria-busy={busyAction === 'connect'} onClick={onConnect}>
            {busyAction === 'connect' ? <><Loader2 size={15} strokeWidth={1.9} className="conn-spin" aria-hidden="true" /> {t('invoiceCard.connecting')}</> : (reconnecting ? t('invoiceCard.reconnect') : t('invoiceCard.connect'))}
          </Btn>
          {reconnecting && (
            <Btn type="button" className="conn-btn ghost" disabled={busyAction === 'connect'} onClick={() => { setReconnecting(false); setLocalErr(''); setOkMsg('') }}>{t('invoiceCard.cancel')}</Btn>
          )}

          <Txt as="p" className="conn-note">{t(`invoiceCard.help.${def.tk}`)}</Txt>
        </Box>
      ) : (
        <>
          <Box className="conn-actions">
            <Btn type="button" className="conn-btn primary" disabled={inv.busy} aria-busy={busyAction === 'test'} onClick={onTest}>
              {busyAction === 'test'
                ? <><Loader2 size={15} strokeWidth={1.9} className="conn-spin" aria-hidden="true" /> {t('invoiceCard.testing')}</>
                : <><RefreshCw size={15} strokeWidth={1.8} aria-hidden="true" /> {t('invoiceCard.testConnection')}</>}
            </Btn>
            <Btn type="button" className="conn-btn ghost danger" disabled={inv.busy} aria-busy={busyAction === 'disconnect'} onClick={onDisconnect}>
              {busyAction === 'disconnect'
                ? <><Loader2 size={15} strokeWidth={1.9} className="conn-spin" aria-hidden="true" /> {t('invoiceCard.disconnecting')}</>
                : <><Link2Off size={15} strokeWidth={1.8} aria-hidden="true" /> {confirmDisc ? t('invoiceCard.disconnectConfirm') : t('invoiceCard.disconnect')}</>}
            </Btn>
          </Box>
          {confirmDisc && (
            <Txt className="sr-only" role="status">{t('invoiceCard.disconnectConfirmSr')}</Txt>
          )}
          <Box as="label" className="conn-autoimport">
            <Input type="checkbox" checked={!!status?.auto_import} onChange={(e) => onToggleAutoImport(e.target.checked)} disabled={inv.busy || togglingAuto} />
            <Txt>{t('invoiceCard.autoImportLabel')}</Txt>
          </Box>
          <Txt as="p" className="conn-autoimport-note">{t('invoiceCard.autoImportNote')}</Txt>

          {/* Opt-in periodic (daily) scan. Real-time import already runs via the
              provider webhook; this is an extra safety net that calls the
              provider's API once a day — which some services bill per call, so
              it's OFF by default and gated behind an explicit warning. Only
              meaningful while income import is on. */}
          {status?.auto_import && (
            <>
              <Box as="label" className="conn-autoimport">
                <Input type="checkbox" checked={!!status?.scheduled_scan} onChange={(e) => onToggleScheduledScan(e.target.checked)} disabled={inv.busy || togglingScan} />
                <Txt>{t('invoiceCard.scheduledScanLabel')}</Txt>
              </Box>
              <Txt as="p" className="conn-autoimport-note">{t('invoiceCard.scheduledScanNote')}</Txt>
              {!!status?.scheduled_scan && (
                <Box className="conn-cost-warning" role="note">
                  <TriangleAlert size={16} strokeWidth={1.8} aria-hidden="true" />
                  <Txt>{t('invoiceCard.scheduledScanWarning')}</Txt>
                </Box>
              )}
            </>
          )}

          {/* Business type — drives which document types the issue picker offers.
              Editable any time; a change is committed only on the confirm button. */}
          <Box className="conn-biztype">
            <Txt className="conn-field-lbl">{t('invoiceCard.businessType.label')}</Txt>
            <Txt as="p" className="conn-autoimport-note">{t('invoiceCard.businessType.note')}</Txt>
            <Box className="conn-pills" role="group" aria-label={t('invoiceCard.businessType.label')}>
              {['exempt', 'licensed'].map((v) => (
                <Btn
                  key={v}
                  type="button"
                  className={`conn-type-pill${pendingBiz === v ? ' on' : ''}`}
                  aria-pressed={pendingBiz === v}
                  disabled={bizBusy || inv.busy}
                  onClick={() => setPendingBiz(v)}
                >
                  {t(`invoiceCard.businessType.${v}`)}
                </Btn>
              ))}
            </Box>
            {!status?.business_type && !bizDirty && (
              <Txt as="p" className="conn-autoimport-note conn-biztype-unset">{t('invoiceCard.businessType.unsetHint')}</Txt>
            )}
            {bizDirty && (
              <Btn type="button" className="conn-btn primary conn-biztype-save" disabled={bizBusy} aria-busy={bizBusy} onClick={onSaveBiz}>
                {bizBusy
                  ? <><Loader2 size={15} strokeWidth={1.9} className="conn-spin" aria-hidden="true" /> {t('invoiceCard.businessType.saving')}</>
                  : t('invoiceCard.businessType.confirm')}
              </Btn>
            )}
          </Box>
        </>
      )}

      {okMsg && !localErr && <Txt as="p" className="conn-note" role="status" aria-live="polite">{okMsg}</Txt>}
    </Box>
  )
}
