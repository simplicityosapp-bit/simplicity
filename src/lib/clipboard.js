/* ════════════════════════════════════════════════════════════════
   CLIPBOARD — copy text with a graceful fallback.
   ════════════════════════════════════════════════════════════════
   navigator.clipboard is unavailable in non-secure contexts and is
   blocked in some mobile webviews; without a fallback the copy fails
   silently and the user gets no "copied" confirmation. We try the modern
   API first, then fall back to a hidden <textarea> + execCommand, and
   finally report failure so the caller can surface a manual-copy hint. */
export async function copyText(text) {
  const value = String(text ?? '')
  if (!value) return false
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value)
      return true
    }
  } catch { /* fall through to the legacy path */ }

  try {
    const ta = document.createElement('textarea')
    ta.value = value
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch { return false }
}
