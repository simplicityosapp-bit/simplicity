import { useCallback, useEffect, useState } from 'react'
import { callMcpTokens } from '../lib/api/integrations'
import { CLAUDE_CONSENT_VERSION } from '../lib/claudeAccess'

/* Client over the mcp-tokens edge function (personal Claude access).
   status = { active, expired, categories, created_at, expires_at, last_used_at }
   — never the token or its hash. The token is returned ONLY by create(), and
   this hook does not keep it: the screen holds it in local state for the
   one-time reveal. `error` is the function's short code. */
export function useClaudeAccess() {
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    let active = true
    callMcpTokens('status')
      .then((r) => { if (active) setStatus(r.status) })
      .catch((e) => { if (active) setError(e.message) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  const run = useCallback(async (action, params) => {
    setBusy(true); setError(null)
    try {
      const r = await callMcpTokens(action, params)
      if (r?.status) setStatus(r.status)
      return r
    } catch (e) {
      setError(e.message || 'unknown')
      throw e
    } finally {
      setBusy(false)
    }
  }, [])

  // Only called after the user ticked the consent checkbox; the server rejects
  // a create without the current consent version (consent_required).
  const create = useCallback((categories) => run('create', { categories, consent_version: CLAUDE_CONSENT_VERSION }), [run])
  // withConsent: the user just ticked the consent checkbox because the new
  // selection adds categories outside their earlier consent. Without it the
  // server answers consent_required for any such category.
  const updateCategories = useCallback((categories, withConsent = false) => run('update-categories', {
    categories,
    ...(withConsent ? { consent_version: CLAUDE_CONSENT_VERSION } : {}),
  }), [run])
  const renew = useCallback(() => run('renew'), [run])
  const revoke = useCallback(() => run('revoke'), [run])
  const clearError = useCallback(() => setError(null), [])

  return { status, loading, busy, error, clearError, create, updateCategories, renew, revoke }
}
