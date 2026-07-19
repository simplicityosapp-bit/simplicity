import { useNavigate } from 'react-router-dom'
import { ROUTES } from '../lib/routes'

/* Returns a callback that routes to the subscription screen — the single
   upgrade surface every "you've hit a limit" / locked control points at. */
export function useUpgradeNav() {
  const navigate = useNavigate()
  return () => navigate(ROUTES.SUBSCRIPTION)
}
