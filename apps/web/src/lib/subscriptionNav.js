/* ════════════════════════════════════════════════════════════════
   SUBSCRIPTION SCREEN — visibility switch
   ════════════════════════════════════════════════════════════════
   The /subscription screen carries a live "רכישת מנוי" CTA that opens a
   REAL Grow payment page. Until the billing model is settled, no user
   should be able to reach it and pay by accident.

   While SUBSCRIPTION_NAV_ENABLED is false:
     • the sidebar "עוד" panel drops its subscription row;
     • the mobile menu drawer drops its subscription link;
     • /subscription itself redirects to the home screen, so the payment
       CTA is unreachable even by typing the URL.

   Stricter than the community switch on purpose (which is nav-only and
   leaves its route open): here the thing behind the route charges money.

   Nothing is deleted or restructured — the screen, its styles, the
   CHECKOUT_URL constant and all four locales stay exactly as they are.
   Flip to true (one line) to put the screen back. */
export const SUBSCRIPTION_NAV_ENABLED = false
