/* ════════════════════════════════════════════════════════════════
   CRYPTO CONTEXT — derives the per-user field-encryption key on login
   and exposes bound encrypt/decrypt helpers. The key lives ONLY here in
   memory; it is re-derived on every login and dropped on logout.

   isReady is false until the key is derived — callers must not write
   plaintext while !isReady. `error` is set if the key can't be derived
   (no secure context / Web Crypto failure); CryptoGate surfaces it with a
   retry instead of an infinite splash. See docs/ENCRYPTION_PLAN.md.
   ════════════════════════════════════════════════════════════════ */
import { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react'
import { deriveKey, encryptField as encWithKey, decryptField as decWithKey } from '../lib/crypto'
import { setActiveKey, clearActiveKey } from '../lib/fieldCrypto'
import { useAuth } from '../auth/AuthContext'

const CryptoContext = createContext(null)

export function CryptoProvider({ children }) {
  const { user } = useAuth()
  const [key, setKey] = useState(null)
  const [isReady, setIsReady] = useState(false)
  const [error, setError] = useState(null) // 'secure-context' | 'derive-failed' | null
  const [attempt, setAttempt] = useState(0)

  const retry = useCallback(() => { setError(null); setAttempt((a) => a + 1) }, [])

  useEffect(() => {
    let cancelled = false
    /* eslint-disable react-hooks/set-state-in-effect -- clear stale key state synchronously when the user changes, before re-deriving. */
    setKey(null)
    setIsReady(false)
    setError(null)
    /* eslint-enable react-hooks/set-state-in-effect */
    clearActiveKey()
    const uid = user?.id
    if (!uid) return undefined
    // Web Crypto only exists in a secure context (https / localhost). Without
    // it we can't encrypt at all — surface a clear error rather than hang.
    if (!globalThis.crypto?.subtle) {
      setError('secure-context')
      return undefined
    }
    deriveKey(uid)
      .then((k) => { if (!cancelled) { setActiveKey(k); setKey(k); setIsReady(true) } })
      .catch((e) => {
        if (cancelled) return
        console.error('[crypto] key derivation failed', e)
        setKey(null); setIsReady(false); setError('derive-failed')
      })
    return () => { cancelled = true; clearActiveKey() }
  }, [user?.id, attempt])

  const encryptField = useCallback((value) => encWithKey(value, key), [key])
  const decryptField = useCallback((value) => decWithKey(value, key), [key])

  const value = useMemo(
    () => ({ encryptField, decryptField, isReady, error, retry }),
    [encryptField, decryptField, isReady, error, retry],
  )
  return <CryptoContext.Provider value={value}>{children}</CryptoContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components -- the provider and its hook intentionally share a file; splitting would ripple imports for a dev-only HMR nicety.
export function useCrypto() {
  const ctx = useContext(CryptoContext)
  if (!ctx) throw new Error('useCrypto must be used within a CryptoProvider')
  return ctx
}
