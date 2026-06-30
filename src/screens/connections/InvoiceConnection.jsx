import { useNavigate, Navigate } from 'react-router-dom'
import { ChevronRight, FileText } from 'lucide-react'
import InvoiceCard from './InvoiceCard'
import InvoiceImports from '../finance/InvoiceImports'
import { useSubscription } from '../../hooks/useSubscription'
import { ROUTES } from '../../lib/routes'
import { useT } from '../../i18n/useT'
import './ConnectionsScreen.css'

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
    <div className="screen">
      <header className="screen-head conn-head conn-detail-head">
        <button type="button" className="conn-back" onClick={() => navigate(-1)} aria-label={t('invoiceScreen.back')}>
          <ChevronRight size={20} strokeWidth={1.6} aria-hidden="true" />
        </button>
        <div>
          <p className="t-screen"><FileText size={20} strokeWidth={1.6} aria-hidden="true" /> {t('invoiceScreen.title')}</p>
          <p className="lbl-sm">{t('invoiceScreen.subtitle')}</p>
        </div>
      </header>

      <InvoiceCard />
      <InvoiceImports />
    </div>
  )
}
