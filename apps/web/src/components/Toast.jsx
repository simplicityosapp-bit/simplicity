import { useEffect, useState } from 'react'
import { Check, CircleAlert } from 'lucide-react'
import { subscribe, getSnapshot, clearToast } from '../lib/toast'
import './Toast.css'
import { Box, Txt } from './ui'

/* <Toast> — the visible half of the success/error channel. Always mounted at
   the app shell; renders nothing while idle. Tap to dismiss. */
export default function Toast() {
  const [, setTick] = useState(0)
  useEffect(() => subscribe(() => setTick((t) => t + 1)), [])
  const { message, type, seq } = getSnapshot()
  if (!message) return null
  const isError = type === 'error'
  return (
    <Box
      key={seq}
      className={`app-toast${isError ? ' error' : ''}`}
      role={isError ? 'alert' : 'status'}
      aria-live={isError ? 'assertive' : 'polite'}
      onClick={clearToast}
    >
      {isError
        ? <CircleAlert size={15} strokeWidth={2} aria-hidden="true" />
        : <Check size={15} strokeWidth={2.2} aria-hidden="true" />}
      <Txt>{message}</Txt>
    </Box>
  )
}
