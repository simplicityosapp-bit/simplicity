import { useEffect } from 'react'
import { X } from 'lucide-react'
import { useT } from '../../i18n/useT'
import { Box, Txt, Btn } from '../../components/ui'

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
      <Box className="ob-help-back" onClick={onClose} aria-hidden="true" />
      <Box as="aside" className="ob-help-panel" role="dialog" aria-modal="true" aria-label={content.title}>
        <Box as="header" className="ob-help-head">
          <Txt as="p" className="ob-help-title">{content.title}</Txt>
          <Btn
            type="button"
            className="ob-help-close"
            onClick={onClose}
            aria-label={t('help.closeAria')}
          >
            <X size={15} strokeWidth={1.7} aria-hidden="true" />
          </Btn>
        </Box>
        <Box className="ob-help-body">
          {content.paragraphs.map((p, i) => (
            <Txt as="p" key={i} className="ob-help-p">{p}</Txt>
          ))}
          {content.bullets && (
            <Box as="ul" className="ob-help-list">
              {content.bullets.map((b, i) => (
                <Box as="li" key={i}>{b}</Box>
              ))}
            </Box>
          )}
        </Box>
      </Box>
    </>
  )
}
