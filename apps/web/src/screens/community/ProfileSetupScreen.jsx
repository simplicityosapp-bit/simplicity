import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Users, ArrowLeft } from 'lucide-react'
import { useCommunityProfile } from '../../hooks/useCommunityProfile'
import { reasonForProfileWriteError } from '../../lib/api/communityProfiles'
import { ROUTES } from '../../lib/routes'
import { useT } from '../../i18n/useT'
import './CommunityScreen.css'
import { Box, Txt, Btn, Input, Textarea } from '../../components/ui'

/* Community profile — create AND edit, one form (0082 name gate + 0091 public
   fields). The display name is still the gate: until this row exists the user
   cannot post (the community_messages FK, 0086). Everything else — headline,
   bio, specialties, link — is optional public identity shown on their card.

   Existing users reach the edit form here (the member card's "edit" shortcut
   routes to /community/profile); new users get the same form with a required
   name and empty optionals. avatar_url stays null — photo upload doesn't exist
   anywhere in the app yet, so the card renders the initial-on-a-tint fallback. */

/* Comma-separated tags → a bounded array, mirroring the DB check (≤8 tags,
   ≤200 chars total across them, each capped here at 40). Empty → null so the
   column stores NULL, not an empty array. */
function parseTags(raw) {
  const parts = raw.split(',').map((s) => s.trim()).filter(Boolean).map((s) => s.slice(0, 40))
  const out = []
  let total = 0
  for (const tag of parts) {
    if (out.length >= 8) break
    total += tag.length + (out.length ? 1 : 0)   /* +1 for the ',' the DB check counts */
    if (total > 200) break
    out.push(tag)
  }
  return out.length ? out : null
}

/* A bare "example.com" is what people type; the DB requires http(s) (0091), so
   prepend it. Empty → null. */
function normalizeLink(raw) {
  const v = raw.trim()
  if (!v) return null
  return /^https?:\/\//i.test(v) ? v : `https://${v}`
}

export default function CommunityProfileSetupScreen() {
  const { t } = useT('community')
  const navigate = useNavigate()
  const { profile, loading, createProfile, updateProfile } = useCommunityProfile()
  const editing = !!profile

  const [name, setName] = useState('')
  const [headline, setHeadline] = useState('')
  const [bio, setBio] = useState('')
  const [specialties, setSpecialties] = useState('')
  const [link, setLink] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)

  /* Hydrate the form once, when the profile first resolves — useState
     initialisers run before the async fetch returns, so they'd miss it. The
     guard keeps a later cache-seed (from our own save) from clobbering edits. */
  const hydratedRef = useRef(false)
  useEffect(() => {
    if (!profile || hydratedRef.current) return
    hydratedRef.current = true
    setName(profile.display_name || '')
    setHeadline(profile.headline || '')
    setBio(profile.bio || '')
    setSpecialties((profile.specialties || []).join(', '))
    setLink(profile.link || '')
  }, [profile])

  const submit = async (e) => {
    e.preventDefault()
    const value = name.trim()
    if (!value) {
      setErr(t('profileSetup.errors.required'))
      return
    }
    setBusy(true)
    setErr('')
    setSaved(false)
    const payload = {
      display_name: value,
      headline: headline.trim() || null,
      bio: bio.trim() || null,
      specialties: parseTags(specialties),
      link: normalizeLink(link),
    }
    try {
      if (editing) await updateProfile(payload)
      else await createProfile(payload)
      setSaved(true)
    } catch (e2) {
      /* A refused write is opaque by default (see reasonForProfileWriteError):
         ask what it meant, and only fall back to the raw message when the
         database can't tell us. Client-side length caps keep the other CHECKs
         from firing, so a 23514 here is the reserved-name rule, not a field. */
      const reason = await reasonForProfileWriteError(e2, value)
      setErr(reason
        ? t(`profileSetup.errors.${reason}`)
        : t('profileSetup.errors.failed', { error: e2?.message || '' }))
    } finally {
      setBusy(false)
    }
  }

  const clearSaved = () => { if (saved) setSaved(false) }

  const head = (
    <Box as="header" className="screen-head cmt-head">
      <Box>
        <Txt as="p" className="t-screen">
          <Users size={20} strokeWidth={1.6} aria-hidden="true" /> {t('profileSetup.title')}
        </Txt>
        <Txt as="p" className="lbl-sm">{t(editing ? 'profileSetup.editSubtitle' : 'profileSetup.subtitle')}</Txt>
      </Box>
      {editing && (
        <Btn type="button" className="cmt-head-back" onClick={() => navigate(ROUTES.COMMUNITY_CHAT)}>
          <ArrowLeft size={16} strokeWidth={1.7} aria-hidden="true" /> {t('profileSetup.toChat')}
        </Btn>
      )}
    </Box>
  )

  /* Nothing until we know: flashing the create form at someone who already has
     a profile, then swapping to edit, reads as a bug. */
  if (loading) return <Box className="screen">{head}</Box>

  return (
    <Box className="screen">
      {head}
      <Box as="form" className="cmt-card cmt-profile-form" onSubmit={submit}>
        <Box className="m-field">
          <Box as="label" className="m-label" htmlFor="cmt-display-name">{t('profileSetup.displayName')}</Box>
          <Input
            id="cmt-display-name"
            className={`m-input${err ? ' err' : ''}`}
            value={name}
            onChange={(e) => { setName(e.target.value); if (err) setErr(''); clearSaved() }}
            placeholder={t('profileSetup.namePlaceholder')}
            autoComplete="off"
            maxLength={60}
          />
          {err
            ? <Txt as="p" className="m-error">{err}</Txt>
            : <Txt as="p" className="m-hint">{t('profileSetup.hint')}</Txt>}
        </Box>

        <Box className="m-field">
          <Box as="label" className="m-label" htmlFor="cmt-headline">{t('profileSetup.headline')}</Box>
          <Input
            id="cmt-headline"
            className="m-input"
            value={headline}
            onChange={(e) => { setHeadline(e.target.value); clearSaved() }}
            placeholder={t('profileSetup.headlinePlaceholder')}
            autoComplete="off"
            maxLength={80}
          />
        </Box>

        <Box className="m-field">
          <Box as="label" className="m-label" htmlFor="cmt-bio">{t('profileSetup.bio')}</Box>
          <Textarea
            id="cmt-bio"
            className="m-input cmt-bio-input"
            value={bio}
            onChange={(e) => { setBio(e.target.value); clearSaved() }}
            placeholder={t('profileSetup.bioPlaceholder')}
            rows={3}
            maxLength={300}
          />
        </Box>

        <Box className="m-field">
          <Box as="label" className="m-label" htmlFor="cmt-specialties">{t('profileSetup.specialties')}</Box>
          <Input
            id="cmt-specialties"
            className="m-input"
            value={specialties}
            onChange={(e) => { setSpecialties(e.target.value); clearSaved() }}
            placeholder={t('profileSetup.specialtiesPlaceholder')}
            autoComplete="off"
          />
          <Txt as="p" className="m-hint">{t('profileSetup.specialtiesHint')}</Txt>
        </Box>

        <Box className="m-field">
          <Box as="label" className="m-label" htmlFor="cmt-link">{t('profileSetup.link')}</Box>
          <Input
            id="cmt-link"
            className="m-input"
            value={link}
            onChange={(e) => { setLink(e.target.value); clearSaved() }}
            placeholder={t('profileSetup.linkPlaceholder')}
            autoComplete="off"
            inputMode="url"
            maxLength={200}
          />
        </Box>

        {saved && <Txt as="p" className="cmt-profile-saved">{t('profileSetup.saved')}</Txt>}

        {/* disabled on `busy` only, never on "empty" — matching the modals: a
            greyed-out button states something is wrong without saying what;
            submitting and naming the problem is why errors.required exists. */}
        <Btn type="submit" className="m-btn-save cmt-submit" disabled={busy}>
          {busy
            ? t(editing ? 'profileSetup.saving' : 'profileSetup.creating')
            : t(editing ? 'profileSetup.save' : 'profileSetup.create')}
        </Btn>
      </Box>
    </Box>
  )
}
