import { useCallback, useEffect, useState } from 'react'
import ConfirmModal from './ConfirmModal'
import { useT } from '../i18n/useT'

/* ════════════════════════════════════════════════════════════════
   useDiscardGuard — "leave without saving?" for a form modal.
   ════════════════════════════════════════════════════════════════
   Escape, the overlay and the X all route through Modal's single
   onClose, so a form that hands Modal its raw close() throws away a
   filled-in draft on one stray tap, silently. AddLeadModal and
   AddTransactionModal each grew their own copy of the guard; this is
   that pattern, once, so the modals that did NOT grow one can take it
   in two lines and the two that did can stop maintaining it.

   Usage:
     const guard = useDiscardGuard(formDirty, close)
     <Modal onClose={guard.requestClose} …>
       …
       <Btn onClick={guard.requestClose}>cancel</Btn>
       {guard.confirm}
     </Modal>

   `dirty` is the caller's own comparison against the state the form
   opened with — only the form knows which of its fields were seeded by
   a caller (a locked client, a tapped calendar day) and therefore are
   not the user's work. When it is false the close is immediate, so
   opening a form by mistake still shuts on one tap.

   Nest it or make it a sibling of the form's sheet — either works, and
   the callers do both. Modals stack by OPEN order, not DOM order: each
   one claims a layer from lib/modalLock on open and Modal writes it out
   as an explicit z-index, so a confirm raised from inside a form always
   paints above it. (Older comments in these files still say a nested
   confirm lands underneath. That was true before the layer registry.)
   ════════════════════════════════════════════════════════════════ */
export function useDiscardGuard(dirty, close) {
  const { t } = useT('modalsSystem')
  const [asking, setAsking] = useState(false)

  const requestClose = useCallback(() => {
    if (dirty) setAsking(true)
    else close()
  }, [dirty, close])

  const confirm = (
    <ConfirmModal
      open={asking}
      onClose={() => setAsking(false)}
      title={t('discard.title')}
      message={t('discard.message')}
      confirmLabel={t('discard.confirm')}
      cancelLabel={t('discard.cancel')}
      danger
      onConfirm={() => { setAsking(false); close() }}
    />
  )

  return { requestClose, confirm, asking }
}

/* ════════════════════════════════════════════════════════════════
   useScrollToError — put the rejected field back on screen.
   ════════════════════════════════════════════════════════════════
   Every add form prints its error in one place, just above the sticky
   footer, and marks the offending input with .err. On a form long
   enough to scroll — a client with "more" open, a transaction with the
   receipt block — the two are nowhere near each other: the message
   appears under your thumb while the field it is about is off the top
   of the sheet. Nothing tells you where to look.

   Scrolls the marked field into view when the error appears, and falls
   back to the message itself when no field carries the mark (a save
   that failed on the server, which belongs to no one field).
   Queried off the live sheet rather than through refs so a form adds
   this in one line without threading a ref to every input.
   ════════════════════════════════════════════════════════════════ */
export function useScrollToError(err) {
  useEffect(() => {
    if (!err) return undefined
    /* After the error has rendered — it is the same commit that sets it. */
    const id = setTimeout(() => {
      const sheet = document.querySelector('.m-sheet.open')
      const target = sheet?.querySelector('.err') || sheet?.querySelector('.m-error')
      target?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }, 0)
    return () => clearTimeout(id)
  }, [err])
}

/* Shallow "has the user touched this?" for the common case: a flat form
   object compared field-by-field against the blank it opened with.
   Values are stringified so '' / null / undefined all read as empty and
   a number typed into a text field doesn't register as a change on its
   own. Pass `skip` for fields the form seeds itself (a date stamped with
   today, an id bound by the caller). */
export function isDirty(form, pristine, skip = []) {
  return Object.keys(pristine).some((k) => (
    !skip.includes(k) && String(form[k] ?? '') !== String(pristine[k] ?? '')
  ))
}

/* ════════════════════════════════════════════════════════════════
   useFormDraft — a half-filled form survives the page going away.
   ════════════════════════════════════════════════════════════════
   Narrow on purpose. useDiscardGuard already covers the case this
   started as (a stray tap on the backdrop): the form asks, and "keep
   editing" leaves the text where it was. What is left uncovered is the
   page itself disappearing — a refresh, a crash, a back-navigation —
   and that is all this restores.

   So a draft is written continuously while the user types, and CLEARED
   on both deliberate exits: a successful save, and choosing "leave
   without saving" (which would otherwise be a lie — reopening would
   hand the discarded text straight back).

   sessionStorage, not local: a draft belongs to the sitting in front of
   the screen right now. Close the tab and it is gone, which is the
   behaviour someone returning tomorrow expects.

   NEW RECORDS ONLY. Pass enabled:false for an edit — restoring a stale
   edit over whatever the server holds now is worse than losing it.

   `seed` is whatever the CALLER pre-filled: a locked client, a tapped
   calendar day, a bound project. It goes into the key, so a form opened
   from a different place never restores the other place's draft — the
   half-typed payment for one client must not reappear under another.
   ════════════════════════════════════════════════════════════════ */
const seedKey = (seed) => {
  if (!seed || typeof seed !== 'object') return String(seed ?? '')
  return Object.keys(seed).sort().map((k) => `${k}=${seed[k] ?? ''}`).join('&')
}

export function useFormDraft({ name, form, setForm, blank, enabled, seed }) {
  const key = `mg-draft:${name}:${seedKey(seed)}`

  /* Restore when the form opens (enabled flips true), never mid-edit. */
  useEffect(() => {
    if (!enabled) return
    try {
      const raw = window.sessionStorage.getItem(key)
      if (!raw) return
      const saved = JSON.parse(raw)
      if (saved && typeof saved === 'object') setForm((f) => ({ ...f, ...saved }))
    } catch { /* unreadable or unparseable — open blank, which is the safe end */ }
    /* setForm is the caller's stable setState; re-running on it would
       restore over the user's typing. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, key])

  /* Write on every change. A form back at its blank state holds nothing
     worth restoring, so it drops the draft instead of storing an empty one. */
  useEffect(() => {
    if (!enabled) return
    try {
      if (isDirty(form, blank)) window.sessionStorage.setItem(key, JSON.stringify(form))
      else window.sessionStorage.removeItem(key)
    } catch { /* private mode / quota — the form still works, it just won't survive */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, form, key])

  const clear = useCallback(() => {
    try { window.sessionStorage.removeItem(key) } catch { /* nothing to do */ }
  }, [key])

  return { clear }
}
