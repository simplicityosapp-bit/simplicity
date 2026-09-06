import { useState } from 'react'
import { X, Phone } from 'lucide-react'
import { useClients } from '../../../hooks/useClients'
import { useT } from '../../../i18n/useT'
import { useStepCTA } from '../useStepCTA'
import { Box, Txt, Btn, Input } from '../../../components/ui'

/* ════════════════════════════════════════════════════════════════
   Step 3 — the first client.
   ════════════════════════════════════════════════════════════════
   This step used to mount the whole in-app add-client form: name, phone,
   four status pills, an accordion of ten more fields, a project select, a
   group select, and a live card computing a balance out of sessions and
   price. All of it optional, none of it explained, on the third screen a
   new user ever sees.

   Name and phone. The project is whatever step 2 just built, so there is
   nothing to choose. Everything else about a client — status, package,
   price, address, birthday — lives on their own card, at the moment
   there's a reason to fill it in.
   ════════════════════════════════════════════════════════════════ */

const initials = (name) =>
  (name || '').split(' ').map((w) => w[0] || '').join('').slice(0, 2).toUpperCase()

export default function Step3Clients({ ob, setCTA }) {
  const { t } = useT('onboardingSteps')
  const { addClient, removeClient, clients } = useClients()

  /* The project step 2 settled on — one it created, or an existing one the
     user chose to continue with. */
  const projectId = ob.state.answers?.projects?.project_id || ob.state.answers?.projects?.created_ids?.[0] || null
  const initial = ob.state.answers?.clients || {}

  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [createdIds, setCreatedIds] = useState(initial.created_ids || [])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const added = createdIds.map((id) => clients.find((c) => c.id === id)).filter(Boolean)
  const composerHasName = name.trim().length > 0
  const canAdvance = composerHasName || added.length > 0
  const hint = !canAdvance ? t('step3.hintAddOne') : null

  /* Only the two fields we ask for carry a value; the rest of the row is
     the same shape insertClient always writes, left at its defaults. */
  const commit = async () => {
    const row = await addClient({
      name: name.trim(),
      status: 'active',
      status_meta: 'active',
      status_id: null,
      project_id: projectId,
      group_id: null,
      sessions: 0,
      price_per_session: 0,
      total_override: null,
      has_custom_price: false,
      recurring_day: null,
      recurring_time: null,
      left_mid_process: false,
      phone: phone.trim() || null,
      email: null,
      address: null,
      birth_date: null,
      notes: null,
      notes_updated_at: null,
    })
    const next = [...createdIds, row.id]
    setCreatedIds(next)
    await ob.setAnswers('clients', { created_ids: next })
    return next
  }

  const onAdd = async () => {
    if (!composerHasName) return
    setBusy(true); setErr('')
    try { await commit(); setName(''); setPhone('') }
    catch (e) { setErr(t('step3.errSaveFail', { error: e.message || t('step3.tryAgain') })) }
    finally { setBusy(false) }
  }

  /* Enter here means "that's one", not "I'm done with this step". The shell
     treats Enter as advance, so someone who typed a name and pressed the key
     every form has taught them found themselves on step 4 with the client
     they had just typed saved but the composer's own "+" never used. Adding
     is what the field in front of them is for; a second Enter, on an empty
     composer, falls through to the shell and moves on. */
  const onComposerKeyDown = (e) => {
    if (e.key !== 'Enter' || e.shiftKey || !composerHasName || busy) return
    e.preventDefault()
    e.stopPropagation()
    onAdd()
  }

  const onRemove = async (id) => {
    await removeClient(id)
    const next = createdIds.filter((x) => x !== id)
    setCreatedIds(next)
    await ob.setAnswers('clients', { created_ids: next })
  }

  const onNext = async () => {
    setBusy(true); setErr('')
    try {
      if (composerHasName) await commit()
      await ob.advance()
    } catch (e) {
      setErr(t('step3.errSaveFail', { error: e.message || t('step3.tryAgain') }))
    } finally {
      setBusy(false)
    }
  }

  useStepCTA(setCTA, { onNext, canAdvance, busy, hint })

  return (
    <>
      <Txt as="p" className="ob-intro">{t('step3.intro')}</Txt>
      <Txt as="p" className="ob-intro-sub">{t('step3.introSub')}</Txt>

      <Box className="ob-field">
        <Box as="label" className="ob-label" htmlFor="ob-c-name">{t('step3.nameLabel')}</Box>
        <Input
          id="ob-c-name"
          className="ob-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={onComposerKeyDown}
          placeholder={t('step3.namePlaceholder')}
          autoFocus
        />
      </Box>

      <Box className="ob-field">
        <Box as="label" className="ob-label" htmlFor="ob-c-phone">{t('step3.phoneLabel')}</Box>
        <Input
          id="ob-c-phone"
          className="ob-input"
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          onKeyDown={onComposerKeyDown}
          placeholder="050-0000000"
        />
      </Box>

      {composerHasName && (
        <Btn type="button" className="ob-pc-add" onClick={onAdd} disabled={busy}>
          + {t('step3.addAnother')}
        </Btn>
      )}

      {added.length > 0 && (
        <Box className="ob-field">
          <Txt as="p" className="ob-label">{t('step3.addedHeading', { count: added.length })}</Txt>
          <Box className="ob-pc-group-list">
            {added.map((c) => (
              <Box key={c.id} className="ob-pc-group">
                <Box className="ob-cc-av">{initials(c.name) || '–'}</Box>
                <Box className="ob-pc-group-body">
                  <Txt as="p" className="ob-pc-group-name">{c.name}</Txt>
                  {c.phone && (
                    <Txt as="p" className="ob-pc-group-meta">
                      <Phone size={11} strokeWidth={1.8} aria-hidden="true" /> {c.phone}
                    </Txt>
                  )}
                </Box>
                <Btn type="button" className="ob-pc-group-x" onClick={() => onRemove(c.id)} aria-label={t('step3.removeAria', { name: c.name })}>
                  <X size={13} strokeWidth={2} aria-hidden="true" />
                </Btn>
              </Box>
            ))}
          </Box>
        </Box>
      )}

      {err && <Txt as="p" className="ob-empty-hint" style={{ color: 'var(--clay)' }}>{err}</Txt>}
    </>
  )
}
