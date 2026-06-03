import { useState } from 'react'

/* Collapsible home card. The header (title + count) stays visually IDENTICAL
   to the original card and acts as the toggle; the list below renders only
   when open. Closed by default — home stays a glance, and you expand the
   cards you want to read. No extra chrome (no chevron) — the only change is
   that the header is clickable. Used by the three list widgets
   (attention / reminders / next-tasks).

   `title`   — inner content of the header title (icon + text [+ InfoPopover]).
   `headEnd` — the trailing count / nav link, kept exactly as before.
   Interactive children (nav link, InfoPopover) must stop propagation so a
   tap on them doesn't also toggle the card. */
export default function CollapsibleCard({ title, headEnd, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen)
  const toggle = () => setOpen((o) => !o)

  return (
    <div className={`h-card${open ? ' is-open' : ' is-collapsed'}`}>
      <div
        className="h-card-head h-card-head-toggle"
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={toggle}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle() }
        }}
      >
        <span className="h-card-title">{title}</span>
        {headEnd}
      </div>
      {open && <div className="h-card-list">{children}</div>}
    </div>
  )
}
