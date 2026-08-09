import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { useT } from '../i18n/useT'
import { acquireModalLock, acquireModalLayer, isTopModalLayer } from '../lib/modalLock'
import './Modal.css'
import { Box, Txt, Btn } from '../components/ui'

const FOCUSABLE = 'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/* Centered card modal — rendered into document.body via a portal so
   it escapes any ancestor that creates a containing block for
   position:fixed (e.g. a CSS transform on a parent, or — as we hit
   in the home widgets — a `.home-stack .home-widget > *` rule that
   forced `position: relative` onto every direct child including the
   modal nodes). The portal sidesteps the cascade entirely. */
export default function Modal({ open, onClose, title, titleLabel, onSubmit, children }) {
  const { t } = useT('modalsSystem')
  const sheetRef = useRef(null)
  const overlayRef = useRef(null)
  const restoreRef = useRef(null)
  const layerRef = useRef(0)

  /* Claim a stacking layer on open, release it on close — see lib/modalLock.
     Written straight to the DOM rather than held in state: routing it through
     setState would render once at the old layer and again at the new one, and
     that first frame is exactly the one where a confirmation would flash
     underneath the form it was opened from. Layer 0 reproduces the 500/510 in
     Modal.css, so a lone modal is untouched. */
  useEffect(() => {
    if (!open) return undefined
    const { layer, release } = acquireModalLayer()
    layerRef.current = layer
    /* Captured, not read again in cleanup: cleanup must clear the z-index off
       the same two nodes it set it on, whatever the refs point at by then. */
    const overlay = overlayRef.current
    const sheet = sheetRef.current
    const z = 500 + layer * 20
    overlay?.style.setProperty('z-index', String(z))
    sheet?.style.setProperty('z-index', String(z + 10))
    return () => {
      release()
      layerRef.current = 0
      overlay?.style.removeProperty('z-index')
      sheet?.style.removeProperty('z-index')
    }
  }, [open])

  /* Escape closes. */
  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => {
      if (e.key !== 'Escape') return
      /* Only the TOP-most modal responds, so stacked modals (e.g. a picker over
         a form) don't all close on one Escape. Asks the layer registry rather
         than reading DOM order — a closed modal stays mounted, so the last
         .m-sheet.open in the DOM was never reliably the top one. */
      if (!isTopModalLayer(layerRef.current)) return
      onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  /* Enter in a text field saves. These forms have no <form> element, so the
     browser's own "Enter submits" never applied and every add form made the
     user reach for the button — on a phone, past the keyboard.
     Lives here rather than on each field so all five behave the same.
     Deliberately narrow:
       - single-line inputs only. A textarea's Enter is a newline, and a
         button's is its own activation (the lid, a pill, a picker row).
       - skips an event already handled: the inline "new source" / "new
         category" rows call preventDefault to create their row on Enter,
         and that must not also save the form around them.
       - skips mid-composition Enter, which is the IME committing a word,
         not the user asking to save. */
  useEffect(() => {
    if (!open || !onSubmit) return undefined
    const sheet = sheetRef.current
    const onKey = (e) => {
      if (e.key !== 'Enter' || e.defaultPrevented || e.isComposing) return
      if (!isTopModalLayer(layerRef.current)) return
      const el = e.target
      if (el?.tagName !== 'INPUT' || el.type === 'checkbox' || el.type === 'radio') return
      e.preventDefault()
      onSubmit()
    }
    sheet?.addEventListener('keydown', onKey)
    return () => sheet?.removeEventListener('keydown', onKey)
  }, [open, onSubmit])

  /* Lock the scrolling .screen behind the modal so the background can't
     scroll on touch. The lock is derived from the set of open modals, never
     tallied — see lib/modalLock. */
  useEffect(() => {
    if (!open) return undefined
    return acquireModalLock()
  }, [open])

  /* Focus management: move focus into the dialog on open (preferring the
     first field, else the first control), trap Tab inside it, and restore
     focus to the trigger on close. Skips stealing focus from an input that
     already has it (e.g. a React autoFocus field). */
  useEffect(() => {
    if (!open) return undefined
    const sheet = sheetRef.current
    restoreRef.current = document.activeElement
    const visibleFocusables = () =>
      sheet ? [...sheet.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null) : []
    /* setTimeout (not rAF) so it lands after the open transition begins and
       survives React StrictMode's dev double-invoke. */
    const focusTimer = setTimeout(() => {
      if (sheet && !sheet.contains(document.activeElement)) {
        const f = visibleFocusables()
        const field = f.find((el) => /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))
        ;(field || f[0] || sheet).focus()
      }
    }, 40)
    const onKey = (e) => {
      if (e.key !== 'Tab') return
      const f = visibleFocusables()
      if (!f.length) return
      const first = f[0]
      const last = f[f.length - 1]
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
    sheet?.addEventListener('keydown', onKey)
    return () => {
      clearTimeout(focusTimer)
      sheet?.removeEventListener('keydown', onKey)
      const el = restoreRef.current
      if (el && typeof el.focus === 'function') el.focus()
    }
  }, [open])

  if (typeof document === 'undefined') return null

  return createPortal(
    <>
      <Box ref={overlayRef} className={`m-overlay${open ? ' open' : ''}`} onClick={onClose} aria-hidden="true" />
      <Box ref={sheetRef} tabIndex={-1} className={`m-sheet${open ? ' open' : ''}`} role="dialog" aria-modal="true" aria-hidden={!open} aria-label={titleLabel || (typeof title === 'string' ? title : undefined)}>
        <Box className="m-head">
          <Txt as="p" className="m-title">{title}</Txt>
          <Btn type="button" className="m-close" onClick={onClose} aria-label={t('modal.close')}>
            <X size={18} strokeWidth={1.6} />
          </Btn>
        </Box>
        <Box className="m-body">{children}</Box>
      </Box>
    </>,
    document.body,
  )
}
