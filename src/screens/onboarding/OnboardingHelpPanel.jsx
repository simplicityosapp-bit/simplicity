import { useEffect } from 'react'
import { X } from 'lucide-react'
import { useT } from '../../i18n/useT'

/* Slide-up panel pinned to the bottom of the step card. Holds the
   step-specific "what is this and how do we use it" explanation —
   intentionally chatty, not a tooltip. Closes on backdrop click or
   Escape. Per-step body content lives in helpContent.js so we can
   iterate copy without touching layout. */
export default function OnboardingHelpPanel({ open, onClose, content }) {
  const { t } = useT('onboarding')
  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open || !content) return null
  return (
    <>
      <div className="ob-help-back" onClick={onClose} aria-hidden="true" />
      <aside className="ob-help-panel" role="dialog" aria-modal="true" aria-label={content.title}>
        <header className="ob-help-head">
          <p className="ob-help-title">{content.title}</p>
          <button
            type="button"
            className="ob-help-close"
            onClick={onClose}
            aria-label={t('help.closeAria')}
          >
            <X size={15} strokeWidth={1.7} aria-hidden="true" />
          </button>
        </header>
        <div className="ob-help-body">
          {content.paragraphs.map((p, i) => (
            <p key={i} className="ob-help-p">{p}</p>
          ))}
          {content.bullets && (
            <ul className="ob-help-list">
              {content.bullets.map((b, i) => (
                <li key={i}>{b}</li>
              ))}
            </ul>
          )}
        </div>
      </aside>
    </>
  )
}
