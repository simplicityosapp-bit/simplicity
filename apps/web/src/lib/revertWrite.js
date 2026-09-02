import i18n from '@simplicity/core/i18n'
import { showToast } from './toast'

/* An optimistic write that the server refused.
   ────────────────────────────────────────────────────────────────
   Every list in this app writes optimistically: the row disappears, or renames,
   or changes status, the instant you click. When the server then rejects it,
   invalidating the query pulls the truth back — and the row reappears.

   That rollback used to happen in silence. From the user's side a delete simply
   undid itself a second later, with no message and no reason. It is one of the
   fastest ways to lose someone's trust in an app, because the obvious readings
   are all wrong: that they mis-clicked, that the app is broken, or that their
   data is unstable. And it left no trace anywhere, so it could not be
   diagnosed from a bug report either.

   So the rollback now says so. Deliberately one shared sentence rather than a
   per-action message: the useful information is "that did not save, what you
   see now is what the server has", and forty-four bespoke variants of it would
   be forty-four chances to drift.

   `options` is passed to invalidateQueries untouched, so the caller keeps full
   control of what gets refetched. */
export function revertWrite(qc, options) {
  qc.invalidateQueries(options)
  showToast(i18n.t('components:writeFailed'), 'error')
}
