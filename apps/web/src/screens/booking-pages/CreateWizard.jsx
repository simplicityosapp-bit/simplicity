import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowRight, ArrowLeft, Check, CalendarClock, Clock, Palette, BellRing, Globe,
  Link2, Copy, ExternalLink, Sparkles, Trash2,
} from 'lucide-react'
import Modal from '../../modals/Modal'
import DesignToolbox from '../../components/DesignToolbox'
import SelectMenu from '../../components/SelectMenu'
import { useMeetingTypes } from '../../hooks/useMeetingTypes'
import { useProjects } from '../../hooks/useProjects'
import { useGoogleCalendar } from '../../hooks/useGoogleCalendar'
import AvailabilityEditor from './AvailabilityEditor'
import MeetingTypesPicker from './MeetingTypesPicker'
import {
  leadPageSurface, publicBookingPageUrl,
  normalizeSlug, isValidSlug, slugifyInput, sanitizeAvailability, findInvalidWindow,
  weekdayLabels, publishBlocker, publishMessage,
  draftFromPage, pausedAtStep, WIZARD_STEP_KEY,
} from '../../lib/bookingPageSchema'
import {
  WIZARD_STEPS, stepIndex, stepBlocker, nextStep, prevStep, isLastStep,
  provisionalTitle, isProvisionalTitle,
} from '../../lib/bookingWizard'
import { ROUTES } from '../../lib/routes'
import { copyText } from '../../lib/clipboard'
import { showError } from '../../lib/toast'
import { useT } from '../../i18n/useT'
import { Box, Txt, Btn, Input, Textarea, Lnk } from '../../components/ui'

const STEP_ICONS = { offer: CalendarClock, when: Clock, look: Palette, after: BellRing, publish: Globe }

/* ════════════════════════════════════════════════════════════════
   CREATING A BOOKING PAGE — one question at a time.
   ════════════════════════════════════════════════════════════════
   The builder asks everything at once: ~3,000px, 34 controls, and the first
   seven of them administration. This asks in the order a coach decides —
   what I offer, when I am free, how it looks, what happens after, where it
   lives — and nothing else is on screen while they answer.

   The page becomes REAL at the end of step 1, under a provisional name, so
   walking away leaves a draft in the list instead of losing four steps of work.
   Every step after that saves onto that same row. The name is asked last,
   because it is the least interesting thing about a page and asking it first
   is what made the old first screen feel like paperwork.

   Editing an existing page still opens the full builder: coming back is almost
   always about one thing, and a five-step walk to reach it would be worse.
   ════════════════════════════════════════════════════════════════ */
export default function BookingCreateWizard({ resumePage, takenTitles, onAdd, onUpdate, onDiscard, onExit, onOpenBuilder }) {
  const { t } = useT('booking')
  const navigate = useNavigate()
  const { types: meetingTypes, addType: onAddType } = useMeetingTypes()
  const { projects } = useProjects()
  const { status: gcalStatus } = useGoogleCalendar()
  const gcalConnected = !!gcalStatus?.connected
  const [step, setStep] = useState(() => pausedAtStep(resumePage) || 'offer')
  const [draft, setDraft] = useState(() => draftFromPage(resumePage))
  const [pageId, setPageId] = useState(resumePage?.id ?? null)
  const [saved, setSaved] = useState(resumePage ?? null)   // the row, once it exists
  const [leaving, setLeaving] = useState(false)            // the two-doors dialog
  const [discarding, setDiscarding] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [done, setDone] = useState(false)
  const [copied, setCopied] = useState(false)

  const baseTitle = t('pages.provisionalTitle')
  const availTypes = useMemo(() => (meetingTypes || []).filter((x) => !x.deleted_at), [meetingTypes])

  const set = (patch) => setDraft((d) => ({ ...d, ...patch }))
  const setContent = (patch) => setDraft((d) => ({ ...d, content: { ...d.content, ...patch } }))
  const setThankYou = (patch) => setDraft((d) => ({ ...d, content: { ...d.content, thankYou: { ...d.content.thankYou, ...patch } } }))

  const toggleType = (id) => setDraft((d) => ({
    ...d,
    meeting_type_ids: d.meeting_type_ids.includes(id)
      ? d.meeting_type_ids.filter((x) => x !== id)
      : [...d.meeting_type_ids, id],
  }))
  const setTypeDuration = (id, minutes) => setDraft((d) => {
    const next = { ...d.meeting_type_durations }
    if (minutes === '' || minutes == null) delete next[id]
    else next[id] = Number(minutes)
    return { ...d, meeting_type_durations: next }
  })

  /* `pausedAt` is the step to reopen at, or null once the wizard is done with
     this page. It rides inside `content`, which both editors round-trip whole. */
  const payloadFrom = (d, { title, publish, pausedAt }) => ({
    title,
    published: !!publish,
    auto_confirm: d.auto_confirm,
    /* Carried through rather than dropped: a resumed page may already hold it,
       and rebuilding the payload without it would quietly switch it off. */
    require_payment: !!d.require_payment,
    write_to_google: d.write_to_google,
    invite_client: d.write_to_google && d.invite_client,
    project_id: d.project_id || null,
    slug: d.slug ? normalizeSlug(d.slug) : null,
    content: pausedAt
      ? { ...d.content, [WIZARD_STEP_KEY]: pausedAt }
      : (() => { const c = { ...d.content }; delete c[WIZARD_STEP_KEY]; return c })(),
    availability: sanitizeAvailability(d.availability),
    meeting_type_ids: d.meeting_type_ids,
    meeting_type_durations: Object.fromEntries(
      Object.entries(d.meeting_type_durations).filter(([id]) => d.meeting_type_ids.includes(id)),
    ),
  })

  /* Persist whatever the draft holds right now. The first call creates the row
     under a provisional name; every later one updates it. */
  const persist = async ({ publish, pausedAt = null } = {}) => {
    const title = draft.title.trim() || provisionalTitle(baseTitle, takenTitles)
    const payload = payloadFrom(draft, { title, publish: publish ?? draft.published, pausedAt })
    if (pageId) {
      const row = (await onUpdate(pageId, payload)) || { ...payload, id: pageId }
      setSaved(row)
      return row
    }
    const row = await onAdd(payload)
    setPageId(row.id)
    setSaved(row)
    return row
  }

  const goNext = async () => {
    if (busy) return
    setErr('')
    const blocker = stepBlocker(step, draft)
    if (blocker) { setErr(t(`wizard.${blocker}`)); return }
    /* Reversed windows would save happily and then produce no slots at all. */
    if (step === 'when') {
      const bad = findInvalidWindow(draft.availability)
      if (bad) { setErr(t('pages.errInvalidWindow', { day: weekdayLabels()[bad.day] })); return }
    }
    if (step === 'publish' && draft.slug.trim() && !isValidSlug(normalizeSlug(draft.slug))) {
      setErr(t('pages.errSlugFormat')); return
    }
    /* The same question the builder asks before going live. Without it this
       wizard would publish a page whose windows are all shorter than the
       shortest meeting it offers — live, and offering nothing, with no way for
       the owner to find out. Only asked when they actually chose to publish;
       saving it as a draft is always allowed. */
    if (step === 'publish' && draft.published) {
      const problem = publishMessage(publishBlocker(draft, availTypes), t)
      if (problem) { setErr(problem); return }
    }

    setBusy(true)
    try {
      const row = await persist()
      if (isLastStep(step)) setDone(true)
      else setStep(nextStep(step))
      return row
    } catch (e) {
      if (e?.code === '23505' || /duplicate|unique|idx_booking_pages_slug/i.test(e?.message || '')) setErr(t('pages.errSlugTaken'))
      else { console.error('booking wizard save failed', e); setErr(t('pages.errSaveFailed')) }
      return null
    } finally { setBusy(false) }
  }

  const goBack = () => { setErr(''); setStep(prevStep(step)) }

  /* ── Leaving before the end ──────────────────────────────────────
     Walking out used to just… leave, quietly keeping whatever had been created
     so far. That is the right default for not losing work, but it was never
     offered as a choice, so a coach who changed their mind had no way to say so
     and no way to know a half-built page was now sitting in their list.

     Two doors, named for what they do. Nothing is asked before the page exists
     — there is nothing to keep or throw away yet. */
  const requestExit = () => { if (pageId) setLeaving(true); else onExit() }

  const exitKeeping = async () => {
    if (busy) return
    setBusy(true)
    try {
      /* Remember the step, so coming back opens where they stopped. */
      await persist({ pausedAt: step })
      onExit()
    } catch (e) {
      console.error('booking wizard save-on-exit failed', e)
      setErr(t('pages.errSaveFailed'))
      setLeaving(false)
    } finally { setBusy(false) }
  }

  const exitDiscarding = async () => {
    if (discarding) return
    setDiscarding(true)
    try {
      await onDiscard(pageId)
      onExit()
    } catch (e) {
      console.error('booking wizard discard failed', e)
      setErr(t('pages.errSaveFailed'))
      setLeaving(false)
    } finally { setDiscarding(false) }
  }

  const url = saved?.id ? publicBookingPageUrl(saved.slug || saved.id) : null
  const copyLink = async () => {
    if (!url) return
    if (await copyText(url)) { setCopied(true); setTimeout(() => setCopied(false), 1600) }
    else showError(t('pages.copyFailed'))
  }

  const slugPrefix = publicBookingPageUrl('').replace(/^https?:\/\//, '')
  const c = draft.content
  const { style: canvasStyle, cls: surfaceCls } = leadPageSurface(c)

  /* ── The finish screen ─────────────────────────────────────────── */
  if (done) {
    return (
      <Box className="screen bk-screen bk-wiz-screen">
        <Box className="bk-wiz-done">
          <Box className="bk-wiz-done-mark"><Sparkles size={26} strokeWidth={1.6} aria-hidden="true" /></Box>
          <Txt as="h2" className="bk-wiz-done-title">
            {saved?.published ? t('wizard.doneLive') : t('wizard.doneDraft')}
          </Txt>
          <Txt as="p" className="bk-wiz-done-sub">
            {saved?.published ? t('wizard.doneLiveSub') : t('wizard.doneDraftSub')}
          </Txt>

          {url && saved?.published && (
            <Box className="lpb-link-row bk-wiz-link">
              <Link2 size={15} strokeWidth={1.7} aria-hidden="true" />
              <Txt className="lpb-link-url mono" dir="ltr">{url}</Txt>
              <Btn type="button" className="lpb-copy-btn" onClick={copyLink}>
                {copied ? <><Check size={14} strokeWidth={2} /> {t('pages.copied')}</> : <><Copy size={14} strokeWidth={1.7} /> {t('pages.copy')}</>}
              </Btn>
            </Box>
          )}

          <Box className="bk-wiz-done-actions">
            {url && saved?.published && (
              <Lnk className="bk-mini-btn" href={url} target="_blank" rel="noreferrer">
                <ExternalLink size={14} strokeWidth={1.7} /> {t('wizard.viewPage')}
              </Lnk>
            )}
            <Btn type="button" className="m-btn-cancel" onClick={() => onOpenBuilder(saved)}>{t('wizard.advancedEdit')}</Btn>
            <Btn type="button" className="m-btn-save" onClick={onExit}>{t('wizard.finish')}</Btn>
          </Box>
        </Box>
      </Box>
    )
  }

  /* ── The steps ─────────────────────────────────────────────────── */
  return (
    <Box className="screen bk-screen bk-wiz-screen">
      {step === 'look' && <DesignToolbox content={draft.content} onChange={setContent} />}

      <Box className="bk-wiz-top">
        <Btn type="button" className="lp-back-link" onClick={requestExit}>
          <ArrowRight size={16} strokeWidth={1.7} aria-hidden="true" /> {t('wizard.leave')}
        </Btn>
        {/* The rail is the guiding hand: five names, where you are, what is
            behind you. Numbers alone would say how long it is, not what it is
            about. */}
        <Box className="bk-wiz-rail" role="list">
          {WIZARD_STEPS.map((s, i) => {
            const Icon = STEP_ICONS[s]
            const state = i < stepIndex(step) ? 'done' : (s === step ? 'now' : 'todo')
            return (
              <Box key={s} role="listitem" className={`bk-wiz-pip is-${state}`} aria-current={s === step ? 'step' : undefined}>
                <Box className="bk-wiz-pip-dot">{state === 'done' ? <Check size={13} strokeWidth={2.4} /> : <Icon size={14} strokeWidth={1.8} />}</Box>
                <Txt className="bk-wiz-pip-label">{t(`wizard.step.${s}`)}</Txt>
              </Box>
            )
          })}
        </Box>
      </Box>

      <Box className="bk-wiz-card">
        <Txt as="h2" className="bk-wiz-q">{t(`wizard.title.${step}`)}</Txt>
        <Txt as="p" className="bk-wiz-sub">{t(`wizard.sub.${step}`)}</Txt>

        {step === 'offer' && (
          <MeetingTypesPicker
            meetingTypes={availTypes}
            selectedIds={draft.meeting_type_ids}
            durations={draft.meeting_type_durations}
            defaultDuration={draft.availability.defaultDurationMinutes}
            onToggle={toggleType}
            onSetDuration={setTypeDuration}
            onSetDefaultDuration={(minutes) => setDraft((d) => ({ ...d, availability: { ...d.availability, defaultDurationMinutes: minutes } }))}
            onAddType={onAddType}
            emptyKey="wizard.noTypes"
          />
        )}

        {step === 'when' && (
          <AvailabilityEditor
            availability={draft.availability}
            onChange={(availability) => set({ availability })}
          />
        )}

        {step === 'look' && (
          <Box className={`lpe-canvas lp-surface${surfaceCls ? ` ${surfaceCls}` : ''}`} style={canvasStyle}>
            <Box className="lp-card">
              <Input className="lp-logo lpe-edit lpe-center" value={c.logoText} onChange={(e) => setContent({ logoText: e.target.value })} placeholder={t('pages.logoPlaceholder')} aria-label={t('pages.logoAria')} />
              <Input className="lp-heading lpe-edit" value={c.heading} onChange={(e) => setContent({ heading: e.target.value })} placeholder={t('pages.headingPlaceholder')} aria-label={t('pages.headingAria')} />
              <Textarea className="lp-body lpe-edit" value={c.body} onChange={(e) => setContent({ body: e.target.value })} placeholder={t('pages.bodyPlaceholder')} rows={2} aria-label={t('pages.bodyAria')} />
              <Box className="bk-preview-hint" aria-hidden="true">
                <CalendarClock size={15} strokeWidth={1.6} /> {t('pages.previewHint')}
              </Box>
              <Box className="lp-submit lpe-submit-preview" aria-hidden="true">{t('pages.submitPreview')}</Box>
            </Box>
          </Box>
        )}

        {step === 'after' && (
          <>
            <Box as="label" className="lpb-toggle">
              <Input type="checkbox" checked={draft.auto_confirm} onChange={(e) => set({ auto_confirm: e.target.checked })} />
              <Txt><strong>{t('pages.autoConfirmTitle')}</strong><em>{t('pages.autoConfirmHint')}</em></Txt>
            </Box>
            <Box as="label" className={`lpb-toggle${gcalConnected ? '' : ' is-disabled'}`}>
              <Input type="checkbox" checked={draft.write_to_google} disabled={!gcalConnected} onChange={(e) => set({ write_to_google: e.target.checked })} />
              <Txt>
                <strong>{t('pages.writeToGoogleTitle')}</strong>
                <em>{gcalConnected ? t('pages.writeToGoogleHintConnected') : t('pages.writeToGoogleHintDisconnected')}</em>
              </Txt>
            </Box>
            {/* Naming the obstacle without offering the way round it is half an
                answer. Leaving mid-wizard is safe — the draft is already saved. */}
            {!gcalConnected && (
              <Btn type="button" className="bk-connect-link" onClick={() => navigate(ROUTES.CONNECTION_CALENDAR)}>
                {t('pages.connectGoogle')}
              </Btn>
            )}
            {gcalConnected && draft.write_to_google && (
              <Box as="label" className="lpb-toggle">
                <Input type="checkbox" checked={draft.invite_client} onChange={(e) => set({ invite_client: e.target.checked })} />
                <Txt><strong>{t('pages.inviteClientTitle')}</strong><em>{t('pages.inviteClientHint')}</em></Txt>
              </Box>
            )}
            <Box className="m-field">
              <Box as="label" className="m-label">{t('pages.afterBookingLabel')}</Box>
              <Box className="lpb-radio-group">
                <Box as="label" className="lpb-radio">
                  <Input type="radio" name="bkw-thankyou" checked={c.thankYou.mode === 'message'} onChange={() => setThankYou({ mode: 'message' })} />
                  {t('pages.thankYouModeMessage')}
                </Box>
                <Box as="label" className="lpb-radio">
                  <Input type="radio" name="bkw-thankyou" checked={c.thankYou.mode === 'redirect'} onChange={() => setThankYou({ mode: 'redirect' })} />
                  {t('pages.thankYouModeRedirect')}
                </Box>
              </Box>
              {c.thankYou.mode === 'redirect' ? (
                <Input className="m-input" value={c.thankYou.url} onChange={(e) => setThankYou({ url: e.target.value })} placeholder="https://..." dir="ltr" />
              ) : (
                <Textarea className="m-textarea" value={c.thankYou.message} onChange={(e) => setThankYou({ message: e.target.value })} />
              )}
            </Box>
          </>
        )}

        {step === 'publish' && (
          <>
            <Box className="m-field">
              <Box as="label" className="m-label">{t('pages.internalNameLabel')} <Txt className="bk-req" title={t('pages.requiredField')}>*</Txt></Box>
              <Input
                className="m-input" required aria-required="true"
                value={isProvisionalTitle(draft.title, baseTitle) ? '' : draft.title}
                onChange={(e) => set({ title: e.target.value })}
                placeholder={t('pages.internalNamePlaceholder')}
              />
              <Txt as="p" className="lbl-sm">{t('pages.internalNameHint')}</Txt>
            </Box>
            <Box className="m-field">
              <Box as="label" className="m-label">{t('pages.slugLabel')}</Box>
              <Box className="lpe-slug-row">
                <Txt className="lpe-slug-prefix mono" dir="ltr">{slugPrefix}</Txt>
                <Input className="m-input lpe-slug-input" dir="ltr" value={draft.slug} onChange={(e) => set({ slug: slugifyInput(e.target.value) })} placeholder={t('pages.slugPlaceholder')} maxLength={40} />
              </Box>
              <Txt as="p" className="lbl-sm">{t('pages.slugHint')}</Txt>
            </Box>
            {(projects || []).filter((p) => !p.deleted_at).length > 0 && (
              <Box className="m-field">
                <Box as="label" className="m-label">{t('pages.projectLabel')}</Box>
                <SelectMenu
                  value={draft.project_id || ''}
                  onChange={(v) => set({ project_id: v })}
                  ariaLabel={t('pages.projectLabel')}
                  options={[
                    { value: '', label: t('pages.projectNone') },
                    ...(projects || []).filter((p) => !p.deleted_at).map((p) => ({ value: p.id, label: p.name })),
                  ]}
                />
              </Box>
            )}
            {/* Two named outcomes, not a checkbox whose off-state you have to
                infer. Publishing is the last thing anyone decides and it is
                phrased as the decision it is. */}
            <Box className="m-field">
              <Box as="label" className="m-label">{t('wizard.publishQuestion')}</Box>
              <Box className="lpb-radio-group">
                <Box as="label" className="lpb-radio">
                  <Input type="radio" name="bkw-publish" checked={!!draft.published} onChange={() => set({ published: true })} />
                  {t('wizard.publishYes')}
                </Box>
                <Box as="label" className="lpb-radio">
                  <Input type="radio" name="bkw-publish" checked={!draft.published} onChange={() => set({ published: false })} />
                  {t('wizard.publishNo')}
                </Box>
              </Box>
            </Box>
          </>
        )}

        {err && <Txt as="p" className="m-error lpe-err">{err}</Txt>}
      </Box>

      <Box className="bk-wiz-actions">
        {prevStep(step) ? (
          <Btn type="button" className="m-btn-cancel" onClick={goBack} disabled={busy}>
            <ArrowRight size={15} strokeWidth={1.8} aria-hidden="true" /> {t('wizard.back')}
          </Btn>
        ) : <Box />}
        <Btn type="button" className="m-btn-save" onClick={goNext} disabled={busy}>
          {busy ? t('pages.saving') : (isLastStep(step) ? t('wizard.finishStep') : t('wizard.next'))}
          {!busy && !isLastStep(step) && <ArrowLeft size={15} strokeWidth={1.8} aria-hidden="true" />}
        </Btn>
      </Box>

      {leaving ? (
        <Modal open onClose={() => setLeaving(false)} title={t('wizard.leaveTitle')}>
          <Txt as="p" className="bk-copy-hint">{t('wizard.leaveBody')}</Txt>
          <Box className="bk-leave-actions">
            <Btn type="button" className="m-btn-save" onClick={exitKeeping} disabled={busy || discarding}>
              {busy ? t('pages.saving') : t('wizard.leaveKeep')}
            </Btn>
            {/* The destructive door is a plain button, not the primary one, and
                it says what it destroys. */}
            <Btn type="button" className="bk-leave-discard" onClick={exitDiscarding} disabled={busy || discarding}>
              <Trash2 size={14} strokeWidth={1.8} aria-hidden="true" />
              {discarding ? t('pages.saving') : t('wizard.leaveDiscard')}
            </Btn>
            <Btn type="button" className="m-btn-cancel" onClick={() => setLeaving(false)} disabled={busy || discarding}>
              {t('wizard.leaveStay')}
            </Btn>
          </Box>
        </Modal>
      ) : null}
    </Box>
  )
}
