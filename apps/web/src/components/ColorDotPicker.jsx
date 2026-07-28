import { useEffect, useRef, useState } from 'react'
import { CATEGORY_COLORS } from '../lib/api/categories'
import { useT } from '../i18n/useT'
import './ColorDotPicker.css'
import { Box, Btn } from './ui'

/* ════════════════════════════════════════════════════════════════
   ColorDotPicker — the coloured dot IS the control.
   ════════════════════════════════════════════════════════════════
   Lead sources and lead stages both carry a colour, and until now it could
   only be chosen at the moment of creation: the palette lived in the add
   row and nowhere else. `updateLeadSource` had existed in the API since the
   table did, with no caller — so a colour picked in haste was permanent,
   and fixing one meant deleting the source (moving every lead on it) and
   building it again.

   The dot each row already showed is now the button that changes it. No new
   affordance to learn, and nothing added to a row that is already grip +
   dot + name + delete.

   `data-no-drag` on the popover: these rows are draggable, and the drag hook
   ignores presses on buttons but not on the panel around them.
   ════════════════════════════════════════════════════════════════ */
export default function ColorDotPicker({ value, onPick, label }) {
  const { t } = useT('leads')
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)

  /* Close on Escape, or on a press anywhere else. Pointerdown rather than
     click so it closes on the press that starts a drag elsewhere, not after. */
  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false) } }
    const onDown = (e) => { if (!wrapRef.current?.contains(e.target)) setOpen(false) }
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onDown)
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('pointerdown', onDown) }
  }, [open])

  return (
    <Box ref={wrapRef} className="cdp" data-no-drag>
      <Btn
        type="button"
        className="cdp-dot"
        style={{ background: value || 'var(--stone)' }}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={label}
        title={label}
      />
      {open && (
        <Box className="cdp-pop" role="radiogroup" aria-label={label} data-no-drag>
          {CATEGORY_COLORS.map((c, i) => (
            <Btn
              key={c}
              type="button"
              role="radio"
              aria-checked={value === c}
              /* Position, not the hex — a screen reader announcing
                 "#C97B5E" tells nobody anything. */
              aria-label={t('color.option', { index: i + 1, total: CATEGORY_COLORS.length })}
              className={`cdp-swatch${value === c ? ' on' : ''}`}
              style={{ background: c }}
              onClick={() => { onPick(c); setOpen(false) }}
            />
          ))}
        </Box>
      )}
    </Box>
  )
}
