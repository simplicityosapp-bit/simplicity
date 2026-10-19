import { useNavigate } from 'react-router-dom'
import { ChevronRight, FileText } from 'lucide-react'
import InvoiceCard from './InvoiceCard'
import InvoiceImports from '../finance/InvoiceImports'
import { useT } from '../../i18n/useT'
import './ConnectionsScreen.css'
import { Box, Txt, Btn } from '../../components/ui'

/* Sub-screen for the invoice connection (Green Invoice / SUMIT): the connect /
   manage card + the "ייבוא ממתין" list (also shown on the finance screen). */
export default function InvoiceConnectionScreen() {
  const { t } = useT('connections')
  const navigate = useNavigate()
  return (
    <Box className="screen">
      <Box as="header" className="screen-head conn-head conn-detail-head">
        <Btn type="button" className="conn-back" onClick={() => navigate(-1)} aria-label={t('invoiceScreen.back')}>
          <ChevronRight size={20} strokeWidth={1.6} aria-hidden="true" />
        </Btn>
        <Txt as="p" className="t-screen">
          <FileText size={20} strokeWidth={1.6} aria-hidden="true" />
          {t('invoiceScreen.title')}
        </Txt>
      </Box>

      <InvoiceCard />
      <InvoiceImports />
    </Box>
  )
}
