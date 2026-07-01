import { useEffect, useRef, useState } from 'react'
import { Check } from 'lucide-react'
import { useT } from '../../i18n/useT'
import { Txt, Btn, Input } from '../../components/ui'

/* Inline-editable title for a task / reminder card. The title renders as
   plain text; a double-click (desktop) or long-press (mobile) swaps it for
   an input — a lightweight rename without opening the full edit modal.

   Save: Enter or blur (focus leaving the field, incl. the ✓ button).
   Cancel: Escape, or an empty/unchanged value.

   `onRename(nextTitle)` is invoked only when the trimmed value actually
   changed; the parent owns the optimistic update (editTask/editReminder).
   `children` lets the caller append trailing content (e.g. the ×N badge)
   that shows in display mode but not while editing. */
const LONG_PRESS_MS = 450
/* Finger drift past this many px = a scroll, not a long-press → abort. */
const MOVE_TOLERANCE = 10

export default function InlineTitle({ title, onRename, className = '', children }) {
  const { t } = useT('tasks')
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(title)
  const inputRef = useRef(null)
  /* Long-press bookkeeping: a pending timer + the pointer's start point so a
     scroll can cancel it. Guards against the long-press ALSO firing a click. */
  const timer = useRef(null)
  const startPt = useRef(null)
  const savedRef = useRef(false)

  const begin = () => {
    if (!onRename) return
    setDraft(title)
    savedRef.current = false
    setEditing(true)
  }

  /* Focus + select-all once the input mounts so typing replaces the title. */
  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editing])

  const clearTimer = () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null }
  }

  const commit = () => {
    if (savedRef.current) return
    savedRef.current = true
    const next = draft.trim()
    setEditing(false)
    if (next && next !== title) onRename(next)
  }

  const cancel = () => {
    savedRef.current = true /* block the trailing blur from re-committing */
    setEditing(false)
    setDraft(title)
  }

  const onKeyDown = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); commit() }
    else if (e.key === 'Escape') { e.preventDefault(); cancel() }
  }

  /* ── Long-press (touch/pen): start a timer on down, cancel on move/up. ── */
  const onPointerDown = (e) => {
    if (editing || !onRename || e.pointerType === 'mouse') return
    startPt.current = { x: e.clientX, y: e.clientY }
    clearTimer()
    timer.current = setTimeout(() => { timer.current = null; begin() }, LONG_PRESS_MS)
  }
  const onPointerMove = (e) => {
    if (!timer.current || !startPt.current) return
    const dx = Math.abs(e.clientX - startPt.current.x)
    const dy = Math.abs(e.clientY - startPt.current.y)
    if (dx > MOVE_TOLERANCE || dy > MOVE_TOLERANCE) clearTimer()
  }
  const onPointerEnd = () => clearTimer()

  if (editing) {
    return (
      <Txt className="tc-rename">
        <Input
          ref={inputRef}
          type="text"
          className="tc-rename-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={commit}
          aria-label={t('item.renameAria')}
          dir="auto"
          enterKeyHint="done"
        />
        {/* onMouseDown-preventDefault keeps the input focused so the click
            registers as a save, not a blur-then-click. */}
        <Btn
          type="button"
          className="tc-rename-save"
          onMouseDown={(e) => e.preventDefault()}
          onClick={commit}
          aria-label={t('item.renameSave')}
          title={t('item.renameHint')}
        >
          <Check size={14} strokeWidth={2.5} aria-hidden="true" />
        </Btn>
      </Txt>
    )
  }

  return (
    <Txt as="p"
      className={className}
      onDoubleClick={begin}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      title={onRename ? t('item.renameHint') : undefined}
    >
      {title}
      {children}
    </Txt>
  )
}
