import { useNavigate } from 'react-router-dom'
import { ChevronRight, FileText } from 'lucide-react'
import InvoiceCard from './InvoiceCard'
import InvoiceImports from '../finance/InvoiceImports'
import './ConnectionsScreen.css'

/* Sub-screen for the invoice connection (Green Invoice / SUMIT): the connect /
   manage card + the "ייבוא ממתין" list (also shown on the finance screen). */
export default function InvoiceConnectionScreen() {
  const navigate = useNavigate()
  return (
    <div className="screen">
      <header className="screen-head conn-head conn-detail-head">
        <button type="button" className="conn-back" onClick={() => navigate(-1)} aria-label="חזרה">
          <ChevronRight size={20} strokeWidth={1.6} aria-hidden="true" />
        </button>
        <div>
          <p className="t-screen"><FileText size={20} strokeWidth={1.6} aria-hidden="true" /> חשבוניות</p>
          <p className="lbl-sm">הפקת חשבוניות וקבלות, וייבוא הכנסות מתוכנת הקבלות שלך.</p>
        </div>
      </header>

      <InvoiceCard />
      <InvoiceImports />
    </div>
  )
}
