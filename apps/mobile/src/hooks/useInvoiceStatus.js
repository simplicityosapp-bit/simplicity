import { useEffect, useSyncExternalStore } from 'react'
import { subscribeInvoiceStatus, getInvoiceStatusSnapshot, loadInvoiceStatus } from '../lib/invoices'

/* The invoice provider's status, shared by every screen that asks (see
   lib/invoices). { status, loaded } — status is null until loaded, and stays
   null when nothing is connected. */
export function useInvoiceStatus() {
  const snap = useSyncExternalStore(subscribeInvoiceStatus, getInvoiceStatusSnapshot, getInvoiceStatusSnapshot)
  useEffect(() => { loadInvoiceStatus() }, [])
  return snap
}
