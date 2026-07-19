import { useNavigate } from 'react-router-dom'
import { ROUTES } from '../lib/routes'

/* Returns a callback that routes to the subscription screen — the single
   upgrade surface every "you've hit a limit" / locked control points at.

   ⚠️ ACTIVATION NOTE: while billing is off (BILLING_ENABLED=false) every limit
   is Infinity, so these callers never fire and the target is purely
   informational. The /subscription screen currently has NO upgrade/pay CTA
   (removed by design — everyone is on the single plan). Before enabling billing,
   add an upgrade affordance there, or these "limit reached" paths dead-end. */
export function useUpgradeNav() {
  const navigate = useNavigate()
  return () => navigate(ROUTES.SUBSCRIPTION)
}
