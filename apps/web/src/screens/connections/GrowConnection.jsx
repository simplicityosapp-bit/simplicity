import { useNavigate, Navigate } from 'react-router-dom'
import { ChevronRight, CreditCard } from 'lucide-react'
import GrowCard from './GrowCard'
import GrowImports from './GrowImports'
import { ROUTES } from '../../lib/routes'
import { GROW_ENABLED } from '../../lib/grow'
import { useT } from '../../i18n/useT'
import './ConnectionsScreen.css'
import { Box, Txt, Btn } from '../../components/ui'

/* Sub-screen for the Grow (גרו / Meshulam) payment-gateway connection: the
   connect / manage card. Payment-link history + settings will be added here in
   later phases. */
export default function GrowConnectionScreen() {
  const { t } = useT('connections')
  const navigate = useNavigate()
  // Locked → the screen is closed; bounce back to the connections list.
  if (!GROW_ENABLED) return <Navigate to={ROUTES.CONNECTIONS} replace />
  return (
    <Box className="screen">
      <Box as="header" className="screen-head conn-head conn-detail-head">
        <Btn type="button" className="conn-back" onClick={() => navigate(-1)} aria-label={t('growScreen.back')}>
          <ChevronRight size={20} strokeWidth={1.6} aria-hidden="true" />
        </Btn>
        <Box>
          <Txt as="p" className="t-screen"><CreditCard size={20} strokeWidth={1.6} aria-hidden="true" /> {t('growScreen.title')}</Txt>
          <Txt as="p" className="lbl-sm">{t('growScreen.subtitle')}</Txt>
        </Box>
      </Box>

      <GrowCard />
      <GrowImports />
    </Box>
  )
}
