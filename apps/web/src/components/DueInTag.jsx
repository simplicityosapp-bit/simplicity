import { Clock } from 'lucide-react'
import { daysUntilLabel } from '@simplicity/core'
import { Txt } from './ui'
import './DueInTag.css'

/* "עוד 3 ימים" — how soon a reminder falls due, said in days.
   ════════════════════════════════════════════════════════════════
   Every surface that lists a reminder prints its date, and three of them
   ("12/08 · 10:00" in the client drawer, the project drawer and the tasks
   rows) print it as a bare number: correct, and no help at all in answering
   the only question being asked of that line — is this soon?

   Renders NOTHING outside a 2–7 day window. Today and tomorrow already carry
   a word of their own wherever formatWhen is used, so a tag there would say
   the same thing twice; past a week the count stops reading as a distance and
   the date itself is the better answer. Overdue is somebody else's job — the
   surfaces that care already colour their own row for it.

   One component rather than a chip per screen, because the four call sites
   sit in three different stylesheets and this is one idea. */
export default function DueInTag({ date, className = '' }) {
  const label = daysUntilLabel(date)
  if (!label) return null
  return (
    <Txt className={`due-in-tag${className ? ` ${className}` : ''}`}>
      <Clock size={10} strokeWidth={1.8} aria-hidden="true" />
      {label}
    </Txt>
  )
}
