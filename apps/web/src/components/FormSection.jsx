import { ChevronDown } from 'lucide-react'
import { Box, Txt, Btn } from './ui'

/* ════════════════════════════════════════════════════════════════
   FormSection — a foldable part of a form.
   ════════════════════════════════════════════════════════════════
   Two jobs, one control:
     - the "more details" lid the add forms put their optional half
       behind (one per form, closed unless something inside is already
       filled), and
     - the named sections EditClientModal stacks so a long form reads
       top-down instead of as one scroll.

   EditClientModal grew this first and kept it to itself; the lead,
   transaction and client forms each hand-rolled the same .ec-acc
   markup beside it, and the task form had no lid at all. This is that
   component, shared, so the four cannot drift.

   Module-level, and deliberately not memoised away: a stable identity
   is the point. Declared inside a parent it would remount its whole
   body on every keystroke and the field being typed into would lose
   focus. A closed section renders NO body, which also keeps its
   fields out of the modal's Tab focus-trap.

   `summary` is the collapsed one-liner EditClientModal shows beside a
   section's title ("3 פגישות · ₪380"). The add forms pass none.
   ════════════════════════════════════════════════════════════════ */
export default function FormSection({ icon, title, summary, open, onToggle, id, children }) {
  return (
    <Box className={`ec-acc${open ? ' open' : ''}`}>
      <Btn
        type="button"
        className="ec-acc-head"
        onClick={onToggle}
        aria-expanded={open}
        /* Only while the body actually exists. A closed section renders NO
           body (see above), so naming its id the rest of the time pointed
           every screen reader at an element that is not in the document —
           which ARIA forbids, and which is less use than saying nothing.
           aria-expanded alone is a complete disclosure on its own. */
        aria-controls={open && id ? id : undefined}
      >
        {icon && <Txt className="ec-acc-ic" aria-hidden="true">{icon}</Txt>}
        <Txt className="ec-acc-title">{title}</Txt>
        {!open && summary ? <Txt className="ec-acc-sum">{summary}</Txt> : null}
        <ChevronDown size={16} strokeWidth={1.8} className="ec-acc-chev" aria-hidden="true" />
      </Btn>
      {open && <Box id={id} className="ec-acc-body">{children}</Box>}
    </Box>
  )
}
