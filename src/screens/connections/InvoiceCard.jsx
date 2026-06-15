import { useEffect, useId, useRef, useState } from 'react'
import { FileText, Check, CircleAlert, Link2Off, RefreshCw, HelpCircle, ChevronDown, ChevronUp, Copy, Webhook, Loader2, TriangleAlert } from 'lucide-react'
import { useInvoiceProvider } from '../../hooks/useInvoiceProvider'
import { useAddress } from '../../hooks/useAddress'

/* Supported invoice services. Each declares its two credential fields — the
   generic api_key/api_secret slots are LABELLED per provider (Green Invoice:
   key id + secret; SUMIT: company id + API key). Adding a provider here +
   in the edge function's providers.ts is all it takes. */
const PROVIDERS = [
  {
    key: 'greeninvoice',
    label: 'חשבונית ירוקה',
    enabled: true,
    fields: [
      { slot: 'apiKey', label: 'API Key (מזהה מפתח)', type: 'text' },
      { slot: 'apiSecret', label: 'API Secret (סוד)', type: 'password' },
    ],
    help: 'את הפרטים מפיקים בחשבון חשבונית ירוקה: הגדרות ← כלים למפתחים ← מפתחות API. ה-Secret מוצג פעם אחת בלבד — שמרו אותו.',
    steps: [
      'היכנסו לחשבון חשבונית ירוקה (לבדיקות: הירשמו ב-sandbox.d.greeninvoice.co.il).',
      'הגדרות ← כלים למפתחים ← מפתחות API.',
      'צרו מפתח חדש — תקבלו API Key (מזהה) ו-Secret.',
      'ה-Secret מוצג פעם אחת בלבד — העתיקו מיד.',
      'הדביקו כאן את המזהה ואת ה-Secret, ולחצו "חבר".',
    ],
  },
  {
    key: 'sumit',
    label: 'סאמיט',
    enabled: true,
    fields: [
      { slot: 'apiKey', label: 'מזהה חברה (Company ID)', type: 'text' },
      { slot: 'apiSecret', label: 'API Key (מפתח)', type: 'password' },
    ],
    help: 'את הפרטים מפיקים בחשבון סאמיט: הגדרות ← מפתחים ובעלי אתרים ← מפתחות API (מזהה חברה + API Key).',
    steps: [
      'היכנסו לחשבון סאמיט.',
      'הגדרות ← מפתחים ובעלי אתרים ← מפתחות API.',
      'העתיקו את מזהה החברה (Company ID).',
      'השתמשו במפתח ה-API הפרטי — לא הציבורי!',
      'הדביקו כאן את שניהם, ולחצו "חבר".',
    ],
  },
]
const providerDef = (k) => PROVIDERS.find((p) => p.key === k) || PROVIDERS[0]
const providerLabel = (k) => PROVIDERS.find((p) => p.key === k)?.label || k
const envLabel = (e) => (e === 'production' ? 'Production' : 'Sandbox')

/* Map the function's coarse error CODE to a Hebrew sentence (gendered via
   addr). Provider-neutral wording — works for both services. */
function errToHe(code, addr) {
  switch (code) {
    case 'invalid_credentials':
      return addr({ male: 'פרטי ההזדהות שגויים. בדוק והעתק שוב.', female: 'פרטי ההזדהות שגויים. בדקי והעתיקי שוב.', neutral: 'פרטי ההזדהות שגויים. בדוק/י והעתק/י שוב.' })
    case 'missing_api_key':
    case 'missing_api_secret':
      return 'יש למלא את שני השדות.'
    case 'provider_unreachable':
      return addr({ male: 'השירות לא זמין כרגע. נסה שוב בעוד רגע.', female: 'השירות לא זמין כרגע. נסי שוב בעוד רגע.', neutral: 'השירות לא זמין כרגע. נסה/י שוב בעוד רגע.' })
    default:
      return addr({ male: 'החיבור נכשל. נסה שוב.', female: 'החיבור נכשל. נסי שוב.', neutral: 'החיבור נכשל. נסה/י שוב.' })
  }
}

/* Invoice connection card — sits on /connections beside the Google Calendar
   card. The user picks a provider + environment, pastes their credentials,
   and connects. Credentials go straight to the `invoices` edge function; the
   browser never reads them back (status carries no secret). */
export default function InvoiceCard() {
  const { addr } = useAddress()
  const inv = useInvoiceProvider()
  const status = inv.status
  const connected = !!status?.connected
  const credsInvalid = connected && !!status?.credentials_invalid // provider rejected the stored key
  const webhookId = useId()

  const [provider, setProvider] = useState('greeninvoice')
  const [environment, setEnvironment] = useState('sandbox')
  const [creds, setCreds] = useState({ apiKey: '', apiSecret: '' })
  const [localErr, setLocalErr] = useState('')
  const [okMsg, setOkMsg] = useState('')
  const [showHelp, setShowHelp] = useState(false)
  const [showWebhook, setShowWebhook] = useState(false)
  const [copied, setCopied] = useState(false)
  const [reconnecting, setReconnecting] = useState(false) // re-entering creds for a broken connection

  const [busyAction, setBusyAction] = useState(null) // 'connect' | 'test' | 'disconnect'
  const [confirmDisc, setConfirmDisc] = useState(false)
  const discTimer = useRef(0)
  /* Clear the 2-step-confirm auto-disarm timer if we unmount mid-confirm. */
  useEffect(() => () => window.clearTimeout(discTimer.current), [])

  const def = providerDef(provider)

  const pickProvider = (k) => {
    setProvider(k)
    setCreds({ apiKey: '', apiSecret: '' }) // different service → clear the fields
    setEnvironment(k === 'sumit' ? 'production' : 'sandbox') // SUMIT has no separate sandbox host → force production
    setLocalErr(''); setOkMsg('')
  }

  /* Broken connection → re-enter credentials for the SAME provider. */
  const startReconnect = () => {
    setProvider(status.provider)
    setEnvironment(status.environment || (status.provider === 'sumit' ? 'production' : 'sandbox'))
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
      setOkMsg('החיבור הצליח.')
    } catch (e) {
      setLocalErr(errToHe(e.message, addr))
    } finally {
      setBusyAction(null)
    }
  }

  const onTest = async () => {
    setLocalErr(''); setOkMsg(''); setBusyAction('test')
    try {
      await inv.test()
      setOkMsg('החיבור תקין.')
    } catch (e) {
      setLocalErr(errToHe(e.message, addr))
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
    await inv.disconnect()
    setBusyAction(null)
  }

  const onToggleAutoImport = async (value) => {
    setLocalErr(''); setOkMsg('')
    try {
      await inv.setAutoImport(value)
      setOkMsg(value ? 'ייבוא הכנסות הופעל.' : 'ייבוא הכנסות כובה.')
    } catch (e) {
      setLocalErr(errToHe(e.message, addr))
    }
  }

  const canConnect = !inv.busy && !!creds.apiKey.trim() && !!creds.apiSecret.trim()

  return (
    <section className="conn-card">
      <div className="conn-card-head">
        <span className="conn-icon"><FileText size={22} strokeWidth={1.6} aria-hidden="true" /></span>
        <div className="conn-card-titles">
          <p className="conn-card-title">חשבוניות</p>
          <p className="conn-card-sub">
            {inv.loading ? 'טוען…'
              : connected
                ? (credsInvalid
                    ? <><TriangleAlert size={13} strokeWidth={2} aria-hidden="true" /> דורש חיבור מחדש · {providerLabel(status.provider)}</>
                    : <><Check size={13} strokeWidth={2} aria-hidden="true" /> מחובר · {providerLabel(status.provider)} · {envLabel(status.environment)}</>)
                : 'לא מחובר — הפקת חשבוניות וקבלות ישירות מסימפליסיטי.'}
          </p>
        </div>
      </div>

      {localErr && (
        <p className="conn-error" role="alert"><CircleAlert size={14} strokeWidth={1.7} aria-hidden="true" /> {localErr}</p>
      )}

      {credsInvalid && !reconnecting && (
        <div className="conn-broken" role="alert">
          <TriangleAlert size={16} strokeWidth={1.8} aria-hidden="true" />
          <span>פרטי ההזדהות לשירות אינם תקפים יותר — ייתכן שהמפתח בוטל או הוחלף. כדי להמשיך להפיק חשבוניות, התחבר/י מחדש.</span>
          <button type="button" className="conn-btn primary conn-broken-btn" onClick={startReconnect}>
            {addr({ male: 'התחבר מחדש', female: 'התחברי מחדש', neutral: 'התחבר/י מחדש' })}
          </button>
        </div>
      )}

      {(!connected || reconnecting) ? (
        <div className="conn-connect">
          <div className="conn-lbl-row">
            <span className="conn-field-lbl">{addr({ male: 'בחר ספק', female: 'בחרי ספק', neutral: 'בחר/י ספק' })}</span>
            <button type="button" className="conn-help-btn" onClick={() => setShowHelp((v) => !v)} aria-expanded={showHelp}>
              <HelpCircle size={15} strokeWidth={1.7} aria-hidden="true" /> איך משיגים?
            </button>
          </div>
          {showHelp && (
            <ol className="conn-help-steps">
              {def.steps.map((s, i) => <li key={i}>{s}</li>)}
            </ol>
          )}
          <div className="conn-pills" role="group" aria-label="ספק חשבוניות">
            {PROVIDERS.map((p) => (
              <button
                key={p.key}
                type="button"
                className={`conn-type-pill${provider === p.key ? ' on' : ''}`}
                aria-pressed={provider === p.key}
                disabled={!p.enabled}
                onClick={() => p.enabled && pickProvider(p.key)}
              >
                {p.label}{!p.enabled && <span className="conn-soon">בקרוב</span>}
              </button>
            ))}
          </div>

          {/* SUMIT's accounting API has no separate sandbox host — hide the
              environment choice for it (forced to production in pickProvider). */}
          {provider !== 'sumit' && (
            <>
              <span className="conn-field-lbl">סביבה</span>
              <div className="conn-pills" role="group" aria-label="סביבה">
                {['sandbox', 'production'].map((e) => (
                  <button key={e} type="button" className={`conn-type-pill${environment === e ? ' on' : ''}`} aria-pressed={environment === e} onClick={() => setEnvironment(e)}>
                    {e === 'sandbox' ? 'בדיקה (Sandbox)' : 'אמיתי (Production)'}
                  </button>
                ))}
              </div>
            </>
          )}

          {def.fields.map((f) => (
            <label key={f.slot} className="conn-field">
              <span className="conn-field-lbl">{f.label}</span>
              <input
                type={f.type}
                className="conn-input"
                value={creds[f.slot]}
                onChange={(e) => setCreds((c) => ({ ...c, [f.slot]: e.target.value }))}
                autoComplete="off"
                dir="ltr"
                placeholder="הדבק/י כאן"
              />
            </label>
          ))}

          <button type="button" className="conn-btn primary" disabled={!canConnect} aria-busy={busyAction === 'connect'} onClick={onConnect}>
            {busyAction === 'connect' ? <><Loader2 size={15} strokeWidth={1.9} className="conn-spin" aria-hidden="true" /> מתחבר…</> : (reconnecting ? addr({ male: 'התחבר מחדש', female: 'התחברי מחדש', neutral: 'התחבר/י מחדש' }) : 'חבר')}
          </button>
          {reconnecting && (
            <button type="button" className="conn-btn ghost" disabled={busyAction === 'connect'} onClick={() => { setReconnecting(false); setLocalErr(''); setOkMsg('') }}>ביטול</button>
          )}

          <p className="conn-note">{def.help}</p>
        </div>
      ) : (
        <>
          <div className="conn-actions">
            <button type="button" className="conn-btn primary" disabled={inv.busy} aria-busy={busyAction === 'test'} onClick={onTest}>
              {busyAction === 'test'
                ? <><Loader2 size={15} strokeWidth={1.9} className="conn-spin" aria-hidden="true" /> בודק…</>
                : <><RefreshCw size={15} strokeWidth={1.8} aria-hidden="true" /> {addr({ male: 'בדוק חיבור', female: 'בדקי חיבור', neutral: 'בדוק/י חיבור' })}</>}
            </button>
            <button type="button" className="conn-btn ghost danger" disabled={inv.busy} aria-busy={busyAction === 'disconnect'} onClick={onDisconnect}>
              {busyAction === 'disconnect'
                ? <><Loader2 size={15} strokeWidth={1.9} className="conn-spin" aria-hidden="true" /> מנתק…</>
                : <><Link2Off size={15} strokeWidth={1.8} aria-hidden="true" /> {confirmDisc ? addr({ male: 'בטוח? נתק', female: 'בטוחה? נתק', neutral: 'בטוח/ה? נתק' }) : addr({ male: 'נתק', female: 'נתקי', neutral: 'נתק/י' })}</>}
            </button>
          </div>
          {confirmDisc && (
            <span className="sr-only" role="status">{addr({ male: 'לחץ שוב לאישור הניתוק', female: 'לחצי שוב לאישור הניתוק', neutral: 'לחצו שוב לאישור הניתוק' })}</span>
          )}
          <label className="conn-autoimport">
            <input type="checkbox" checked={!!status?.auto_import} onChange={(e) => onToggleAutoImport(e.target.checked)} disabled={inv.busy} />
            <span>לייבא אוטומטית הכנסות?</span>
          </label>
          <p className="conn-autoimport-note">המערכת תזהה הכנסות שהזנת בתוכנת הקבלות שלך — ותשאל אותך אם לרשום אותן גם אצלנו.</p>
          {status?.webhook_url && (
            <div className="conn-webhook">
              <button type="button" className="conn-webhook-toggle" onClick={() => setShowWebhook((v) => !v)} aria-expanded={showWebhook}>
                <span><Webhook size={15} strokeWidth={1.7} aria-hidden="true" /> הגדרת ייבוא מסאמיט (חד-פעמי)</span>
                {showWebhook ? <ChevronUp size={16} strokeWidth={1.7} aria-hidden="true" /> : <ChevronDown size={16} strokeWidth={1.7} aria-hidden="true" />}
              </button>
              {showWebhook && (
                <div className="conn-webhook-panel">
                  <p className="conn-webhook-intro">כדי שחשבוניות שתפיקו ישירות בסאמיט ייובאו לכאן אוטומטית — צרו "טריגר" בסאמיט שמצביע לכתובת הזו:</p>
                  <div className="conn-webhook-url-row">
                    <code id={webhookId} className="conn-webhook-url">{status.webhook_url}</code>
                    <button
                      type="button"
                      className="conn-webhook-copy"
                      aria-label={addr({ male: 'העתק את כתובת ה-webhook', female: 'העתקי את כתובת ה-webhook', neutral: 'העתק/י את כתובת ה-webhook' })}
                      aria-describedby={webhookId}
                      onClick={() => { navigator.clipboard?.writeText(status.webhook_url).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 2000) }).catch(() => {}) }}
                    >
                      <Copy size={13} strokeWidth={1.8} aria-hidden="true" /> <span aria-hidden="true">{copied ? 'הועתק' : addr({ male: 'העתק', female: 'העתקי', neutral: 'העתק/י' })}</span>
                    </button>
                  </div>
                  {copied && <span className="sr-only" role="status">כתובת ה-webhook הועתקה</span>}
                  <ol className="conn-webhook-steps">
                    <li>בסאמיט: הגדרות ← <b>מודול טריגרים</b> ← "יצירת טריגר".</li>
                    <li>בחרו את התיקייה והתצוגה של מסמכי החשבוניות, ובאירוע: <b>"יצירת כרטיס"</b>.</li>
                    <li>בשלב הפעולה בחרו <b>"יצירת קריאת HTTP"</b>, וסוג הקריאה <b>JSON</b>.</li>
                    <li>הדביקו את הכתובת שלמעלה בשדה ה-URL, ושמרו את הטריגר כ<b>פעיל</b>.</li>
                    <li>מעכשיו כל מסמך שתפיקו בסאמיט יופיע ב<b>"ייבוא ממתין"</b> במסך הכספים.</li>
                  </ol>
                  <p className="conn-webhook-intro">לאחר ההגדרה, מסמכים שתפיקו בסאמיט יופיעו ב"ייבוא ממתין" לאישורך — כל עוד "לייבא אוטומטית הכנסות" מסומן למעלה.</p>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {okMsg && !localErr && <p className="conn-note" role="status" aria-live="polite">{okMsg}</p>}
    </section>
  )
}
