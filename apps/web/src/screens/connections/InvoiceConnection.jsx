import { useNavigate, Navigate } from 'react-router-dom'
import { ChevronRight, FileText } from 'lucide-react'
import InvoiceCard from './InvoiceCard'
import InvoiceImports from '../finance/InvoiceImports'
import { useSubscription } from '../../hooks/useSubscription'
import { ROUTES } from '../../lib/routes'
import { useT } from '../../i18n/useT'
import './ConnectionsScreen.css'
import { Box, Txt, Btn } from '../../components/ui'

/* Sub-screen for the invoice connection (Green Invoice / SUMIT): the connect /
   manage card + the "ייבוא ממתין" list (also shown on the finance screen). */
export default function InvoiceConnectionScreen() {
  const { t } = useT('connections')
  const { can, loading } = useSubscription()
  const navigate = useNavigate()
  /* Hard guard for a direct-URL hit on the free plan (mirrors the GROW_ENABLED
     redirect). Inert while billing isn't enforced — can.connectInvoicing is
     true for everyone. Wait for the plan to load before deciding. */
  if (!loading && !can.connectInvoicing) return <Navigate to={ROUTES.CONNECTIONS} replace />
  return (
    <Box className="screen">
      <Box as="header" className="screen-head conn-head conn-detail-head">
        <Btn type="button" className="conn-back" onClick={() => navigate(-1)} aria-label={t('invoiceScreen.back')}>
          <ChevronRight size={20} strokeWidth={1.6} aria-hidden="true" />
        </Btn>
        <Box>
          <Txt as="p" className="t-screen"><FileText size={20} strokeWidth={1.6} aria-hidden="true" /> {t('invoiceScreen.title')}</Txt>
          <Txt as="p" className="lbl-sm">{t('invoiceScreen.subtitle')}</Txt>
        </Box>
      </Box>

      <InvoiceCard />
      <InvoiceImports />
    </Box>
  )
}
