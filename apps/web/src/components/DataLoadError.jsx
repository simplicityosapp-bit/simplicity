import { AlertCircle } from 'lucide-react'
import { useDataLoadError } from '../hooks/useDataLoadError'
import { useT } from '../i18n/useT'
import './DataLoadError.css'
import { Box, Txt, Btn } from './ui'

/* Shown when something on the screen failed to load.
   ────────────────────────────────────────────────────────────────
   Without it a failed fetch is indistinguishable from having no data: home
   renders its empty states, the calendar draws an empty week, and the project
   shows no clients — all of which read as "this is what you have", not as
   "we could not reach the server". That is the worst possible reading, because
   it looks like the user's own records are gone.

   Deliberately a strip above the content rather than a replacement for it:
   when four widgets loaded and one did not, the four that worked are still
   worth showing. Blanking a whole screen over one failed query would lose more
   than it explains.

   Renders nothing when everything is fine, so it is safe to mount anywhere. */
export default function DataLoadError() {
  const { t } = useT('common')
  const { failed, retry } = useDataLoadError()
  if (!failed) return null

  return (
    <Box className="data-load-error" role="alert">
      <AlertCircle size={16} strokeWidth={1.8} aria-hidden="true" />
      <Txt className="data-load-error-text">{t('dataLoadError')}</Txt>
      <Btn type="button" className="data-load-error-retry" onClick={retry}>
        {t('tryAgain')}
      </Btn>
    </Box>
  )
}
