import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { useT } from '../i18n/useT'
import './Modal.css'

/* Ref-count so stacked modals (e.g. a ConfirmModal opened over a form modal)
   only release the background scroll-lock when the LAST one closes. */
let modalOpenCount = 0
const FOCUSABLE = 'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/* Centered card modal — rendered into document.body via a portal so
   it escapes any ancestor that creates a containing block for
   position:fixed (e.g. a CSS transform on a parent, or — as we hit
   in the home widgets — a `.home-stack .home-widget > *` rule that
   forced `position: relative` onto every direct child including the
   modal nodes). The portal sidesteps the cascade entirely. */
export default function Modal({ open, onClose, title, titleLabel, children }) {
  const { t } = useT('modalsSystem')
  const sheetRef = useRef(null)
  const restoreRef = useRef(null)

  /* Escape closes. */
  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  /* Lock the scrolling .screen behind the modal so the background can't
     scroll on touch (ref-counted for stacked modals). */
  useEffect(() => {
    if (!open) return undefined
    modalOpenCount += 1
    document.body.classList.add('modal-open')
    return () => {
      modalOpenCount = Math.max(0, modalOpenCount - 1)
      if (modalOpenCount === 0) document.body.classList.remove('modal-open')
    }
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
      <div className={`m-overlay${open ? ' open' : ''}`} onClick={onClose} aria-hidden="true" />
      <div ref={sheetRef} tabIndex={-1} className={`m-sheet${open ? ' open' : ''}`} role="dialog" aria-modal="true" aria-hidden={!open} aria-label={titleLabel || (typeof title === 'string' ? title : undefined)}>
        <div className="m-head">
          <p className="m-title">{title}</p>
          <button type="button" className="m-close" onClick={onClose} aria-label={t('modal.close')}>
            <X size={18} strokeWidth={1.6} />
          </button>
        </div>
        <div className="m-body">{children}</div>
      </div>
    </>,
    document.body,
  )
}
