import { useSyncExternalStore } from 'react'
import { subscribe, getSnapshot } from '../lib/undo'

/* Subscribes a component to the global undo store. Returns the current
   render snapshot ({ phase, label, duration, seq }). Used by the
   <UndoToast>; the store mutation API (pushUndo/performUndo/…) lives in
   lib/undo.js and is callable from anywhere without this hook. */
export function useUndo() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
