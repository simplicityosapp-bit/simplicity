import { useCallback } from 'react'
import { Alert } from 'react-native'
import i18n from './i18n'

/* ════════════════════════════════════════════════════════════════
   DISCARD GUARD — "leave without saving?" for a form sheet.
   ════════════════════════════════════════════════════════════════
   Port of apps/web/src/modals/useDiscardGuard.jsx. The backdrop, the X,
   the cancel button and Android's back button all reach a Sheet's single
   onClose, so a form that hands it a raw close throws a filled-in draft
   away on one stray tap, silently. Web guards every add/edit form this
   way; on the phone only the client edit form did.

   Usage:
     const requestClose = useDiscardGuard(isDirty(form, blank(seed)), close)
     <Sheet onClose={requestClose}> … <Pressable onPress={requestClose}>

   `dirty` is the form's own comparison against the state it opened with —
   only the form knows which fields a caller seeded. When it is false the
   close is immediate, so a form opened by mistake still shuts on one tap.
   Saving calls close directly and never asks.
   ════════════════════════════════════════════════════════════════ */

export function confirmDiscard(onDiscard) {
  Alert.alert(
    i18n.t('modalsSystem:discard.title'),
    i18n.t('modalsSystem:discard.message'),
    [
      { text: i18n.t('modalsSystem:discard.cancel'), style: 'cancel' },
      { text: i18n.t('modalsSystem:discard.confirm'), style: 'destructive', onPress: onDiscard },
    ],
  )
}

export function useDiscardGuard(dirty, close) {
  return useCallback(() => {
    if (dirty) confirmDiscard(close)
    else close()
  }, [dirty, close])
}

/* Shallow "has the user touched this?" — web's isDirty. Values are
   stringified so '' / null / undefined all read as empty. Pass `skip` for
   fields the form seeds itself. */
export function isDirty(form, pristine, skip = []) {
  return Object.keys(pristine).some((k) => (
    !skip.includes(k) && String(form[k] ?? '') !== String(pristine[k] ?? '')
  ))
}
