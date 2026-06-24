import { useEffect, useRef, useState } from 'react'
import { CreditCard, Check, CircleAlert, Link2Off, RefreshCw, HelpCircle, Loader2, TriangleAlert } from 'lucide-react'
import { useGrowGateway } from '../../hooks/useGrowGateway'
import { useT } from '../../i18n/useT'

/* The three credential SLOTS Grow needs: userId + pageCode + apiKey. All three
   travel straight to the `grow` edge function; the browser never reads them
   back (status carries no secret). apiKey is the sensitive one (password input). */
const FIELDS = [
  { slot: 'userId', type: 'text' },
  { slot: 'pageCode', type: 'text' },
  { slot: 'apiKey', type: 'password' },
]

/* Map the function's coarse error CODE to a translated sentence (gender via
   useT context). */
function errMsg(code, t) {
  switch (code) {
    case 'invalid_credentials':
      return t('growCard.err.invalidCredentials')
    case 'missing_user_id':
    case 'missing_page_code':
    case 'missing_api_key':
      return t('growCard.err.missingFields')
    case 'provider_unreachable':
      return t('growCard.err.providerUnreachable')
    default:
      return t('growCard.err.generic')
  }
}

/* Grow connection card — sits on the /connections/grow sub-screen. The user
   picks an environment (Grow has a real sandbox), pastes their three
   credentials, and connects. Credentials go straight to the `grow` edge
   function; the browser never reads them back (status carries no secret). */
export default function GrowCard() {
  const { t } = useT('connections')
  const grow = useGrowGateway()
  const envLabel = (e) => (e === 'production' ? t('env.production') : t('env.sandbox'))
  const status = grow.status
  const connected = !!status?.connected
  const credsInvalid = connected && !!status?.credentials_invalid // gateway rejected the stored key

  const [environment, setEnvironment] = useState('production')
  const [creds, setCreds] = useState({ userId: '', pageCode: '', apiKey: '' })
  const [localErr, setLocalErr] = useState('')
  const [okMsg, setOkMsg] = useState('')
  const [showHelp, setShowHelp] = useState(false)
  const [reconnecting, setReconnecting] = useState(false) // re-entering creds for a broken connection

  const [busyAction, setBusyAction] = useState(null) // 'connect' | 'test' | 'disconnect'
  const [confirmDisc, setConfirmDisc] = useState(false)
  const discTimer = useRef(0)
  /* Clear the 2-step-confirm auto-disarm timer if we unmount mid-confirm. */
  useEffect(() => () => window.clearTimeout(discTimer.current), [])

  /* Broken connection → re-enter credentials. */
  const startReconnect = () => {
    setEnvironment(status?.environment || 'production')
    setCreds({ userId: '', pageCode: '', apiKey: '' })
    setLocalErr(''); setOkMsg(''); setShowHelp(false)
    setReconnecting(true)
  }

  const onConnect = async () => {
    setLocalErr(''); setOkMsg(''); setBusyAction('connect')
    try {
      await grow.connect({
        userId: creds.userId.trim(),
        pageCode: creds.pageCode.trim(),
        apiKey: creds.apiKey.trim(),
        environment,
      })
      setCreds({ userId: '', pageCode: '', apiKey: '' }) // never keep credentials in component state
      setReconnecting(false)
      setOkMsg(t('growCard.connectSuccess'))
    } catch (e) {
      setLocalErr(errMsg(e.message, t))
    } finally {
      setBusyAction(null)
    }
  }

  const onTest = async () => {
    setLocalErr(''); setOkMsg(''); setBusyAction('test')
    try {
      await grow.test()
      setOkMsg(t('growCard.testOk'))
    } catch (e) {
      setLocalErr(errMsg(e.message, t))
    } finally {
      setBusyAction(null)
    }
  }

  const onDisconnect = async () => {
    if (!confirmDisc) {
      /* Two-step confirm (no undo) — same pattern as the invoice card. */
      setConfirmDisc(true)
      window.clearTimeout(discTimer.current)
      discTimer.current = window.setTimeout(() => setConfirmDisc(false), 4000)
      return
    }
    window.clearTimeout(discTimer.current); setConfirmDisc(false)
    setLocalErr(''); setOkMsg(''); setBusyAction('disconnect')
    try {
      await grow.disconnect()
    } catch (e) {
      setLocalErr(errMsg(e.message, t))
    } finally {
      setBusyAction(null)
    }
  }

  const canConnect = !grow.busy && !!creds.userId.trim() && !!creds.pageCode.trim() && !!creds.apiKey.trim()

  return (
    <section className="conn-card">
      <div className="conn-card-head">
        <span className="conn-icon"><CreditCard size={22} strokeWidth={1.6} aria-hidden="true" /></span>
        <div className="conn-card-titles">
          <p className="conn-card-title">{t('growCard.title')}</p>
          <p className="conn-card-sub">
            {grow.loading ? t('loading')
              : connected
                ? (credsInvalid
                    ? <><TriangleAlert size={13} strokeWidth={2} aria-hidden="true" /> {t('growCard.needsReconnectStatus')}</>
                    : <><Check size={13} strokeWidth={2} aria-hidden="true" /> {t('growCard.connectedStatus', { env: envLabel(status.environment) })}</>)
                : t('growCard.notConnectedHint')}
          </p>
        </div>
      </div>

      {localErr && (
        <p className="conn-error" role="alert"><CircleAlert size={14} strokeWidth={1.7} aria-hidden="true" /> {localErr}</p>
      )}

      {credsInvalid && !reconnecting && (
        <div className="conn-broken" role="alert">
          <TriangleAlert size={16} strokeWidth={1.8} aria-hidden="true" />
          <span>{t('growCard.brokenMsg')}</span>
          <button type="button" className="conn-btn primary conn-broken-btn" onClick={startReconnect}>
            {t('growCard.reconnect')}
          </button>
        </div>
      )}

      {(!connected || reconnecting) ? (
        <div className="conn-connect">
          <div className="conn-lbl-row">
            <span className="conn-field-lbl">{t('growCard.pickEnv')}</span>
            <button type="button" className="conn-help-btn" onClick={() => setShowHelp((v) => !v)} aria-expanded={showHelp}>
              <HelpCircle size={15} strokeWidth={1.7} aria-hidden="true" /> {t('growCard.howTo')}
            </button>
          </div>
          {showHelp && (
            <ol className="conn-help-steps">
              {t('growCard.steps', { returnObjects: true }).map((s, i) => <li key={i}>{s}</li>)}
            </ol>
          )}
          <div className="conn-pills" role="group" aria-label={t('growCard.envGroupAria')}>
            {['production', 'sandbox'].map((e) => (
              <button
                key={e}
                type="button"
                className={`conn-type-pill${environment === e ? ' on' : ''}`}
                aria-pressed={environment === e}
                onClick={() => setEnvironment(e)}
              >
                {envLabel(e)}
              </button>
            ))}
          </div>

          {FIELDS.map((f) => (
            <label key={f.slot} className="conn-field">
              <span className="conn-field-lbl">{t(`growCard.fields.${f.slot}`)}</span>
              <input
                type={f.type}
                className="conn-input"
                value={creds[f.slot]}
                onChange={(e) => setCreds((c) => ({ ...c, [f.slot]: e.target.value }))}
                autoComplete="off"
                dir="ltr"
                placeholder={t('growCard.pastePlaceholder')}
              />
            </label>
          ))}

          <button type="button" className="conn-btn primary" disabled={!canConnect} aria-busy={busyAction === 'connect'} onClick={onConnect}>
            {busyAction === 'connect'
              ? <><Loader2 size={15} strokeWidth={1.9} className="conn-spin" aria-hidden="true" /> {t('growCard.connecting')}</>
              : (reconnecting ? t('growCard.reconnect') : t('growCard.connect'))}
          </button>
          {reconnecting && (
            <button type="button" className="conn-btn ghost" disabled={busyAction === 'connect'} onClick={() => { setReconnecting(false); setLocalErr(''); setOkMsg('') }}>{t('growCard.cancel')}</button>
          )}

          <p className="conn-note">{t('growCard.help')}</p>
        </div>
      ) : (
        <div className="conn-actions">
          <button type="button" className="conn-btn primary" disabled={grow.busy} aria-busy={busyAction === 'test'} onClick={onTest}>
            {busyAction === 'test'
              ? <><Loader2 size={15} strokeWidth={1.9} className="conn-spin" aria-hidden="true" /> {t('growCard.testing')}</>
              : <><RefreshCw size={15} strokeWidth={1.8} aria-hidden="true" /> {t('growCard.testConnection')}</>}
          </button>
          <button type="button" className="conn-btn ghost danger" disabled={grow.busy} aria-busy={busyAction === 'disconnect'} onClick={onDisconnect}>
            {busyAction === 'disconnect'
              ? <><Loader2 size={15} strokeWidth={1.9} className="conn-spin" aria-hidden="true" /> {t('growCard.disconnecting')}</>
              : <><Link2Off size={15} strokeWidth={1.8} aria-hidden="true" /> {confirmDisc ? t('growCard.disconnectConfirm') : t('growCard.disconnect')}</>}
          </button>
          {confirmDisc && (
            <span className="sr-only" role="status">{t('growCard.disconnectConfirmSr')}</span>
          )}
        </div>
      )}

      {okMsg && !localErr && <p className="conn-note" role="status" aria-live="polite">{okMsg}</p>}
    </section>
  )
}
