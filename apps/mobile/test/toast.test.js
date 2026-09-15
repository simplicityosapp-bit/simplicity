/* ════════════════════════════════════════════════════════════════
   THE TOAST CHANNEL — web's contract, on the phone.
   ════════════════════════════════════════════════════════════════
   lib/toast is a port of apps/web/src/lib/toast.js. What a later edit
   could quietly break: a new toast not replacing the old one's timer
   (so the second message vanishes on the first one's schedule), errors
   losing their extra time on screen, and an empty message painting an
   empty bar.
   ════════════════════════════════════════════════════════════════ */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { showToast, showError, clearToast, getSnapshot, subscribe, TOAST_DURATION } from '../src/lib/toast'

beforeEach(() => { vi.useFakeTimers(); clearToast() })
afterEach(() => { vi.useRealTimers() })

describe('toast', () => {
  it('shows a message and clears it after the duration', () => {
    showToast('נשמר')
    expect(getSnapshot()).toMatchObject({ message: 'נשמר', type: 'success' })
    vi.advanceTimersByTime(TOAST_DURATION)
    expect(getSnapshot().message).toBe('')
  })

  it('a second toast restarts the clock instead of inheriting the first one', () => {
    showToast('ראשון')
    vi.advanceTimersByTime(TOAST_DURATION - 100)
    showToast('שני')
    vi.advanceTimersByTime(200)
    expect(getSnapshot().message).toBe('שני')
  })

  it('keeps an error on screen longer than a success', () => {
    showError('נכשל')
    vi.advanceTimersByTime(TOAST_DURATION)
    expect(getSnapshot()).toMatchObject({ message: 'נכשל', type: 'error' })
    vi.advanceTimersByTime(1400)
    expect(getSnapshot().message).toBe('')
  })

  it('ignores an empty message and notifies subscribers of real ones', () => {
    const fn = vi.fn()
    const off = subscribe(fn)
    showToast('')
    expect(fn).not.toHaveBeenCalled()
    showToast('x')
    expect(fn).toHaveBeenCalledTimes(1)
    off()
  })
})
