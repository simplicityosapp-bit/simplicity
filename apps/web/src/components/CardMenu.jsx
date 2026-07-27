import { useEffect, useRef, useState } from 'react'
import { MoreHorizontal } from 'lucide-react'
import './CardMenu.css'
import { Box, Btn } from './ui'

/* ════════════════════════════════════════════════════════════════
   CardMenu — the "…" overflow on a card.
   ════════════════════════════════════════════════════════════════
   For actions that belong to a card but shouldn't each occupy a corner
   of it. Follows the pattern the site-page editor already uses for its
   top-bar overflow (aria-haspopup + role="menu"/"menuitem", dismiss on
   outside click and Escape), lifted into a component because a card is
   where it earns its keep.

   Two things it must not do, both of which cost real behaviour on a
   draggable card:
     · trigger the card's own onClick (which opens the editor)
     · start a drag when the user is only reaching for the menu
   The first is handled by stopping propagation on every interaction; the
   second comes free, because usePointerDnd already ignores presses that
   land on a <button>.

   items: [{ key, label, icon?, danger?, onSelect }]
   ════════════════════════════════════════════════════════════════ */
export default function CardMenu({ items = [], label, align = 'end' }) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)
  const btnRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    const onDoc = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false) }
    const onKey = (e) => {
      if (e.key !== 'Escape') return
      /* Only this menu closes — the card may sit inside a modal or a drawer
         whose own Escape handler would otherwise fire at the same time. */
      e.stopPropagation()
      setOpen(false)
      btnRef.current?.focus()
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey, true)
    }
  }, [open])

  if (!items.length) return null

  /* Every handler stops propagation: without it the press bubbles to the
     card and opens the editor behind the menu. */
  const stop = (e) => { e.stopPropagation() }

  return (
    <Box className="card-menu" ref={wrapRef} onClick={stop} onKeyDown={stop}>
      <Btn
        ref={btnRef}
        type="button"
        className="card-menu-btn"
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v) }}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        title={label}
      >
        <MoreHorizontal size={15} strokeWidth={2} aria-hidden="true" />
      </Btn>
      {open && (
        <Box className={`card-menu-list align-${align}`} role="menu">
          {items.map((it) => (
            <Btn
              key={it.key}
              type="button"
              role="menuitem"
              className={it.danger ? 'danger' : undefined}
              onClick={(e) => { e.stopPropagation(); setOpen(false); it.onSelect() }}
            >
              {it.icon}
              {it.label}
            </Btn>
          ))}
        </Box>
      )}
    </Box>
  )
}
