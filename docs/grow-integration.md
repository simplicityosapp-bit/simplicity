# Grow (גרו / Meshulam) payment-gateway integration — plan & status

**Status: Phase 1 built + edge fn deployed; NOT merged to main; parked on Grow sandbox credentials for live verification.**
Last updated: 2026-06-24.

Grow (גרו, formerly Meshulam) is an Israeli credit-card **clearing / סליקה** gateway: it lets a coach
collect money online (credit card, Bit, Apple/Google Pay). This is distinct from the existing invoice
integration (Green Invoice / SUMIT), which only issues tax documents. The two are complementary —
a Grow payment can later auto-issue a receipt through the invoice provider (Phase 4).

Built on the exact rails of the invoice integration: BYOK credentials in `user_integrations`
(service-role only, no client RLS), an action-dispatch edge function, a React Query hook, and a
connect card on the Connections screen.

## Owner-approved decisions (locked 2026-06-24)
1. **Full scope**, built **in phases** (the invoice integration shipped this way for the same reason — real money).
2. **Payment links** generated from four surfaces: client-drawer balance, transaction/income, payment-plan installment, public booking page.
3. **On a successful payment**: record an income transaction (`payment_method = credit_card`), mark a payment-plan installment received when linked, and auto-issue a receipt via the connected invoice provider.
4. **Import = both**: reconcile our own links + poll/import external Grow charges (made outside Simplicity), deduped by Grow transaction id.
5. Customer pays via **redirect to Grow's hosted page** (not an embedded iframe) — Grow handles PCI.
6. **Single source of truth for income = the payment webhook.** It creates exactly ONE income transaction, tagged with the Grow transaction id. The auto-receipt is issued *for* that transaction; the polling import dedupes by Grow transaction id. This is what prevents double/triple counting.
7. **Payment-link model = context-aware**: a link from a client → creates a new income tx on payment; a link from an existing income tx → updates that tx; a link from a plan installment → marks it received (via the existing `usePaymentPlans` mechanism).

## Grow API facts (verified from docs/search — env/parsing still to be confirmed against a live account)
- Credentials = **userId + pageCode + apiKey** (three identifiers; per-business, from Grow).
- Requests are **multipart/form-data, NOT JSON** (a classic integration mistake).
- Flow: `createPaymentProcess` (server-side) → returns a hosted payment-page **URL valid 10 minutes** →
  customer pays → Grow calls the server **callback (`notifyUrl`)** → we must call **`approveTransaction`** to acknowledge.
- Base URLs: sandbox `https://sandbox.meshulam.co.il/api/light/server/1.0`, production `https://secure.meshulam.co.il/api/light/server/1.0`.
- **Open API item:** the 10-minute `createPaymentProcess` URL suits "pay now" (booking page). For "send a link the client pays later" (client balance / installment) we likely need Grow's longer-lived **Payment-Link** product — verify the exact endpoint during Phase 2.

## Credential storage (migration 0060 — additive, already authored)
One new nullable column on the shared `user_integrations` table; the rest reuse existing slots:
- `api_key` ← Grow **userId**
- `api_secret` ← Grow **apiKey** (the sensitive one)
- `page_code` ← Grow **pageCode** (NEW column)
- `environment` reused (Grow has a real sandbox); `credentials_invalid_at` reused for the reconnect marker.
RLS unchanged: service-role only, no `authenticated` policy.

## Phase plan
| Phase | Contents | Done-when |
|---|---|---|
| **1 — foundation** | connect / status / test / disconnect; migration 0060; edge fn `grow`; `useGrowGateway` + `callGrow`; Connections row + `GrowConnection`/`GrowCard`; i18n ×4. | Live sandbox connect shows "מחובר · Sandbox". |
| **2 — links + webhook** | `payment_requests` table; `create-payment-link` action; public `grow-webhook` (`--no-verify-jwt`); single income record + installment mark. | A link → sandbox payment → exactly one income tx, no duplicates. |
| **3 — booking pages** | Pay-at-booking: hold the slot during payment, release on abandon; per-page opt-in + price. | Book → pay → appointment confirmed; abandon → slot freed. |
| **4 — receipt + import** | Auto-issue receipt via invoice provider (guarded vs invoice auto-import); polling reconcile + external-charge import, deduped by Grow tx id. | Paid → one receipt; external Grow charge appears once. |

## Phase 1 — current state
- **Migration `0060_grow_integration.sql`** — adds `page_code`. RUN on the EU project by the owner 2026-06-24.
- **Edge fn `grow`** (`index.ts` + `gateway.ts`) — DEPLOYED to EU project `rdurkakzyymxhocvhufw`. verify_jwt ON.
- **Frontend** — `useGrowGateway`, `callGrow` (shared `fnError`/`readFnErrorBody` refactor), route `CONNECTION_GROW`, Connections row, `GrowConnection.jsx` + `GrowCard.jsx` (env pills + 3 fields + 2-step disconnect), i18n in he/en/es/fr (he gendered). `mockSupabase` got a dev-only `grow` handler.
- **Verified**: build passes; preview (mock) shows the row, the sub-screen, and a full connect→connected→test/disconnect flow with no console errors.
- ⚠️ **`gateway.verifyCredentials` is UNVERIFIED.** Grow has no documented read-only ping, so it probes
  `createPaymentProcess` with ₪1 (no charge, expires in 10 min) and treats `status !== 1` as
  `invalid_credentials`. The real success/error envelope must be observed against a live sandbox account; the
  invalid-vs-error split may need tightening. **Hard rule: do not merge to main until a live connect returns ok.**

## Resume checklist (when Grow sandbox credentials are available)
1. In the app: Connections → "סליקה · Grow" → Sandbox → enter userId / pageCode / apiKey → "חבר".
2. If it errors, capture Grow's exact message (the UI surfaces the `detail`) and tighten `gateway.ts` envelope parsing.
3. Once "מחובר · Sandbox" shows: create `feat/grow-integration` → commit → `git merge --no-ff` to main → push. Then start Phase 2.

## Phase 2 — design (ready to build once Phase 1 is verified)
**`payment_requests` table** (additive migration; owner RLS SELECT, writes service-role only):
`id, user_id, client_id?, transaction_id?, installment_id?, source ('client'|'transaction'|'installment'|'booking'),
amount, description, status ('pending'|'paid'|'expired'|'cancelled'|'failed'), grow_process_id, grow_process_token,
grow_transaction_id (UNIQUE per user — idempotency/dedup), payment_url, paid_at, created_at, updated_at`.

**`grow` edge fn — `create-payment-link`**: input `{ client_id?, transaction_id?, installment_id?, amount, description }`;
load owner creds; call Grow (Payment-Link product for send-later, or createPaymentProcess for pay-now); insert a
`payment_requests` row (status pending); return the URL.

**`grow-webhook`** (separate, `--no-verify-jwt`, tenant via a per-row `webhook_token` like SUMIT): never trust the
callback body — re-query Grow for the authoritative status, call `approveTransaction`, then **atomically**
(claim on `grow_transaction_id`) record ONE income tx + flip the `payment_requests` row to paid + mark the linked
installment received. Context-aware per `source` (decision #7).

**UI**: "צור לינק תשלום" in the client drawer (beside the WhatsApp payment-request), the transaction modal, and the
payment-plan installment row; show link status (pending/paid) and a copy / WhatsApp send. i18n ×4.
