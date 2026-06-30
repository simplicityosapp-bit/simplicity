import { useNavigate, Navigate } from 'react-router-dom'
import { ChevronRight, CreditCard } from 'lucide-react'
import GrowCard from './GrowCard'
import GrowImports from './GrowImports'
import { ROUTES } from '../../lib/routes'
import { GROW_ENABLED } from '../../lib/grow'
import { useT } from '../../i18n/useT'
import './ConnectionsScreen.css'

/* Sub-screen for the Grow (גרו / Meshulam) payment-gateway connection: the
   connect / manage card. Payment-link history + settings will be added here in
   later phases. */
export default function GrowConnectionScreen() {
  const { t } = useT('connections')
  const navigate = useNavigate()
  // Locked → the screen is closed; bounce back to the connections list.
  if (!GROW_ENABLED) return <Navigate to={ROUTES.CONNECTIONS} replace />
  return (
    <div className="screen">
      <header className="screen-head conn-head conn-detail-head">
        <button type="button" className="conn-back" onClick={() => navigate(-1)} aria-label={t('growScreen.back')}>
          <ChevronRight size={20} strokeWidth={1.6} aria-hidden="true" />
        </button>
        <div>
          <p className="t-screen"><CreditCard size={20} strokeWidth={1.6} aria-hidden="true" /> {t('growScreen.title')}</p>
          <p className="lbl-sm">{t('growScreen.subtitle')}</p>
        </div>
      </header>

      <GrowCard />
      <GrowImports />
    </div>
  )
}
