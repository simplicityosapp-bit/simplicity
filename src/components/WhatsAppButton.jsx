import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { MessageCircle, Send } from 'lucide-react'
import { useT } from '../i18n/useT'
import { waLink } from '../lib/whatsapp'
import './WhatsAppButton.css'
import { Box, Txt, Btn, Input, Textarea } from './ui'

/* ════════════════════════════════════════════════════════════════
   WhatsAppButton — a manual "send via WhatsApp" control.
   ════════════════════════════════════════════════════════════════
   Click opens a small composer (recipient + a prefilled, fully
   editable message), then launches a wa.me click-to-chat link. No
   API, no credentials, nothing to connect: the coach presses send
   inside WhatsApp. Leaving the recipient empty opens WhatsApp's own
   contact picker (see lib/whatsapp.js).

   The composer is rendered through a PORTAL to <body> (fixed,
   anchored to the trigger) so the glass cards' backdrop-filter
   stacking contexts can't paint it underneath siblings — same reason
   as InfoPopover.

   Props:
     - phone:     recipient's raw phone (string|null) — prefills the field
     - message:   default prefilled, fully-editable message text
     - label:     optional aria/title override
     - showLabel: render the text label beside the icon (default: icon only)
     - triggerClassName: override the trigger button's class entirely, so the
                  button can match its host context (e.g. a drawer action row).
                  Defaults to the component's own round-icon style.
   ════════════════════════════════════════════════════════════════ */

const EST_POP_H = 248 // rough composer height, used only to decide up/down flip

export default function WhatsAppButton({
  phone = '',
  message = '',
  label,
  showLabel = false,
  triggerClassName = '',
}) {
  const { t } = useT('components')
  const [open, setOpen] = useState(false)
  const [coords, setCoords] = useState(null)
  const [recipient, setRecipient] = useState('')
  const [text, setText] = useState('')
  const btnRef = useRef(null)
  const bodyRef = useRef(null)
  const textRef = useRef(null)

  const title = label || t('whatsapp.title')

  /* Seed the editable fields from props each time the composer opens, so
     re-opening starts fresh from the current default and discards any
     abandoned edit. */
  const openComposer = () => {
    setRecipient(phone || '')
    setText(message || '')
    setOpen(true)
  }
  const toggle = (e) => {
    e.stopPropagation()
    if (open) setOpen(false)
    else openComposer()
  }

  /* Anchor the fixed body to the trigger, opening TOWARD the screen centre
     so it never spills off an edge (the trigger often sits near a side —
     a drawer action row, a list-row corner). Horizontally clamped to the
     viewport; vertically opens below, flipping above when there's no room
     (the composer is taller than a tooltip). */
  useLayoutEffect(() => {
    if (!open) return undefined
    const place = () => {
      const r = btnRef.current?.getBoundingClientRect()
      if (!r) return
      const margin = 8
      const width = Math.min(288, window.innerWidth - margin * 2)
      const centre = (r.left + r.right) / 2
      // Right-half anchor → align the popover's right edge to the trigger
      // (opens leftward); left-half anchor → align left edges (opens right).
      let left = centre > window.innerWidth / 2 ? r.right - width : r.left
      left = Math.max(margin, Math.min(left, window.innerWidth - width - margin))
      const below = r.bottom + 6
      const flipUp = below + EST_POP_H > window.innerHeight - margin && r.top > EST_POP_H
      setCoords(flipUp
        ? { left, width, bottom: window.innerHeight - r.top + 6 }
        : { left, width, top: below })
    }
    place()
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    return () => {
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
    }
  }, [open])

  /* Click-outside + Escape close. The body is in a portal (outside
     wrapRef), so check both refs. */
  useEffect(() => {
    if (!open) return undefined
    const onClick = (e) => {
      if (btnRef.current?.contains(e.target)) return
      if (bodyRef.current?.contains(e.target)) return
      setOpen(false)
    }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  /* Focus the message on open, caret at end (ready to tweak before send). */
  useEffect(() => {
    if (!open || !textRef.current) return
    const el = textRef.current
    el.focus()
    el.setSelectionRange(el.value.length, el.value.length)
  }, [open])

  const send = () => {
    window.open(waLink(recipient, text), '_blank', 'noopener,noreferrer')
    setOpen(false)
  }

  return (
    <>
      <Btn
        ref={btnRef}
        type="button"
        className={triggerClassName || `wab-trigger${showLabel ? ' has-label' : ''}`}
        aria-label={title}
        aria-expanded={open}
        title={title}
        onClick={toggle}
      >
        <MessageCircle size={16} strokeWidth={1.7} aria-hidden="true" />
        {showLabel && <Txt>{label || t('whatsapp.send')}</Txt>}
      </Btn>
      {open && coords && createPortal(
        <Box
          ref={bodyRef}
          className="wab-pop"
          role="dialog"
          aria-label={title}
          dir="rtl"
          style={{ position: 'fixed', top: coords.top, bottom: coords.bottom, left: coords.left, width: coords.width }}
          onClick={(e) => e.stopPropagation()}
        >
          <Box className="wab-pop-title">{title}</Box>
          <Box as="label" className="wab-field">
            <Txt className="wab-label">{t('whatsapp.recipient')}</Txt>
            <Input
              className="wab-input"
              type="tel"
              inputMode="tel"
              dir="ltr"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              placeholder={t('whatsapp.recipientPlaceholder')}
            />
          </Box>
          <Box as="label" className="wab-field">
            <Txt className="wab-label">{t('whatsapp.message')}</Txt>
            <Textarea
              ref={textRef}
              className="wab-textarea"
              rows={4}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </Box>
          <Btn type="button" className="wab-send" onClick={send}>
            <Send size={15} strokeWidth={1.8} aria-hidden="true" />
            {t('whatsapp.send')}
          </Btn>
        </Box>,
        document.body,
      )}
    </>
  )
}
