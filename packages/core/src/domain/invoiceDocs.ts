/* Shared invoice document-type + payment-method options, used by both the
   per-transaction issue picker (InvoiceActions) and the issue-on-creation
   toggle (AddTransactionModal). Single source of truth so the two never drift.
   Display labels resolve via i18n (finance:docTypes.* / finance:payMethods.*) so
   they follow the active language; the option lists stay language-agnostic. */
import i18n from '../i18n'

/* The three document types the user picks per issuance (covers עוסק פטור →
   receipt and עוסק מורשה → invoice_receipt without assuming a tax status). */
export const DOC_TYPES = [
  { key: 'invoice_receipt' },
  { key: 'receipt' },
  { key: 'invoice' },
]

/* Payment methods (shown for receipt-type docs). Map to provider codes server-side.
   NOTE: 'cheque' is intentionally NOT offered — Green Invoice requires the cheque
   number + bank (name/branch/account) on the receipt, which we don't collect, so a
   cheque receipt can't be issued correctly. Coaches paid by cheque pick "אחר". */
export const PAY_METHODS = [
  { key: 'bank_transfer' },
  { key: 'cash' },
  { key: 'credit_card' },
  { key: 'app' },
  { key: 'other' },
]

export const docTypeLabel = (k?: string | null) => (k ? i18n.t(`finance:docTypes.${k}`, { defaultValue: k }) : k)
export const isReceiptType = (t?: string | null): boolean => t === 'invoice_receipt' || t === 'receipt'

/* Label for a stored transaction payment_method key (transactions.payment_method).
   Falls back to the raw key for forward-compatibility, '' for unset. */
export const payMethodLabel = (k?: string | null): string => (k ? i18n.t(`finance:payMethods.${k}`, { defaultValue: k }) : '')

/* Free-text → payment_method KEY, for imports. A "אמצעי תשלום" column carries
   human text ("מזומן" / "העברה בנקאית" / "ביט") but the DB CHECK only accepts the
   PAY_METHODS keys — importing the raw text would violate it. Map by substring on
   a normalized form; anything non-empty-but-unrecognized becomes 'other' (never
   breaks the CHECK, never silently dropped). Empty → null (not set). */
const PAY_METHOD_SYNONYMS = [
  { key: 'cash',          match: ['מזומן', 'cash'] },
  { key: 'bank_transfer', match: ['העברה', 'transfer', 'bank', 'wire', 'זיכוי'] },
  { key: 'credit_card',   match: ['אשראי', 'כרטיס', 'ויזה', 'visa', 'credit', 'card', 'mastercard'] },
  { key: 'app',           match: ['ביט', 'bit', 'פייבוקס', 'paybox', 'אפליקציה', 'app', 'פאי'] },
]
export function parsePayMethod(raw: unknown): string | null {
  const s = String(raw == null ? '' : raw).trim().toLowerCase().replace(/[\s\-_."'`׳״]/g, '')
  if (!s) return null
  for (const m of PAY_METHOD_SYNONYMS) {
    if (m.match.some((w) => s.includes(w.toLowerCase()))) return m.key
  }
  return 'other'
}

/* Document types a business may issue. A VAT-exempt עוסק פטור can ONLY issue a
   receipt (a tax invoice / חשבונית מס fails at the provider, GI errorCode 2403);
   an עוסק מורשה (or an unset business type) can issue all three. Drives the issue
   picker's options + default so users never hit 2403. */
export const allowedDocTypes = (businessType?: string | null) =>
  businessType === 'exempt' ? DOC_TYPES.filter((d) => d.key === 'receipt') : DOC_TYPES

export const defaultDocType = (businessType?: string | null): string =>
  businessType === 'exempt' ? 'receipt' : 'invoice_receipt'

/* Clamp a chosen doc type to what the business may issue — guards against a
   stale selection (e.g. picked before the business type loaded) reaching the
   provider and 2403-ing AFTER the income was already saved. */
export const clampDocType = (businessType?: string | null, docType?: string | null): string => {
  const allowed = allowedDocTypes(businessType).map((d) => d.key)
  return allowed.includes(docType as string) ? (docType as string) : defaultDocType(businessType)
}
