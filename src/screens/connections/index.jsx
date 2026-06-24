import { useEffect, useRef, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { Plug, Calendar, FileText, Check, CircleAlert, ChevronLeft, MessageCircle, Sparkles, CreditCard } from 'lucide-react'
import { ROUTES } from '../../lib/routes'
import { useGoogleCalendar } from '../../hooks/useGoogleCalendar'
import { useInvoiceProvider } from '../../hooks/useInvoiceProvider'
import { useGrowGateway } from '../../hooks/useGrowGateway'
import { GROW_ENABLED } from '../../lib/grow'
import { useT } from '../../i18n/useT'
import './ConnectionsScreen.css'

/* One row in the connections list — a status indicator + chevron; tapping it
   opens the connection's own sub-screen (where you connect / manage / view its
   data). The toggle/connect actions live inside the sub-screen, so a row tap
   can never accidentally disconnect. */
function ConnRow({ icon: Icon, title, loading, connected, warn, statusText, onOpen, loadingLabel, ariaLabel }) {
  return (
    <button type="button" className="conn-row" onClick={onOpen} aria-label={ariaLabel}>
      <span className="conn-row-icon"><Icon size={20} strokeWidth={1.6} aria-hidden="true" /></span>
      <span className="conn-row-body">
        <span className="conn-row-title">{title}</span>
        <span className={`conn-row-status${connected ? ' on' : ''}${warn ? ' warn' : ''}`}>
          {!loading && connected && !warn && <Check size={12} strokeWidth={2.2} aria-hidden="true" />}
          {!loading && warn && <CircleAlert size={12} strokeWidth={2} aria-hidden="true" />}
          {loading ? loadingLabel : statusText}
        </span>
      </span>
      <ChevronLeft size={18} strokeWidth={1.7} aria-hidden="true" className="conn-row-chevron" />
    </button>
  )
}

/* Not-yet-available integrations — shown as a disabled row with an
   Anthropic-style toggle (off) + a "בקרוב" tag. Non-interactive.
   (WhatsApp graduated to a live row — manual click-to-chat send.) */
const SOON = [
  { key: 'claude', title: 'Claude', icon: Sparkles },
]
function SoonRow({ icon: Icon, title, soonLabel, ariaLabel }) {
  return (
    <div className="conn-row conn-row-soon" aria-disabled="true">
      <span className="conn-row-icon"><Icon size={20} strokeWidth={1.6} aria-hidden="true" /></span>
      <span className="conn-row-body">
        <span className="conn-row-title">{title}</span>
        <span className="conn-row-status soon">{soonLabel}</span>
      </span>
      <span className="conn-toggle" role="switch" aria-checked="false" aria-disabled="true" aria-label={ariaLabel}>
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
  const { t } = useT('connections')
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const gcal = useGoogleCalendar()
  const inv = useInvoiceProvider()
  const grow = useGrowGateway()
  const providerLabel = (p) => (p === 'sumit' || p === 'greeninvoice' ? t(`providers.${p}`) : '')
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
      Promise.resolve().then(() => setCallbackError(t('list.connectCancelled')))
      navigate(ROUTES.CONNECTIONS, { replace: true })
      return
    }
    Promise.resolve().then(() => setConnecting(true))
    gcal.completeConnect(code, params.get('state'))
      .then(() => navigate(ROUTES.CONNECTION_CALENDAR, { replace: true }))
      .catch(() => { setCallbackError(t('list.connectFailed')); navigate(ROUTES.CONNECTIONS, { replace: true }) })
      .finally(() => setConnecting(false))
  }, [params, gcal, navigate, t])

  const calConnected = !!gcal.status?.connected
  const invConnected = !!inv.status?.connected
  const invWarn = invConnected && !!inv.status?.credentials_invalid
  const invStatusText = !invConnected
    ? t('list.notConnected')
    : invWarn
      ? t('list.needsReconnect')
      : t('list.connectedTo', { provider: providerLabel(inv.status?.provider) })
  const calStatusText = calConnected ? t('list.connected') : t('list.notConnected')
  const growConnected = !!grow.status?.connected
  const growWarn = growConnected && !!grow.status?.credentials_invalid
  const growStatusText = !growConnected
    ? t('list.notConnected')
    : growWarn
      ? t('list.needsReconnect')
      : t('list.connected')

  return (
    <div className="screen">
      <header className="screen-head conn-head">
        <div>
          <p className="t-screen"><Plug size={20} strokeWidth={1.6} aria-hidden="true" /> {t('list.title')}</p>
          <p className="lbl-sm">{t('list.subtitle')}</p>
        </div>
      </header>

      {connecting && <p className="conn-note" role="status" aria-live="polite">{t('list.connecting')}</p>}
      {callbackError && (
        <p className="conn-error" role="alert"><CircleAlert size={14} strokeWidth={1.7} aria-hidden="true" /> {callbackError}</p>
      )}

      <div className="conn-list">
        <ConnRow
          icon={Calendar}
          title="Google Calendar"
          loading={gcal.loading}
          connected={calConnected}
          statusText={calStatusText}
          loadingLabel={t('loading')}
          ariaLabel={t('list.rowAria', { title: 'Google Calendar', status: gcal.loading ? t('loading') : calStatusText })}
          onOpen={() => navigate(ROUTES.CONNECTION_CALENDAR)}
        />
        <ConnRow
          icon={FileText}
          title={t('list.invoices')}
          loading={inv.loading}
          connected={invConnected}
          warn={invWarn}
          statusText={invStatusText}
          loadingLabel={t('loading')}
          ariaLabel={t('list.rowAria', { title: t('list.invoices'), status: inv.loading ? t('loading') : invStatusText })}
          onOpen={() => navigate(ROUTES.CONNECTION_INVOICES)}
        />
        {GROW_ENABLED ? (
          <ConnRow
            icon={CreditCard}
            title={t('list.grow')}
            loading={grow.loading}
            connected={growConnected}
            warn={growWarn}
            statusText={growStatusText}
            loadingLabel={t('loading')}
            ariaLabel={t('list.rowAria', { title: t('list.grow'), status: grow.loading ? t('loading') : growStatusText })}
            onOpen={() => navigate(ROUTES.CONNECTION_GROW)}
          />
        ) : (
          /* Locked until a real Grow account verifies the flow — shown as a
             disabled "בקרוב" row (the full feature is built behind GROW_ENABLED). */
          <SoonRow
            icon={CreditCard}
            title={t('list.grow')}
            soonLabel={t('list.soon')}
            ariaLabel={t('list.soonAria', { title: t('list.grow') })}
          />
        )}
        <ConnRow
          icon={MessageCircle}
          title="WhatsApp"
          loading={false}
          connected
          statusText={t('list.whatsappStatus')}
          loadingLabel={t('loading')}
          ariaLabel={t('list.rowAria', { title: 'WhatsApp', status: t('list.whatsappStatus') })}
          onOpen={() => navigate(ROUTES.CONNECTION_WHATSAPP)}
        />
        {SOON.map((s) => (
          <SoonRow
            key={s.key}
            icon={s.icon}
            title={s.title}
            soonLabel={t('list.soon')}
            ariaLabel={t('list.soonAria', { title: s.title })}
          />
        ))}
      </div>
    </div>
  )
}
