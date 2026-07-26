import { ChevronDown } from 'lucide-react'
import { Box, Txt, Btn } from './ui'

/* ════════════════════════════════════════════════════════════════
   CollapsibleSection — a card that opens and closes.
   ════════════════════════════════════════════════════════════════
   For blocks that are management rather than daily reading: they earn
   their place on the screen but shouldn't cost a screenful of scrolling
   to get past. Closed, the header still carries the title, the icon and
   a count, so a shut section says what is inside it.

   `open` / `onToggle` are controlled by the caller, which is what lets
   the finance screen persist the state in prefs rather than losing it on
   every navigation. The body is unmounted while closed — these sections
   render lists, and there is no reason to pay for them until asked.
   ════════════════════════════════════════════════════════════════ */
export default function CollapsibleSection({ id, icon, title, count, open, onToggle, children }) {
  const bodyId = `collapsible-${id}`
  return (
    <Box as="section" className={`cs-section${open ? ' open' : ''}`}>
      <Btn
        type="button"
        className="cs-head"
        onClick={() => onToggle(!open)}
        aria-expanded={open}
        aria-controls={bodyId}
      >
        {icon && <Txt className="cs-head-ic" aria-hidden="true">{icon}</Txt>}
        <Txt className="cs-head-title">{title}</Txt>
        {count > 0 && <Txt className="cs-head-count mono">{count}</Txt>}
        <ChevronDown size={16} strokeWidth={1.8} className="cs-head-chev" aria-hidden="true" />
      </Btn>
      {open && <Box id={bodyId} className="cs-body">{children}</Box>}
    </Box>
  )
}
