import { useNavigate } from 'react-router-dom'
import { ROUTES } from '../lib/routes'

/* Returns a callback that routes to the subscription section in Settings —
   the single upgrade surface every "you've hit a limit" / locked control
   points at. Deep-links the personal group + subscription section open. */
export function useUpgradeNav() {
  const navigate = useNavigate()
  return () => navigate(ROUTES.SETTINGS, { state: { openGroup: 'personal', openSection: 'subscription' } })
}
