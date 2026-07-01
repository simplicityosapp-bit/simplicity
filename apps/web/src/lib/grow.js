/* ════════════════════════════════════════════════════════════════
   GROW — master feature switch
   ════════════════════════════════════════════════════════════════
   The Grow (גרו / Meshulam) payment-gateway feature is built in full but
   kept LOCKED until a real Grow account has live-verified the connect +
   payment flow (we have no sandbox credentials to verify against).

   While GROW_ENABLED is false:
     • the Connections row shows "בקרוב" and is not clickable;
     • /connections/grow redirects back to /connections;
     • useGrowGateway makes NO network calls (status query disabled), so it
       always reports "not connected" — which hides every downstream
       payment-link button automatically.
   → NO code path reaches the Grow API while this is false. Safe to merge.

   Flip to true (one line) to go live once the flow is verified end-to-end. */
export const GROW_ENABLED = false
