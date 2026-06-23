/* Shared invoice document-type + payment-method options, used by both the
   per-transaction issue picker (InvoiceActions) and the issue-on-creation
   toggle (AddTransactionModal). Single source of truth so the two never drift. */

/* The three document types the user picks per issuance (covers עוסק פטור →
   receipt and עוסק מורשה → invoice_receipt without assuming a tax status). */
export const DOC_TYPES = [
  { key: 'invoice_receipt', label: 'חשבונית מס קבלה' },
  { key: 'receipt', label: 'קבלה' },
  { key: 'invoice', label: 'חשבונית מס' },
]

/* Payment methods (shown for receipt-type docs). Map to provider codes server-side.
   NOTE: 'cheque' is intentionally NOT offered — Green Invoice requires the cheque
   number + bank (name/branch/account) on the receipt, which we don't collect, so a
   cheque receipt can't be issued correctly. Coaches paid by cheque pick "אחר". */
export const PAY_METHODS = [
  { key: 'bank_transfer', label: 'העברה בנקאית' },
  { key: 'cash', label: 'מזומן' },
  { key: 'credit_card', label: 'כרטיס אשראי' },
  { key: 'app', label: 'אפליקציה (ביט/פייבוקס)' },
  { key: 'other', label: 'אחר' },
]

export const docTypeLabel = (k) => DOC_TYPES.find((d) => d.key === k)?.label || k
export const isReceiptType = (t) => t === 'invoice_receipt' || t === 'receipt'
