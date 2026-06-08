import { useEffect, useState } from 'react'
import { Check } from 'lucide-react'
import { subscribe, getSnapshot, clearToast, TOAST_DURATION } from '../lib/toast'
import './Toast.css'

/* <Toast> — the visible half of the success/info channel. Always mounted at
   the app shell; renders nothing while idle. Tap to dismiss. */
export default function Toast() {
  const [, setTick] = useState(0)
  useEffect(() => subscribe(() => setTick((t) => t + 1)), [])
  const { message, seq } = getSnapshot()
  if (!message) return null
  return (
    <div
      key={seq}
      className="app-toast"
      role="status"
      aria-live="polite"
      onClick={clearToast}
      style={{ '--toast-dur': `${TOAST_DURATION}ms` }}
    >
      <Check size={15} strokeWidth={2.2} aria-hidden="true" />
      <span>{message}</span>
    </div>
  )
}
