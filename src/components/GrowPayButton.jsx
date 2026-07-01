import { useState } from 'react'
import { CreditCard, Loader2, Copy, Check, CircleAlert } from 'lucide-react'
import { useGrowGateway } from '../hooks/useGrowGateway'
import { GROW_ENABLED } from '../lib/grow'
import { useT } from '../i18n/useT'
import WhatsAppButton from './WhatsAppButton'
import './GrowPayButton.css'
import { Box, Txt, Btn, Input } from './ui'

/* Map the create-payment-link coarse error code to a translated sentence. */
function errMsg(code, t) {
  switch (code) {
    case 'not_connected': return t('growPay.err.notConnected')
    case 'bad_amount': return t('growPay.err.badAmount')
    case 'invalid_credentials': return t('growPay.err.invalidCredentials')
    case 'provider_unreachable': return t('growPay.err.providerUnreachable')
    default: return t('growPay.err.generic')
  }
}

/* "Create a Grow payment link" button — shown beside the existing payment
   surfaces (client balance, an income transaction, a plan installment) ONLY
   when the Grow gateway is enabled AND connected. It creates a hosted payment
   link the coach can copy or send on WhatsApp; the income itself is recorded by
   the grow-webhook when the customer actually pays (never here).

   While GROW_ENABLED is false, useGrowGateway reports "not connected", so this
   renders nothing — the whole feature stays dark until the flag is flipped. */
export default function GrowPayButton({
  source,
  clientId = null,
  transactionId = null,
  installmentId = null,
  amount,
  description = '',
  clientName = '',
  clientPhone = '',
  triggerClassName = '',
}) {
  const { t } = useT('connections')
  const grow = useGrowGateway()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [url, setUrl] = useState('')
  const [copied, setCopied] = useState(false)

  // Hidden entirely unless the gateway is live + connected (and the amount is real).
  if (!GROW_ENABLED || !grow.status?.connected) return null
  const amt = Number(amount)
  if (!Number.isFinite(amt) || amt <= 0) return null

  const onCreate = async () => {
    setErr(''); setBusy(true)
    try {
      const r = await grow.createPaymentLink({ source, clientId, transactionId, installmentId, amount: amt, description })
      setUrl(r?.payment?.url || '')
    } catch (e) {
      setErr(errMsg(e.message, t))
    } finally {
      setBusy(false)
    }
  }

  const onCopy = async () => {
    try { await navigator.clipboard.writeText(url); setCopied(true); window.setTimeout(() => setCopied(false), 2000) } catch { /* ignore */ }
  }

  if (url) {
    return (
      <Box className="growpay-result">
        <Txt className="growpay-ready">{t('growPay.linkReady')}</Txt>
        <Box className="growpay-linkrow">
          <Input className="growpay-url" type="text" readOnly dir="ltr" value={url} onFocus={(e) => e.target.select()} />
          <Btn type="button" className="growpay-copy" onClick={onCopy} aria-label={t('growPay.copy')}>
            {copied ? <Check size={15} strokeWidth={2} aria-hidden="true" /> : <Copy size={15} strokeWidth={1.8} aria-hidden="true" />}
            {copied ? t('growPay.copied') : t('growPay.copy')}
          </Btn>
        </Box>
        <WhatsAppButton
          showLabel
          triggerClassName="growpay-wa"
          label={t('growPay.send')}
          phone={clientPhone}
          message={t('growPay.waMessage', { name: clientName || '', url })}
        />
      </Box>
    )
  }

  return (
    <Box className="growpay">
      <Btn type="button" className={`growpay-trigger ${triggerClassName}`} onClick={onCreate} disabled={busy} aria-busy={busy}>
        {busy
          ? <><Loader2 size={15} strokeWidth={1.9} className="growpay-spin" aria-hidden="true" /> {t('growPay.creating')}</>
          : <><CreditCard size={15} strokeWidth={1.8} aria-hidden="true" /> {t('growPay.create')}</>}
      </Btn>
      {err && <Txt as="p" className="growpay-err" role="alert"><CircleAlert size={13} strokeWidth={1.7} aria-hidden="true" /> {err}</Txt>}
    </Box>
  )
}
