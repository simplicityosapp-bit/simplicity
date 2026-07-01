import { useEffect } from 'react'
import { RotateCcw, X, Check } from 'lucide-react'
import { useUndo } from '../hooks/useUndo'
import { performUndo, performRedo, dismiss } from '../lib/undo'
import { useT } from '../i18n/useT'
import './UndoToast.css'
import { Box, Txt, Btn } from './ui'

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
  const { t } = useT('components')
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
    <Box className="undo-toast-wrap" role="status" aria-live="polite">
      <Box className={`undo-toast undo-toast--${phase}`}>
        {phase === 'offer' ? (
          <>
            <Txt className="undo-toast-label">{label}</Txt>
            <Btn type="button" className="undo-toast-action" onClick={performUndo}>
              <RotateCcw size={15} strokeWidth={1.8} aria-hidden="true" />
              <Txt>{t('undo.undo')}</Txt>
            </Btn>
            <Btn type="button" className="undo-toast-x" onClick={dismiss} aria-label={t('undo.dismiss')}>
              <X size={15} strokeWidth={1.8} aria-hidden="true" />
            </Btn>
            <Txt key={seq} className="undo-toast-bar" style={{ animationDuration: `${duration}ms` }} aria-hidden="true" />
          </>
        ) : (
          <Txt className="undo-toast-label undo-toast-label--done">
            <Check size={15} strokeWidth={2} aria-hidden="true" />
            {label}
          </Txt>
        )}
      </Box>
    </Box>
  )
}
