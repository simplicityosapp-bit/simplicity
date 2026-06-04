import { useEffect } from 'react'
import { RotateCcw, X, Check } from 'lucide-react'
import { useUndo } from '../hooks/useUndo'
import { performUndo, performRedo, dismiss } from '../lib/undo'
import './UndoToast.css'

/* ════════════════════════════════════════════════════════════════
   <UndoToast> — the visible half of the undo system.
   ════════════════════════════════════════════════════════════════
   Always mounted at the app shell so its keyboard listener lives for
   the whole session; it renders nothing while the store is idle.

   • phase 'offer'  → "<label> · בטל" with a small X to dismiss, and a
                      countdown bar that auto-expires after ~6s.
   • phase 'undone' → brief "בוטל" confirmation (Ctrl+Y still redoes
                      during this window).

   Desktop adds Ctrl/Cmd+Z (undo) and Ctrl/Cmd+Y or Ctrl/Cmd+Shift+Z
   (redo); typing inside an input/textarea/contenteditable is left to
   the browser's native field-level undo. Mobile drives it via the X /
   "בטל" tap targets — no keyboard needed.
   ════════════════════════════════════════════════════════════════ */
export default function UndoToast() {
  const { phase, label, duration, seq } = useUndo()

  useEffect(() => {
    const onKey = (e) => {
      if (!(e.ctrlKey || e.metaKey)) return
      const t = e.target
      const tag = t?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t?.isContentEditable) return
      const key = e.key?.toLowerCase()
      if (key === 'z' && !e.shiftKey) { e.preventDefault(); performUndo() }
      else if (key === 'y' || (key === 'z' && e.shiftKey)) { e.preventDefault(); performRedo() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (phase === 'idle') return null

  return (
    <div className="undo-toast-wrap" role="status" aria-live="polite">
      <div className={`undo-toast undo-toast--${phase}`}>
        {phase === 'offer' ? (
          <>
            <span className="undo-toast-label">{label}</span>
            <button type="button" className="undo-toast-action" onClick={performUndo}>
              <RotateCcw size={15} strokeWidth={1.8} aria-hidden="true" />
              <span>בטל</span>
            </button>
            <button type="button" className="undo-toast-x" onClick={dismiss} aria-label="סגירה">
              <X size={15} strokeWidth={1.8} aria-hidden="true" />
            </button>
            <span key={seq} className="undo-toast-bar" style={{ animationDuration: `${duration}ms` }} aria-hidden="true" />
          </>
        ) : (
          <span className="undo-toast-label undo-toast-label--done">
            <Check size={15} strokeWidth={2} aria-hidden="true" />
            {label}
          </span>
        )}
      </div>
    </div>
  )
}
