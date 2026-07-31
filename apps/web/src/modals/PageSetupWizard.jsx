import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import Modal from './Modal'
import { missingSetup, SETUP_FIELDS } from '../lib/pageSetup'
import { useT } from '../i18n/useT'
import './PageSetupWizard.css'
import { Box, Txt, Btn, Input } from '../components/ui'

/* ════════════════════════════════════════════════════════════════
   PAGE SETUP WIZARD — the questions a page cannot answer for itself.
   ════════════════════════════════════════════════════════════════
   Shown right after a page is first saved, by BOTH builders (the block engine
   behind landing/lead pages, and the booking builder). Until now a page could
   be saved with no internal name — so the list read "דף ללא שם" over and over —
   and with no address, so the link handed to a client was a raw uuid. Neither
   was ever asked for: the name only appeared as a save error, the address as a
   field halfway down a settings panel that opens closed, and whether the page
   was live at all was a checkbox further down still.

   It asks for exactly three things and treats them differently:
     • the internal name is REQUIRED — the dialog will not close without it
     • the address is OFFERED, and "no thanks" is a real answer
     • live-or-draft is a CHOICE, made explicitly by which button is pressed.
       Nobody is pushed into publishing; they are pushed into deciding.

   Each builder keeps its own publish rules — a landing page needs a section, a
   booking page needs bookable availability — so `validatePublish` is passed in
   and its message is shown here rather than after the dialog closes. */
export default function PageSetupWizard({
  open, page, urlPrefix, slugify, isValidSlug,
  validatePublish, onSubmit, onClose,
}) {
  const { t } = useT('components')
  /* Seeded once, on mount. Both builders render this only while a setup is
     pending, so every opening is a fresh mount and there is nothing to sync. */
  const [title, setTitle] = useState(() => String(page?.title ?? ''))
  const [slug, setSlug] = useState(() => String(page?.slug ?? ''))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const missing = missingSetup({ title, slug })
  const titleMissing = missing.required.includes(SETUP_FIELDS.TITLE)
  const slugBad = !!slug.trim() && isValidSlug && !isValidSlug(slug.trim())
  const blocked = titleMissing || slugBad

  /* The close routes — X, Escape, the backdrop — all land here, and all refuse
     while something required is still empty. Everything else is optional, so
     this is the only state that traps anyone, and it traps them on one field. */
  const requestClose = () => { if (!blocked && !busy) onClose() }

  const submit = async (publish) => {
    if (blocked || busy) return
    setErr('')
    if (publish && validatePublish) {
      const problem = validatePublish()
      if (problem) { setErr(problem); return }
    }
    setBusy(true)
    try {
      await onSubmit({ title: title.trim(), slug: slug.trim() || null, publish })
      onClose()
    } catch (e) {
      /* Builders mark the failures worth repeating to a coach (a taken address);
         anything else is a raw database complaint and stays generic. */
      setErr(e?.userMessage || t('pageSetup.saveFailed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={requestClose} title={t('pageSetup.title')}>
      <Txt as="p" className="psw-intro">{t('pageSetup.intro')}</Txt>

      <Box className="m-field">
        <Box as="label" className="m-label" htmlFor="psw-name">
          {t('pageSetup.nameLabel')} <Txt className="psw-req" title={t('pageSetup.required')}>*</Txt>
        </Box>
        <Input
          id="psw-name"
          className="m-input"
          value={title}
          required
          aria-required="true"
          autoFocus
          placeholder={t('pageSetup.namePlaceholder')}
          onChange={(e) => setTitle(e.target.value)}
        />
        <Txt as="p" className="psw-hint">{t('pageSetup.nameHint')}</Txt>
      </Box>

      <Box className="m-field">
        <Box as="label" className="m-label" htmlFor="psw-slug">{t('pageSetup.addressLabel')}</Box>
        {/* LTR: a URL read right-to-left is a URL read wrong. */}
        <Box className="psw-url" dir="ltr">
          <Txt className="psw-url-prefix">{urlPrefix}</Txt>
          <Input
            id="psw-slug"
            className="m-input"
            dir="ltr"
            value={slug}
            maxLength={40}
            placeholder="my-page"
            onChange={(e) => setSlug(slugify ? slugify(e.target.value) : e.target.value)}
          />
        </Box>
        <Txt as="p" className={`psw-hint${slugBad ? ' psw-hint-err' : ''}`}>
          {slugBad ? t('pageSetup.addressInvalid') : t('pageSetup.addressHint')}
        </Txt>
      </Box>

      {err ? (
        <Box className="psw-err" role="alert">
          <AlertTriangle size={16} strokeWidth={1.8} aria-hidden="true" />
          <Txt>{err}</Txt>
        </Box>
      ) : null}

      <Box className="m-actions psw-actions">
        {page?.published ? (
          /* Already live — there is no decision left to make, only the fields. */
          <Btn type="button" className="m-btn-save" disabled={blocked || busy} onClick={() => submit(false)}>
            {busy ? t('pageSetup.saving') : t('pageSetup.save')}
          </Btn>
        ) : (
          <>
            <Btn type="button" className="m-btn-cancel" disabled={blocked || busy} onClick={() => submit(false)}>
              {t('pageSetup.keepDraft')}
            </Btn>
            <Btn type="button" className="m-btn-save" disabled={blocked || busy} onClick={() => submit(true)}>
              {busy ? t('pageSetup.saving') : t('pageSetup.publish')}
            </Btn>
          </>
        )}
      </Box>
      {titleMissing ? <Txt as="p" className="psw-blocked">{t('pageSetup.blocked')}</Txt> : null}
    </Modal>
  )
}
