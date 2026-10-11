/* ⛔ HIDDEN behind CLAUDE_ACCESS_ENABLED (lib/claudeAccessFlag.js), currently
   false: /connections/claude redirects back to /connections and nothing below
   mounts. The screen itself is complete; see that file for why it is frozen. */
import { useEffect, useRef, useState } from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import { ChevronRight, Sparkles, Check, CircleAlert, RefreshCw, SlidersHorizontal, Copy, ShieldAlert, KeyRound } from 'lucide-react'
import { useClaudeAccess } from '../../hooks/useClaudeAccess'
import { CLAUDE_ACCESS_ENABLED } from '../../lib/claudeAccessFlag'
import { ROUTES } from '../../lib/routes'
import { CLAUDE_CATEGORIES, categoriesNeedingConsent, claudeConnectCommand, claudeErrorKey, consentLines } from '../../lib/claudeAccess'
import { copyText } from '../../lib/clipboard'
import { showToast } from '../../lib/toast'
import ConfirmModal from '../../modals/ConfirmModal'
import { useT } from '../../i18n/useT'
import './ConnectionsScreen.css'
import { Box, Txt, Btn, Input } from '../../components/ui'

const fmtDate = (iso, lang) => (iso
  ? new Date(iso).toLocaleDateString(lang || 'he', { day: '2-digit', month: '2-digit', year: 'numeric' })
  : '')
const ordered = (set) => CLAUDE_CATEGORIES.map((c) => c.key).filter((k) => set.has(k))

/* Category checklist — nothing is preselected by the caller on first setup.
   Sensitive categories carry a badge; free-text ones a note. */
function CategoryPicker({ picked, onToggle, disabled, t }) {
  return (
    <Box className="conn-claude-cats" role="group" aria-label={t('claude.pickTitle')}>
      {CLAUDE_CATEGORIES.map((c) => (
        <Box as="label" key={c.key} className={`conn-claude-cat${disabled ? ' is-disabled' : ''}`}>
          <Input type="checkbox" checked={picked.has(c.key)} disabled={disabled} onChange={() => onToggle(c.key)} />
          <Txt className="conn-claude-cat-text">
            <Txt className="conn-claude-cat-name">
              {t(`claude.cats.${c.key}.name`)}
              {c.sensitive && (
                <Txt className="conn-claude-badge"><ShieldAlert size={11} strokeWidth={2} aria-hidden="true" /> {t('claude.sensitive')}</Txt>
              )}
            </Txt>
            <Txt className="conn-claude-cat-desc">{t(`claude.cats.${c.key}.desc`)}</Txt>
            {c.freeText && <Txt className="conn-claude-cat-free">{t('claude.freeText')}</Txt>}
          </Txt>
        </Box>
      ))}
    </Box>
  )
}

/* Route entry: locked → bounce back to the connections list before any hook
   (and so any call to mcp-tokens) runs. Same guard as GrowConnection. */
export default function ClaudeConnectionScreen() {
  if (!CLAUDE_ACCESS_ENABLED) return <Navigate to={ROUTES.CONNECTIONS} replace />
  return <ClaudeConnectionPanel />
}

/* Sub-screen for personal Claude access (read-only token over the claude-mcp
   connector). Flow when off: pick categories → consent → create → one-time
   reveal of the token + setup command. When on: switch, categories, last use,
   expiry, renew, edit categories; switching off revokes (ConfirmModal). */
export function ClaudeConnectionPanel() {
  const { t, lang } = useT('connections')
  const navigate = useNavigate()
  const ca = useClaudeAccess()
  const [mode, setMode] = useState('view') // view | pick | consent | reveal | edit
  const [picked, setPicked] = useState(() => new Set())
  // { token, url } — held only here, only until the user leaves the reveal step.
  const [reveal, setReveal] = useState(null)
  const [copied, setCopied] = useState(false)
  const [copyFailed, setCopyFailed] = useState(false)
  const [confirmOff, setConfirmOff] = useState(false)
  const [note, setNote] = useState('')
  // Consent checkbox — required for create, and reset to unchecked every time
  // the consent step is entered (goConsent), never carried over.
  const [agreed, setAgreed] = useState(false)

  /* Steps differ a lot in height (the 12-row checklist vs. the short consent
     step), so after a step change the card's top can be scrolled out of view.
     Bring it back — only when it actually is out of view. */
  const cardRef = useRef(null)
  const firstRender = useRef(true)
  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return }
    const el = cardRef.current
    if (el && el.getBoundingClientRect().top < 0) el.scrollIntoView({ block: 'start' })
  }, [mode])

  const status = ca.status
  const active = !!status?.active
  const expired = active && !!status?.expired

  const toggle = (key) => {
    // Any change to the selection while editing un-ticks the consent box, so
    // the consent always covers exactly the selection being saved.
    if (mode === 'edit') setAgreed(false)
    setPicked((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })
  }
  // First setup starts with nothing ticked; re-creating after expiry starts
  // from the previous token's categories (still editable).
  const startSetup = (prefill = []) => { ca.clearError(); setNote(''); setPicked(new Set(prefill)); setMode('pick') }
  const goConsent = () => { setAgreed(false); setMode('consent') }
  const startEdit = () => { ca.clearError(); setNote(''); setAgreed(false); setPicked(new Set(status?.categories ?? [])); setMode('edit') }
  // Categories in the edit selection that the user has not consented to on
  // this token → the same consent text + checkbox before saving.
  const editMissing = mode === 'edit' ? categoriesNeedingConsent(ordered(picked), status?.consented_categories) : []
  const editNeedsConsent = editMissing.length > 0
  const cancel = () => { ca.clearError(); setMode('view') }

  const onCreate = async () => {
    if (!agreed) return
    try {
      const r = await ca.create(ordered(picked))
      setReveal({ token: r.token, url: r.url })
      setCopied(false); setCopyFailed(false)
      setMode('reveal')
    } catch { /* ca.error shows the reason */ }
  }
  const onCopy = async () => {
    const ok = await copyText(claudeConnectCommand(reveal.url, reveal.token))
    setCopied(ok); setCopyFailed(!ok)
    if (ok) window.setTimeout(() => setCopied(false), 1600)
  }
  const onDoneReveal = () => { setReveal(null); setMode('view') }
  const onSaveEdit = async () => {
    if (editNeedsConsent && !agreed) return
    try {
      await ca.updateCategories(ordered(picked), editNeedsConsent && agreed)
      setMode('view')
      setNote(t('claude.categoriesSaved'))
    } catch { /* ca.error */ }
  }
  const onRenew = async () => {
    setNote('')
    try {
      const r = await ca.renew()
      setNote(t('claude.renewed', { date: fmtDate(r.status?.expires_at, lang) }))
    } catch { /* ca.error */ }
  }
  const onRevoke = async () => {
    const wasActive = active
    try {
      await ca.revoke()
      setNote('')
      // Only a real switch-off gets a confirmation; there was nothing to revoke otherwise.
      if (wasActive) showToast(t('claude.revoked'))
    } catch { /* ca.error */ }
  }

  const onSwitch = () => {
    if (active) setConfirmOff(true)
    else startSetup()
  }

  const headerSub = ca.loading
    ? t('loading')
    : !active
      ? t('claude.offHint')
      : expired
        ? <><CircleAlert size={13} strokeWidth={2} aria-hidden="true" /> {t('claude.expiredOn', { date: fmtDate(status.expires_at, lang) })}</>
        : <><Check size={13} strokeWidth={2} aria-hidden="true" /> {t('claude.activeUntil', { date: fmtDate(status.expires_at, lang) })}</>

  const inFlow = mode === 'pick' || mode === 'consent' || mode === 'reveal' || mode === 'edit'

  return (
    <Box className="screen conn-claude">
      <Box as="header" className="screen-head conn-head conn-detail-head">
        <Btn type="button" className="conn-back" onClick={() => navigate(-1)} aria-label={t('calendar.back')}>
          <ChevronRight size={20} strokeWidth={1.6} aria-hidden="true" />
        </Btn>
        <Txt as="p" className="t-screen">
          <Sparkles size={20} strokeWidth={1.6} aria-hidden="true" />
          Claude
        </Txt>
      </Box>

      <Box as="section" className="conn-card" ref={cardRef}>
        <Box className="conn-card-head">
          <Txt className="conn-icon"><Sparkles size={22} strokeWidth={1.6} aria-hidden="true" /></Txt>
          <Box className="conn-card-titles">
            <Txt as="p" className="conn-card-title">{t('claude.title')}</Txt>
            <Txt as="p" className={`conn-card-sub${expired ? ' conn-claude-expired' : ''}`}>{headerSub}</Txt>
          </Box>
        </Box>

        {!ca.loading && !inFlow && (
          <Btn
            type="button"
            className="conn-claude-switch"
            role="switch"
            aria-checked={active}
            disabled={ca.busy || (!active && !!ca.error && !status)}
            onClick={onSwitch}
          >
            <Txt>{t('claude.switchLabel')}</Txt>
            <Txt className={`conn-toggle${active ? ' on' : ''}`} aria-hidden="true">
              <Txt className="conn-toggle-knob" />
            </Txt>
          </Btn>
        )}

        {ca.error && (
          <Txt as="p" className="conn-error" role="alert">
            <CircleAlert size={14} strokeWidth={1.7} aria-hidden="true" /> {t(claudeErrorKey(ca.error))}
          </Txt>
        )}

        {/* ── Off: what this is ── */}
        {!ca.loading && !active && mode === 'view' && (
          <>
            <Txt as="p" className="conn-claude-hint">{t('claude.intro')}</Txt>
            <Txt as="p" className="conn-claude-hint">{t('claude.clientNote')}</Txt>
          </>
        )}

        {/* ── Step 1: pick categories (also used to edit) ── */}
        {(mode === 'pick' || mode === 'edit') && (
          <>
            <Txt as="p" className="conn-claude-step">{mode === 'pick' ? t('claude.pickTitle') : t('claude.editTitle')}</Txt>
            <Txt as="p" className="conn-claude-hint">{t('claude.pickHint')}</Txt>
            <CategoryPicker picked={picked} onToggle={toggle} disabled={ca.busy} t={t} />
            {picked.size === 0 && <Txt as="p" className="conn-note">{t('claude.pickAtLeastOne')}</Txt>}
            {mode === 'edit' && editNeedsConsent && picked.size > 0 && (
              <>
                <Txt as="p" className="conn-claude-step">{t('claude.reconsentTitle')}</Txt>
                <Box className="conn-claude-consent">
                  <Box as="ul">
                    {consentLines(ordered(picked), t, lang).map((line, i) => <Box as="li" key={i}>{line}</Box>)}
                  </Box>
                </Box>
                <Box as="label" className="conn-claude-agree">
                  <Input type="checkbox" checked={agreed} disabled={ca.busy} onChange={(e) => setAgreed(e.target.checked)} />
                  <Txt>{t('claude.consent.agree')}</Txt>
                </Box>
              </>
            )}
            <Box className="conn-actions">
              {mode === 'pick' ? (
                <Btn type="button" className="conn-btn primary" disabled={picked.size === 0} onClick={goConsent}>
                  {t('claude.continue')}
                </Btn>
              ) : (
                <Btn type="button" className="conn-btn primary" disabled={picked.size === 0 || ca.busy || (editNeedsConsent && !agreed)} onClick={onSaveEdit}>
                  {ca.busy ? t('claude.saving') : t('claude.saveCategories')}
                </Btn>
              )}
              <Btn type="button" className="conn-btn ghost" disabled={ca.busy} onClick={cancel}>{t('claude.cancel')}</Btn>
            </Box>
          </>
        )}

        {/* ── Step 2: consent ── */}
        {mode === 'consent' && (
          <>
            <Txt as="p" className="conn-claude-step">{t('claude.consentTitle')}</Txt>
            <Box className="conn-claude-chips" aria-label={t('claude.selectedAria')}>
              {ordered(picked).map((k) => (
                <Txt key={k} className="conn-claude-chip">{t(`claude.cats.${k}.name`)}</Txt>
              ))}
            </Box>
            <Box className="conn-claude-consent">
              <Box as="ul">
                {consentLines(ordered(picked), t, lang).map((line, i) => <Box as="li" key={i}>{line}</Box>)}
              </Box>
            </Box>
            <Box as="label" className="conn-claude-agree">
              <Input type="checkbox" checked={agreed} disabled={ca.busy} onChange={(e) => setAgreed(e.target.checked)} />
              <Txt>{t('claude.consent.agree')}</Txt>
            </Box>
            <Box className="conn-actions">
              <Btn type="button" className="conn-btn primary" disabled={!agreed || ca.busy} onClick={onCreate}>
                <KeyRound size={15} strokeWidth={1.8} aria-hidden="true" /> {ca.busy ? t('claude.creating') : t('claude.agreeCreate')}
              </Btn>
              <Btn type="button" className="conn-btn ghost" disabled={ca.busy} onClick={() => setMode('pick')}>{t('claude.back')}</Btn>
            </Box>
          </>
        )}

        {/* ── Step 3: one-time reveal ── */}
        {mode === 'reveal' && reveal && (
          <>
            <Box className="conn-claude-warn" role="alert">
              <CircleAlert size={16} strokeWidth={1.8} aria-hidden="true" />
              <Txt>{t('claude.revealWarning')}</Txt>
            </Box>
            <Txt as="p" className="conn-claude-step">{t('claude.commandTitle')}</Txt>
            <Box className="conn-webhook-url-row">
              <Txt as="code" className="conn-webhook-url">{claudeConnectCommand(reveal.url, reveal.token)}</Txt>
              <Btn type="button" className="conn-webhook-copy" onClick={onCopy} aria-label={t('claude.copyAria')}>
                {copied ? <Check size={13} strokeWidth={2} aria-hidden="true" /> : <Copy size={13} strokeWidth={2} aria-hidden="true" />}
                {copied ? t('claude.copied') : t('claude.copy')}
              </Btn>
            </Box>
            {copyFailed && <Txt as="p" className="conn-error" role="alert">{t('claude.copyFailed')}</Txt>}
            <Box as="ol" className="conn-webhook-steps conn-claude-steps">
              <Box as="li">{t('claude.steps.one')}</Box>
              <Box as="li">{t('claude.steps.two')}</Box>
              <Box as="li">{t('claude.steps.three')}</Box>
            </Box>
            <Box className="conn-actions">
              <Btn type="button" className="conn-btn primary" onClick={onDoneReveal}>{t('claude.doneReveal')}</Btn>
            </Box>
          </>
        )}

        {/* ── On: details + actions ── */}
        {!ca.loading && active && mode === 'view' && (
          <>
            <Box as="dl" className="conn-claude-meta">
              <Txt as="dt">{t('claude.lastUsed')}</Txt>
              <Txt as="dd">{status.last_used_at ? fmtDate(status.last_used_at, lang) : t('claude.neverUsed')}</Txt>
              <Txt as="dt">{expired ? t('claude.expiredLabel') : t('claude.expiresLabel')}</Txt>
              <Txt as="dd" className={expired ? 'conn-claude-expired' : undefined}>{fmtDate(status.expires_at, lang)}</Txt>
            </Box>
            <Txt as="p" className="conn-claude-step">{t('claude.allowedTitle')}</Txt>
            <Box className="conn-claude-chips">
              {CLAUDE_CATEGORIES.filter((c) => status.categories?.includes(c.key)).map((c) => (
                <Txt key={c.key} className={`conn-claude-chip${c.sensitive ? ' sensitive' : ''}`}>
                  {c.sensitive && <ShieldAlert size={11} strokeWidth={2} aria-hidden="true" />}
                  {t(`claude.cats.${c.key}.name`)}
                </Txt>
              ))}
            </Box>
            <Box className="conn-actions">
              <Btn type="button" className="conn-btn primary" disabled={ca.busy} onClick={onRenew}>
                <RefreshCw size={15} strokeWidth={1.8} aria-hidden="true" /> {t('claude.renew')}
              </Btn>
              <Btn type="button" className="conn-btn ghost" disabled={ca.busy} onClick={startEdit}>
                <SlidersHorizontal size={15} strokeWidth={1.8} aria-hidden="true" /> {t('claude.editCategories')}
              </Btn>
              {expired && (
                <Btn type="button" className="conn-btn ghost" disabled={ca.busy} onClick={() => startSetup(status.categories ?? [])}>
                  <KeyRound size={15} strokeWidth={1.8} aria-hidden="true" /> {t('claude.recreate')}
                </Btn>
              )}
            </Box>
          </>
        )}

        {note && !ca.error && <Txt as="p" className="conn-note" role="status" aria-live="polite">{note}</Txt>}
      </Box>

      <ConfirmModal
        open={confirmOff}
        onClose={() => setConfirmOff(false)}
        title={t('claude.offTitle')}
        message={t('claude.offMessage')}
        confirmLabel={t('claude.offConfirm')}
        cancelLabel={t('claude.cancel')}
        danger
        onConfirm={onRevoke}
      />
    </Box>
  )
}
