import { useEffect, useRef, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { Plug, Calendar, FileText, Check, CircleAlert, ChevronLeft, MessageCircle, Sparkles } from 'lucide-react'
import { ROUTES } from '../../lib/routes'
import { useGoogleCalendar } from '../../hooks/useGoogleCalendar'
import { useInvoiceProvider } from '../../hooks/useInvoiceProvider'
import './ConnectionsScreen.css'

const providerLabel = (p) => (p === 'sumit' ? 'סאמיט' : p === 'greeninvoice' ? 'חשבונית ירוקה' : '')

/* One row in the connections list — a status indicator + chevron; tapping it
   opens the connection's own sub-screen (where you connect / manage / view its
   data). The toggle/connect actions live inside the sub-screen, so a row tap
   can never accidentally disconnect. */
function ConnRow({ icon: Icon, title, loading, connected, warn, statusText, onOpen }) {
  return (
    <button type="button" className="conn-row" onClick={onOpen} aria-label={`${title} — ${statusText}`}>
      <span className="conn-row-icon"><Icon size={20} strokeWidth={1.6} aria-hidden="true" /></span>
      <span className="conn-row-body">
        <span className="conn-row-title">{title}</span>
        <span className={`conn-row-status${connected ? ' on' : ''}${warn ? ' warn' : ''}`}>
          {!loading && connected && !warn && <Check size={12} strokeWidth={2.2} aria-hidden="true" />}
          {!loading && warn && <CircleAlert size={12} strokeWidth={2} aria-hidden="true" />}
          {loading ? 'טוען…' : statusText}
        </span>
      </span>
      <ChevronLeft size={18} strokeWidth={1.7} aria-hidden="true" className="conn-row-chevron" />
    </button>
  )
}

/* Not-yet-available integrations — shown as a disabled row with an
   Anthropic-style toggle (off) + a "בקרוב" tag. Non-interactive. */
const SOON = [
  { key: 'whatsapp', title: 'WhatsApp', icon: MessageCircle },
  { key: 'claude', title: 'Claude', icon: Sparkles },
]
function SoonRow({ icon: Icon, title }) {
  return (
    <div className="conn-row conn-row-soon" aria-disabled="true">
      <span className="conn-row-icon"><Icon size={20} strokeWidth={1.6} aria-hidden="true" /></span>
      <span className="conn-row-body">
        <span className="conn-row-title">{title}</span>
        <span className="conn-row-status soon">בקרוב</span>
      </span>
      <span className="conn-toggle" role="switch" aria-checked="false" aria-disabled="true" aria-label={`${title} — בקרוב`}>
        <span className="conn-toggle-knob" aria-hidden="true" />
      </span>
    </div>
  )
}

/* Connections home — a compact list of integrations. Each row enters its own
   sub-screen. This screen also catches the Google OAuth redirect (?code), since
   the registered redirect_uri is /connections; on success it forwards into the
   calendar sub-screen. */
export default function ConnectionsScreen() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const gcal = useGoogleCalendar()
  const inv = useInvoiceProvider()
  const [callbackError, setCallbackError] = useState('')
  const [connecting, setConnecting] = useState(false)
  const handledCode = useRef(false)

  /* OAuth return: Google sent us back with ?code (or ?error). Exchange it once,
     scrub the query string, then forward into the calendar sub-screen. */
  useEffect(() => {
    if (handledCode.current) return
    const code = params.get('code')
    const err = params.get('error')
    if (!code && !err) return
    handledCode.current = true
    if (err) {
      Promise.resolve().then(() => setCallbackError('החיבור בוטל או נדחה.'))
      navigate(ROUTES.CONNECTIONS, { replace: true })
      return
    }
    Promise.resolve().then(() => setConnecting(true))
    gcal.completeConnect(code, params.get('state'))
      .then(() => navigate(ROUTES.CONNECTION_CALENDAR, { replace: true }))
      .catch(() => { setCallbackError('החיבור נכשל. נסו שוב.'); navigate(ROUTES.CONNECTIONS, { replace: true }) })
      .finally(() => setConnecting(false))
  }, [params, gcal, navigate])

  const calConnected = !!gcal.status?.connected
  const invConnected = !!inv.status?.connected
  const invWarn = invConnected && !!inv.status?.credentials_invalid
  const invStatusText = !invConnected
    ? 'לא מחובר'
    : invWarn
      ? 'דורש חיבור מחדש'
      : `מחובר · ${providerLabel(inv.status?.provider)}`

  return (
    <div className="screen">
      <header className="screen-head conn-head">
        <div>
          <p className="t-screen"><Plug size={20} strokeWidth={1.6} aria-hidden="true" /> חיבורים</p>
          <p className="lbl-sm">חברו שירותים חיצוניים כדי למשוך נתונים אוטומטית.</p>
        </div>
      </header>

      {connecting && <p className="conn-note" role="status" aria-live="polite">מתחבר ומסנכרן…</p>}
      {callbackError && (
        <p className="conn-error" role="alert"><CircleAlert size={14} strokeWidth={1.7} aria-hidden="true" /> {callbackError}</p>
      )}

      <div className="conn-list">
        <ConnRow
          icon={Calendar}
          title="Google Calendar"
          loading={gcal.loading}
          connected={calConnected}
          statusText={calConnected ? 'מחובר' : 'לא מחובר'}
          onOpen={() => navigate(ROUTES.CONNECTION_CALENDAR)}
        />
        <ConnRow
          icon={FileText}
          title="חשבוניות"
          loading={inv.loading}
          connected={invConnected}
          warn={invWarn}
          statusText={invStatusText}
          onOpen={() => navigate(ROUTES.CONNECTION_INVOICES)}
        />
        {SOON.map((s) => <SoonRow key={s.key} icon={s.icon} title={s.title} />)}
      </div>
    </div>
  )
}
