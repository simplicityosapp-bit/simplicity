import { useEffect, useRef, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { Plug, Calendar, FileText, Check, CircleAlert, ChevronLeft, MessageCircle, Sparkles, Lock, CreditCard } from 'lucide-react'
import { ROUTES } from '../../lib/routes'
import { useGoogleCalendar } from '../../hooks/useGoogleCalendar'
import { useInvoiceProvider } from '../../hooks/useInvoiceProvider'
import { useSubscription } from '../../hooks/useSubscription'
import { useUpgradeNav } from '../../hooks/useUpgradeNav'
import { useGrowGateway } from '../../hooks/useGrowGateway'
import { useClaudeAccess } from '../../hooks/useClaudeAccess'
import { GROW_ENABLED } from '../../lib/grow'
import { CLAUDE_ACCESS_ENABLED } from '../../lib/claudeAccessFlag'
import { useT } from '../../i18n/useT'
import './ConnectionsScreen.css'
import { Box, Txt, Btn } from '../../components/ui'

/* One row in the connections list — a status indicator + chevron; tapping it
   opens the connection's own sub-screen (where you connect / manage / view its
   data). The toggle/connect actions live inside the sub-screen, so a row tap
   can never accidentally disconnect. */
function ConnRow({ icon: Icon, title, loading, connected, warn, statusText, onOpen, loadingLabel, ariaLabel, iconClass }) {
  return (
    <Btn type="button" className="conn-row" onClick={onOpen} aria-label={ariaLabel}>
      <Txt className={`conn-row-icon${iconClass ? ` ${iconClass}` : ''}`}><Icon size={20} strokeWidth={1.6} aria-hidden="true" /></Txt>
      <Txt className="conn-row-body">
        <Txt className="conn-row-title">{title}</Txt>
        <Txt className={`conn-row-status${connected ? ' on' : ''}${warn ? ' warn' : ''}`}>
          {!loading && connected && !warn && <Check size={12} strokeWidth={2.2} aria-hidden="true" />}
          {!loading && warn && <CircleAlert size={12} strokeWidth={2} aria-hidden="true" />}
          {loading ? loadingLabel : statusText}
        </Txt>
      </Txt>
      <ChevronLeft size={18} strokeWidth={1.7} aria-hidden="true" className="conn-row-chevron" />
    </Btn>
  )
}

/* Not-yet-available integrations — shown as a disabled row with an
   Anthropic-style toggle (off) + a "בקרוב" tag. Non-interactive.
   (WhatsApp graduated to a live row; Claude shows here while
   CLAUDE_ACCESS_ENABLED is false.) */
function SoonRow({ icon: Icon, title, soonLabel, ariaLabel }) {
  return (
    <Box className="conn-row conn-row-soon" aria-disabled="true">
      <Txt className="conn-row-icon"><Icon size={20} strokeWidth={1.6} aria-hidden="true" /></Txt>
      <Txt className="conn-row-body">
        <Txt className="conn-row-title">{title}</Txt>
        <Txt className="conn-row-status soon">{soonLabel}</Txt>
      </Txt>
      <Txt className="conn-toggle" role="switch" aria-checked="false" aria-disabled="true" aria-label={ariaLabel}>
        <Txt className="conn-toggle-knob" aria-hidden="true" />
      </Txt>
    </Box>
  )
}

/* Locked integration — available only on a paid plan. Tapping routes to the
   subscription screen (the upgrade surface). While billing isn't enforced
   (BILLING_ENABLED=false) this never renders — can.* is all true. */
function LockedRow({ icon: Icon, title, label, onOpen, ariaLabel }) {
  return (
    <Btn type="button" className="conn-row conn-row-locked" onClick={onOpen} aria-label={ariaLabel}>
      <Txt className="conn-row-icon"><Icon size={20} strokeWidth={1.6} aria-hidden="true" /></Txt>
      <Txt className="conn-row-body">
        <Txt className="conn-row-title">{title}</Txt>
        <Txt className="conn-row-status locked"><Lock size={11} strokeWidth={2} aria-hidden="true" /> {label}</Txt>
      </Txt>
      <ChevronLeft size={18} strokeWidth={1.7} aria-hidden="true" className="conn-row-chevron" />
    </Btn>
  )
}

/* The live Claude row — status from mcp-tokens. Its own component so the hook
   (and its network call) only mounts while the feature is enabled. */
function ClaudeRow({ t, onOpen }) {
  const claude = useClaudeAccess()
  const on = !!claude.status?.active
  const expired = on && !!claude.status?.expired
  const statusText = claude.error && !claude.status
    ? t('list.statusError')
    : !on
      ? t('list.notConnected')
      : expired
        ? t('list.expired')
        : t('list.connected')
  return (
    <ConnRow
      icon={Sparkles}
      title="Claude"
      loading={claude.loading}
      connected={on}
      warn={expired}
      statusText={statusText}
      loadingLabel={t('loading')}
      ariaLabel={t('list.rowAria', { title: 'Claude', status: claude.loading ? t('loading') : statusText })}
      onOpen={onOpen}
    />
  )
}

/* Claude in the list: the "בקרוב" row while CLAUDE_ACCESS_ENABLED is false
   (exactly as before the feature), the live row once it is turned on. */
export function ClaudeEntry({ t, onOpen }) {
  if (!CLAUDE_ACCESS_ENABLED) {
    return <SoonRow icon={Sparkles} title="Claude" soonLabel={t('list.soon')} ariaLabel={t('list.soonAria', { title: 'Claude' })} />
  }
  return <ClaudeRow t={t} onOpen={onOpen} />
}

/* Connections home — a compact list of integrations. Each row enters its own
   sub-screen. This screen also catches the Google OAuth redirect (?code), since
   the registered redirect_uri is /connections; on success it forwards into the
   calendar sub-screen. */
export default function ConnectionsScreen() {
  const { t } = useT('connections')
  const { t: ts } = useT('subscription')
  const { can } = useSubscription()
  const navigate = useNavigate()
  const goUpgrade = useUpgradeNav()
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
  // A failed status fetch must not masquerade as "not connected" — show a distinct
  // error so a genuinely-connected user isn't nudged to reconnect over a blip.
  const invStatusText = inv.error && !invConnected
    ? t('list.statusError')
    : !invConnected
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
    <Box className="screen">
      <Box as="header" className="screen-head conn-head">
        <Txt as="p" className="t-screen">
          <Plug size={20} strokeWidth={1.6} aria-hidden="true" />
          {t('list.title')}
        </Txt>
      </Box>

      {connecting && <Txt as="p" className="conn-note" role="status" aria-live="polite">{t('list.connecting')}</Txt>}
      {callbackError && (
        <Txt as="p" className="conn-error" role="alert"><CircleAlert size={14} strokeWidth={1.7} aria-hidden="true" /> {callbackError}</Txt>
      )}

      <Box className="conn-list">
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
        {can.connectInvoicing ? (
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
        ) : (
          <LockedRow
            icon={FileText}
            title={t('list.invoices')}
            label={ts('locked')}
            onOpen={goUpgrade}
            ariaLabel={t('list.rowAria', { title: t('list.invoices'), status: ts('locked') })}
          />
        )}
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
          iconClass="wa"
          title="WhatsApp"
          loading={false}
          connected
          statusText={t('list.whatsappStatus')}
          loadingLabel={t('loading')}
          ariaLabel={t('list.rowAria', { title: 'WhatsApp', status: t('list.whatsappStatus') })}
          onOpen={() => navigate(ROUTES.CONNECTION_WHATSAPP)}
        />
        <ClaudeEntry t={t} onOpen={() => navigate(ROUTES.CONNECTION_CLAUDE)} />
      </Box>
    </Box>
  )
}
